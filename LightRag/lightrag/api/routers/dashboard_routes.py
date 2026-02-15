"""
Dashboard and Logging API Routes.

This module provides endpoints for dashboard statistics and logging:
- GET /logs/queries - Get query logs (paginated)
- GET /logs/stats - Get dashboard statistics
- GET /logs/trends - Get query trends
- GET /logs/audit - Get audit logs (Admin only)
- POST /logs/export - Export logs to CSV
"""

import csv
import io
from datetime import datetime, timedelta, timezone

# UTC+7 timezone for Ho Chi Minh City
UTC_PLUS_7 = timezone(timedelta(hours=7))
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..db_setup import (
    get_query_logs,
    get_query_stats,
    get_query_trends,
    get_audit_logs,
    db_manager,
    log_query,
    UserRole
)
from .user_routes import get_current_user, require_admin


# Request/Response models
class QueryLogEntry(BaseModel):
    user_email: str
    user_role: str
    query_text: str
    query_mode: str
    response_preview: str
    execution_time_ms: int
    timestamp: str
    tokens_used: Optional[int] = None
    cost: Optional[float] = None


class QueryLogsResponse(BaseModel):
    logs: List[dict]
    total: int
    page: int
    page_size: int
    total_pages: int


class DashboardStats(BaseModel):
    queries_today: int
    total_documents: int
    tokens_used_today: int
    cost_today: float
    avg_response_time_ms: float
    total_queries: int
    total_tokens: int
    total_cost: float


class QueryTrendEntry(BaseModel):
    date: str
    count: int
    tokens: int
    cost: float


class QueryTrendsResponse(BaseModel):
    trends: List[dict]
    period_days: int


class AuditLogEntry(BaseModel):
    user_email: str
    action: str
    resource_type: str
    resource_id: str
    timestamp: str
    ip_address: Optional[str] = None


class AuditLogsResponse(BaseModel):
    logs: List[dict]
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    status: str
    message: str


class LogChatRequest(BaseModel):
    """Request model for logging a chat-mode query (no RAG)."""
    query_text: str
    response_preview: str = ""
    execution_time_ms: int = 0
    tokens_used: Optional[int] = None
    cost: Optional[float] = None


