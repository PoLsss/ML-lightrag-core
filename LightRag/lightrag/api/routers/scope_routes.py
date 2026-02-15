"""
Document Scope Management API Routes.

This module provides endpoints for managing document access scopes:
- GET /scope/documents - List documents with scope info
- PUT /scope/documents/{doc_id} - Update document scope (Admin/Teacher only)
- GET /scope/stats - Get scope statistics
- POST /scope/sync - Sync scope changes to Neo4j
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Request, Query
from pydantic import BaseModel, Field
from datetime import datetime

from ..db_setup import (
    db_manager,
    get_doc_acl,
    update_doc_acl,
    create_doc_acl,
    log_audit,
    AccessScope,
    AuditAction,
    UserRole
)
from ..tenant_context import get_optional_tenant_context, TenantContext, DEFAULT_TENANT_ID
from ..rls import build_read_filter, build_visibility_update_filter, build_visibility_update_set
from .user_routes import get_current_user, require_admin, require_teacher_or_admin, get_client_ip


# Request/Response Models

class ScopeUpdateRequest(BaseModel):
    """Request model for updating document scope."""
    scope: str = Field(..., description="New scope value: 'public' or 'internal'")
    
    class Config:
        json_schema_extra = {
            "example": {
                "scope": "public"
            }
        }


class DocumentScopeResponse(BaseModel):
    """Response model for document scope information."""
    doc_id: str
    file_path: str
    scope: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class ScopeStatsResponse(BaseModel):
    """Response model for scope statistics."""
    total_documents: int
    public_count: int
    internal_count: int
    unscoped_count: int


class ScopeListResponse(BaseModel):
    """Response model for listing documents with scope."""
    documents: List[DocumentScopeResponse]
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    """Generic message response."""
    status: str
    message: str


def create_scope_routes() -> APIRouter:
    """Create and return the scope management router."""
    router = APIRouter(prefix="/scope", tags=["scope"])
    
    @router.get("/documents", response_model=ScopeListResponse)
    async def list_documents_with_scope(
        page: int = Query(default=1, ge=1, description="Page number"),
        page_size: int = Query(default=20, ge=10, le=100, description="Items per page"),
        scope_filter: Optional[str] = Query(default=None, description="Filter by scope"),
        current_user: dict = Depends(require_teacher_or_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        List all documents with their scope information.
        Admin and Teacher only. Respects RLS tenant isolation.
        """
        try:
            # ── RLS: Build tenant-isolated filter ──
            if ctx:
                query = ctx.rls_read_filter
            else:
                query = build_read_filter(
                    tenant_id=DEFAULT_TENANT_ID,
                    user_role="teacher",
                    user_email=current_user.get("email", ""),
                )

            if scope_filter:
                if scope_filter not in [AccessScope.PUBLIC, AccessScope.INTERNAL]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid scope filter. Must be '{AccessScope.PUBLIC}' or '{AccessScope.INTERNAL}'"
                    )
                query["visibility"] = scope_filter
            
            # Get documents from doc_status collection
            # Use doc_acl for scope info, join with doc_status for file info
            collection = db_manager.db.doc_status if hasattr(db_manager, 'db') else None
            
            if collection is None:
                # Fallback to doc_acl collection
                collection = db_manager.doc_acl
            
            # Count total
            total = await collection.count_documents(query)
            
            # Get paginated results
            skip = (page - 1) * page_size
            cursor = collection.find(query).skip(skip).limit(page_size)
            docs = await cursor.to_list(length=page_size)
            
            # Transform to response format
            documents = []
            for doc in docs:
                doc_response = DocumentScopeResponse(
                    doc_id=str(doc.get("_id", doc.get("doc_id", ""))),
                    file_path=doc.get("file_path", ""),
                    scope=doc.get("scope", doc.get("access_scope", "internal")),
                    updated_at=doc.get("updated_at", "").isoformat() if isinstance(doc.get("updated_at"), datetime) else str(doc.get("updated_at", "")),
                    updated_by=doc.get("updated_by", "")
                )
                documents.append(doc_response)
            
            return ScopeListResponse(
                documents=documents,
                total=total,
                page=page,
                page_size=page_size
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error fetching documents: {str(e)}"
            )
    
    @router.put("/documents/{doc_id}", response_model=MessageResponse)
    async def update_document_scope(
        request: Request,
        doc_id: str,
        scope_data: ScopeUpdateRequest,
        current_user: dict = Depends(require_teacher_or_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        Update document access scope (visibility) using a conditional
        MongoDB update that validates ownership in the query itself.

        RLS Rules enforced at DB level:
        - Student: CANNOT change visibility (blocked before DB query).
        - Teacher: Can ONLY change their own teacher docs (filter includes owner_id).
        - Admin: Can change ANY doc in their tenant.
        """
        # Validate scope value
        if scope_data.scope not in [AccessScope.PUBLIC, AccessScope.INTERNAL]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scope. Must be '{AccessScope.PUBLIC}' or '{AccessScope.INTERNAL}'"
            )
        
        try:
            # ── RLS: Build conditional update filter ──
            # This filter encodes authorization directly into the MongoDB query.
            # If the filter doesn't match, the update is a no-op → 403.
            if ctx:
                rls_filter = ctx.rls_visibility_update_filter(doc_id)
            else:
                rls_filter = build_visibility_update_filter(
                    tenant_id=current_user.get("tenant_id", DEFAULT_TENANT_ID),
                    user_role=current_user.get("role", "teacher"),
                    user_email=current_user.get("email", ""),
                    doc_id=doc_id,
                )

            if rls_filter is None:
                # Student role — blocked at code level before touching DB
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Students cannot change document visibility"
                )

            # Get old scope for audit logging
            existing_acl = await get_doc_acl(doc_id)
            old_scope = existing_acl.get("access_scope", "internal") if existing_acl else "internal"

            # ── Conditional update on doc_status ──
            # The filter includes {_id, tenant_id, owner_id (for teachers)}.
            # If the user is not authorized, matched_count == 0.
            update_set = build_visibility_update_set(
                new_visibility=scope_data.scope,
                updated_by=current_user["email"],
            )
            doc_status_collection = db_manager.db.doc_status
            result = await doc_status_collection.update_one(rls_filter, update_set)

            if result.matched_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"You are not authorized to change the visibility of document '{doc_id}'. "
                           "Teachers can only change their own documents."
                )

            # Update or create ACL entry (for backward compatibility)
            if existing_acl:
                await update_doc_acl(
                    doc_id=doc_id,
                    access_scope=scope_data.scope,
                    updated_by=current_user["email"]
                )
            else:
                await create_doc_acl(
                    doc_id=doc_id,
                    file_path="",
                    access_scope=scope_data.scope,
                    created_by=current_user["email"],
                    tenant_id=ctx.tenant_id if ctx else DEFAULT_TENANT_ID,
                    owner_id=current_user["email"],
                    owner_role=current_user.get("role", "teacher"),
                )

            # Sync scope change to Neo4j
            await sync_scope_to_neo4j(doc_id, old_scope, scope_data.scope)
            
            # Log audit
            await log_audit(
                user_email=current_user["email"],
                action=AuditAction.ACL_CHANGE,
                resource_type="document_scope",
                resource_id=doc_id,
                old_value={"scope": old_scope},
                new_value={"scope": scope_data.scope},
                ip_address=get_client_ip(request)
            )
            
            return MessageResponse(
                status="success",
                message=f"Document {doc_id} scope updated from '{old_scope}' to '{scope_data.scope}'"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error updating document scope: {str(e)}"
            )
    
    @router.get("/stats", response_model=ScopeStatsResponse)
    async def get_scope_statistics(
        current_user: dict = Depends(require_teacher_or_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        Get statistics about document scopes.
        Admin and Teacher only. Respects RLS tenant isolation.
        """
        try:
            # ── RLS: Scope stats must respect tenant isolation ──
            tenant_id = ctx.tenant_id if ctx else current_user.get("tenant_id", DEFAULT_TENANT_ID)
            collection = db_manager.db.doc_status
            
            # Aggregate by visibility within the tenant
            pipeline = [
                {"$match": {"tenant_id": tenant_id}},
                {
                    "$group": {
                        "_id": "$visibility",
                        "count": {"$sum": 1}
                    }
                }
            ]
            
            cursor = collection.aggregate(pipeline)
            results = await cursor.to_list(length=None)
            
            # Process results
            public_count = 0
            internal_count = 0
            unscoped_count = 0
            
            for result in results:
                scope = result["_id"]
                count = result["count"]
                
                if scope == AccessScope.PUBLIC:
                    public_count = count
                elif scope == AccessScope.INTERNAL:
                    internal_count = count
                else:
                    unscoped_count += count
            
            total = public_count + internal_count + unscoped_count
            
            return ScopeStatsResponse(
                total_documents=total,
                public_count=public_count,
                internal_count=internal_count,
                unscoped_count=unscoped_count
            )
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error fetching scope statistics: {str(e)}"
            )
    
    @router.post("/sync/{doc_id}", response_model=MessageResponse)
    async def sync_document_scope_to_neo4j(
        doc_id: str,
        current_user: dict = Depends(require_admin)
    ):
        """
        Manually sync a document's scope to Neo4j.
        Admin only. Use this to fix sync issues.
        
        Args:
            doc_id: Document ID to sync
            current_user: Authenticated admin user
        
        Returns:
            MessageResponse: Status of the sync operation
        """
        try:
            # Get current scope from MongoDB
            acl = await get_doc_acl(doc_id)
            if not acl:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Document ACL not found for doc_id: {doc_id}"
                )
            
            current_scope = acl.get("access_scope", "internal")
            
            # Force sync to Neo4j
            await sync_scope_to_neo4j(doc_id, None, current_scope, force=True)
            
            return MessageResponse(
                status="success",
                message=f"Document {doc_id} scope synced to Neo4j as '{current_scope}'"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error syncing document scope: {str(e)}"
            )
    
    return router


