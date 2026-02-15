"""
Row-Level Security (RLS) Module — Database-First Authorization.

This module is the SINGLE SOURCE OF TRUTH for all authorization query logic
in the KMS. Every MongoDB read/update query MUST use the builders here to
guarantee tenant isolation and role-based document access.

Design Principles:
    1. Authorization is enforced INSIDE the MongoDB query filter — never after.
    2. Every query includes `tenant_id` — cross-tenant access is impossible.
    3. Visibility updates use conditional MongoDB updates with `owner_id` checks.
    4. The UI is presentation-only — it NEVER enforces security.

Access Control Matrix:
    ┌──────────────────────────────────┬───────┬─────────┬───────────────┬────────────────┐
    │ Document Type                    │ Admin │ Teacher │ Student(self) │ Student(other) │
    ├──────────────────────────────────┼───────┼─────────┼───────────────┼────────────────┤
    │ Teacher doc (internal)           │  ✔    │ Owner ✔ │      ✗        │       ✗        │
    │ Teacher doc (public)             │  ✔    │ All ✔   │      ✔        │       ✔        │
    │ Student doc (always public)      │  ✔    │   ✗     │    Owner ✔    │       ✗        │
    │ Admin doc (internal)             │  ✔    │  All ✔  │      ✗        │       ✗        │
    │ Admin doc (public)               │  ✔    │  All ✔  │      ✔        │       ✔        │
    └──────────────────────────────────┴───────┴─────────┴───────────────┴────────────────┘

Visibility Update Rules:
    - Teacher doc: Only the owner OR admin can change visibility.
    - Student doc: Nobody can change visibility (always public, admin-only view).
    - Admin doc: Only admin can change visibility.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Union

from .db_setup import UserRole


# READ QUERY BUILDERS — Used for all document listing / retrieval endpoints
def build_read_filter(
    tenant_id: str,
    user_role: str,
    user_email: str,
) -> Dict[str, Any]:
    """
    Build a MongoDB query filter that enforces row-level security for
    document reads. This is the ONLY way to build a read query.

    EVERY call includes tenant_id — no exceptions.

    Args:
        tenant_id:  Current user's tenant (REQUIRED, never empty).
        user_role:  One of 'admin', 'teacher', 'student'.
        user_email: Current user's email (used for teacher ownership checks).

    Returns:
        dict: A MongoDB filter that guarantees the user only sees
              documents they are authorized to access.

    Raises:
        ValueError: If tenant_id is empty/None — this is a hard stop.
    """
    if not tenant_id:
        raise ValueError("tenant_id is REQUIRED for every query — refusing to proceed")

    base = {"tenant_id": tenant_id}

    if user_role == UserRole.ADMIN:
        # Admin sees ALL documents in their tenant.
        return base

    if user_role == UserRole.TEACHER:
        # Teacher sees:
        #   1. Own documents (any visibility)
        #   2. Other teachers' PUBLIC documents
        #   3. ALL admin documents (public + internal)
        # Teacher CANNOT see: student-uploaded documents.
        base["$or"] = [
            # Own docs
            {"owner_id": user_email, "owner_role": UserRole.TEACHER},
            # Other teachers' public docs
            {"owner_role": UserRole.TEACHER, "visibility": "public"},
            # All admin docs (public + internal visible to teachers)
            {"owner_role": UserRole.ADMIN},
        ]
        return base

    if user_role == UserRole.STUDENT:
        # Student sees:
        #   1. Their OWN uploaded documents (any visibility)
        #   2. Teacher PUBLIC documents
        #   3. Admin PUBLIC documents
        # Student CANNOT see: other students' docs, internal teacher/admin docs.
        base["$or"] = [
            # Own docs — students can always see what they uploaded
            {"owner_id": user_email, "owner_role": UserRole.STUDENT},
            # Teacher public docs
            {"owner_role": UserRole.TEACHER, "visibility": "public"},
            # Admin public docs
            {"owner_role": UserRole.ADMIN, "visibility": "public"},
        ]
        return base

    # Unknown role → deny all (fail closed)
    return {"tenant_id": tenant_id, "_id": {"$exists": False}}


def build_read_filter_for_doc_ids(
    tenant_id: str,
    user_role: str,
    user_email: str,
) -> Dict[str, Any]:
    """
    Build a MongoDB query filter for retrieving accessible document IDs.
    Same logic as build_read_filter but returns only _id projections.
    Used by the retrieval/chat system to scope vector search results.
    """
    return build_read_filter(tenant_id, user_role, user_email)


# WRITE / UPDATE QUERY BUILDERS — Used for visibility changes
class VisibilityUpdateResult:
    """Result of a conditional visibility update."""
    __slots__ = ("matched", "modified", "error")

    def __init__(self, matched: bool, modified: bool, error: Optional[str] = None):
        self.matched = matched
        self.modified = modified
        self.error = error

    @property
    def authorized(self) -> bool:
        """True if the query matched (user was authorized)."""
        return self.matched


def build_visibility_update_filter(
    tenant_id: str,
    user_role: str,
    user_email: str,
    doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Build a MongoDB filter for a conditional visibility update.

    The filter ensures that the update ONLY succeeds if the user is
    authorized to change this document's visibility. If the filter
    doesn't match any document, the update is a no-op → 403.

    Rules:
        - Student: CANNOT change visibility → returns None (reject early).
        - Teacher: Can only change visibility of THEIR OWN teacher docs.
        - Admin: Can change visibility of ANY doc in their tenant.

    Args:
        tenant_id:  Current user's tenant.
        user_role:  One of 'admin', 'teacher', 'student'.
        user_email: Current user's email.
        doc_id:     Document ID to update.

    Returns:
        dict or None: MongoDB filter for update_one(), or None if the
                      user's role fundamentally cannot update visibility.
    """
    if not tenant_id:
        raise ValueError("tenant_id is REQUIRED — refusing to proceed")

    if user_role == UserRole.STUDENT:
        # Students CANNOT change visibility. Period.
        return None

    if user_role == UserRole.TEACHER:
        # Teacher can ONLY change their own teacher documents.
        # This single filter does both: checks tenant + ownership + role.
        return {
            "_id": doc_id,
            "tenant_id": tenant_id,
            "owner_id": user_email,
            "owner_role": UserRole.TEACHER,
        }

    if user_role == UserRole.ADMIN:
        # Admin can change ANY document in their tenant.
        # But teachers/students cannot change admin docs — enforced by
        # the teacher filter above not matching admin docs.
        return {
            "_id": doc_id,
            "tenant_id": tenant_id,
        }

    # Unknown role → deny
    return None


