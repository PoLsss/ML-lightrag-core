"""
Database Permission Setup Script for KMS

This module provides setup functions for creating:
- MongoDB Views for row-level and column-level security
- Neo4j Label constraints for scope-based access control

Run this script once to initialize the permission layer.
"""

import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from neo4j import AsyncGraphDatabase
from dotenv import load_dotenv

load_dotenv()


# MongoDB View Definitions
STUDENT_VIEW_NAME = "view_student_docs"
TEACHER_VIEW_NAME = "view_teacher_docs"

# Sensitive fields to hide from students
SENSITIVE_FIELDS = ["uploader_id", "admin_notes", "internal_notes", "metadata.sensitive"]


async def create_mongodb_views(db_name: str = None, collection_name: str = None):
    """
    Create MongoDB Views for role-based document access.
    
    Creates two views:
    1. view_student_docs: Only public documents, sensitive fields hidden
    2. view_teacher_docs: All documents with full access
    
    Args:
        db_name: MongoDB database name (defaults to MONGO_DATABASE env var)
        collection_name: Source collection name (defaults to "doc_status")
    
    Returns:
        dict: Status of view creation operations
    """
    mongo_uri = os.environ.get("MONGO_URI")
    database_name = db_name or os.environ.get("MONGO_DATABASE")
    source_collection = collection_name or "doc_status"
    
    client = AsyncIOMotorClient(mongo_uri)
    db = client[database_name]
    
    results = {"student_view": None, "teacher_view": None}
    
    try:
        # Drop existing views if they exist (for updates)
        existing_collections = await db.list_collection_names()
        
        if STUDENT_VIEW_NAME in existing_collections:
            await db.drop_collection(STUDENT_VIEW_NAME)
            print(f"Dropped existing view: {STUDENT_VIEW_NAME}")
        
        if TEACHER_VIEW_NAME in existing_collections:
            await db.drop_collection(TEACHER_VIEW_NAME)
            print(f"Dropped existing view: {TEACHER_VIEW_NAME}")
        
        # Create Student View (Row-level: public only, Column-level: hide sensitive fields)
        # Note: MongoDB $project cannot mix inclusion (1) and exclusion (0) except for _id
        # So we only include the fields students should see
        student_pipeline = [
            # Row-level security: Only public documents
            {"$match": {"scope": "public"}},
            # Column-level security: Only include non-sensitive fields
            {"$project": {
                "_id": 1,
                "file_path": 1,
                "status": 1,
                "scope": 1,
                "created_at": 1,
                "updated_at": 1,
                "content_summary": 1,
                "chunks_count": 1,
                "file_size": 1,
                "chunks_list": 1,
                "track_id": 1
                # Sensitive fields NOT included: uploader_id, admin_notes, internal_notes
            }}
        ]
        
        await db.command({
            "create": STUDENT_VIEW_NAME,
            "viewOn": source_collection,
            "pipeline": student_pipeline
        })
        results["student_view"] = "created"
        print(f"Created view: {STUDENT_VIEW_NAME} (public docs only, sensitive fields hidden)")
        
        # Create Teacher View (Full access to all documents)
        teacher_pipeline = [
            # No filter - teachers see all documents (public and internal)
            {"$match": {}}
        ]
        
        await db.command({
            "create": TEACHER_VIEW_NAME,
            "viewOn": source_collection,
            "pipeline": teacher_pipeline
        })
        results["teacher_view"] = "created"
        print(f"Created view: {TEACHER_VIEW_NAME} (all docs, full access)")
        
        # Create index on scope field for better query performance
        collection = db[source_collection]
        await collection.create_index([("scope", 1)], name="scope_idx")
        print(f"Created index on 'scope' field in {source_collection}")
        
    except Exception as e:
        print(f"Error creating MongoDB views: {e}")
        results["error"] = str(e)
    finally:
        client.close()
    
    return results


