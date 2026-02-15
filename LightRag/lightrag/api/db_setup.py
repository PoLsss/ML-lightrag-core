"""
MongoDB Database Setup for User Management, ACL, and Logging.

This module provides MongoDB collection management for:
- users: User authentication and profile management
- doc_acl: Document access control
- query_logs: Query logging and analytics
- audit_logs: System audit trail
"""

import os
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from dotenv import load_dotenv

try:
    import bcrypt
    _HAS_BCRYPT = True
except ImportError:
    _HAS_BCRYPT = False

load_dotenv(dotenv_path=".env", override=False)


class DatabaseManager:
    """Singleton manager for MongoDB connections and collections."""
    
    _instance: Optional['DatabaseManager'] = None
    _client: Optional[AsyncIOMotorClient] = None
    _db: Optional[AsyncIOMotorDatabase] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def initialize(self, uri: Optional[str] = None, database: Optional[str] = None):
        """Initialize MongoDB connection."""
        if self._client is not None:
            return
        
        mongo_uri = uri or os.getenv("MONGO_URI", "mongodb://localhost:27017")
        db_name = database or os.getenv("MONGO_DATABASE", "LightRag")
        
        self._client = AsyncIOMotorClient(mongo_uri)
        self._db = self._client[db_name]
        
        # Create indexes
        await self._create_indexes()
    
    async def _create_indexes(self):
        """Create indexes for all collections."""
        # Users collection indexes
        await self._db.users.create_index([("email", ASCENDING)], unique=True)
        await self._db.users.create_index([("role", ASCENDING)])
        await self._db.users.create_index([("status", ASCENDING)])
        
        # Doc ACL collection indexes
        await self._db.doc_acl.create_index([("doc_id", ASCENDING)], unique=True)
        await self._db.doc_acl.create_index([("access_scope", ASCENDING)])
        await self._db.doc_acl.create_index([("created_by", ASCENDING)])
        
        # Query logs collection indexes
        await self._db.query_logs.create_index([("user_email", ASCENDING), ("timestamp", DESCENDING)])
        await self._db.query_logs.create_index([("timestamp", DESCENDING)])
        await self._db.query_logs.create_index([("query_mode", ASCENDING)])
        
        # Audit logs collection indexes
        await self._db.audit_logs.create_index([("timestamp", DESCENDING)])
        await self._db.audit_logs.create_index([("action", ASCENDING), ("timestamp", DESCENDING)])
        await self._db.audit_logs.create_index([("user_email", ASCENDING), ("timestamp", DESCENDING)])
    
    @property
    def db(self) -> AsyncIOMotorDatabase:
        """Get the database instance."""
        if self._db is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        return self._db
    
    @property
    def users(self):
        """Get users collection."""
        return self.db.users
    
    @property
    def doc_acl(self):
        """Get document ACL collection."""
        return self.db.doc_acl
    
    @property
    def query_logs(self):
        """Get query logs collection."""
        return self.db.query_logs
    
    @property
    def audit_logs(self):
        """Get audit logs collection."""
        return self.db.audit_logs
    
    async def close(self):
        """Close the database connection."""
        if self._client:
            self._client.close()
            self._client = None
            self._db = None


# Singleton instance
db_manager = DatabaseManager()