def build_visibility_update_set(
    new_visibility: str,
    updated_by: str,
) -> Dict[str, Any]:
    """
    Build the $set portion of a visibility update.

    Args:
        new_visibility: 'public' or 'internal'.
        updated_by:     Email of the user making the change.

    Returns:
        dict: The $set document for update_one().
    """
    return {
        "$set": {
            "visibility": new_visibility,
            # Keep backward compatibility with old field name
            "scope": new_visibility,
            "updated_at": datetime.utcnow(),
            "updated_by": updated_by,
        }
    }


# DOCUMENT CREATION HELPERS — Set correct fields on upload
def build_document_metadata(
    tenant_id: str,
    owner_id: str,
    owner_role: str,
    visibility: str,
) -> Dict[str, Any]:
    """
    Build the authorization metadata that MUST be set on every new document.

    Args:
        tenant_id:   Tenant the document belongs to.
        owner_id:    Email of the uploader.
        owner_role:  Role of the uploader ('admin', 'teacher', 'student').
        visibility:  'public' or 'internal'.

    Returns:
        dict: Fields to merge into the document before insertion.
    """
    if not tenant_id:
        raise ValueError("tenant_id is REQUIRED — refusing to create document")

    # Enforce business rules for initial visibility
    if owner_role == UserRole.STUDENT:
        # Student documents are ALWAYS public (but only admin can see them)
        visibility = "public"

    return {
        "tenant_id": tenant_id,
        "owner_id": owner_id,
        "owner_role": owner_role,
        "visibility": visibility,
        # Backward compatibility
        "uploaded_by": owner_id,
        "uploaded_by_role": owner_role,
        "scope": visibility,
    }


def validate_visibility_value(visibility: str) -> str:
    """Validate and normalize visibility value."""
    visibility = visibility.lower().strip()
    if visibility not in ("public", "internal"):
        raise ValueError(f"Invalid visibility '{visibility}'. Must be 'public' or 'internal'.")
    return visibility