async def create_neo4j_scope_constraints():
    """
    Create Neo4j constraints and indexes for scope-based labels.
    
    Creates:
    - Constraint for PublicDocument nodes
    - Constraint for InternalDocument nodes
    - Indexes for faster scope-based queries
    
    Returns:
        dict: Status of constraint creation operations
    """
    uri = os.environ.get("NEO4J_URI")
    username = os.environ.get("NEO4J_USERNAME")
    password = os.environ.get("NEO4J_PASSWORD")
    database = os.environ.get("NEO4J_DATABASE", "neo4j")
    
    if not all([uri, username, password]):
        print("Neo4j connection details not configured. Skipping Neo4j setup.")
        return {"status": "skipped", "reason": "missing credentials"}
    
    driver = AsyncGraphDatabase.driver(uri, auth=(username, password))
    results = {"constraints": [], "indexes": []}
    
    try:
        async with driver.session(database=database) as session:
            # Create indexes for scope-based labels
            # These improve query performance when filtering by document scope
            
            # Index for PublicDocument label
            try:
                await session.run("""
                    CREATE INDEX public_doc_entity_idx IF NOT EXISTS
                    FOR (n:PublicDocument)
                    ON (n.entity_id)
                """)
                results["indexes"].append("public_doc_entity_idx")
                print("Created index: public_doc_entity_idx on :PublicDocument(entity_id)")
            except Exception as e:
                print(f"Index creation note: {e}")
            
            # Index for InternalDocument label
            try:
                await session.run("""
                    CREATE INDEX internal_doc_entity_idx IF NOT EXISTS
                    FOR (n:InternalDocument)
                    ON (n.entity_id)
                """)
                results["indexes"].append("internal_doc_entity_idx")
                print("Created index: internal_doc_entity_idx on :InternalDocument(entity_id)")
            except Exception as e:
                print(f"Index creation note: {e}")
            
            # Index for scope property on all Document nodes
            try:
                await session.run("""
                    CREATE INDEX doc_scope_idx IF NOT EXISTS
                    FOR (n:Document)
                    ON (n.scope)
                """)
                results["indexes"].append("doc_scope_idx")
                print("Created index: doc_scope_idx on :Document(scope)")
            except Exception as e:
                print(f"Index creation note: {e}")
            
            print("Neo4j scope constraints and indexes created successfully")
            results["status"] = "success"
            
    except Exception as e:
        print(f"Error creating Neo4j constraints: {e}")
        results["status"] = "error"
        results["error"] = str(e)
    finally:
        await driver.close()
    
    return results


async def setup_permission_layer():
    """
    Main setup function to initialize the complete permission layer.
    
    This should be run once during initial deployment or when
    updating the permission system configuration.
    
    Returns:
        dict: Combined results from MongoDB and Neo4j setup
    """
    print("=" * 60)
    print("Setting up Database-First Permission Layer")
    print("=" * 60)
    
    results = {
        "mongodb": None,
        "neo4j": None
    }
    
    # Setup MongoDB Views
    print("\n[1/2] Creating MongoDB Views...")
    results["mongodb"] = await create_mongodb_views()
    
    # Setup Neo4j Constraints
    print("\n[2/2] Creating Neo4j Scope Constraints...")
    results["neo4j"] = await create_neo4j_scope_constraints()
    
    print("\n" + "=" * 60)
    print("Permission Layer Setup Complete")
    print("=" * 60)
    
    return results


# Helper functions for runtime use

def get_view_for_role(role: str) -> str:
    """
    Get the appropriate MongoDB view/collection name for a user role.
    
    Args:
        role: User role ("admin", "teacher", "student")
    
    Returns:
        str: View or collection name to query
    """
    if role in ["admin", "teacher"]:
        return TEACHER_VIEW_NAME
    elif role == "student":
        return STUDENT_VIEW_NAME
    else:
        # Default to student view for unknown roles (most restrictive)
        return STUDENT_VIEW_NAME


def get_neo4j_label_filter(role: str) -> str:
    """
    Get the Neo4j label filter clause for a user role.
    
    Args:
        role: User role ("admin", "teacher", "student")
    
    Returns:
        str: Cypher WHERE clause for label filtering
    """
    if role in ["admin", "teacher"]:
        # Teachers and admins can see all documents
        return ""  # No filter needed
    elif role == "student":
        # Students can only see public documents
        return "WHERE n:PublicDocument"
    else:
        # Default to most restrictive
        return "WHERE n:PublicDocument"


def get_scope_label(scope: str) -> str:
    """
    Get the Neo4j label for a document scope.
    
    Args:
        scope: Document scope ("public" or "internal")
    
    Returns:
        str: Neo4j label name
    """
    if scope == "public":
        return "PublicDocument"
    else:
        return "InternalDocument"


# CLI entry point
if __name__ == "__main__":
    print("Running Database Permission Setup...")
    asyncio.run(setup_permission_layer())
