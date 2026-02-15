"""
Migration Script for Document Permission System

This script adds scope fields to all existing documents in MongoDB and Neo4j
that don't already have them. All existing documents default to 'internal' scope.

Run this script once after deploying the permission system to migrate existing data.
"""

import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from neo4j import AsyncGraphDatabase
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()


async def migrate_mongodb_documents():
    """
    Migrate existing MongoDB documents to include scope field.
    
    - Sets scope to 'internal' for all documents without a scope field
    - Updates both doc_status and doc_acl collections
    """
    mongo_uri = os.environ.get("MONGO_URI")
    database_name = os.environ.get("MONGO_DATABASE")
    
    if not mongo_uri or not database_name:
        print("MongoDB connection not configured. Skipping MongoDB migration.")
        return {"status": "skipped", "reason": "missing credentials"}
    
    client = AsyncIOMotorClient(mongo_uri)
    db = client[database_name]
    
    results = {
        "doc_status_updated": 0,
        "doc_acl_updated": 0,
        "doc_acl_created": 0
    }
    
    try:
        # 1. Update doc_status collection - add scope field to documents without it
        doc_status = db.doc_status
        
        # Find all documents without scope field
        cursor = doc_status.find({"scope": {"$exists": False}})
        docs_without_scope = await cursor.to_list(length=None)
        
        print(f"Found {len(docs_without_scope)} documents without scope field in doc_status")
        
        if docs_without_scope:
            # Update all documents without scope to have scope='internal'
            result = await doc_status.update_many(
                {"scope": {"$exists": False}},
                {
                    "$set": {
                        "scope": "internal",
                        "updated_at": datetime.utcnow().isoformat()
                    }
                }
            )
            results["doc_status_updated"] = result.modified_count
            print(f"Updated {result.modified_count} documents with scope='internal'")
        
        # 2. Update/create doc_acl entries for all documents
        doc_acl = db.doc_acl
        
        # Get all documents from doc_status
        all_docs = await doc_status.find({}).to_list(length=None)
        
        for doc in all_docs:
            doc_id = str(doc.get("_id"))
            file_path = doc.get("file_path", "")
            scope = doc.get("scope", "internal")
            
            # Check if ACL exists
            existing_acl = await doc_acl.find_one({"doc_id": doc_id})
            
            if existing_acl:
                # Update existing ACL if access_scope doesn't match
                if existing_acl.get("access_scope") != scope:
                    await doc_acl.update_one(
                        {"doc_id": doc_id},
                        {
                            "$set": {
                                "access_scope": scope,
                                "updated_at": datetime.utcnow()
                            }
                        }
                    )
                    results["doc_acl_updated"] += 1
            else:
                # Create new ACL entry
                await doc_acl.insert_one({
                    "doc_id": doc_id,
                    "file_path": file_path,
                    "access_scope": scope,
                    "created_by": "system_migration",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "updated_by": "system_migration"
                })
                results["doc_acl_created"] += 1
        
        print(f"ACL updates: {results['doc_acl_updated']} updated, {results['doc_acl_created']} created")
        
        results["status"] = "success"
        
    except Exception as e:
        print(f"Error during MongoDB migration: {e}")
        results["status"] = "error"
        results["error"] = str(e)
    finally:
        client.close()
    
    return results


async def migrate_neo4j_documents():
    """
    Migrate existing Neo4j nodes to include scope labels.
    
    - Adds :InternalDocument label to all document nodes without scope labels
    - Sets scope property to 'internal'
    """
    uri = os.environ.get("NEO4J_URI")
    username = os.environ.get("NEO4J_USERNAME")
    password = os.environ.get("NEO4J_PASSWORD")
    database = os.environ.get("NEO4J_DATABASE", "neo4j")
    
    if not all([uri, username, password]):
        print("Neo4j connection not configured. Skipping Neo4j migration.")
        return {"status": "skipped", "reason": "missing credentials"}
    
    driver = AsyncGraphDatabase.driver(uri, auth=(username, password))
    results = {"nodes_updated": 0}
    
    try:
        async with driver.session(database=database) as session:
            # Find all nodes that don't have PublicDocument or InternalDocument labels
            # and add InternalDocument label + scope property
            query = """
            MATCH (n)
            WHERE NOT n:PublicDocument AND NOT n:InternalDocument
              AND n.entity_id IS NOT NULL
            SET n:InternalDocument, n.scope = 'internal'
            RETURN count(n) as updated_count
            """
            
            result = await session.run(query)
            record = await result.single()
            
            if record:
                results["nodes_updated"] = record["updated_count"]
                print(f"Updated {record['updated_count']} nodes with :InternalDocument label")
            
            await result.consume()
            results["status"] = "success"
            
    except Exception as e:
        print(f"Error during Neo4j migration: {e}")
        results["status"] = "error"
        results["error"] = str(e)
    finally:
        await driver.close()
    
    return results


async def run_migration():
    """
    Run the complete migration for permission system.
    """
    print("=" * 60)
    print("Running Permission System Migration")
    print("=" * 60)
    
    results = {
        "mongodb": None,
        "neo4j": None
    }
    
    # Migrate MongoDB
    print("\n[1/2] Migrating MongoDB documents...")
    results["mongodb"] = await migrate_mongodb_documents()
    
    # Migrate Neo4j
    print("\n[2/2] Migrating Neo4j nodes...")
    results["neo4j"] = await migrate_neo4j_documents()
    
    print("\n" + "=" * 60)
    print("Migration Complete")
    print("=" * 60)
    
    # Print summary
    print("\nSummary:")
    if results["mongodb"].get("status") == "success":
        print(f"  MongoDB: {results['mongodb']['doc_status_updated']} doc_status updated, "
              f"{results['mongodb']['doc_acl_created']} ACL entries created")
    else:
        print(f"  MongoDB: {results['mongodb'].get('status', 'unknown')}")
    
    if results["neo4j"].get("status") == "success":
        print(f"  Neo4j: {results['neo4j']['nodes_updated']} nodes updated")
    else:
        print(f"  Neo4j: {results['neo4j'].get('status', 'unknown')}")
    
    return results


# CLI entry point
if __name__ == "__main__":
    print("Running Permission System Migration...")
    asyncio.run(run_migration())