# ACCESSIBLE DOC IDS — For retrieval / chat scoping
async def get_accessible_doc_ids_rls(
    tenant_id: str,
    user_role: str,
    user_email: str,
) -> Optional[List[str]]:
    """
    Get the list of document IDs the current user can access.

    Returns None for admin (unrestricted access within tenant).
    Returns a list of doc_ids for teacher/student (restricted).

    This function queries doc_status with the RLS filter — no post-filtering.

    Args:
        tenant_id:  Current user's tenant.
        user_role:  One of 'admin', 'teacher', 'student'.
        user_email: Current user's email.

    Returns:
        list[str] or None: None means unrestricted; list means restricted.
    """
    if user_role == UserRole.ADMIN:
        return None  # Admin has unrestricted access within their tenant

    from .db_setup import db_manager

    rls_filter = build_read_filter(tenant_id, user_role, user_email)
    cursor = db_manager.db.doc_status.find(rls_filter, {"_id": 1})
    docs = await cursor.to_list(length=None)
    return [str(doc["_id"]) for doc in docs]


async def get_accessible_chunk_ids_rls(
    tenant_id: str,
    user_role: str,
    user_email: str,
) -> Optional[Set[str]]:
    """
    Get the set of chunk IDs the current user can access.

    Maps accessible doc IDs → chunk IDs via the chunks collection.
    Returns None for admin (unrestricted access within tenant).

    Args:
        tenant_id:  Current user's tenant.
        user_role:  One of 'admin', 'teacher', 'student'.
        user_email: Current user's email.

    Returns:
        set[str] or None: None means unrestricted; set means restricted.
    """
    accessible_doc_ids = await get_accessible_doc_ids_rls(tenant_id, user_role, user_email)
    if accessible_doc_ids is None:
        return None  # Admin — unrestricted

    if not accessible_doc_ids:
        return set()

    from .db_setup import db_manager

    accessible_chunks = set()

    # Look up chunk IDs from the chunks collection
    try:
        chunks_collection = db_manager.db.chunks
        chunk_cursor = chunks_collection.find(
            {"full_doc_id": {"$in": accessible_doc_ids}},
            {"_id": 1},
        )
        chunk_docs = await chunk_cursor.to_list(length=None)
        for doc in chunk_docs:
            accessible_chunks.add(str(doc["_id"]))
    except Exception:
        pass

    # Also check text_chunks as backup
    try:
        tc_collection = db_manager.db.text_chunks
        tc_cursor = tc_collection.find(
            {"full_doc_id": {"$in": accessible_doc_ids}},
            {"_id": 1},
        )
        tc_docs = await tc_cursor.to_list(length=None)
        for doc in tc_docs:
            accessible_chunks.add(str(doc["_id"]))
    except Exception:
        pass

    return accessible_chunks


# INDEXES — Must be created at server startup
async def create_rls_indexes():
    """
    Create compound indexes that optimize every RLS query pattern.

    Must be called ONCE during server startup (after db_manager.initialize).
    """
    from .db_setup import db_manager

    db = db_manager.db
    doc_status = db.doc_status

    # ── Primary RLS compound indexes ──

    # Covers admin read: {tenant_id: 1}
    # Covers teacher read: {tenant_id, owner_role, visibility}
    # Covers student read: {tenant_id, owner_role, visibility}
    await doc_status.create_index(
        [("tenant_id", 1), ("owner_role", 1), ("visibility", 1)],
        name="rls_tenant_role_visibility",
    )

    # Covers teacher own-doc read + visibility update: {tenant_id, owner_id, owner_role}
    await doc_status.create_index(
        [("tenant_id", 1), ("owner_id", 1), ("owner_role", 1)],
        name="rls_tenant_owner_role",
    )

    # Covers admin visibility update: {tenant_id, _id} (covered by _id index + tenant)
    await doc_status.create_index(
        [("tenant_id", 1)],
        name="rls_tenant",
    )

    # ── doc_acl indexes ──
    doc_acl = db.doc_acl
    await doc_acl.create_index(
        [("tenant_id", 1), ("doc_id", 1)],
        name="rls_acl_tenant_doc",
        unique=True,
    )
    await doc_acl.create_index(
        [("tenant_id", 1), ("owner_id", 1)],
        name="rls_acl_tenant_owner",
    )

    # ── Users indexes ──
    users = db.users
    await users.create_index(
        [("tenant_id", 1), ("email", 1)],
        name="rls_user_tenant_email",
    )
    await users.create_index(
        [("tenant_id", 1), ("role", 1)],
        name="rls_user_tenant_role",
    )

    # ── Query/Audit logs indexes ──
    await db.query_logs.create_index(
        [("tenant_id", 1), ("user_email", 1), ("timestamp", -1)],
        name="rls_querylog_tenant_user_time",
    )
    await db.audit_logs.create_index(
        [("tenant_id", 1), ("timestamp", -1)],
        name="rls_auditlog_tenant_time",
    )