# Password hashing utilities
def hash_password(password: str) -> str:
    """Hash a password using bcrypt (with automatic salt).
    
    Falls back to SHA-256 if bcrypt is not installed, but bcrypt is
    strongly recommended for production use.
    """
    if _HAS_BCRYPT:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    # Fallback — NOT recommended for production
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash.
    
    Supports both bcrypt hashes (start with $2b$) and legacy SHA-256 hashes.
    If a legacy hash matches, the caller should consider re-hashing with bcrypt.
    """
    if _HAS_BCRYPT and hashed.startswith("$2b$"):
        return bcrypt.checkpw(password.encode(), hashed.encode())
    # Legacy SHA-256 check (for backward compatibility with existing users)
    return hashlib.sha256(password.encode()).hexdigest() == hashed


# User role constants
class UserRole:
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class UserStatus:
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class AccessScope:
    INTERNAL = "internal"
    PUBLIC = "public"


class AuditAction:
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    UPLOAD = "UPLOAD"
    DELETE = "DELETE"
    ACL_CHANGE = "ACL_CHANGE"
    USER_CREATE = "USER_CREATE"
    USER_UPDATE = "USER_UPDATE"
    USER_DELETE = "USER_DELETE"


# Default tenant ID for single-tenant deployments
DEFAULT_TENANT_ID = os.getenv("DEFAULT_TENANT_ID", "default")


# User document schema
async def create_user(
    email: str,
    password: str,
    display_name: str,
    role: str = UserRole.STUDENT,
    status: str = UserStatus.ACTIVE,
    metadata: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new user document with mandatory tenant_id."""
    now = datetime.utcnow()
    user_doc = {
        "email": email.lower(),
        "password_hash": hash_password(password),
        "display_name": display_name,
        "role": role,
        "status": status,
        "tenant_id": tenant_id or DEFAULT_TENANT_ID,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
        "metadata": metadata or {}
    }
    
    result = await db_manager.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return user_doc


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get a user by email."""
    return await db_manager.users.find_one({"email": email.lower()})


async def update_user_last_login(email: str):
    """Update user's last login timestamp."""
    await db_manager.users.update_one(
        {"email": email.lower()},
        {"$set": {"last_login": datetime.utcnow()}}
    )


async def get_all_users() -> List[Dict[str, Any]]:
    """Get all users."""
    cursor = db_manager.users.find({})
    return await cursor.to_list(length=None)


async def update_user(email: str, update_data: Dict[str, Any]) -> bool:
    """Update a user's data."""
    update_data["updated_at"] = datetime.utcnow()
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))
    
    result = await db_manager.users.update_one(
        {"email": email.lower()},
        {"$set": update_data}
    )
    return result.modified_count > 0


async def delete_user(email: str) -> bool:
    """Delete a user."""
    result = await db_manager.users.delete_one({"email": email.lower()})
    return result.deleted_count > 0


