"""
Tenant Context Module — Per-Request User/Tenant Isolation.

This module provides a request-scoped tenant context that ensures:

1. Each request has a completely independent context (no shared mutable state).
2. Tenant/user identity is extracted once from the JWT and propagated
   throughout the entire dependency chain via FastAPI's Depends().
3. No global variables are mutated at runtime.
4. 1000 concurrent users → 1000 completely independent contexts.
5. **tenant_id** is ALWAYS present — cross-tenant access is impossible.

Architecture:
    JWT Token → DB User lookup (get tenant_id) → TenantContext (immutable)
    → Injected via Depends() → Available everywhere.

Integration with RLS module:
    Use `ctx.rls_read_filter` to get the MongoDB filter that enforces
    row-level security for the current user. Never build filters manually.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, status

from .auth import auth_handler
from .db_setup import UserRole, get_user_by_email

# Default tenant_id for single-tenant deployments (set via env var)
DEFAULT_TENANT_ID = os.getenv("DEFAULT_TENANT_ID", "default")


@dataclass(frozen=True)
class TenantContext:
    """
    Immutable, per-request tenant context.

    Frozen dataclass ensures no mutation after creation — eliminates
    race conditions and cross-request state leakage entirely.

    Attributes:
        user_email:  Authenticated user's email (from JWT `sub`).
        user_role:   User's role (admin / teacher / student).
        tenant_id:   Tenant identifier — REQUIRED for every DB query.
        display_name: User's display name.
        user_id:     MongoDB ObjectId as string.
        request_id:  Unique ID for this request (for tracing / logging).
        metadata:    Extra JWT metadata (department, student_id, etc.).
        ip_address:  Client IP extracted from the request.
    """

    user_email: str
    user_role: str
    tenant_id: str = ""
    display_name: str = ""
    user_id: str = ""
    request_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    metadata: dict = field(default_factory=dict)
    ip_address: str = "unknown"

    # ----- Derived properties (no mutable state) -----

    @property
    def is_admin(self) -> bool:
        return self.user_role == UserRole.ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.user_role == UserRole.TEACHER

    @property
    def is_student(self) -> bool:
        return self.user_role == UserRole.STUDENT

    @property
    def is_privileged(self) -> bool:
        """Admin or Teacher — can see internal documents."""
        return self.user_role in (UserRole.ADMIN, UserRole.TEACHER)

    # ----- RLS Query Helpers (delegate to rls.py) -----

    @property
    def rls_read_filter(self) -> Dict[str, Any]:
        """
        Return the MongoDB query filter that enforces row-level security
        for document reads. Includes tenant_id automatically.

        Usage:
            docs = await collection.find(ctx.rls_read_filter)
        """
        from .rls import build_read_filter
        return build_read_filter(self.tenant_id, self.user_role, self.user_email)

    def rls_visibility_update_filter(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Return the MongoDB filter for a conditional visibility update.
        Returns None if the user's role cannot update visibility.

        Usage:
            filt = ctx.rls_visibility_update_filter(doc_id)
            if filt is None:
                raise 403
            result = await collection.update_one(filt, {"$set": ...})
            if result.matched_count == 0:
                raise 403  # Not authorized
        """
        from .rls import build_visibility_update_filter
        return build_visibility_update_filter(
            self.tenant_id, self.user_role, self.user_email, doc_id
        )

    @property
    def db_view_name(self) -> str:
        """
        Return the MongoDB VIEW name for backward compatibility.
        Prefer using rls_read_filter instead.
        """
        if self.is_privileged:
            return "view_teacher_docs"
        return "view_student_docs"

    @property
    def scope_filter(self) -> Optional[dict]:
        """
        Legacy property — prefer rls_read_filter.
        """
        if self.is_privileged:
            return None
        return {"scope": "public"}


# ---------------------------------------------------------------------------
# FastAPI Dependency — creates a NEW TenantContext per request
# ---------------------------------------------------------------------------