# NEO4J GRAPH RLS — Same authorization logic applied to Knowledge Graph
async def get_graph_accessible_chunks(
    tenant_id: str,
    user_role: str,
    user_email: str,
) -> Optional[Set[str]]:
    """
    Get accessible chunk IDs for graph filtering.

    This is the graph-specific version that uses the same RLS rules.
    Graph nodes/edges are filtered by their source_id (chunk references).

    Returns None for admin (show everything in tenant).
    Returns a set of chunk IDs for restricted users.
    """
    return await get_accessible_chunk_ids_rls(tenant_id, user_role, user_email)


def _get_node_source_id(node) -> str:
    """Extract source_id from a graph node (Pydantic KnowledgeGraphNode or dict)."""
    if isinstance(node, dict):
        return node.get("source_id", "")
    # Pydantic KnowledgeGraphNode: source_id lives inside .properties
    props = getattr(node, "properties", None)
    if isinstance(props, dict):
        return props.get("source_id", "")
    return getattr(node, "source_id", "")


def _get_node_id(node) -> str:
    """Extract node id from a graph node (Pydantic KnowledgeGraphNode or dict)."""
    if isinstance(node, dict):
        return node.get("id", node.get("label", ""))
    return getattr(node, "id", "") or getattr(node, "label", "")


def _get_edge_endpoints(edge) -> tuple:
    """Extract (source, target, source_id) from a graph edge."""
    if isinstance(edge, dict):
        src = edge.get("source", edge.get("src_id", ""))
        tgt = edge.get("target", edge.get("tgt_id", ""))
        src_id = edge.get("source_id", "")
    else:
        src = getattr(edge, "source", "") or getattr(edge, "src_id", "")
        tgt = getattr(edge, "target", "") or getattr(edge, "tgt_id", "")
        props = getattr(edge, "properties", None)
        src_id = props.get("source_id", "") if isinstance(props, dict) else getattr(edge, "source_id", "")
    return src, tgt, src_id


def filter_graph_by_chunks(
    graph_data,
    accessible_chunks: Optional[Set[str]],
):
    """
    Filter graph nodes and edges based on accessible chunks.

    Accepts both a Pydantic ``KnowledgeGraph`` model (from
    ``rag.get_knowledge_graph``) and a plain ``dict``.

    If accessible_chunks is None → return unfiltered (admin).
    If accessible_chunks is empty → return empty graph.
    Otherwise → filter nodes/edges by source_id.
    """
    if accessible_chunks is None:
        return graph_data

    # Normalise input — support both Pydantic model and dict
    if isinstance(graph_data, dict):
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
    else:
        # Pydantic KnowledgeGraph (or any object with .nodes / .edges)
        nodes = getattr(graph_data, "nodes", [])
        edges = getattr(graph_data, "edges", [])

    if not accessible_chunks:
        # Return same type as input but empty
        if isinstance(graph_data, dict):
            return {"nodes": [], "edges": []}
        try:
            return graph_data.__class__(nodes=[], edges=[])
        except Exception:
            return {"nodes": [], "edges": []}

    filtered_nodes = []
    allowed_node_ids = set()

    for node in nodes:
        source_id = _get_node_source_id(node)
        if _is_source_allowed(source_id, accessible_chunks):
            filtered_nodes.append(node)
            allowed_node_ids.add(_get_node_id(node))

    filtered_edges = []
    for edge in edges:
        src, tgt, edge_source = _get_edge_endpoints(edge)
        if (
            src in allowed_node_ids
            and tgt in allowed_node_ids
            and _is_source_allowed(edge_source, accessible_chunks)
        ):
            filtered_edges.append(edge)

    # Return same type as input
    if isinstance(graph_data, dict):
        return {"nodes": filtered_nodes, "edges": filtered_edges}
    try:
        return graph_data.__class__(nodes=filtered_nodes, edges=filtered_edges)
    except Exception:
        return {"nodes": filtered_nodes, "edges": filtered_edges}


def _is_source_allowed(source_id_str: str, accessible_chunks: Set[str]) -> bool:
    """Check if a source_id references any accessible chunk."""
    if not source_id_str:
        return False
    parts = str(source_id_str).split("<SEP>")
    return any(p.strip() in accessible_chunks for p in parts if p.strip())