# Document ACL functions
async def create_doc_acl(
    doc_id: str,
    file_path: str,
    access_scope: str,
    created_by: str,
    tenant_id: Optional[str] = None,
    owner_id: Optional[str] = None,
    owner_role: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a document ACL entry with tenant isolation."""
    now = datetime.utcnow()
    acl_doc = {
        "doc_id": doc_id,
        "file_path": file_path,
        "access_scope": access_scope,
        "visibility": access_scope,  # New canonical field name
        "tenant_id": tenant_id or DEFAULT_TENANT_ID,
        "owner_id": owner_id or created_by,
        "owner_role": owner_role or "system",
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "updated_by": created_by
    }
    
    result = await db_manager.doc_acl.insert_one(acl_doc)
    acl_doc["_id"] = result.inserted_id
    return acl_doc


async def get_doc_acl(doc_id: str) -> Optional[Dict[str, Any]]:
    """Get ACL for a document.
    
    First checks doc_acl collection, then falls back to doc_status collection.
    """
    # First check explicit ACL collection
    acl = await db_manager.doc_acl.find_one({"doc_id": doc_id})
    if acl:
        return acl
    
    # Fall back to doc_status collection
    try:
        doc_status_collection = db_manager.db.doc_status
        doc = await doc_status_collection.find_one({"_id": doc_id})
        if doc and doc.get("scope"):
            return {
                "doc_id": doc_id,
                "file_path": doc.get("file_path", ""),
                "access_scope": doc.get("scope", "internal"),
                "created_by": "system",
                "created_at": doc.get("created_at", datetime.utcnow()),
                "updated_at": doc.get("updated_at", datetime.utcnow()),
                "updated_by": "system"
            }
    except Exception as e:
        print(f"Warning: Could not fetch from doc_status: {e}")
    
    return None


async def update_doc_acl(doc_id: str, access_scope: str, updated_by: str) -> bool:
    """Update document access scope in both doc_acl and doc_status collections."""
    success = False
    
    # Update in doc_acl collection
    result = await db_manager.doc_acl.update_one(
        {"doc_id": doc_id},
        {
            "$set": {
                "access_scope": access_scope,
                "visibility": access_scope,  # Keep in sync
                "updated_at": datetime.utcnow(),
                "updated_by": updated_by
            }
        },
        upsert=True  # Create if doesn't exist
    )
    success = result.modified_count > 0 or result.upserted_id is not None
    
    # Also update scope in doc_status collection to keep them in sync
    try:
        doc_status_collection = db_manager.db.doc_status
        await doc_status_collection.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "scope": access_scope,
                    "updated_at": datetime.utcnow()
                }
            }
        )
    except Exception as e:
        print(f"Warning: Could not update scope in doc_status: {e}")
    
    return success


async def get_all_doc_acls() -> List[Dict[str, Any]]:
    """Get all document ACLs.
    
    This function merges data from two sources:
    1. doc_acl collection - explicit ACL entries
    2. doc_status collection - documents with scope field (from uploads)
    
    Returns a unified list where doc_status entries are converted to ACL format.
    """
    # Get existing ACL entries
    acl_cursor = db_manager.doc_acl.find({})
    acl_docs = await acl_cursor.to_list(length=None)
    
    # Create a set of existing doc_ids in ACL collection
    acl_doc_ids = {acl["doc_id"] for acl in acl_docs}
    
    # Get documents from doc_status collection that have scope field
    # These are documents uploaded with scope but not yet in ACL collection
    try:
        doc_status_collection = db_manager.db.doc_status
        status_cursor = doc_status_collection.find({"scope": {"$exists": True}})
        status_docs = await status_cursor.to_list(length=None)
        
        # Add documents from doc_status that aren't already in ACL collection
        for doc in status_docs:
            doc_id = str(doc.get("_id", ""))
            if doc_id and doc_id not in acl_doc_ids:
                # Convert doc_status to ACL format
                acl_entry = {
                    "doc_id": doc_id,
                    "file_path": doc.get("file_path", ""),
                    "access_scope": doc.get("scope", "internal"),
                    "created_by": "system",  # Uploaded via API
                    "created_at": doc.get("created_at", datetime.utcnow()),
                    "updated_at": doc.get("updated_at", datetime.utcnow()),
                    "updated_by": "system"
                }
                acl_docs.append(acl_entry)
    except Exception as e:
        # If we can't access doc_status, just return what we have from doc_acl
        print(f"Warning: Could not fetch from doc_status: {e}")
    
    return acl_docs


async def can_user_access_document(user_role: str, access_scope: str) -> bool:
    """Check if a user role can access a document with given access scope."""
    if access_scope == AccessScope.PUBLIC:
        return True
    if access_scope == AccessScope.INTERNAL:
        return user_role in [UserRole.ADMIN, UserRole.TEACHER]
    return False


# Query logs functions
async def log_query(
    user_email: str,
    user_role: str,
    query_text: str,
    query_mode: str,
    response_preview: str,
    documents_accessed: List[str],
    execution_time_ms: int,
    session_id: str,
    ip_address: str,
    tokens_used: Optional[int] = None,
    cost: Optional[float] = None
) -> Dict[str, Any]:
    """Log a query."""
    log_doc = {
        "user_email": user_email,
        "user_role": user_role,
        "query_text": query_text,
        "query_mode": query_mode,
        "response_preview": response_preview[:200] if response_preview else "",
        "documents_accessed": documents_accessed,
        "execution_time_ms": execution_time_ms,
        "timestamp": datetime.utcnow(),
        "session_id": session_id,
        "ip_address": ip_address,
        "tokens_used": tokens_used,
        "cost": cost
    }
    
    result = await db_manager.query_logs.insert_one(log_doc)
    log_doc["_id"] = result.inserted_id
    return log_doc


async def get_query_logs(
    page: int = 1,
    page_size: int = 20,
    user_email: Optional[str] = None,
    query_mode: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> tuple[List[Dict[str, Any]], int]:
    """Get query logs with pagination and filters."""
    query = {}
    
    if user_email:
        query["user_email"] = user_email
    if query_mode:
        query["query_mode"] = query_mode
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    total = await db_manager.query_logs.count_documents(query)
    cursor = db_manager.query_logs.find(query).sort("timestamp", DESCENDING).skip((page - 1) * page_size).limit(page_size)
    logs = await cursor.to_list(length=page_size)
    
    return logs, total


async def get_query_stats(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, user_email: Optional[str] = None) -> Dict[str, Any]:
    """Get query statistics for dashboard.
    
    Args:
        start_date: Optional start date filter.
        end_date: Optional end date filter.
        user_email: If provided, only aggregate stats for this user.
    """
    match_stage = {}
    if user_email:
        match_stage["user_email"] = user_email
    if start_date or end_date:
        match_stage["timestamp"] = {}
        if start_date:
            match_stage["timestamp"]["$gte"] = start_date
        if end_date:
            match_stage["timestamp"]["$lte"] = end_date
    
    pipeline = []
    if match_stage:
        pipeline.append({"$match": match_stage})
    
    pipeline.extend([
        {
            "$group": {
                "_id": None,
                "total_queries": {"$sum": 1},
                "total_tokens": {"$sum": {"$ifNull": ["$tokens_used", 0]}},
                "total_cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avg_execution_time": {"$avg": "$execution_time_ms"}
            }
        }
    ])
    
    cursor = db_manager.query_logs.aggregate(pipeline)
    results = await cursor.to_list(length=1)
    
    if results:
        return results[0]
    return {
        "total_queries": 0,
        "total_tokens": 0,
        "total_cost": 0,
        "avg_execution_time": 0
    }


async def get_query_trends(days: int = 7, user_email: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get query trends for the last N days.
    
    Args:
        days: Number of days to look back.
        user_email: If provided, only aggregate trends for this user.
    """
    from datetime import timedelta, timezone
    
    UTC_PLUS_7 = timezone(timedelta(hours=7))
    now_utc7 = datetime.now(UTC_PLUS_7)
    start_date = (now_utc7 - timedelta(days=days)).astimezone(timezone.utc).replace(tzinfo=None)
    
    match_filter: Dict[str, Any] = {"timestamp": {"$gte": start_date}}
    if user_email:
        match_filter["user_email"] = user_email
    
    pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp", "timezone": "+07:00"}
                },
                "count": {"$sum": 1},
                "tokens": {"$sum": {"$ifNull": ["$tokens_used", 0]}},
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}}
            }
        },
        {"$sort": {"_id": 1}}
    ]
    
    cursor = db_manager.query_logs.aggregate(pipeline)
    return await cursor.to_list(length=days)


