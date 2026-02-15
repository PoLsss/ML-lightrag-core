"""
Document Access Control (ACL) API Routes.

This module provides endpoints for managing document access:
- GET /acl/documents - List all documents with their ACL (Admin only)
- PUT /acl/documents/{doc_id} - Update document access scope (Admin only)
- GET /acl/check/{doc_id} - Check if current user can access a document
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel

from ..db_setup import (
    get_all_doc_acls,
    get_doc_acl,
    update_doc_acl,
    create_doc_acl,
    can_user_access_document,
    log_audit,
    AccessScope,
    AuditAction
)
from ..tenant_context import get_optional_tenant_context, TenantContext, DEFAULT_TENANT_ID
from ..rls import build_read_filter, build_visibility_update_set
from .user_routes import get_current_user, require_admin, get_client_ip


# Request/Response models
class DocumentACLResponse(BaseModel):
    doc_id: str
    file_path: str
    access_scope: str
    created_by: str
    created_at: str
    updated_at: str
    updated_by: str


class DocumentACLListResponse(BaseModel):
    documents: List[dict]
    total: int


class UpdateACLRequest(BaseModel):
    access_scope: str  # "internal" or "public"


class AccessCheckResponse(BaseModel):
    doc_id: str
    can_access: bool
    access_scope: str
    reason: str


class MessageResponse(BaseModel):
    status: str
    message: str


def create_acl_routes(rag=None) -> APIRouter:
    """Create and return the ACL management router.
    
    Args:
        rag: LightRAG instance to access actual document storage (source of truth)
    """
    router = APIRouter(prefix="/acl", tags=["acl"])

    @router.get("/documents", response_model=DocumentACLListResponse)
    async def list_document_acls(
        admin_user: dict = Depends(require_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        List all documents with their access control settings.
        Admin only. Respects tenant isolation via tenant_id.
        """
        def format_datetime(dt):
            """Format datetime to ISO string, handling both datetime objects and strings."""
            if dt is None:
                return None
            if isinstance(dt, str):
                return dt
            try:
                return dt.isoformat()
            except AttributeError:
                return str(dt)
        
        documents = []
        tenant_id = ctx.tenant_id if ctx else admin_user.get("tenant_id", DEFAULT_TENANT_ID)
        
        # ── RLS: Admin sees everything in their tenant ──
        tenant_filter = {"tenant_id": tenant_id}
        
        if rag is not None and hasattr(rag, 'doc_status'):
            try:
                docs_result, total_count = await rag.doc_status.get_docs_paginated(
                    status_filter=None,
                    page=1,
                    page_size=10000,
                    sort_field="created_at",
                    sort_direction="desc",
                    tenant_filter=tenant_filter,
                )
                
                # Get ACL info for each actual document
                for doc_id, doc_status in docs_result:
                    # Try to get ACL from doc_acl collection
                    acl = await get_doc_acl(doc_id)
                    
                    # Get scope from doc_status or ACL
                    access_scope = "internal"  # Default
                    if acl:
                        access_scope = acl.get("access_scope", "internal")
                    elif hasattr(doc_status, 'scope') and doc_status.scope:
                        access_scope = doc_status.scope
                    
                    doc_dict = {
                        "doc_id": doc_id,
                        "file_path": getattr(doc_status, 'file_path', "") or "",
                        "access_scope": access_scope,
                        "created_by": acl.get("created_by", "system") if acl else "system",
                        "created_at": format_datetime(getattr(doc_status, 'created_at', None)),
                        "updated_at": format_datetime(getattr(doc_status, 'updated_at', None)),
                        "updated_by": acl.get("updated_by", "system") if acl else "system"
                    }
                    documents.append(doc_dict)
                    
            except Exception as e:
                # Log error and fallback to old behavior
                import logging
                logging.getLogger("lightrag").warning(f"Failed to fetch from rag.doc_status, falling back: {e}")
                # Fallback to old behavior
                acls = await get_all_doc_acls()
                for acl in acls:
                    doc_dict = {
                        "doc_id": acl["doc_id"],
                        "file_path": acl.get("file_path", ""),
                        "access_scope": acl.get("access_scope", "internal"),
                        "created_by": acl.get("created_by", "system"),
                        "created_at": format_datetime(acl.get("created_at")),
                        "updated_at": format_datetime(acl.get("updated_at")),
                        "updated_by": acl.get("updated_by", acl.get("created_by", "system"))
                    }
                    documents.append(doc_dict)
        else:
            # Fallback: use old behavior if rag not available
            acls = await get_all_doc_acls()
            for acl in acls:
                doc_dict = {
                    "doc_id": acl["doc_id"],
                    "file_path": acl.get("file_path", ""),
                    "access_scope": acl.get("access_scope", "internal"),
                    "created_by": acl.get("created_by", "system"),
                    "created_at": format_datetime(acl.get("created_at")),
                    "updated_at": format_datetime(acl.get("updated_at")),
                    "updated_by": acl.get("updated_by", acl.get("created_by", "system"))
                }
                documents.append(doc_dict)
        
        return DocumentACLListResponse(documents=documents, total=len(documents))

    @router.put("/documents/{doc_id}", response_model=MessageResponse)
    async def update_document_acl(
        request: Request,
        doc_id: str,
        acl_data: UpdateACLRequest,
        admin_user: dict = Depends(require_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        Update document access scope. Admin only.
        Uses conditional update with tenant_id for isolation.
        """
        valid_scopes = [AccessScope.INTERNAL, AccessScope.PUBLIC]
        if acl_data.access_scope not in valid_scopes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid access_scope. Must be one of: {valid_scopes}"
            )
        
        existing_acl = await get_doc_acl(doc_id)
        
        if not existing_acl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document ACL not found for doc_id: {doc_id}"
            )
        
        old_scope = existing_acl["access_scope"]
        
        # ── RLS: Conditional update scoped to tenant ──
        tenant_id = ctx.tenant_id if ctx else admin_user.get("tenant_id", DEFAULT_TENANT_ID)
        from ..db_setup import db_manager
        update_set = build_visibility_update_set(
            new_visibility=acl_data.access_scope,
            updated_by=admin_user["email"],
        )
        result = await db_manager.db.doc_status.update_one(
            {"_id": doc_id, "tenant_id": tenant_id},
            update_set,
        )
        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document '{doc_id}' not found in your tenant"
            )
        
        # Update ACL for backward compat
        await update_doc_acl(
            doc_id=doc_id,
            access_scope=acl_data.access_scope,
            updated_by=admin_user["email"]
        )
        
        # Log audit
        await log_audit(
            user_email=admin_user["email"],
            action=AuditAction.ACL_CHANGE,
            resource_type="document",
            resource_id=doc_id,
            old_value={"access_scope": old_scope},
            new_value={"access_scope": acl_data.access_scope},
            ip_address=get_client_ip(request)
        )
        
        return MessageResponse(
            status="success",
            message=f"Document {doc_id} access scope updated to {acl_data.access_scope}"
        )

    @router.get("/check/{doc_id}", response_model=AccessCheckResponse)
    async def check_document_access(
        doc_id: str,
        current_user: dict = Depends(get_current_user),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        Check if current user can access a specific document.
        Uses the same RLS filter as all other read endpoints.
        """
        tenant_id = ctx.tenant_id if ctx else current_user.get("tenant_id", DEFAULT_TENANT_ID)
        user_role = current_user["role"]
        user_email = current_user["email"]

        # ── RLS: Build read filter + doc_id constraint ──
        rls_filter = build_read_filter(tenant_id, user_role, user_email)
        rls_filter["_id"] = doc_id

        from ..db_setup import db_manager
        doc = await db_manager.db.doc_status.find_one(rls_filter)

        if doc:
            access_scope = doc.get("visibility", doc.get("scope", "internal"))
            return AccessCheckResponse(
                doc_id=doc_id,
                can_access=True,
                access_scope=access_scope,
                reason=f"User role '{user_role}' has access to this document",
            )

        return AccessCheckResponse(
            doc_id=doc_id,
            can_access=False,
            access_scope="unknown",
            reason=f"Document not found or user role '{user_role}' does not have access",
        )

    @router.post("/documents/{doc_id}", response_model=MessageResponse)
    async def create_document_acl_entry(
        request: Request,
        doc_id: str,
        acl_data: UpdateACLRequest,
        admin_user: dict = Depends(require_admin),
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        """
        Create a new document ACL entry. Admin only.
        Includes tenant_id for isolation.
        """
        # Check if ACL already exists
        existing_acl = await get_doc_acl(doc_id)
        if existing_acl:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"ACL already exists for doc_id: {doc_id}. Use PUT to update."
            )
        
        # Validate access_scope
        valid_scopes = [AccessScope.INTERNAL, AccessScope.PUBLIC]
        if acl_data.access_scope not in valid_scopes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid access_scope. Must be one of: {valid_scopes}"
            )
        
        # Create ACL with tenant_id
        tenant_id = ctx.tenant_id if ctx else admin_user.get("tenant_id", DEFAULT_TENANT_ID)
        await create_doc_acl(
            doc_id=doc_id,
            file_path="",
            access_scope=acl_data.access_scope,
            created_by=admin_user["email"],
            tenant_id=tenant_id,
            owner_id=admin_user["email"],
            owner_role=admin_user.get("role", "admin"),
        )
        
        # Log audit
        await log_audit(
            user_email=admin_user["email"],
            action=AuditAction.ACL_CHANGE,
            resource_type="document",
            resource_id=doc_id,
            new_value={"access_scope": acl_data.access_scope},
            ip_address=get_client_ip(request)
        )
        
        return MessageResponse(
            status="success",
            message=f"ACL created for document {doc_id} with access scope {acl_data.access_scope}"
        )

    return router