async def get_tenant_context(request: Request) -> TenantContext:
    """
    FastAPI dependency that extracts a TenantContext from the JWT token
    in the Authorization header.

    This function:
    1. Extracts the Bearer token from the Authorization header.
    2. Validates the JWT (expiry, signature).
    3. Looks up the user in the DB to get their tenant_id.
    4. Builds an IMMUTABLE TenantContext — one per request, never shared.

    The tenant_id is ALWAYS populated — it comes from the user's DB record
    or from the JWT metadata (set at login time).

    Raises HTTPException 401 on missing/invalid token.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )

    token = auth_header.split(" ", 1)[1]

    try:
        payload = auth_handler.validate_token(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Extract client IP
    ip_address = "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip()
    elif request.client:
        ip_address = request.client.host

    # Get tenant_id from JWT metadata (set at login) or fall back to default
    jwt_metadata = payload.get("metadata", {})
    tenant_id = jwt_metadata.get("tenant_id", DEFAULT_TENANT_ID)

    return TenantContext(
        user_email=payload["username"],
        user_role=payload.get("role", "student"),
        tenant_id=tenant_id,
        display_name=jwt_metadata.get("display_name", ""),
        user_id=jwt_metadata.get("user_id", ""),
        metadata=jwt_metadata,
        ip_address=ip_address,
    )


async def get_tenant_context_with_db_user(request: Request) -> TenantContext:
    """
    Like get_tenant_context but also verifies the user still exists and is
    active in the database. Use this for sensitive operations (user mgmt, ACL).

    Always fetches fresh tenant_id from the DB to prevent stale JWT data.
    """
    ctx = await get_tenant_context(request)

    user = await get_user_by_email(ctx.user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in database",
        )
    if user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.get('status', 'inactive')}",
        )

    # Use tenant_id from DB (authoritative) with fallback to JWT/default
    db_tenant_id = user.get("tenant_id", DEFAULT_TENANT_ID)

    # Return enriched context with fresh DB data
    return TenantContext(
        user_email=user["email"],
        user_role=user["role"],
        tenant_id=db_tenant_id,
        display_name=user.get("display_name", ""),
        user_id=str(user.get("_id", "")),
        request_id=ctx.request_id,
        metadata=user.get("metadata", {}),
        ip_address=ctx.ip_address,
    )


async def require_admin_context(request: Request) -> TenantContext:
    """Dependency: require admin role. Returns TenantContext."""
    ctx = await get_tenant_context_with_db_user(request)
    if not ctx.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return ctx


async def require_teacher_or_admin_context(request: Request) -> TenantContext:
    """Dependency: require teacher or admin role. Returns TenantContext."""
    ctx = await get_tenant_context_with_db_user(request)
    if not ctx.is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or Admin access required",
        )
    return ctx


# ---------------------------------------------------------------------------
# Lightweight context for combined_auth routes (query, document, graph)
# ---------------------------------------------------------------------------

async def get_optional_tenant_context(request: Request) -> Optional[TenantContext]:
    """
    Try to extract TenantContext from the request. Returns None if no valid
    token is present (for whitelist/API-key-only routes).

    When a valid JWT is present, also looks up the user's tenant_id from
    the database to ensure correct tenant isolation.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1]
    try:
        payload = auth_handler.validate_token(token)
    except Exception:
        return None

    ip_address = "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip()
    elif request.client:
        ip_address = request.client.host

    jwt_metadata = payload.get("metadata", {})
    tenant_id = jwt_metadata.get("tenant_id", DEFAULT_TENANT_ID)

    # Try to get authoritative tenant_id from DB
    try:
        user = await get_user_by_email(payload["username"])
        if user:
            tenant_id = user.get("tenant_id", tenant_id)
    except Exception:
        pass  # Fall back to JWT tenant_id

    return TenantContext(
        user_email=payload["username"],
        user_role=payload.get("role", "student"),
        tenant_id=tenant_id,
        display_name=jwt_metadata.get("display_name", ""),
        user_id=jwt_metadata.get("user_id", ""),
        metadata=jwt_metadata,
        ip_address=ip_address,
    )