def create_dashboard_routes() -> APIRouter:
    """Create and return the dashboard router."""
    router = APIRouter(prefix="/logs", tags=["dashboard"])

    @router.get("/queries", response_model=QueryLogsResponse)
    async def get_query_logs_endpoint(
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
        user_email: Optional[str] = None,
        query_mode: Optional[str] = None,
        period: Optional[str] = Query(None, description="Filter period: today, week, month, all"),
        current_user: dict = Depends(get_current_user)
    ):
        """
        Get query logs with pagination and filters.
        Regular users can only see their own logs.
        Admins can see all logs.
        """
        # Determine date range based on period (using UTC+7 for Ho Chi Minh City)
        start_date = None
        end_date = None
        now_utc7 = datetime.now(UTC_PLUS_7)
        
        if period == "today":
            # Midnight UTC+7, converted to naive UTC for MongoDB query
            today_start_utc7 = now_utc7.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = today_start_utc7.astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "week":
            start_date = (now_utc7 - timedelta(days=7)).astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "month":
            start_date = (now_utc7 - timedelta(days=30)).astimezone(timezone.utc).replace(tzinfo=None)
        
        # Non-admin users can only see their own logs
        if current_user["role"] != UserRole.ADMIN:
            user_email = current_user["email"]
        
        logs, total = await get_query_logs(
            page=page,
            page_size=page_size,
            user_email=user_email,
            query_mode=query_mode,
            start_date=start_date,
            end_date=end_date
        )
        
        # Format logs for response
        formatted_logs = []
        for log in logs:
            log_dict = {
                "user_email": log["user_email"],
                "user_role": log.get("user_role", "unknown"),
                "query_text": log["query_text"][:100] + "..." if len(log.get("query_text", "")) > 100 else log.get("query_text", ""),
                "query_mode": log["query_mode"],
                "response_preview": log.get("response_preview", ""),
                "execution_time_ms": log["execution_time_ms"],
                "timestamp": log["timestamp"].replace(tzinfo=timezone.utc).astimezone(UTC_PLUS_7).isoformat() if log.get("timestamp") else None,
                "tokens_used": log.get("tokens_used"),
                "cost": log.get("cost")
            }
            formatted_logs.append(log_dict)
        
        total_pages = (total + page_size - 1) // page_size
        
        return QueryLogsResponse(
            logs=formatted_logs,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )

    @router.get("/stats", response_model=DashboardStats)
    async def get_dashboard_stats(
        current_user: dict = Depends(get_current_user)
    ):
        """
        Get dashboard statistics.
        Non-admin users only see their own stats.
        Admins see aggregate stats for all users.
        """
        now_utc7 = datetime.now(UTC_PLUS_7)
        # Midnight UTC+7, converted to naive UTC for MongoDB query
        today_start_utc7 = now_utc7.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_utc7.astimezone(timezone.utc).replace(tzinfo=None)
        
        # Filter by current user for non-admins
        user_filter = None if current_user["role"] == UserRole.ADMIN else current_user["email"]
        
        # Get today's stats
        today_stats = await get_query_stats(start_date=today_start_utc, user_email=user_filter)
        
        # Get all-time stats
        all_stats = await get_query_stats(user_email=user_filter)
        
        # Get document count — ACL matrix:
        #   Document type               | Admin | Teacher | Student(owner) | Student(other)
        #   Teacher/admin public doc     |  See  |   See   |      See       |      See
        #   Teacher/admin internal doc   |  See  |   See   |       -        |       -
        #   Student-uploaded doc         |  See  |    -    |      See       |       -
        try:
            doc_status_collection = db_manager.db.doc_status
            if current_user["role"] == UserRole.ADMIN:
                doc_count = await doc_status_collection.count_documents({})
            elif current_user["role"] == UserRole.TEACHER:
                doc_count = await doc_status_collection.count_documents({"$or": [
                    {"uploaded_by_role": {"$ne": "student"}},
                    {"uploaded_by_role": {"$exists": False}}
                ]})
            else:
                # Students see their own uploads + non-student public docs
                doc_count = await doc_status_collection.count_documents({"$or": [
                    {"uploaded_by": current_user["email"]},
                    {"scope": "public", "uploaded_by_role": {"$ne": "student"}},
                    {"scope": "public", "uploaded_by_role": {"$exists": False}}
                ]})
        except Exception:
            doc_count = 0
        
        return DashboardStats(
            queries_today=today_stats.get("total_queries", 0),
            total_documents=doc_count,
            tokens_used_today=today_stats.get("total_tokens", 0),
            cost_today=round(today_stats.get("total_cost", 0), 4),
            avg_response_time_ms=round(all_stats.get("avg_execution_time", 0), 2),
            total_queries=all_stats.get("total_queries", 0),
            total_tokens=all_stats.get("total_tokens", 0),
            total_cost=round(all_stats.get("total_cost", 0), 4)
        )

    @router.get("/trends", response_model=QueryTrendsResponse)
    async def get_query_trends_endpoint(
        days: int = Query(7, ge=1, le=30),
        current_user: dict = Depends(get_current_user)
    ):
        """
        Get query trends for the specified number of days.
        Non-admin users only see their own trends.
        """
        user_filter = None if current_user["role"] == UserRole.ADMIN else current_user["email"]
        trends = await get_query_trends(days=days, user_email=user_filter)
        
        formatted_trends = []
        for trend in trends:
            # Trend date is already a date string from MongoDB aggregation
            trend_dict = {
                "date": trend["_id"],
                "count": trend["count"],
                "tokens": trend.get("tokens", 0),
                "cost": round(trend.get("cost", 0), 4)
            }
            formatted_trends.append(trend_dict)
        
        return QueryTrendsResponse(
            trends=formatted_trends,
            period_days=days
        )

    @router.get("/audit", response_model=AuditLogsResponse)
    async def get_audit_logs_endpoint(
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
        action: Optional[str] = None,
        user_email: Optional[str] = None,
        period: Optional[str] = Query(None, description="Filter period: today, week, month, all"),
        admin_user: dict = Depends(require_admin)
    ):
        """
        Get audit logs with pagination and filters.
        Admin only.
        """
        # Determine date range based on period (using UTC+7)
        start_date = None
        end_date = None
        now_utc7 = datetime.now(UTC_PLUS_7)
        
        if period == "today":
            today_start_utc7 = now_utc7.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = today_start_utc7.astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "week":
            start_date = (now_utc7 - timedelta(days=7)).astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "month":
            start_date = (now_utc7 - timedelta(days=30)).astimezone(timezone.utc).replace(tzinfo=None)
        
        logs, total = await get_audit_logs(
            page=page,
            page_size=page_size,
            action=action,
            user_email=user_email,
            start_date=start_date,
            end_date=end_date
        )
        
        # Format logs for response
        formatted_logs = []
        for log in logs:
            log_dict = {
                "user_email": log["user_email"],
                "action": log["action"],
                "resource_type": log["resource_type"],
                "resource_id": log["resource_id"],
                "timestamp": log["timestamp"].replace(tzinfo=timezone.utc).astimezone(UTC_PLUS_7).isoformat() if log.get("timestamp") else None,
                "ip_address": log.get("ip_address"),
                "old_value": log.get("old_value"),
                "new_value": log.get("new_value")
            }
            formatted_logs.append(log_dict)
        
        total_pages = (total + page_size - 1) // page_size
        
        return AuditLogsResponse(
            logs=formatted_logs,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )

    @router.post("/export")
    async def export_query_logs(
        period: Optional[str] = Query("all", description="Export period: today, week, month, all"),
        current_user: dict = Depends(get_current_user)
    ):
        """
        Export query logs to CSV.
        Regular users export their own logs, admins export all logs.
        """
        # Determine date range (using UTC+7)
        start_date = None
        now_utc7 = datetime.now(UTC_PLUS_7)
        
        if period == "today":
            today_start_utc7 = now_utc7.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = today_start_utc7.astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "week":
            start_date = (now_utc7 - timedelta(days=7)).astimezone(timezone.utc).replace(tzinfo=None)
        elif period == "month":
            start_date = (now_utc7 - timedelta(days=30)).astimezone(timezone.utc).replace(tzinfo=None)
        
        # Non-admin users can only export their own logs
        user_email = None if current_user["role"] == UserRole.ADMIN else current_user["email"]
        
        # Get all logs for export (no pagination)
        logs, total = await get_query_logs(
            page=1,
            page_size=10000,  # Large limit for export
            user_email=user_email,
            start_date=start_date
        )
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            "Timestamp",
            "User Email",
            "User Role",
            "Query Mode",
            "Query Text",
            "Response Preview",
            "Execution Time (ms)",
            "Tokens Used",
            "Cost"
        ])
        
        # Write data
        for log in logs:
            ts = log["timestamp"].replace(tzinfo=timezone.utc).astimezone(UTC_PLUS_7).isoformat() if log.get("timestamp") else ""
            writer.writerow([
                ts,
                log["user_email"],
                log.get("user_role", ""),
                log["query_mode"],
                log.get("query_text", ""),
                log.get("response_preview", ""),
                log["execution_time_ms"],
                log.get("tokens_used", ""),
                log.get("cost", "")
            ])
        
        output.seek(0)
        
        # Generate filename
        filename = f"query_logs_{period}_{now_utc7.strftime('%Y%m%d_%H%M%S')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    @router.post("/log-chat", response_model=MessageResponse)
    async def log_chat_query_endpoint(
        request: LogChatRequest,
        current_user: dict = Depends(get_current_user)
    ):
        """
        Log a chat-mode query that was handled directly by the frontend LLM
        (bypassing RAG). This ensures all queries — including agent-mode chat
        queries — are counted in the dashboard metrics.
        """
        import uuid
        try:
            await log_query(
                user_email=current_user["email"],
                user_role=current_user.get("role", "unknown"),
                query_text=request.query_text,
                query_mode="bypass",
                response_preview=request.response_preview[:200] if request.response_preview else "",
                documents_accessed=[],
                execution_time_ms=request.execution_time_ms,
                session_id=str(uuid.uuid4()),
                ip_address="frontend",
                tokens_used=request.tokens_used,
                cost=request.cost,
            )
            return MessageResponse(status="ok", message="Chat query logged successfully")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to log chat query: {str(e)}"
            )

    return router
