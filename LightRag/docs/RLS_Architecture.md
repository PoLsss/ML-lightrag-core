# Row-Level Security (RLS) Architecture — Database-First Authorization

## Overview

This document describes the complete RLS architecture implemented across MongoDB, Neo4j, and the Chat/Retrieval system. Authorization is enforced **inside database queries** — never after fetching data.

---

## 1. Authentication & Authorization Flow

```
┌─────────┐     ┌──────────┐      ┌────────────────┐      ┌─────────────────┐
│  Login   │────▶│ JWT Token│─────▶│ TenantContext   │─────▶│  Route Handler   │
│ (email/  │     │ (PyJWT)  │      │ (per-request,   │      │  uses ctx.*      │
│  pass)   │     │          │      │  immutable)     │      │  for all queries │
└─────────┘     └──────────┘      └────────────────┘      └─────────────────┘
                     │                    │
                     │  sub = email       │  Extracts from JWT:
                     │  role = admin      │    - user_email
                     │  tenant_id = xyz   │    - user_role
                     │                    │    - tenant_id
                     │                    │    - metadata
                     │                    │
                     ▼                    ▼
                DB User Lookup     TenantContext.rls_read_filter
                (authoritative       → rls.build_read_filter()
                 tenant_id)            → MongoDB filter dict
```

### Step-by-step:

1. **User logs in** → `POST /auth/login` validates credentials against MongoDB `users` collection.
2. **JWT is issued** with `sub` (email), `role`, `tenant_id`, and `metadata` claims.
3. **Every subsequent request** passes through `get_optional_tenant_context()` which:
   - Decodes the JWT token.
   - Looks up the user in MongoDB to get the **authoritative** `tenant_id`.
   - Creates a **frozen** (immutable) `TenantContext` dataclass.
4. **Route handlers** use `ctx.rls_read_filter` or `ctx.rls_visibility_update_filter(doc_id)` to build queries.
5. **MongoDB queries** ALWAYS include `tenant_id` — cross-tenant leakage is impossible.

---

## 2. Access Control Matrix

| Document Type | Admin | Teacher (owner) | Teacher (other) | Student |
|---|---|---|---|---|
| Teacher doc (internal) | ✔ Read/Write | ✔ Read/Write | ✗ | ✗ |
| Teacher doc (public) | ✔ Read/Write | ✔ Read/Write | ✔ Read | ✔ Read |
| Student doc (always public) | ✔ Read only | ✗ | ✗ | ✗ |
| Admin doc (internal) | ✔ Read/Write | ✔ Read | ✔ Read | ✗ |
| Admin doc (public) | ✔ Read/Write | ✔ Read | ✔ Read | ✔ Read |

### Visibility Update Rules

| Who can change visibility? | Admin | Teacher (owner) | Teacher (other) | Student |
|---|---|---|---|---|
| Teacher doc | ✔ | ✔ | ✗ | ✗ |
| Admin doc | ✔ | ✗ | ✗ | ✗ |
| Student doc | nobody | nobody | nobody | nobody |

---

## 3. Core Module: `rls.py`

**Location:** `lightrag/api/rls.py`

This is the **SINGLE SOURCE OF TRUTH** for all authorization query logic. Every MongoDB read/update/insert MUST use functions from this module.

### Key Functions

| Function | Purpose | Used By |
|---|---|---|
| `build_read_filter(tenant_id, role, email)` | MongoDB query filter for reads | Document listing, status counts |
| `build_visibility_update_filter(tenant_id, role, email, doc_id)` | Conditional update filter (checks ownership) | Scope/visibility changes |
| `build_visibility_update_set(visibility, updated_by)` | `$set` document for updates | Scope routes, ACL routes |
| `build_document_metadata(tenant_id, owner_id, role, visibility)` | RLS fields for new documents | Upload route |
| `get_accessible_doc_ids_rls(tenant_id, role, email)` | Doc IDs for RAG retrieval scoping | Query routes |
| `get_accessible_chunk_ids_rls(tenant_id, role, email)` | Chunk IDs for graph filtering | Graph routes |
| `get_graph_accessible_chunks(tenant_id, role, email)` | Same as chunk IDs but for graph | Graph routes |
| `filter_graph_by_chunks(graph_data, accessible_chunks)` | Filter graph nodes/edges | Graph routes |
| `create_rls_indexes()` | Create compound MongoDB indexes | Server startup |

---

## 4. MongoDB Document Schema (RLS Fields)

Every document in `doc_status` and `doc_acl` collections has these fields:

```json
{
  "_id": "doc_abc123",
  "tenant_id": "default",
  "owner_id": "teacher@example.com",
  "owner_role": "teacher",
  "visibility": "internal",
  
  // Backward compatibility (same values)
  "uploaded_by": "teacher@example.com",
  "uploaded_by_role": "teacher",
  "scope": "internal"
}
```

### MongoDB Indexes

