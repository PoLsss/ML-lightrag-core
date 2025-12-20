import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore, ChatMessage } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { useGraphStore } from "@/stores/graph";
import { queryText } from "@/api/lightrag";
import { cn, errorMessage } from "@/lib/utils";
import { toast } from "sonner";
import Button from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  SendIcon,
  BotIcon,
  UserIcon,
  TrashIcon,
  SparklesIcon,
  CopyIcon,
  NetworkIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  ActivityIcon,
} from "lucide-react";

import MiniGraphPanel from "./MiniGraphPanel";
import ChatStatsPanel from "./ChatStatsPanel";

// --- MARKDOWN COMPONENTS & MESSAGE BUBBLE (Giữ nguyên để tiết kiệm dòng) ---
const MarkdownComponents = {
  p: ({ children, ...props }: any) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  a: ({ children, href, ...props }: any) => (
    <a
      href={href}
      className="text-emerald-500 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const MessageBubble = React.memo(
  ({
    message,
    onCopy,
  }: {
    message: ChatMessage;
    onCopy: (text: string) => void;
  }) => {
    const [copied, setCopied] = useState(false);
    const isUser = message.role === "user";
    const handleCopy = () => {
      onCopy(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    // Nút hiển thị graph
    const handleShowGraph = () => {
      const msgData = message as any;
      if (msgData.context_data?.entities?.length > 0) {
        useGraphStore.getState().setMiniGraphData(msgData.context_data);
        toast.success(
          `Đã hiển thị ${msgData.context_data.entities.length} thực thể.`
        );
      } else {
        toast.info("Tin nhắn này không có dữ liệu đồ thị.");
      }
    };

    return (
      <div
        className={cn(
          "flex gap-3 group",
          isUser ? "flex-row-reverse" : "flex-row"
        )}
      >
        <div
          className={cn(
            "shrink-0 size-8 rounded-full flex items-center justify-center",
            isUser ? "bg-emerald-500" : "bg-purple-500"
          )}
        >
          {isUser ? (
            <UserIcon className="size-4 text-white" />
          ) : (
            <BotIcon className="size-4 text-white" />
          )}
        </div>
        <div
          className={cn(
            "max-w-[90%] md:max-w-[80%] rounded-2xl px-4 py-3 relative",
            isUser
              ? "bg-emerald-500 text-white rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm"
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={MarkdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          <div
            className={cn(
              "flex items-center gap-2 mt-2 text-xs",
              isUser ? "text-white/70 justify-end" : "text-muted-foreground"
            )}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {!isUser && !message.isThinking && (
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleShowGraph}
                className="p-1.5 rounded-md bg-muted/80 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
              >
                <NetworkIcon className="size-3" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md bg-muted/80 hover:bg-muted transition-colors"
              >
                <CopyIcon className="size-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

// --- CHAT INPUT (Giữ nguyên logic) ---
function ChatInput({
  onSend,
  isLoading,
}: {
  onSend: (message: string) => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput("");
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  return (
    <div className="relative">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.inputPlaceholder", "Đặt câu hỏi...")}
        className="w-full min-h-[52px] resize-none rounded-xl border-2 border-border bg-background px-4 py-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        disabled={isLoading}
      />
      <Button
        onClick={handleSend}
        disabled={!input.trim() || isLoading}
        size="icon"
        className="absolute right-2 bottom-2 size-9 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600"
      >
        <SendIcon className="size-4 text-white" />
      </Button>
    </div>
  );
}

// --- MAIN LAYOUT ---
export default function ChatPanel() {
  const { t } = useTranslation();
  const messages = useChatStore.use.messages();
  const addMessage = useChatStore.use.addMessage();
  const updateMessage = useChatStore.use.updateMessage();
  const isLoading = useChatStore.use.isLoading();
  const setIsLoading = useChatStore.use.setIsLoading();
  const chatMode = useChatStore.use.chatMode();
  const setChatMode = useChatStore.use.setChatMode();
  const agentModeEnabled = useChatStore.use.agentModeEnabled();
  const setAgentModeEnabled = useChatStore.use.setAgentModeEnabled();
  const clearMessages = useChatStore.use.clearMessages();
  const querySettings = useSettingsStore.use.querySettings();

  const [layoutMode, setLayoutMode] = useState<
    "default" | "expanded_graph" | "full_chat"
  >("default");
  const [rightPanelTab, setRightPanelTab] = useState<"graph" | "stats">(
    "graph"
  );

  const handleSend = useCallback(
    async (content: string) => {
      addMessage({ role: "user", content });
      const assistantId = addMessage({
        role: "assistant",
        content: "",
        isThinking: true,
      });
      setIsLoading(true);
      try {
        const response = await queryText({
          query: content,
          mode: chatMode,
          stream: false,
          conversation_history: [],
          ...querySettings,
        });
        updateMessage(assistantId, {
          content: response.response,
          isThinking: false,
          context_data: response.context_data as any,
        });
        if (response.context_data) {
          useGraphStore.getState().setMiniGraphData(response.context_data);
          // Tự động mở panel nếu đang đóng
          if (layoutMode === "full_chat") setLayoutMode("default");
        }
      } catch (e) {
        updateMessage(assistantId, {
          content: "Có lỗi xảy ra: " + errorMessage(e),
          isThinking: false,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      addMessage,
      updateMessage,
      setIsLoading,
      chatMode,
      querySettings,
      layoutMode,
    ]
  );

  return (
    <div className="flex h-full w-full bg-background overflow-hidden relative">
      {/* === CỘT TRÁI: CHAT === */}
      {/* Dùng flex-shrink-0 và width cứng để tránh lỗi layout shift */}
      <div
        className={cn(
          "flex flex-col h-full border-r border-border transition-all duration-300 ease-in-out bg-background z-10",
          layoutMode === "full_chat"
            ? "w-full"
            : layoutMode === "expanded_graph"
            ? "w-[30%] min-w-[320px]"
            : "w-[65%]"
        )}
      >
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
              <SparklesIcon className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Chat with Docs</h2>
              <div className="flex items-center gap-2">
                <Switch
                  checked={agentModeEnabled}
                  onCheckedChange={setAgentModeEnabled}
                  className="scale-75 origin-left"
                />
                <span className="text-xs text-muted-foreground">
                  {agentModeEnabled ? "Smart Agent" : "Manual"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!agentModeEnabled && (
              <Select
                value={chatMode}
                onValueChange={(v) => setChatMode(v as any)}
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              className="size-8"
            >
              <TrashIcon className="size-4" />
            </Button>
            {layoutMode === "full_chat" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLayoutMode("default")}
                className="ml-2 gap-1 text-xs"
              >
                <PanelRightOpenIcon className="size-4" /> Graph
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onCopy={() => {}} />
            ))}
          </div>
        </ScrollArea>
        <div className="shrink-0 p-4 border-t border-border bg-card">
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      </div>

      {/* === CỘT PHẢI: GRAPH === */}
      {layoutMode !== "full_chat" && (
        <div className="flex-1 min-w-0 flex flex-col h-full bg-muted/10 relative">
          <div className="shrink-0 h-14 border-b border-border bg-card/50 px-3 flex items-center justify-between">
            <div className="flex bg-muted/50 p-1 rounded-lg">
              <button
                onClick={() => setRightPanelTab("graph")}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-all",
                  rightPanelTab === "graph"
                    ? "bg-background shadow text-emerald-600"
                    : "text-muted-foreground"
                )}
              >
                Graph
              </button>
              <button
                onClick={() => setRightPanelTab("stats")}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-all",
                  rightPanelTab === "stats"
                    ? "bg-background shadow text-blue-600"
                    : "text-muted-foreground"
                )}
              >
                Stats
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() =>
                  setLayoutMode((prev) =>
                    prev === "default" ? "expanded_graph" : "default"
                  )
                }
              >
                {layoutMode === "default" ? (
                  <Maximize2Icon className="size-4" />
                ) : (
                  <Minimize2Icon className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => setLayoutMode("full_chat")}
              >
                <PanelRightCloseIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 relative w-full h-full overflow-hidden">
            {rightPanelTab === "graph" ? (
              // [FIX QUAN TRỌNG] Bọc trong absolute inset-0 để Canvas không bị width=0
              <div className="absolute inset-0 w-full h-full">
                <MiniGraphPanel isExpanded={layoutMode === "expanded_graph"} />
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full overflow-auto">
                <ChatStatsPanel />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
