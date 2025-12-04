from dotenv import load_dotenv
import asyncio
import os

from agents import Agent, Runner, function_tool, TResponseInputItem
from openai.types.responses import ResponseTextDeltaEvent

from reponse_from_lightrag_llm import query_api

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

MODE = "mix"
TOP_K = 5
import uuid

@function_tool
async def faqRAG_tool(question: str) -> str:
    return query_api(question, mode=MODE, top_k=TOP_K)


Assistant_agent = Agent(
    name="UIT Assistant",
    instructions=(
        "Bạn là trợ lý ảo của Trường Đại học Công nghệ Thông tin (UIT).\n\n"

        "NHIỆM VỤ:\n"
        "1. Phân loại câu hỏi người dùng.\n"
        "- Nếu liên quan đến UIT / giáo dục / tuyển sinh / học vụ / học phí / sinh viên / khoa-ngành / môn học / thủ tục: "
        "Các chủ đề bạn phải xử lý bao gồm:\n"
        "- Tuyển sinh: điều kiện xét tuyển, phương thức tuyển sinh, hồ sơ nhập học, điểm chuẩn...\n"
        "- Học vụ: đăng ký học phần, thời khóa biểu, quy chế học tập, điểm số, cảnh báo học tập, tốt nghiệp...\n"
        "- Học phí, học bổng, miễn giảm học phí.\n"
        "- Các môn học, chương trình đào tạo, khung chương trình.\n"
        "- Thông tin khoa, ngành, lớp, giảng viên.\n"
        "- Sinh viên UIT.\n"
        "- Các thủ tục dành cho sinh viên UIT.\n"
        "⇒ PHẢI gọi `faqRAG_tool(question)` để lấy dữ liệu rồi mới trả lời.\n\n"

        "- Nếu không liên quan đến các chủ đề trên: "
        "⇒ Trả lời trực tiếp, KHÔNG gọi tool.\n\n"

        "2. KHÔNG được tự bịa thông tin về UIT.\n"
        "Chỉ dùng dữ liệu tool trả về để trả lời.\n\n"

        "3. Trả lời rõ ràng, chính xác, thân thiện."
    ),
    model="gpt-4o-mini",
    tools=[faqRAG_tool]
)

async def main():
    print("===== UIT ASSISTANT =====")
    print("Type 'exit' to stop.\n")

    convo: list[TResponseInputItem] = []
    while True:
        user_input = input("Bạn: ")
        if user_input.lower() == "exit":
            break

        convo.append({"content": user_input, "role": "user"})
        result = Runner.run_streamed(
            Assistant_agent,
            input=convo,
        )

        async for event in result.stream_events():
            if (
                event.type == "raw_response_event"
                and isinstance(event.data, ResponseTextDeltaEvent)
            ):
                print(event.data.delta, end="", flush=True)

        print("\n")
        convo = result.to_input_list()


if __name__ == "__main__":
    asyncio.run(main())

