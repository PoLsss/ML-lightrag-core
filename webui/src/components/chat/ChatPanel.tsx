import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore, ChatMessage, QueryType } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { useGraphStore } from "@/stores/graph"; // Import Graph Store
import { queryText, queryTextStream } from "@/api/lightrag";
import {
  classifyQueryWithLLM,
  buildConversationHistory,
} from "@/services/agent";
import { sendChatToOpenAI, isOpenAIConfigured } from "@/services/openai";
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
  Loader2Icon,
  BotIcon,
  UserIcon,
  TrashIcon,
  SparklesIcon,
  CopyIcon,
  CheckIcon,
  BrainIcon,
  DatabaseIcon,
  MessageCircleIcon,
  PlusIcon,
  NetworkIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

// Fallback helper function
const extractEntitiesFromContent = (content: string): string[] => {
  const entities = new Set<string>();
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;
  while ((match = boldRegex.exec(content)) !== null) {
    if (match[1].length > 2) entities.add(match[1].trim());
  }
  return Array.from(entities);
};

// Markdown Components (Giữ nguyên)
const MarkdownComponents = {
  h1: ({ children, ...props }: any) => (
    <h1 className="text-xl font-bold mt-4 mb-2" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-lg font-bold mt-3 mb-2" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-base font-semibold mt-2 mb-1" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: any) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="ml-2" {...props}>
      {children}
    </li>
  ),
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-3">
      <table
        className="min-w-full border-collapse border border-border text-xs"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }: any) => (
    <tr className="border-b border-border" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: any) => (
    <th
      className="border border-border px-2 py-1.5 text-left font-semibold bg-muted/30"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="border border-border px-2 py-1.5" {...props}>
      {children}
    </td>
  ),
  code: ({ inline, children, ...props }: any) =>
    inline ? (
      <code
        className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    ) : (
      <div className="bg-muted p-3 rounded-lg overflow-x-auto my-2">
        <code className="text-xs font-mono block" {...props}>
          {children}
        </code>
      </div>
    ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote
      className="border-l-4 border-emerald-500 pl-3 my-2 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }: any) => (
    <a
      href={href}
      className="text-emerald-500 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  strong: ({ children, ...props }: any) => (
    <strong
      className="font-semibold text-emerald-600 dark:text-emerald-400"
      {...props}
    >
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  hr: (props: any) => <hr className="my-3 border-border" {...props} />,
};

interface MessageBubbleProps {
  message: ChatMessage;
  onCopy: (text: string) => void;
}

const MessageBubble = React.memo(({ message, onCopy }: MessageBubbleProps) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // === [UPDATED] Handle Show Graph ===
  const handleShowGraph = () => {
    // 1. Lấy dữ liệu trực tiếp từ Backend (trong context_data)
    const msgData = message as any;

    if (
      msgData.context_data &&
      Array.isArray(msgData.context_data.entities) &&
      msgData.context_data.entities.length > 0
    ) {
      // [NEW] Gửi toàn bộ object graph data vào store
      useGraphStore.getState().setMiniGraphData(msgData.context_data);
      toast.success(
        `Đã hiển thị ${msgData.context_data.entities.length} thực thể.`
      );
    } else {
      // Fallback: Nếu không có dữ liệu (ví dụ chat mode bypass), báo lỗi
      toast.info("Tin nhắn này không có dữ liệu đồ thị đi kèm.");
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
          "max-w-[80%] rounded-2xl px-4 py-3 relative",
          isUser
            ? "bg-emerald-500 text-white rounded-tr-sm"
            : "bg-card border border-border rounded-tl-sm"
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
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
          {message.responseTime && (
            <span>{(message.responseTime / 1000).toFixed(2)}s</span>
          )}
          {message.queryType && !isUser && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] uppercase flex items-center gap-1",
                message.queryType === "retrieval"
                  ? "bg-blue-500/20 text-blue-600"
                  : "bg-purple-500/20 text-purple-600"
              )}
            >
              {message.queryType === "retrieval" ? (
                <>
                  <DatabaseIcon className="size-2.5" /> RAG
                </>
              ) : (
                <>
                  <MessageCircleIcon className="size-2.5" /> Chat
                </>
              )}
            </span>
          )}
          {message.mode && !isUser && message.queryType === "retrieval" && (
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] uppercase">
              {message.mode}
            </span>
          )}
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {!isUser && !message.isThinking && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleShowGraph}
                    className="p-1.5 rounded-md bg-muted/80 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                  >
                    <NetworkIcon className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Show Context on Graph</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md bg-muted/80 hover:bg-muted transition-colors"
                  >
                    {copied ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3 text-muted-foreground" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy Message</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
});

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  };

  useEffect(() => {
    if (!isLoading && textareaRef.current) textareaRef.current.focus();
  }, [isLoading]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={t(
          "chat.inputPlaceholder",
          "Ask a question about your documents..."
        )}
        className="w-full min-h-[52px] max-h-[150px] resize-none rounded-xl border-2 border-border bg-background px-4 py-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 placeholder:text-muted-foreground shadow-sm transition-all duration-200"
        disabled={isLoading}
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={!input.trim() || isLoading}
        size="icon"
        className="absolute right-2 bottom-2 size-9 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 shadow-lg shadow-emerald-500/30 transition-all duration-200"
      >
        {isLoading ? (
          <Loader2Icon className="size-4 animate-spin text-white" />
        ) : (
          <SendIcon className="size-4 text-white" />
        )}
      </Button>
    </div>
  );
}