# Audit logs functions
async def log_audit(
    user_email: str,
    action: str,
    resource_type: str,
    resource_id: str,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> Dict[str, Any]:
    """Log an audit event."""
    log_doc = {
        "user_email": user_email,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "old_value": old_value,
        "new_value": new_value,
        "timestamp": datetime.utcnow(),
        "ip_address": ip_address
    }
    
    result = await db_manager.audit_logs.insert_one(log_doc)
    log_doc["_id"] = result.inserted_id
    return log_doc


async def get_audit_logs(
    page: int = 1,
    page_size: int = 20,
    action: Optional[str] = None,
    user_email: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> tuple[List[Dict[str, Any]], int]:
    """Get audit logs with pagination and filters."""
    query = {}
    
    if action:
        query["action"] = action
    if user_email:
        query["user_email"] = user_email
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    total = await db_manager.audit_logs.count_documents(query)
    cursor = db_manager.audit_logs.find(query).sort("timestamp", DESCENDING).skip((page - 1) * page_size).limit(page_size)
    logs = await cursor.to_list(length=page_size)
    
    return logs, total


# Seed data function
async def seed_sample_users():
    """Seed the database with sample users."""
    sample_users = [
        {
            "email": "admin@example.com",
            "password": "12345678",
            "display_name": "Nguyen Qua",
            "role": UserRole.ADMIN,
            "tenant_id": DEFAULT_TENANT_ID,
            "metadata": {"department": "IT Department"}
        },
        {
            "email": "teacher1@example.com",
            "password": "12345678",
            "display_name": "Nguyen Chi",
            "role": UserRole.TEACHER,
            "tenant_id": DEFAULT_TENANT_ID,
            "metadata": {"department": "Computer Science"}
        },
        {
            "email": "teacher2@example.com",
            "password": "12345678",
            "display_name": "Nguyen Bich",
            "role": UserRole.TEACHER,
            "tenant_id": DEFAULT_TENANT_ID,
            "metadata": {"department": "Information Systems"}
        },
        {
            "email": "student1@example.com",
            "password": "12345678",
            "display_name": "Nguyen Van C",
            "role": UserRole.STUDENT,
            "tenant_id": DEFAULT_TENANT_ID,
            "metadata": {"student_id": "21520001"}
        },
        {
            "email": "student2@example.com",
            "password": "12345678",
            "display_name": "Nguyen Thi D",
            "role": UserRole.STUDENT,
            "tenant_id": DEFAULT_TENANT_ID,
            "metadata": {"student_id": "21520002"}
        }
    ]
    
    created_count = 0
    for user_data in sample_users:
        existing = await get_user_by_email(user_data["email"])
        if not existing:
            await create_user(
                email=user_data["email"],
                password=user_data["password"],
                display_name=user_data["display_name"],
                role=user_data["role"],
                metadata=user_data.get("metadata"),
                tenant_id=user_data.get("tenant_id", DEFAULT_TENANT_ID),
            )
            created_count += 1
            print(f"Created user: {user_data['email']}")
        else:
            print(f"User already exists: {user_data['email']}")
    
    return created_count


# ============================================================================
# Document Scope Management Helpers
# ============================================================================

def get_view_for_role(role: str) -> str:
    """
    Get the appropriate MongoDB view/collection name for a user role.
    
    Args:
        role: User role ("admin", "teacher", "student")
    
    Returns:
        str: View or collection name to query
    """
    if role in [UserRole.ADMIN, UserRole.TEACHER]:
        return "view_teacher_docs"
    elif role == UserRole.STUDENT:
        return "view_student_docs"
    else:
        # Default to student view for unknown roles (most restrictive)
        return "view_student_docs"


async def get_docs_by_user_role(
    user_role: str,
    page: int = 1,
    page_size: int = 20
) -> tuple[List[Dict[str, Any]], int]:
    """
    Get documents accessible by a specific user role.
    Uses MongoDB views for role-based filtering.
    
    Args:
        user_role: The user's role
        page: Page number (1-indexed)
        page_size: Number of documents per page
    
    Returns:
        tuple: (list of documents, total count)
    """
    view_name = get_view_for_role(user_role)
    
    try:
        collection = db_manager.db[view_name]
        
        # Count total documents in view
        total = await collection.count_documents({})
        
        # Get paginated results
        skip = (page - 1) * page_size
        cursor = collection.find({}).skip(skip).limit(page_size)
        docs = await cursor.to_list(length=page_size)
        
        return docs, total
        
    except Exception as e:
        # Fallback to doc_status if views don't exist
        print(f"Warning: Could not use view {view_name}, falling back to direct query: {e}")
        
        query = {}
        if user_role == UserRole.STUDENT:
            query["scope"] = AccessScope.PUBLIC
        
        collection = db_manager.db.doc_status
        total = await collection.count_documents(query)
        
        skip = (page - 1) * page_size
        cursor = collection.find(query).skip(skip).limit(page_size)
        docs = await cursor.to_list(length=page_size)
        
        return docs, total


async def update_document_scope_with_sync(
    doc_id: str,
    new_scope: str,
    updated_by: str
) -> Dict[str, Any]:
    """
    Update document scope in both MongoDB and Neo4j.
    
    This function updates:
    1. The scope field in doc_status collection
    2. The access_scope field in doc_acl collection
    3. The scope labels in Neo4j (via sync_scope_to_neo4j)
    
    Args:
        doc_id: Document ID to update
        new_scope: New scope value ("public" or "internal")
        updated_by: Email of user making the change
    
    Returns:
        dict: Status of the update operation
    """
    from datetime import datetime
    
    result = {
        "doc_id": doc_id,
        "new_scope": new_scope,
        "mongodb_updated": False,
        "acl_updated": False,
        "neo4j_synced": False,
        "error": None
    }
    
    try:
        # Get old scope for Neo4j sync
        acl = await get_doc_acl(doc_id)
        old_scope = acl.get("access_scope", "internal") if acl else "internal"
        
        # Update doc_status collection
        doc_status_result = await db_manager.db.doc_status.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "scope": new_scope,
                    "updated_at": datetime.utcnow(),
                    "updated_by": updated_by
                }
            }
        )
        result["mongodb_updated"] = doc_status_result.modified_count > 0 or doc_status_result.matched_count > 0
        
        # Update doc_acl collection
        if acl:
            acl_updated = await update_doc_acl(doc_id, new_scope, updated_by)
            result["acl_updated"] = acl_updated
        else:
            # Create new ACL entry if it doesn't exist
            await create_doc_acl(
                doc_id=doc_id,
                file_path="",
                access_scope=new_scope,
                created_by=updated_by
            )
            result["acl_updated"] = True
        
        # Sync to Neo4j (import here to avoid circular imports)
        try:
            from .routers.scope_routes import sync_scope_to_neo4j
            await sync_scope_to_neo4j(doc_id, old_scope, new_scope)
            result["neo4j_synced"] = True
        except Exception as neo4j_error:
            result["neo4j_synced"] = False
            print(f"Warning: Neo4j sync failed for {doc_id}: {neo4j_error}")
        
    except Exception as e:
        result["error"] = str(e)
    
    return result


