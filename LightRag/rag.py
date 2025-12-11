import asyncio
import os
from io import BytesIO

import nest_asyncio
import numpy as np
import requests
from docx import Document
from dotenv import load_dotenv
from lightrag import LightRAG, QueryParam
from lightrag.kg.shared_storage import (
    initialize_pipeline_status,
    initialize_share_data,
)
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed
from lightrag.utils import EmbeddingFunc
from openai import OpenAI

"""
pymongo
neo4j
"""
nest_asyncio.apply()

load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")
CHUNK_OVERLAP_SIZE = os.getenv("CHUNK_OVERLAP_SIZE")
CHUNK_SIZE = os.getenv("CHUNK_SIZE")


async def llm_model_func(
    prompt,
    system_prompt=None,
    history_messages=[],
    keyword_extraction=False,
    **kwargs,
) -> str:
    client = OpenAI(api_key=openai_api_key)

    # Tạo danh sách messages đúng định dạng OpenAI Chat API
    messages = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    for msg in history_messages:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": prompt})

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        temperature=0.2,
        max_tokens=1000,
    )

    return response.choices[0].message.content.strip()


async def embedding_func(texts: list[str]) -> np.ndarray:
    client = OpenAI(api_key=openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-small", input=texts, dimensions=3072
    )

    # Trích xuất vector embedding
    embeddings = [item.embedding for item in response.data]

    return np.array(embeddings)


async def initialize_rag(working_dir: str = "./rag_storage") -> LightRAG:
    """
    Initialize LightRAG with vector and Neo4j graph storage,
    and prepare shared pipeline status to avoid KeyError.
    """
    rag = LightRAG(
        working_dir=working_dir,
        kv_storage="MongoKVStorage",
        vector_storage="MongoVectorDBStorage",
        graph_storage="Neo4JStorage",
        doc_status_storage="MongoDocStatusStorage",
        # embedding_token_limit = 3072,
        embedding_func=embedding_func,
        llm_model_func=gpt_4o_mini_complete,
        # chunk_token_size=CHUNK_SIZE,
        # chunk_overlap_token_size=CHUNK_OVERLAP_SIZE
    )
    await rag.initialize_storages()

    # ensure shared dicts exist
    initialize_share_data()
    await initialize_pipeline_status()

    return rag


def read_file(path: str) -> str:
    """
    Read file content based on extension:
    - .txt -> UTF-8 text
    - .docx -> read via python-docx
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Data file not found: {path}")

    ext = os.path.splitext(path)[1].lower()

    if ext == ".txt":
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    elif ext == ".docx":
        doc = Document(path)
        return "\n".join([p.text for p in doc.paragraphs])
    else:
        raise ValueError(f"Unsupported file type: {ext}")


async def index_data(rag: LightRAG, file_path: str) -> None:
    """
    Index a text or docx file into LightRAG, tagging chunks with its filename.
    """
    text = read_file(file_path)

    # stream chunks into vector store and graph
    await rag.ainsert(input=text, file_paths=[file_path])


async def index_file(rag: LightRAG, path: str) -> None:
    """
    Alias for index_data to mirror sync naming.
    """
    await index_data(rag, path)


async def main_retrival(query):

    rag = asyncio.run(initialize_rag())
    top_k = 3
    # queryfv = "Làm sao để khôi phục tài khoản bị hack hoặc khóa?"
    # query = "I've been experiencing some strangts lately. It's especially noticeable at night when I'm driving or looking at street lamps."
    url = (
        "http://localhost:9621/query/data?api_key_header_value=context_retrival"
    )
    payload = {
        "query": query,
        "mode": "global",
        "only_need_context": True,
        # "only_need_prompt": True,
        "response_type": "Multiple Paragraphs",
        "top_k": top_k,
        "chunk_top_k": 10,
        "max_entity_tokens": 256,
        "max_relation_tokens": 256,
        # "max_total_tokens": 1000,
        # "hl_keywords": [
        #     "string"
        # ],
        # "ll_keywords": [
        #     "string"
        # ],
        # # "conversation_history": [
        #     {
        #     "additionalProp1": {}
        #     }
        # ],
        # "user_prompt": "string",
        "enable_rerank": True,
        "include_references": True,
        # "stream": True
    }
    # headers = {"api_key_header_value": "retrival"}

    result_retrival = requests.post(url, json=payload)
    # print("result_retrival.status_code: ", result_retrival.status_code)

    result_json = result_retrival.json()

    # Lấy danh sách chunks
    chunks = result_json.get("data", {}).get("chunks", [])

    if not chunks:
        print("⚠️ Không có chunk nào được trả về.")
    else:
        print(f"✅ Có {len(chunks)} chunks được truy xuất:\n")
        # for i, chunk in enumerate(chunks, 1):
        #     print(f"--- Chunk {i} ---")
        #     print(chunk.get("content", "").strip())
        #     print()
    retrieved_text = "\n\n".join(
        [
            f"--- Chunk {i} ---\n{chunk.get('content', '').strip()}"
            for i, chunk in enumerate(chunks, 1)
        ]
    )

    return retrieved_text


if __name__ == "__main__":
    query = "I've been experiencing some strangts lately. It's especially noticeable at night when I'm driving or looking at street lamps."
    result_retrival = asyncio.run(main_retrival(query))