export default function ChatPanel() {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const lastScrollTop = useRef(0);
  const scrollAnimationFrame = useRef<number | null>(null);
  
  const messages = useChatStore.use.messages();
  const addMessage = useChatStore.use.addMessage();
  const updateMessage = useChatStore.use.updateMessage();
  const clearMessages = useChatStore.use.clearMessages();
  const isLoading = useChatStore.use.isLoading();
  const setIsLoading = useChatStore.use.setIsLoading();
  const updateStats = useChatStore.use.updateStats();
  const chatMode = useChatStore.use.chatMode();
  const setChatMode = useChatStore.use.setChatMode();
  const streamEnabled = useChatStore.use.streamEnabled();
  const agentModeEnabled = useChatStore.use.agentModeEnabled();
  const setAgentModeEnabled = useChatStore.use.setAgentModeEnabled();
  const saveCurrentConversation = useChatStore.use.saveCurrentConversation();
  const startNewConversation = useChatStore.use.startNewConversation();
  const querySettings = useSettingsStore.use.querySettings();

  // Smooth scroll system for streaming
  const scrollToBottom = useCallback((immediate = false) => {
    if (scrollAnimationFrame.current) {
      cancelAnimationFrame(scrollAnimationFrame.current);
    }
    
    scrollAnimationFrame.current = requestAnimationFrame(() => {
      if (!messagesEndRef.current || !scrollContainerRef.current) return;
      
      // Check if user is near the bottom (within 100px)
      const container = scrollContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      // Only auto-scroll if user is near bottom or it's immediate
      if (immediate || isNearBottom || !isUserScrolling.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: immediate ? "auto" : "smooth",
          block: "end"
        });
      }
    });
  }, []);

  // Handle user scroll detection
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const currentScrollTop = container.scrollTop;
    
    // Detect if user is actively scrolling
    if (Math.abs(currentScrollTop - lastScrollTop.current) > 5) {
      isUserScrolling.current = true;
      
      // Reset user scrolling flag after 1 second of no activity
      setTimeout(() => {
        isUserScrolling.current = false;
      }, 1000);
    }
    
    lastScrollTop.current = currentScrollTop;
  }, []);
  
  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom(!isLoading);
  }, [messages, scrollToBottom, isLoading]);
  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      toast.success(t("common.copied", "Copied to clipboard"));
    },
    [t]
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
      const startTime = Date.now();

      try {
        const conversationHistory = buildConversationHistory(
          messages.map((m) => ({ role: m.role, content: m.content }))
        );
        let queryType: QueryType = "retrieval";
        let effectiveMode = chatMode;

        if (agentModeEnabled) {
          updateMessage(assistantId, {
            content: "🤔 Đang phân tích câu hỏi...",
            isThinking: true,
          });
          queryType = await classifyQueryWithLLM(content, conversationHistory);

          if (queryType === "chat") {
            effectiveMode = "bypass";
            updateMessage(assistantId, {
              content: "💬 Đang xử lý chat...",
              isThinking: true,
            });
            if (isOpenAIConfigured()) {
              try {
                const openaiResponse = await sendChatToOpenAI(
                  content,
                  conversationHistory
                );
                const responseTime = Date.now() - startTime;
                updateMessage(assistantId, {
                  content: openaiResponse.content,
                  responseTime,
                  mode: "bypass",
                  queryType: "chat",
                  isThinking: false,
                });
                updateStats(responseTime, "bypass", "chat");
                return;
              } catch (error) {
                console.warn("OpenAI failed, falling back to RAG:", error);
                toast.info("OpenAI không khả dụng, đang sử dụng RAG...");
              }
            }
          } else {
            updateMessage(assistantId, {
              content: "🔍 Đang tìm kiếm trong tài liệu...",
              isThinking: true,
            });
          }
        }

        let fullResponse = "";
        let streamUpdateTimeout: NodeJS.Timeout | null = null;
        let pendingUpdate = false;

        if (streamEnabled) {
          // [UPDATED] Gọi hàm stream với tham số mới và throttling
          await queryTextStream(
            {
              query: content,
              mode: effectiveMode,
              stream: true,
              conversation_history: conversationHistory,
              ...querySettings,
            },
            (chunk) => {
              fullResponse += chunk;
              
              // Throttle UI updates to reduce jitter - only update every 50ms
              if (!pendingUpdate) {
                pendingUpdate = true;
                streamUpdateTimeout = setTimeout(() => {
                  updateMessage(assistantId, {
                    content: fullResponse,
                    isThinking: false,
                  });
                  pendingUpdate = false;
                  // Smooth auto-scroll during streaming
                  scrollToBottom();
                }, 50);
              }
            },
            // [NEW] Callback nhận context data
            (contextData) => {
              console.log("Received streaming context:", contextData);
              if (contextData) {
                updateMessage(assistantId, {
                  // @ts-ignore
                  context_data: contextData,
                });
              }
            },
            (error) => {
              // Clear any pending updates on error
              if (streamUpdateTimeout) {
                clearTimeout(streamUpdateTimeout);
                streamUpdateTimeout = null;
              }
              throw new Error(error);
            }
          );
          
          // Ensure final update after stream completes
          if (streamUpdateTimeout) {
            clearTimeout(streamUpdateTimeout);
          }
          updateMessage(assistantId, {
            content: fullResponse,
            isThinking: false,
          });
          // Final smooth scroll after streaming ends
          scrollToBottom();
        } else {
          // Non-streaming
          const response = await queryText({
            query: content,
            mode: effectiveMode,
            stream: false,
            conversation_history: conversationHistory,
            ...querySettings,
          });
          fullResponse = response.response;
          // [NEW] Lưu context data
          updateMessage(assistantId, {
            content: fullResponse,
            isThinking: false,
            // @ts-ignore
            context_data: response.context_data,
          });
        }

        const responseTime = Date.now() - startTime;
        updateMessage(assistantId, {
          responseTime,
          mode: effectiveMode,
          queryType,
          isThinking: false,
        });
        updateStats(responseTime, effectiveMode, queryType);
        setTimeout(() => saveCurrentConversation(), 100);
      } catch (error) {
        const errMsg = errorMessage(error);
        updateMessage(assistantId, {
          content: t("chat.error", "Sorry, an error occurred: ") + errMsg,
          isThinking: false,
        });
        toast.error(errMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [
      messages,
      addMessage,
      updateMessage,
      setIsLoading,
      updateStats,
      chatMode,
      streamEnabled,
      agentModeEnabled,
      querySettings,
      saveCurrentConversation,
      t,
      scrollToBottom,
    ]
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
              <SparklesIcon className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">
                {t("chat.title", "Chat with your Docs")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {agentModeEnabled
                  ? t("chat.agentMode", "Smart mode: Auto-detects query type")
                  : t(
                      "chat.subtitle",
                      "Ask questions about your knowledge base"
                    )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <BrainIcon
                      className={cn(
                        "size-4 transition-colors",
                        agentModeEnabled
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                      )}
                    />
                    <Switch
                      checked={agentModeEnabled}
                      onCheckedChange={setAgentModeEnabled}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs max-w-xs">
                    <p className="font-semibold mb-1">
                      {t("chat.agentModeTitle", "Agent Mode")}
                    </p>
                    <p>
                      {t(
                        "chat.agentModeDesc",
                        "When enabled, automatically detects if your question needs document retrieval (RAG) or just a simple chat response."
                      )}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!agentModeEnabled && (
              <Select
                value={chatMode}
                onValueChange={(v) => setChatMode(v as typeof chatMode)}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="naive">Naive</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="mix">Mix</SelectItem>
                  <SelectItem value="bypass">Bypass</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 gap-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 hover:border-emerald-300"
              onClick={startNewConversation}
              disabled={messages.length === 0}
            >
              <PlusIcon className="size-4" />
              <span className="text-xs font-medium">
                {t("chat.newChat", "New Chat")}
              </span>
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={clearMessages}
                    disabled={messages.length === 0}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("chat.clear", "Clear chat")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1" ref={scrollContainerRef} onScroll={handleScroll}>
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4">
                <BotIcon className="size-8 text-emerald-500" />
              </div>
              <h3 className="font-semibold text-lg mb-2">
                {t("chat.welcome.title", "Welcome to LightRAG Chat")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {t(
                  "chat.welcome.description",
                  "Bắt đầu hỏi với các câu hỏi về tài liệu bạn đã tải lên. Tôi sẽ sử dụng đồ thị tri thức để cung cấp câu trả lời chính xác."
                )}
              </p>
              <div className="flex flex-wrap gap-2 mt-6 max-w-md justify-center">
                {[
                  t(
                    "chat.suggestions.1",
                    "Những chủ đề chính trong tài liệu là gì?"
                  ),
                  t("chat.suggestions.2", "Thông tin về khóa luận tốt nghiệp"),
                  t(
                    "chat.suggestions.3",
                    "Chương trình nghiên cứu phương thức 2"
                  ),
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(suggestion)}
                    className="px-3 py-2 text-xs rounded-full border border-border hover:bg-muted transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCopy={handleCopy}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="shrink-0 p-4 border-t border-border bg-card">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            {t("chat.hint", "Press Enter to send, Shift+Enter for new line")}
          </span>
          <span>
            {streamEnabled
              ? t("chat.streaming", "Streaming enabled")
              : t("chat.noStreaming", "Streaming disabled")}
          </span>
        </div>
      </div>
    </div>
  );
}
