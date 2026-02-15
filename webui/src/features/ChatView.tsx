import ChatPanel from "@/components/chat/ChatPanel";
import ChatStatsPanel from "@/components/chat/ChatStatsPanel";

export default function ChatView() {
  return (
    <div className="h-full flex">
      {/* Chat Panel - Left side (Flex Grow) */}
      <div className="flex-1 min-w-0">
        <ChatPanel />
      </div>

      {/* Right Sidebar - Chat Analytics Only */}
      <div className="w-96 shrink-0 hidden lg:flex flex-col border-l border-border bg-background">
        <div className="flex-1 min-h-0 overflow-auto">
          <ChatStatsPanel />
        </div>
      </div>
    </div>
  );
}
