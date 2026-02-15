# 🎓 UIT Master Chatbot — LightRAG

A Retrieval-Augmented Generation (RAG) chatbot built for the Master's program at **UIT (University of Information Technology)**. The system uses [LightRAG](https://github.com/HKUDS/LightRAG) to ingest, index, and retrieve knowledge from program documents — then generates answers via LLM. It is wrapped in a custom React WebUI with a full multi-tenant permission system, an admin monitoring dashboard, and a pink-neon theme.

---

## 📋 Table of Contents

- [Quick Start with Docker](#-quick-start-with-docker)
- [Key Features](#-key-features)
- [Database-First Permission Architecture](#-database-first-permission-architecture)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Multi-Tenant Architecture](#-multi-tenant-architecture)
- [User-Level Monitoring Dashboard](#-user-level-monitoring-dashboard)
- [Pink-Neon Theme](#-pink-neon-theme)
- [Additional Notable Features](#-additional-notable-features)
- [Project Structure](#-project-structure)
- [Usage Guide](#-usage-guide)
- [Troubleshooting](#-troubleshooting)
- [Track in Progress](#-track-in-progress)

---

## 🐳 Quick Start with Docker

### Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Docker Desktop | 24.0+ | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | 2.0+ | [git-scm.com](https://git-scm.com/downloads) |

> Node.js and Python are **not** required when running via Docker — everything is containerized.

### Step 1 — Clone the repository

```bash
git clone https://github.com/PoLsss/ML-lightrag-core.git
cd ML-lightrag-core
```

### Step 2 — Configure environment

```bash
cd LightRag
cp env.example .env
```

Open `LightRag/.env` and fill in your API keys and settings (at minimum, set your `LLM_MODEL`, `LLM_BINDING`, and the corresponding API key).

### Step 3 — Start Docker

> ⚠️ **Make sure Docker Desktop is running** before executing the command below.

```powershell
# From the project root (ML-lightrag-core/)
docker compose up -d --build
```

Docker will build and start **three services**:

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| **MinIO** | `minio` | `10000` (API) / `10001` (Console) | Object storage for uploaded documents |
| **LightRAG** | `backend-lightrag` | `9621` | RAG backend API server |
| **WebUI** | `webui` | `3000` | Custom React frontend (Nginx) |

Wait ~30 seconds for health checks to pass, then open:

| URL | Description |
|-----|-------------|
| **http://localhost:3000** | Custom WebUI (main interface) |
| **http://localhost:9621/webui/** | LightRAG built-in WebUI |
| **http://localhost:10001** | MinIO Console (`minioadmin` / `minioadmin`) |

### Step 4 — Verify

```powershell
docker compose ps
```

All three services should show `healthy`. If any service shows `unhealthy`, check the logs:

```powershell
docker compose logs -f <service-name>
```

### Step 5 — Stopping & Restarting

```powershell
# Stop all containers
docker compose down

# Restart (preserves data volumes)
docker compose up -d

# Full reset (removes data volumes — destructive!)
docker compose down -v
```

---

## ✨ Key Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Database-First Permissions** | Row-level and column-level security enforced at the MongoDB/Neo4j layer — not in application code |
| 2 | **Role-Based Access Control** | Three roles (Admin, Teacher, Student) with granular document, graph, and retrieval permissions |
| 3 | **Multi-Tenant Architecture** | Every request is tenant-scoped; cross-tenant data leakage is architecturally impossible |
| 4 | **Monitoring Dashboard** | Real-time query stats, token usage, cost tracking, audit logs — scoped per user or aggregated for admins |
| 5 | **6 Query Modes** | Local, Global, Hybrid, Naive, Mix, and Bypass — with an LLM-based router that auto-classifies queries |
| 6 | **Interactive Knowledge Graph** | Sigma.js visualization with search, layout algorithms, fullscreen, and permission-filtered views |
| 7 | **Document Lifecycle Management** | Upload, process, search, scope toggle, bulk delete — with MinIO object storage backend |
| 8 | **Pink-Neon Theme** | A custom dark theme with hot-pink primary, electric-purple accents, and neon-cyan highlights |
| 9 | **Streaming Chat with Agent Mode** | Real-time streamed LLM responses with conversation history and optional agent-based reasoning |
| 10 | **Dockerized Deployment** | Three-service Docker Compose stack with health checks, named volumes, and auto-initialization |

---

## 🔐 Database-First Permission Architecture

Security is enforced **inside database queries** — the application never fetches data and then filters it in Python. This is the "Database-First" philosophy:

### How it works

```
User Login ──▶ JWT Token ──▶ TenantContext (per-request, immutable)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               MongoDB          MongoDB          Neo4j
             doc_status        Views           Labels
            (RLS filter)   (row + column     (:PublicDocument
                            level filter)    :InternalDocument)
```

### Row-Level Security (RLS)

Every MongoDB `find()` and `update_one()` call includes an authorization filter built by the centralized `rls.py` module. For example:

- **Students** can only see documents where `visibility = "public"`.
- **Teachers** can see their own documents (any visibility) + all public documents.
- **Admins** can see all documents within the tenant.

### Column-Level Security

MongoDB Views strip sensitive fields based on role:

| View | Row Filter | Hidden Columns | Used By |
|------|-----------|----------------|---------|
| `view_student_docs` | `scope = "public"` only | `uploader_id`, `admin_notes`, `internal_notes` | Students |
| `view_teacher_docs` | All documents | None | Teachers, Admins |

### Neo4j Label Partitioning

Graph nodes are labeled by document scope:

| Label | Visible To |
|-------|-----------|
| `:PublicDocument` | All roles |
| `:InternalDocument` | Admin, Teacher only |

Students' graph queries are restricted to `:PublicDocument` nodes only.

---

## 👥 Role-Based Access Control (RBAC)

Three roles exist in the system: **Admin**, **Teacher**, and **Student**.

### Document Access Permissions

| Action | Admin | Teacher (own docs) | Teacher (others' docs) | Student |
|--------|-------|--------------------|------------------------|---------|
| **View public documents** | ✅ | ✅ | ✅ | ✅ |
| **View internal documents** | ✅ | ✅ (own only) | ❌ | ❌ |
| **Upload documents** | ✅ | ✅ | — | ✅ (always public) |
| **Delete own documents** | ✅ | ✅ | ❌ | ❌ |
| **Delete any document** | ✅ | ❌ | ❌ | ❌ |
| **Change scope (public ↔ internal)** | ✅ (any doc) | ✅ (own only) | ❌ | ❌ |

### Graph & Retrieval Permissions

| Action | Admin | Teacher | Student |
|--------|-------|---------|---------|
| **Query (RAG retrieval)** | All documents in tenant | Own + public documents | Public documents only |
| **View knowledge graph** | Full graph | Filtered by accessible chunks | Public chunks only |
| **Graph node/edge details** | All | Filtered | Filtered |

### User Management Permissions

| Action | Admin | Teacher | Student |
|--------|-------|---------|---------|
| **Create users** | ✅ | ❌ | ❌ |
| **Edit users** | ✅ | ❌ | ❌ |
| **Delete users** | ✅ | ❌ | ❌ |
| **View all users** | ✅ | ❌ | ❌ |
| **View own profile** | ✅ | ✅ | ✅ |
| **View audit logs** | ✅ | ❌ | ❌ |

### Dashboard & Monitoring Permissions

| Action | Admin | Teacher | Student |
|--------|-------|---------|---------|
| **View own query stats** | ✅ | ✅ | ✅ |
| **View aggregated stats** | ✅ | ❌ | ❌ |
| **Export query logs (CSV)** | ✅ | ✅ | ✅ |
| **View audit trail** | ✅ | ❌ | ❌ |

---

## 🏢 Multi-Tenant Architecture

Every HTTP request creates an **immutable `TenantContext`** containing the user's email, role, and `tenant_id`. This context is injected via FastAPI dependency injection into every route handler.

### Isolation Guarantees

| Guarantee | How it's enforced |
|-----------|-------------------|
| **Tenant ID is always required** | `build_read_filter()` raises `ValueError` if `tenant_id` is empty |
| **Every query is scoped** | `tenant_id` is included in every MongoDB filter and Neo4j query |
| **No post-query filtering** | Authorization happens in the database query itself, not in Python code |
| **Concurrent safety** | 1000 concurrent users → 1000 independent frozen `TenantContext` objects |
| **Conditional updates** | Visibility changes include `owner_id` in the filter — no "check then update" race conditions |

### Tenant ID Resolution Order

1. Database user record (`users` collection)
2. JWT `metadata.tenant_id` claim
3. `DEFAULT_TENANT_ID` environment variable (defaults to `"default"`)

---

## 📊 User-Level Monitoring Dashboard

The dashboard provides real-time analytics scoped by user role:

### Metric Cards

| Metric | Description |
|--------|-------------|
| **Queries Today** | Total queries made today (UTC+7, Ho Chi Minh City timezone) |
| **Total Documents** | Document count visible to the current user (role-filtered) |
| **Tokens Used Today** | LLM tokens consumed today + estimated cost |
| **Avg Response Time** | Average query response time in milliseconds |

### Dashboard Panels

| Panel | Visibility | Description |
|-------|-----------|-------------|
| **Query Trends** | All roles | Line chart of queries, tokens, and cost over 1–30 days |
| **Usage Summary** | All roles | Lifetime totals: queries, tokens, cost |
| **Query Logs** | All roles | Paginated table with user, mode, execution time, tokens, cost |
| **Audit Logs** | Admin only | Tracks `LOGIN`, `LOGOUT`, `UPLOAD`, `DELETE`, `ACL_CHANGE`, `USER_CREATE`, `USER_UPDATE`, `USER_DELETE` with IP address and old/new values |
| **CSV Export** | All roles | Download query logs as CSV |

- **Non-admin users** see only their own statistics.
- **Admins** see aggregated totals across all users within the tenant.
- The dashboard auto-refreshes on `metrics:query-completed` and `metrics:document-uploaded` events.

---

## Pink-Neon Theme (My favorite theme but it has some bugs now)

The WebUI ships with three themes: **Light**, **Dark**, and **Pink-Neon**.

The **Pink-Neon** theme is a custom aesthetic with:

| Element | Color / Style |
|---------|--------------|
| Background | Deep purple (`hsl(280, 50%, 8%)`) |
| Primary | Hot pink (`hsl(330, 100%, 60%)`) |
| Accent | Electric purple (`hsl(280, 100%, 65%)`) |
| Ring / Focus | Neon cyan (`hsl(180, 100%, 50%)`) |
| Cards | Dark purple with subtle transparency |
| Scrollbar | Pink-accented custom scrollbar |

Themes are toggled from the settings panel and persisted via Zustand store. The `ThemeProvider` component applies the selected theme class to the `<html>` root element.

> ⚠️ **Known issue**: The pink-neon theme still has some visual inconsistencies in certain components. See [Track in Progress](#-track-in-progress).

---

## 🔧 Additional Notable Features

### Query Modes

| Mode | Strategy |
|------|----------|
| **Local** | Retrieves entities from the knowledge graph — narrow, specific answers |
| **Global** | Retrieves relationships from the knowledge graph — broad, overview answers |
| **Hybrid** | Combines Local + Global retrieval |
| **Naive** | Simple vector-based chunk retrieval (no graph) |
| **Mix** | Combines all strategies (default, recommended) |
| **Bypass** | Direct LLM chat, skipping RAG entirely |

### Intelligent Query Router

An LLM-based classification agent analyzes each query and routes it to either:
- **RETRIEVAL** mode (needs RAG) — for academic questions about UIT's Master's program
- **CHAT** mode (casual) — for greetings, chitchat, or non-academic queries

Falls back to a keyword-based classifier (Vietnamese academic terms) when the LLM is unavailable.

### Multiple LLM & Embedding Providers

| LLM Providers | Embedding Providers |
|---------------|-------------------|
| OpenAI, Ollama, Azure OpenAI, Gemini, AWS Bedrock, LollMs, OpenRouter | OpenAI, Ollama, Azure OpenAI, Jina, AWS Bedrock |

### Reranking Support

Optional reranking with Cohere, Jina, Aliyun, or local vLLM to improve retrieval quality.

### Storage Backends

LightRAG supports multiple storage backends for vectors and graphs:
- **Vector**: MongoDB
- **Graph**:  Neo4j

### Document Processing

- Configurable chunk size (500–1500) and overlap
- Entity extraction with customizable entity types
- PDF decryption support
- Summary language configuration
- MinIO object storage for source files

---

## 📁 Project Structure

```
ML-lightrag-core/
├── docker-compose.yml          # Root Docker Compose (3 services)
├── requirements.txt            # Python dependencies
├── README.md                   # This file
│
├── LightRag/                   # Backend — LightRAG API Server
│   ├── .env                    # Backend config (API keys, DB settings)
│   ├── Dockerfile              # Multi-stage build (Bun + Python 3.12)
│   ├── lightrag/               # Core LightRAG library
│   │   ├── api/                # FastAPI application
│   │   │   ├── lightrag_server.py  # Server entry point
│   │   │   ├── rls.py              # Row-Level Security module
│   │   │   ├── tenant_context.py   # Multi-tenant context
│   │   │   ├── auth.py             # JWT authentication
│   │   │   ├── db_setup.py         # Database initialization
│   │   │   └── routers/            # API route handlers
│   │   │       ├── document_routes.py
│   │   │       ├── query_routes.py
│   │   │       ├── graph_routes.py
│   │   │       ├── scope_routes.py
│   │   │       ├── acl_routes.py
│   │   │       ├── user_routes.py
│   │   │       └── dashboard_routes.py
│   │   ├── llm/                # LLM provider integrations
│   │   └── kg/                 # Knowledge graph backends
│   └── data/                   # Indexed data & RAG storage
│
├── webui/                      # Frontend — Custom React WebUI
│   ├── Dockerfile              # Multi-stage build (Node 20 + Nginx)
│   ├── src/
│   │   ├── features/           # Page-level components
│   │   │   ├── ChatView.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DocumentManager.tsx
│   │   │   ├── GraphViewer.tsx
│   │   │   ├── AccessControl.tsx
│   │   │   ├── DocumentACL.tsx
│   │   │   └── LoginPage.tsx
│   │   ├── components/         # Reusable UI components
│   │   └── services/           # API client layer
│   └── nginx.conf              # Nginx configuration
│
└── minio/                      # MinIO config & data
```

---

## 📖 Usage Guide

### Main Tabs

| Tab | Function | Access |
|-----|----------|--------|
| 💬 **Chat** | Ask questions about UIT's Master's program | All roles |
| 📊 **Knowledge Graph** | Visualize extracted entities and relationships | All roles (filtered) |
| 📁 **Documents** | Upload, view, delete, and manage document scope | All roles (scoped) |
| 📜 **Histories** | View past conversations | All roles |
| 📈 **Dashboard** | Query analytics, token usage, audit logs | All roles (scoped) |
| 🔒 **Access Control** | Manage users and document ACLs | Admin only |

### Getting Started

1. **Log in** with your credentials (or register a new account).
2. **Upload documents** (PDF, DOCX, TXT) via the Documents tab — they will be automatically chunked and indexed.
3. **Ask questions** in the Chat tab — the system retrieves relevant knowledge and generates answers.
4. **Explore the graph** in the Knowledge Graph tab to see how entities are connected.
5. **Monitor usage** in the Dashboard tab.

---



## 🚧 Track in Progress

### Active Work

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Pink-Neon theme refinement** | In Progress | Some components have color inconsistencies; button hover states and dropdown menus need adjustment |
| 2 | **Knowledge Graph visualization** | In Progress | Layout performance with large graphs; node clustering and label overlap need improvement |
| 3 | **Dashboard chart responsiveness** | In Progress | Charts don't resize cleanly on all screen widths |
| 4 | **Import/Export** | In Progress |  |
| 5 | **Backup** | In Progress |  |