async def get_accessible_doc_ids(user_role: str, user_email: Optional[str] = None) -> List[str]:
    """
    Get list of document IDs accessible by a user role.
    
    Access control matrix:
      Document type               | Admin | Teacher | Student(owner) | Student(other)
      Teacher/admin public doc     |  See  |   See   |      See       |      See
      Teacher/admin internal doc   |  See  |   See   |       -        |       -
      Student-uploaded doc         |  See  |    -    |      See       |       -
    
    Args:
        user_role: The user's role
        user_email: The user's email (required for students to identify their own docs)
    
    Returns:
        list: List of accessible document IDs
    """
    accessible_ids = set()
    
    # Primary source of truth: doc_status collection (has uploaded_by_role)
    try:
        doc_status_collection = db_manager.db.doc_status
        
        if user_role == UserRole.STUDENT:
            # Students can access:
            # 1. Their own uploads (any scope)
            # 2. Non-student public docs (uploaded by teacher/admin/system)
            status_query = {"$or": []}
            if user_email:
                status_query["$or"].append({"uploaded_by": user_email})
            status_query["$or"].append({
                "scope": AccessScope.PUBLIC,
                "uploaded_by_role": {"$ne": "student"}
            })
            # Also include docs without uploaded_by_role (legacy docs) that are public
            status_query["$or"].append({
                "scope": AccessScope.PUBLIC,
                "uploaded_by_role": {"$exists": False}
            })
        elif user_role == UserRole.TEACHER:
            # Teachers see everything except student uploads
            status_query = {"$or": [
                {"uploaded_by_role": {"$ne": "student"}},
                {"uploaded_by_role": {"$exists": False}}
            ]}
        else:
            # Admin or unknown: no filter
            status_query = {}
        
        status_cursor = doc_status_collection.find(status_query, {"_id": 1})
        status_docs = await status_cursor.to_list(length=None)
        for doc in status_docs:
            accessible_ids.add(str(doc["_id"]))
    except Exception as e:
        print(f"Warning: Could not check doc_status for accessible docs: {e}")
    
    # Fallback: also check doc_acl for docs not yet in doc_status
    try:
        acl_query = {}
        if user_role == UserRole.STUDENT:
            acl_query["access_scope"] = AccessScope.PUBLIC
        
        cursor = db_manager.doc_acl.find(acl_query, {"doc_id": 1})
        docs = await cursor.to_list(length=None)
        for doc in docs:
            accessible_ids.add(doc["doc_id"])
    except Exception:
        pass
    
    return list(accessible_ids)


