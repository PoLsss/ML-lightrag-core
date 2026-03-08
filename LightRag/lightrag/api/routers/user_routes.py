"""
User Management API Routes.

This module provides endpoints for user authentication and management:
- POST /users/login - Login with email/password
- GET /users/me - Get current user info
- GET /users - List all users (Admin only)
- POST /users - Create new user (Admin only)
- PUT /users/{email} - Update user (Admin only)
- DELETE /users/{email} - Delete user (Admin only)
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, EmailStr, Field

from ..db_setup import (
    db_manager,
    get_user_by_email,
    get_all_users,
    create_user,
    update_user,
    delete_user,
    update_user_last_login,
    verify_password,
    log_audit,
    UserRole,
    UserStatus,
    AuditAction,
    DEFAULT_TENANT_ID,
)
from ..auth import auth_handler
from ..tenant_context import (
    TenantContext,
    get_tenant_context,
    get_tenant_context_with_db_user,
    require_admin_context,
    require_teacher_or_admin_context,
)


# Request/Response models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    message: str = "Login successful"


class UserProfile(BaseModel):
    email: str
    display_name: str
    role: str
    status: str
    created_at: datetime
    last_login: Optional[datetime] = None
    metadata: dict = {}


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    display_name: str = Field(..., min_length=2)
    role: str = Field(default=UserRole.STUDENT)
    metadata: dict = {}


class RegisterRequest(BaseModel):
    """Public registration request - email, password, and confirmation only."""
    email: EmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[dict] = None


class UserListResponse(BaseModel):
    users: List[dict]
    total: int


class MessageResponse(BaseModel):
    status: str
    message: str


# Dependency to get current user from token
async def get_current_user(request: Request) -> dict:
    """Extract and validate current user from JWT token.
    
    Uses TenantContext internally for consistent per-request isolation.
    Returns a dict for backward compatibility with existing route handlers.
    """
    ctx = await get_tenant_context_with_db_user(request)
    # Return a dict that matches the shape expected by existing code
    user = await get_user_by_email(ctx.user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user


async def require_admin(request: Request) -> dict:
    """Require admin role for access. Uses TenantContext internally."""
    ctx = await require_admin_context(request)
    user = await get_user_by_email(ctx.user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user


async def require_teacher_or_admin(request: Request) -> dict:
    """Require teacher or admin role for access. Uses TenantContext internally."""
    ctx = await require_teacher_or_admin_context(request)
    user = await get_user_by_email(ctx.user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user


def get_client_ip(request: Request) -> str:
    """Get client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def create_user_routes() -> APIRouter:
    """Create and return the user management router."""
    router = APIRouter(prefix="/users", tags=["users"])

    @router.post("/login", response_model=LoginResponse)
    async def login(request: Request, login_data: LoginRequest):
        """
        Login with email and password.
        Returns JWT token and user profile.
        """
        email = login_data.email.lower()
        user = await get_user_by_email(email)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        if not verify_password(login_data.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        if user.get("status") != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user.get('status', 'inactive')}"
            )
        
        # Update last login
        await update_user_last_login(email)
        
        # Create token with role and tenant_id
        tenant_id = user.get("tenant_id", DEFAULT_TENANT_ID)
        token = auth_handler.create_token(
            username=email,
            role=user["role"],
            metadata={
                "display_name": user["display_name"],
                "user_id": str(user["_id"]),
                "tenant_id": tenant_id,
            }
        )
        
        # Log audit
        await log_audit(
            user_email=email,
            action=AuditAction.LOGIN,
            resource_type="system",
            resource_id=email,
            ip_address=get_client_ip(request)
        )
        
        return LoginResponse(
            access_token=token,
            user={
                "email": email,
                "display_name": user["display_name"],
                "role": user["role"],
                "status": user["status"]
            }
        )

    @router.post("/register", response_model=MessageResponse)
    async def register(request: Request, register_data: RegisterRequest):
        """
        Public user registration endpoint.
        Creates a new user with 'student' role and 'active' status.
        No authentication required.
        """
        # Validate password confirmation
        if register_data.password != register_data.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )
        
        email = register_data.email.lower()
        
        # Check if email already exists
        existing = await get_user_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create user with student role and default tenant
        # Use email username part as display_name
        display_name = email.split("@")[0]
        
        await create_user(
            email=email,
            password=register_data.password,
            display_name=display_name,
            role=UserRole.STUDENT,
            metadata={},
            tenant_id=DEFAULT_TENANT_ID,
        )
        
        # Log audit
        await log_audit(
            user_email=email,
            action=AuditAction.USER_CREATE,
            resource_type="user",
            resource_id=email,
            new_value={
                "email": email,
                "display_name": display_name,
                "role": UserRole.STUDENT,
                "self_registered": True
            },
            ip_address=get_client_ip(request)
        )
        
        return MessageResponse(
            status="success",
            message="Registration successful. Please login with your credentials."
        )

    @router.get("/me", response_model=UserProfile)
    async def get_me(current_user: dict = Depends(get_current_user)):
        """Get current user's profile."""
        return UserProfile(
            email=current_user["email"],
            display_name=current_user["display_name"],
            role=current_user["role"],
            status=current_user["status"],
            created_at=current_user["created_at"],
            last_login=current_user.get("last_login"),
            metadata=current_user.get("metadata", {})
        )

    @router.get("", response_model=UserListResponse)
    async def list_users(admin_user: dict = Depends(require_admin)):
        """
        List all users. Admin only.
        """
        users = await get_all_users()
        # Remove password_hash from response
        sanitized_users = []
        for user in users:
            user_dict = {
                "email": user["email"],
                "display_name": user["display_name"],
                "role": user["role"],
                "status": user["status"],
                "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
                "last_login": user["last_login"].isoformat() if user.get("last_login") else None,
                "metadata": user.get("metadata", {})
            }
            sanitized_users.append(user_dict)
        
        return UserListResponse(users=sanitized_users, total=len(sanitized_users))

    @router.post("", response_model=MessageResponse)
    async def create_new_user(
        request: Request,
        user_data: CreateUserRequest,
        admin_user: dict = Depends(require_admin)
    ):
        """
        Create a new user. Admin only.
        """
        try:
            # Check if email already exists
            existing = await get_user_by_email(user_data.email)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            
            # Validate role
            valid_roles = [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT]
            if user_data.role not in valid_roles:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid role. Must be one of: {valid_roles}"
                )
            
            # Create user
            new_user = await create_user(
                email=user_data.email,
                password=user_data.password,
                display_name=user_data.display_name,
                role=user_data.role,
                metadata=user_data.metadata if user_data.metadata else {},
                tenant_id=admin_user.get("tenant_id", DEFAULT_TENANT_ID),
            )
            
            # Log audit
            await log_audit(
                user_email=admin_user["email"],
                action=AuditAction.USER_CREATE,
                resource_type="user",
                resource_id=user_data.email,
                new_value={
                    "email": user_data.email,
                    "display_name": user_data.display_name,
                    "role": user_data.role
                },
                ip_address=get_client_ip(request)
            )
            
            return MessageResponse(
                status="success",
                message=f"User {user_data.email} created successfully"
            )
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user: {str(e)}"
            )

    @router.put("/{email}", response_model=MessageResponse)
    async def update_existing_user(
        request: Request,
        email: str,
        user_data: UpdateUserRequest,
        current_user: dict = Depends(get_current_user)
    ):
        """
        Update an existing user.
        - Any authenticated user can update their own display_name and password.
        - Only admins can update other users or change role/status/metadata.
        """
        is_self = current_user["email"].lower() == email.lower()
        is_admin = current_user.get("role") == UserRole.ADMIN

        # Non-admins can only update themselves
        if not is_self and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )

        # Non-admins cannot change privileged fields
        if not is_admin:
            if user_data.role is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required to change role"
                )
            if user_data.status is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required to change status"
                )
            if user_data.metadata is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required to change metadata"
                )

        existing = await get_user_by_email(email)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Build update data
        update_data = {}
        old_value = {}
        
        if user_data.display_name is not None:
            old_value["display_name"] = existing["display_name"]
            update_data["display_name"] = user_data.display_name
        
        if user_data.password is not None:
            update_data["password"] = user_data.password
        
        if user_data.role is not None:
            valid_roles = [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT]
            if user_data.role not in valid_roles:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid role. Must be one of: {valid_roles}"
                )
            old_value["role"] = existing["role"]
            update_data["role"] = user_data.role
        
        if user_data.status is not None:
            valid_statuses = [UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]
            if user_data.status not in valid_statuses:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status. Must be one of: {valid_statuses}"
                )
            old_value["status"] = existing["status"]
            update_data["status"] = user_data.status
        
        if user_data.metadata is not None:
            old_value["metadata"] = existing.get("metadata", {})
            update_data["metadata"] = user_data.metadata
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No update data provided"
            )
        
        # Update user
        success = await update_user(email, update_data)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update user"
            )
        
        # Log audit
        await log_audit(
            user_email=current_user["email"],
            action=AuditAction.USER_UPDATE,
            resource_type="user",
            resource_id=email,
            old_value=old_value,
            new_value=update_data,
            ip_address=get_client_ip(request)
        )
        
        return MessageResponse(
            status="success",
            message=f"User {email} updated successfully"
        )

    @router.delete("/{email}", response_model=MessageResponse)
    async def delete_existing_user(
        request: Request,
        email: str,
        admin_user: dict = Depends(require_admin)
    ):
        """
        Delete a user. Admin only.
        Cannot delete yourself.
        """
        if email.lower() == admin_user["email"].lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete yourself"
            )
        
        existing = await get_user_by_email(email)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Delete user
        success = await delete_user(email)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete user"
            )
        
        # Log audit
        await log_audit(
            user_email=admin_user["email"],
            action=AuditAction.USER_DELETE,
            resource_type="user",
            resource_id=email,
            old_value={
                "email": existing["email"],
                "display_name": existing["display_name"],
                "role": existing["role"]
            },
            ip_address=get_client_ip(request)
        )
        
        return MessageResponse(
            status="success",
            message=f"User {email} deleted successfully"
        )

    return router