async def sync_scope_to_neo4j(
    doc_id: str,
    old_scope: Optional[str],
    new_scope: str,
    force: bool = False
):
    """
    Sync document scope change to Neo4j by updating labels.
    
    This function swaps the scope-based labels on the Neo4j node:
    - Removes old scope label (e.g., :InternalDocument)
    - Adds new scope label (e.g., :PublicDocument)
    
    Args:
        doc_id: Document/entity ID in Neo4j
        old_scope: Previous scope value (can be None for new documents)
        new_scope: New scope value
        force: If True, update even if old_scope equals new_scope
    """
    import os
    from neo4j import AsyncGraphDatabase
    
    # Skip if no change and not forced
    if old_scope == new_scope and not force:
        return
    
    uri = os.environ.get("NEO4J_URI")
    username = os.environ.get("NEO4J_USERNAME")
    password = os.environ.get("NEO4J_PASSWORD")
    database = os.environ.get("NEO4J_DATABASE", "neo4j")
    
    if not all([uri, username, password]):
        print(f"Warning: Neo4j not configured, skipping scope sync for {doc_id}")
        return
    
    driver = AsyncGraphDatabase.driver(uri, auth=(username, password))
    
    try:
        async with driver.session(database=database) as session:
            # Determine label changes
            old_label = "InternalDocument" if old_scope == "internal" else "PublicDocument" if old_scope == "public" else None
            new_label = "PublicDocument" if new_scope == "public" else "InternalDocument"
            
            # Build and execute Cypher query
            if old_label and old_label != new_label:
                # Swap labels
                cypher = f"""
                MATCH (n {{entity_id: $doc_id}})
                REMOVE n:{old_label}
                SET n:{new_label}, n.scope = $new_scope
                RETURN n.entity_id as id
                """
            else:
                # Just add new label (for new documents or force sync)
                cypher = f"""
                MATCH (n {{entity_id: $doc_id}})
                SET n:{new_label}, n.scope = $new_scope
                RETURN n.entity_id as id
                """
            
            result = await session.run(cypher, doc_id=doc_id, new_scope=new_scope)
            record = await result.single()
            await result.consume()
            
            if record:
                print(f"Neo4j scope synced for {doc_id}: {old_scope} -> {new_scope}")
            else:
                print(f"Warning: No Neo4j node found for doc_id: {doc_id}")
                
    except Exception as e:
        print(f"Error syncing scope to Neo4j for {doc_id}: {e}")
        # Don't raise - Neo4j sync failure shouldn't break the API
    finally:
        await driver.close()