async def get_accessible_chunk_ids(user_role: str, user_email: Optional[str] = None) -> set:
    """
    Get the set of chunk IDs accessible by a user role.
    
    This maps accessible doc_ids to their chunk_ids via the chunks/text_chunks
    collections. This is needed because Neo4j entities reference chunks via
    source_id (e.g. 'chunk-xxx'), not doc_ids (e.g. 'doc-xxx').
    
    Only admin has unrestricted access (returns None = no filtering).
    Teachers and students are filtered according to the document ACL matrix.
    
    Args:
        user_role: The user's role
        user_email: The user's email (for per-student/teacher isolation)
    
    Returns:
        set or None: None if unrestricted (admin), otherwise set of accessible chunk IDs
    """
    if user_role == UserRole.ADMIN:
        # Only admin has unrestricted access
        return None
    
    # Get accessible document IDs
    accessible_doc_ids = await get_accessible_doc_ids(user_role, user_email)
    
    if not accessible_doc_ids:
        return set()
    
    accessible_chunks = set()
    
    try:
        # Look up chunk_ids from chunks collection (maps full_doc_id -> chunk _id)
        chunks_collection = db_manager.db.chunks
        chunk_cursor = chunks_collection.find(
            {"full_doc_id": {"$in": accessible_doc_ids}},
            {"_id": 1}
        )
        chunk_docs = await chunk_cursor.to_list(length=None)
        for doc in chunk_docs:
            accessible_chunks.add(str(doc["_id"]))
    except Exception as e:
        print(f"Warning: Could not fetch chunks: {e}")
    
    # Also check text_chunks collection as backup
    try:
        text_chunks_collection = db_manager.db.text_chunks
        tc_cursor = text_chunks_collection.find(
            {"full_doc_id": {"$in": accessible_doc_ids}},
            {"_id": 1}
        )
        tc_docs = await tc_cursor.to_list(length=None)
        for doc in tc_docs:
            accessible_chunks.add(str(doc["_id"]))
    except Exception as e:
        print(f"Warning: Could not fetch text_chunks: {e}")
    
    return accessible_chunks


