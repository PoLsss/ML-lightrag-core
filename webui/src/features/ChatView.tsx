import ChatPanel from "@/components/chat/ChatPanel"; // ⚠️ Kiểm tra lại đường dẫn import này cho đúng với dự án của bạn

export default function ChatView() {
  // ChatPanel mới đã tự lo layout (Chat + Graph + Stats) bên trong nó rồi.
  // Nên ChatView chỉ cần render ChatPanel full màn hình là xong.
  return (
    <div className="h-full w-full overflow-hidden">
      <ChatPanel />
    </div>
  );
}
