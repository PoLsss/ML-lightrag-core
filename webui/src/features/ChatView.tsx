import { useState } from "react";
import { useTranslation } from "react-i18next";
import ChatPanel from "@/components/chat/ChatPanel";
import ChatStatsPanel from "@/components/chat/ChatStatsPanel";
import RetrievalInfoPanel from "@/components/chat/RetrievalInfoPanel";
import { ResizablePanel } from "@/components/ui/ResizablePanel";
import { ActivityIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarTab = "analytics" | "retrieval";

export default function ChatView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SidebarTab>("analytics");

  const sidebar = (
    <div className="h-full flex flex-col bg-background">
      {/* Tab Toggle Buttons */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("analytics")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "analytics"
              ? "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <ActivityIcon className="size-3.5" />
          {t("chat.stats.title", "Chat Analytics")}
        </button>
        <button
          onClick={() => setActiveTab("retrieval")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "retrieval"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <SearchIcon className="size-3.5" />
          {t("chat.retrieval.title", "Retrieval Info")}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "analytics" ? (
          <div className="h-full overflow-auto">
            <ChatStatsPanel />
          </div>
        ) : (
          <RetrievalInfoPanel />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full">
      {/* Mobile: Chat only */}
      <div className="h-full lg:hidden">
        <ChatPanel />
      </div>

      {/* Desktop: Resizable split */}
      <div className="h-full hidden lg:block">
        <ResizablePanel
          direction="horizontal"
          defaultSize={65}
          minSize={40}
          maxSize={85}
          first={
            <div className="h-full">
              <ChatPanel />
            </div>
          }
          second={sidebar}
        />
      </div>
    </div>
  );
}