# Initialize function for server startup
async def init_database():
    """Initialize database connection, seed data, and create RLS indexes."""
    await db_manager.initialize()
    await seed_sample_users()

    # Create RLS indexes for tenant isolation and role-based queries
    try:
        from .rls import create_rls_indexes
        await create_rls_indexes()
        print("RLS indexes created successfully!")
    except Exception as e:
        print(f"Warning: Could not create RLS indexes: {e}")

    # Migrate existing users to have tenant_id if missing
    try:
        await db_manager.users.update_many(
            {"tenant_id": {"$exists": False}},
            {"$set": {"tenant_id": DEFAULT_TENANT_ID}},
        )
        # Migrate existing documents to have tenant_id, owner_id, owner_role, visibility
        await db_manager.db.doc_status.update_many(
            {"tenant_id": {"$exists": False}},
            [{"$set": {
                "tenant_id": DEFAULT_TENANT_ID,
                "owner_id": {"$ifNull": ["$uploaded_by", "system"]},
                "owner_role": {"$ifNull": ["$uploaded_by_role", "system"]},
                "visibility": {"$ifNull": ["$scope", "internal"]},
            }}],
        )
        await db_manager.doc_acl.update_many(
            {"tenant_id": {"$exists": False}},
            [{"$set": {
                "tenant_id": DEFAULT_TENANT_ID,
                "owner_id": {"$ifNull": ["$created_by", "system"]},
                "owner_role": "system",
                "visibility": {"$ifNull": ["$access_scope", "internal"]},
            }}],
        )
        print("Data migration for tenant_id/owner_id/visibility completed!")
    except Exception as e:
        print(f"Warning: Data migration failed: {e}")

    print("Database initialized successfully!")


# CLI command to run seed
if __name__ == "__main__":
    import asyncio
    asyncio.run(init_database())