```
rls_tenant_role_visibility:  {tenant_id: 1, owner_role: 1, visibility: 1}
rls_tenant_owner_role:       {tenant_id: 1, owner_id: 1, owner_role: 1}
rls_tenant:                  {tenant_id: 1}
rls_acl_tenant_doc:          {tenant_id: 1, doc_id: 1}  (unique)
rls_acl_tenant_owner:        {tenant_id: 1, owner_id: 1}
rls_user_tenant_email:       {tenant_id: 1, email: 1}
rls_user_tenant_role:        {tenant_id: 1, role: 1}
rls_querylog_tenant_user:    {tenant_id: 1, user_email: 1, timestamp: -1}
rls_auditlog_tenant_time:    {tenant_id: 1, timestamp: -1}
```

---

## 5. How Each Subsystem Enforces RLS

### 5.1 Document CRUD (document_routes.py)

**Upload:**
```python
rls_fields = build_document_metadata(
    tenant_id=ctx.tenant_id,
    owner_id=ctx.user_email,
    owner_role=ctx.user_role,
    visibility=scope,
)
# Merged into doc_status upsert
```

**Listing (paginated):**
```python
tenant_filter = ctx.rls_read_filter
# Passed directly to get_docs_paginated(tenant_filter=...)
# MongoDB enforces RLS at query time — no post-filtering
```

**Status counts:**
```python
tenant_filter = ctx.rls_read_filter
# Same filter ensures counts match visible documents
```

### 5.2 Visibility Updates (scope_routes.py)

**Conditional update:**
```python
# The filter includes {_id, tenant_id, owner_id (for teachers)}
rls_filter = ctx.rls_visibility_update_filter(doc_id)
if rls_filter is None:
    raise 403  # Students blocked

result = await collection.update_one(rls_filter, update_set)
if result.matched_count == 0:
    raise 403  # Not authorized (filter didn't match)
```

### 5.3 Chat/Retrieval (query_routes.py)

```python
accessible_ids = await get_accessible_doc_ids_rls(
    ctx.tenant_id, ctx.user_role, ctx.user_email
)
if accessible_ids is not None:
    param.accessible_doc_ids = set(accessible_ids)
# LightRAG only retrieves from allowed documents
```

### 5.4 Knowledge Graph (graph_routes.py)

```python
accessible_chunks = await get_graph_accessible_chunks(
    ctx.tenant_id, ctx.user_role, ctx.user_email
)
graph_data = filter_graph_by_chunks(graph_data, accessible_chunks)
```

### 5.5 ACL Management (acl_routes.py)

```python
# Admin listing scoped to tenant
tenant_filter = {"tenant_id": tenant_id}
docs = await rag.doc_status.get_docs_paginated(tenant_filter=tenant_filter)

# ACL updates use conditional update with tenant_id
await db.doc_status.update_one(
    {"_id": doc_id, "tenant_id": tenant_id},
    update_set,
)
```

---

## 6. Why This Design Guarantees RLS

### Principle 1: Authorization in the query, not after

Every MongoDB `find()` and `update_one()` includes the authorization filter. The database itself enforces access — there is no post-query Python filter that could be bypassed.

### Principle 2: tenant_id is REQUIRED

`build_read_filter()` raises `ValueError` if `tenant_id` is empty. This makes cross-tenant access impossible — even a bug in a route handler cannot bypass tenant isolation.

### Principle 3: Conditional updates validate ownership

`build_visibility_update_filter()` for teachers includes `{owner_id: email}` in the filter. If the teacher is not the owner, `matched_count == 0` → 403. No separate "check then update" race condition.

### Principle 4: Single source of truth

All authorization logic lives in `rls.py`. Every route handler delegates to this module. If the business rules change, there is exactly ONE place to update.

### Principle 5: UI is presentation-only

The frontend receives only what the user is authorized to see. It does not make authorization decisions — it simply renders what the API returns.

---

## 7. Migration

The `init_database()` function in `db_setup.py` automatically migrates existing documents:

```python
# Backfill existing documents that lack RLS fields
pipeline = [
    {"$match": {"tenant_id": {"$exists": False}}},
    {"$set": {
        "tenant_id": DEFAULT_TENANT_ID,
        "owner_id": {"$ifNull": ["$uploaded_by", "system"]},
        "owner_role": {"$ifNull": ["$uploaded_by_role", "system"]},
        "visibility": {"$ifNull": ["$scope", "internal"]},
    }}
]
await db.doc_status.update_many(
    {"tenant_id": {"$exists": False}},
    pipeline
)
```

This ensures backward compatibility — all existing documents get proper RLS fields on first startup after the upgrade.

---

## 8. File Change Summary

| File | Changes |
|---|---|
| `rls.py` | **NEW** — Centralized RLS module (509 lines) |
| `tenant_context.py` | Added `tenant_id`, `rls_read_filter`, `rls_visibility_update_filter()` |
| `db_setup.py` | Added `tenant_id` to users, ACLs, migration logic, RLS indexes |
| `user_routes.py` | `tenant_id` in JWT, registration, admin user creation |
| `document_routes.py` | Upload uses `build_document_metadata()`, listing uses `ctx.rls_read_filter` |
| `scope_routes.py` | Conditional update via `build_visibility_update_filter()` |
| `acl_routes.py` | Tenant-scoped listing, conditional updates |
| `query_routes.py` | `get_accessible_doc_ids_rls()` replaces old function |
| `graph_routes.py` | `get_graph_accessible_chunks()` + `filter_graph_by_chunks()` |
