# Database-First Permission System Documentation

This document describes the Database-First Permission System for the KMS (Knowledge Management System), which enforces data access control at the database level using MongoDB Views and Neo4j Label Partitioning.

## Overview

The permission system supports three roles:
- **Admin**: Full access to all documents
- **Teacher**: Full access to all documents
- **Student**: Access only to public documents

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                          │
│  DocumentScopeToggle (Admin/Teacher) │ ScopeBadge (All users)    │
└─────────────────────────┬────────────────────────────────────────┘
                          │ API Calls
┌─────────────────────────▼────────────────────────────────────────┐
│                      Backend (FastAPI)                            │
│  scope_routes.py │ acl_routes.py │ document_routes.py            │
└─────────────────────────┬────────────────────────────────────────┘
                          │ Database Queries
    ┌─────────────────────┼─────────────────────┐
    ▼                     ▼                     ▼
┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   MongoDB     │  │   MongoDB View   │  │      Neo4j       │
│  doc_status   │  │ view_student_docs│  │ :PublicDocument  │
│  doc_acl      │  │ view_teacher_docs│  │ :InternalDocument│
└───────────────┘  └──────────────────┘  └──────────────────┘
```

## MongoDB Schema

### Collections

#### `doc_status` (Physical Collection)
Main document storage with all metadata.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Document ID (unique) |
| `file_path` | string | Path to source file |
| `status` | string | Processing status |
| `scope` | string | Access scope: "public" or "internal" |
| `chunks_list` | array | List of document chunks |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |
| `updated_by` | string | Email of last updater |

#### `doc_acl` (Access Control List)
Document access control entries.

| Field | Type | Description |
|-------|------|-------------|
| `doc_id` | string | Document ID (unique, references doc_status) |
| `file_path` | string | Path to source file |
| `access_scope` | string | Access scope: "public" or "internal" |
| `created_by` | string | Email of creator |
| `updated_by` | string | Email of last updater |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### Views

#### `view_student_docs`
- **Row-level filter**: Only documents with `scope = "public"`
- **Column-level filter**: Hides sensitive fields (`uploader_id`, `admin_notes`, `internal_notes`)
- **Access**: Students query this view

#### `view_teacher_docs`
- **Row-level filter**: All documents (no filter)
- **Column-level filter**: All fields visible
- **Access**: Teachers and Admins query this view

## Neo4j Schema

### Label Partitioning

Documents are labeled based on their scope:

| Label | Description | Accessible By |
|-------|-------------|---------------|
| `:PublicDocument` | Public scope documents | All users |
| `:InternalDocument` | Internal scope documents | Admin, Teacher only |

### Query Examples

**Student Query (Public documents only):**
```cypher
MATCH (n:base:PublicDocument)
WHERE n.entity_id CONTAINS $search_term
RETURN n
```

**Teacher/Admin Query (All documents):**
```cypher
MATCH (n:base)
WHERE n.entity_id CONTAINS $search_term
RETURN n
```

## API Endpoints

### Scope Routes (`/scope`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/scope/documents` | List documents with scope info | Teacher, Admin |
| PUT | `/scope/documents/{doc_id}` | Update document scope | Teacher, Admin |
| GET | `/scope/stats` | Get scope statistics | Teacher, Admin |
| POST | `/scope/sync/{doc_id}` | Force sync scope to Neo4j | Admin only |

### Request/Response Examples

**Update Document Scope:**
```http
PUT /scope/documents/abc123
Authorization: Bearer <token>
Content-Type: application/json

{
    "scope": "public"
}
```

**Response:**
```json
{
    "status": "success",
    "message": "Document abc123 scope updated from 'internal' to 'public'"
}
```

## Setup Instructions

### 1. Initialize Database Views

Run the setup script once after deployment:

```bash
cd LightRag
python -m lightrag.api.db_permission_setup
```

This creates:
- MongoDB views (`view_student_docs`, `view_teacher_docs`)
- Neo4j indexes and constraints for scope labels

### 2. Migrate Existing Documents

For existing documents without scope:
1. All documents default to `scope: "internal"` on upsert
2. Admin can bulk update scopes via API or database script

## Data Flow

### Upload Flow
1. User uploads document via API
2. Backend saves to `doc_status` with `scope` field
3. Document synchronized to Neo4j with scope label

### Search Flow
1. User sends search query
2. Backend identifies user role from JWT
3. Queries appropriate MongoDB view or applies scope filter
4. Queries Neo4j with label filter for graph-based RAG
5. Returns filtered results

### Scope Update Flow
1. Admin/Teacher toggles scope via UI
2. Frontend calls `PUT /scope/documents/{id}`
3. Backend updates `doc_status.scope` and `doc_acl.access_scope`
4. Backend syncs label change to Neo4j
5. Audit log entry created

## Security Considerations

1. **Defense in Depth**: Views enforce security at database level, not just application
2. **Read-Only Views**: MongoDB views cannot be written to directly
3. **Label Consistency**: Scope changes update both MongoDB and Neo4j atomically
4. **Audit Trail**: All scope changes logged to `audit_logs` collection

## Files Modified/Created

| File | Status | Description |
|------|--------|-------------|
| `db_permission_setup.py` | NEW | Setup script for views and constraints |
| `scope_routes.py` | NEW | Scope management API endpoints |
| `db_setup.py` | MODIFIED | Added scope helper functions |
| `mongo_impl.py` | MODIFIED | Added scope field to upsert |
| `neo4j_impl.py` | MODIFIED | Added scope label methods |
| `user_routes.py` | MODIFIED | Added `require_teacher_or_admin` |
| `lightrag_server.py` | MODIFIED | Registered scope routes |
| `scope.ts` | NEW | Frontend API module |
| `DocumentScopeToggle.tsx` | NEW | React toggle component |
