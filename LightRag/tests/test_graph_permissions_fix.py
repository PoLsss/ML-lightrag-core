
import sys
import os
import asyncio
from unittest.mock import AsyncMock, Mock, patch, MagicMock

# Add LightRag to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

async def test_student_permissions():
    print("Setting up test...")

    # Mock critical dependencies to avoid heavy imports
    
    # 1. Mock 'lightrag.lightrag' module to prevent loading the heavy class
    mock_lightrag_module = MagicMock()
    sys.modules["lightrag.lightrag"] = mock_lightrag_module
    
    # 2. Mock 'lightrag.api.db_setup' to inject our logic
    mock_db_setup = MagicMock()
    sys.modules["lightrag.api.db_setup"] = mock_db_setup
    
    # 3. Mock 'lightrag.api.auth' just in case
    mock_auth = MagicMock()
    sys.modules["lightrag.api.auth"] = mock_auth

    # NOW import
    try:
        from lightrag.api.routers.graph_routes import create_graph_routes
    except ImportError as e:
        print(f"ImportError: {e}")
        return
    except Exception as e:
        print(f"Error importing graph_routes: {e}")
        import traceback
        traceback.print_exc()
        return

    # Mock RAG
    mock_rag = MagicMock()
    mock_rag.get_knowledge_graph = AsyncMock(return_value={
        "nodes": [
            {"id": "Common", "label": "Common", "source_id": "doc-1<SEP>doc-2"},
            {"id": "Public", "label": "Public", "source_id": "doc-1"},
            {"id": "Internal", "label": "Internal", "source_id": "doc-2"},
            {"id": "Unknown", "label": "Unknown", "source_id": ""}
        ],
        "edges": [
            {"source": "Public", "target": "Common", "source_id": "doc-1"},
            {"source": "Internal", "target": "Common", "source_id": "doc-2"},
        ]
    })
    
    # Configure mock db_setup
    mock_db_setup.get_accessible_doc_ids = AsyncMock(return_value=["doc-1"])

    # Create router
    # Note: create_graph_routes might import utils_api which imports LightRAG
    # Since we mocked lightrag.lightrag, this should be fine.
    
    # We also need to ensuring get_combined_auth_dependency works
    # If utils_api is imported, it uses LightRAG type hint.
    
    try:
        test_router = create_graph_routes(mock_rag)
    except Exception as e:
        print(f"Error creating router: {e}")
        import traceback
        traceback.print_exc()
        return

    # Find endpoint
    endpoint = None
    for route in test_router.routes:
        if route.path == "/graphs":
            endpoint = route.endpoint
            break
            
    if not endpoint:
        print("❌ FAILED: Could not find /graphs endpoint")
        return

    # Mock Request
    mock_request = MagicMock()
    mock_request.headers.get.return_value = None # No token -> student

    print("Executing endpoint...")
    try:
        result = await endpoint(
            request=mock_request,
            label="Common",
            max_depth=3,
            max_nodes=100
        )
        
        # Validate result
        nodes = result["nodes"]
        node_ids = {n["id"] for n in nodes}
        print(f"Result Nodes: {node_ids}")

        assert "Public" in node_ids
        assert "Common" in node_ids
        assert "Internal" not in node_ids
        
        print("✅ SUCCESS: Permissions logic validated.")
        
    except Exception as e:
        print(f"❌ Execution Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_student_permissions())
