import requests
import json
import sys

# def query_api_stream(query: str, mode: str = "mix", top_k: int = 5):
#     url = "http://localhost:9621/query/stream"

#     payload = {
#         "query": query,
#         "mode": mode,
#         "top_k": top_k,
#         "stream": True,
#         "include_references": True,
#     }

#     headers = {
#         "accept": "application/json",
#         "Content-Type": "application/json"
#     }

#     full_answer = ""
#     references = []

#     with requests.post(url, json=payload, headers=headers, stream=True) as response:
#         response.raise_for_status()

#         print("\n🤖 Assistant: ", end="", flush=True)

#         # Đọc từng dòng streaming
#         for line in response.iter_lines(decode_unicode=True):
#             if not line:
#                 continue

#             try:
#                 data = json.loads(line)
#             except json.JSONDecodeError:
#                 continue

#             # Bắt references gửi lên đầu stream
#             if "references" in data:
#                 references = data["references"]
#                 continue

#             # In từng token như ChatGPT
#             if "response" in data:
#                 token = data["response"]
#                 full_answer += token

#                 # In realtime không xuống dòng
#                 sys.stdout.write(token)
#                 sys.stdout.flush()

#     # print("\n\n📚 References:")
#     # for ref in references:
#     #     print(f"- [{ref['reference_id']}] {ref['file_path']}")

#     return full_answer, references

def query_api(query: str, mode: str, top_k: int):
    url = "http://localhost:9621/query"
    payload = {
        "query": query,
        "mode": mode,
        "top_k": top_k
    }
    headers = {
        "accept": "application/json",
        "Content-Type": "application/json"
    }

    r = requests.post(url, json=payload, headers=headers)
    r.raise_for_status()
    result = r.json()["response"]
    return result


# ======================
# RUN DEMO
# ======================

if __name__ == "__main__":
    query = "Quỳnh Chi"

    answer = query_api(query, "mix", 5)
    print(answer)
