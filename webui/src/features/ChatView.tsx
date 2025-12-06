import ChatPanel from '@/components/chat/ChatPanel'
import ChatStatsPanel from '@/components/chat/ChatStatsPanel'

export default function ChatView() {
  return (
    <div className="h-full flex">
      {/* Chat Panel - Left side */}
      <div className="flex-1 min-w-0">
        <ChatPanel />
      </div>

      {/* Stats Panel - Right side */}
      <div className="w-80 shrink-0 hidden lg:block">
        <ChatStatsPanel />
      </div>
    </div>
  )
}
