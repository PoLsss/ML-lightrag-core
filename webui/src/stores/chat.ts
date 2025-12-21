import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSelectors } from '@/lib/utils'
import { Message, QueryMode } from '@/api/lightrag'

export type MessageType = 'user' | 'assistant' | 'system' | 'thinking'
export type QueryType = 'retrieval' | 'chat' | 'unknown'

export interface ChatMessage extends Message {
  id: string
  timestamp: number
  responseTime?: number // in milliseconds
  tokensUsed?: number
  mode?: QueryMode
  queryType?: QueryType // 'retrieval' if used RAG, 'chat' if direct LLM
  isThinking?: boolean // For showing "thinking" state
}

// Conversation history interface
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ChatStats {
  totalQueries: number
  totalResponses: number
  averageResponseTime: number
  fastestResponse: number
  slowestResponse: number
  totalTokensUsed: number
  queriesPerMode: Record<QueryMode, number>
  retrievalQueries: number // Queries that used RAG
  chatQueries: number // Direct chat queries
  responseTimes: number[] // Last 50 response times for chart
  queriesOverTime: { timestamp: number; count: number }[] // Queries per hour for last 24h
}

interface ChatState {
  // Messages
  messages: ChatMessage[]
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearMessages: () => void

  // Conversation histories
  conversations: Conversation[]
  currentConversationId: string | null
  saveCurrentConversation: (title?: string) => void
  loadConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  startNewConversation: () => void

  // Current input
  currentInput: string
  setCurrentInput: (input: string) => void

  // Loading state
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Stats
  stats: ChatStats
  updateStats: (responseTime: number, mode: QueryMode, queryType: QueryType, tokensUsed?: number) => void
  resetStats: () => void

  // Settings
  chatMode: QueryMode
  setChatMode: (mode: QueryMode) => void

  streamEnabled: boolean
  setStreamEnabled: (enabled: boolean) => void

  // Agent mode - auto detect if question needs RAG
  agentModeEnabled: boolean
  setAgentModeEnabled: (enabled: boolean) => void
}

const initialStats: ChatStats = {
  totalQueries: 0,
  totalResponses: 0,
  averageResponseTime: 0,
  fastestResponse: Infinity,
  slowestResponse: 0,
  totalTokensUsed: 0,
  queriesPerMode: {
    naive: 0,
    local: 0,
    global: 0,
    hybrid: 0,
    mix: 0,
    bypass: 0
  },
  retrievalQueries: 0,
  chatQueries: 0,
  responseTimes: [],
  queriesOverTime: []
}

const useChatStoreBase = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      conversations: [],
      currentConversationId: null,
      currentInput: '',
      isLoading: false,
      stats: initialStats,
      chatMode: 'hybrid',
      streamEnabled: true,
      agentModeEnabled: true, // Enable agent mode by default

      addMessage: (message) => {
        const id = crypto.randomUUID()
        const timestamp = Date.now()
        set((state) => ({
          messages: [...state.messages, { ...message, id, timestamp }]
        }))
        return id
      },

      updateMessage: (id, updates) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          )
        }))
      },

      clearMessages: () => set({ messages: [], currentConversationId: null }),

      // Conversation management
      saveCurrentConversation: (title?: string) => {
        const state = get()
        if (state.messages.length === 0) return

        const now = Date.now()
        const conversationId = state.currentConversationId || crypto.randomUUID()
        
        // Generate title from first user message if not provided
        const autoTitle = title || state.messages.find(m => m.role === 'user')?.content?.slice(0, 50) || 'New Conversation'
        
        set((s) => {
          const existingIndex = s.conversations.findIndex(c => c.id === conversationId)
          
          const conversation: Conversation = {
            id: conversationId,
            title: autoTitle,
            messages: [...s.messages],
            createdAt: existingIndex >= 0 ? s.conversations[existingIndex].createdAt : now,
            updatedAt: now
          }

          let newConversations: Conversation[]
          if (existingIndex >= 0) {
            newConversations = [...s.conversations]
            newConversations[existingIndex] = conversation
          } else {
            newConversations = [conversation, ...s.conversations]
          }

          // Keep only last 50 conversations
          return {
            conversations: newConversations.slice(0, 50),
            currentConversationId: conversationId
          }
        })
      },

      loadConversation: (id: string) => {
        const state = get()
        const conversation = state.conversations.find(c => c.id === id)
        if (conversation) {
          set({
            messages: [...conversation.messages],
            currentConversationId: id
          })
        }
      },

      deleteConversation: (id: string) => {
        set((state) => ({
          conversations: state.conversations.filter(c => c.id !== id),
          // Clear messages if deleting current conversation
          ...(state.currentConversationId === id ? { messages: [], currentConversationId: null } : {})
        }))
      },

      renameConversation: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map(c =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          )
        }))
      },

      startNewConversation: () => {
        const state = get()
        // Auto-save current conversation if has messages
        if (state.messages.length > 0) {
          state.saveCurrentConversation()
        }
        set({ messages: [], currentConversationId: null })
      },

      setCurrentInput: (input) => set({ currentInput: input }),

      setIsLoading: (loading) => set({ isLoading: loading }),

      updateStats: (responseTime, mode, queryType, tokensUsed = 0) => {
        set((state) => {
          const newResponseTimes = [...state.stats.responseTimes, responseTime].slice(-50)
          const now = Date.now()
          
          // Update queries over time (keep last 24 hours, grouped by hour)
          const currentHour = Math.floor(now / 3600000) * 3600000
          let queriesOverTime = state.stats.queriesOverTime.filter(
            (q) => q.timestamp > now - 86400000
          )
          
          const existingHourIndex = queriesOverTime.findIndex(
            (q) => q.timestamp === currentHour
          )
          
          if (existingHourIndex >= 0) {
            queriesOverTime[existingHourIndex].count++
          } else {
            queriesOverTime.push({ timestamp: currentHour, count: 1 })
          }

          const totalQueries = state.stats.totalQueries + 1
          const totalResponseTime = state.stats.averageResponseTime * state.stats.totalResponses + responseTime
          const totalResponses = state.stats.totalResponses + 1

          return {
            stats: {
              totalQueries,
              totalResponses,
              averageResponseTime: totalResponseTime / totalResponses,
              fastestResponse: Math.min(state.stats.fastestResponse === Infinity ? responseTime : state.stats.fastestResponse, responseTime),
              slowestResponse: Math.max(state.stats.slowestResponse, responseTime),
              totalTokensUsed: state.stats.totalTokensUsed + tokensUsed,
              queriesPerMode: {
                ...state.stats.queriesPerMode,
                [mode]: (state.stats.queriesPerMode[mode] || 0) + 1
              },
              retrievalQueries: state.stats.retrievalQueries + (queryType === 'retrieval' ? 1 : 0),
              chatQueries: state.stats.chatQueries + (queryType === 'chat' ? 1 : 0),
              responseTimes: newResponseTimes,
              queriesOverTime
            }
          }
        })
      },

      resetStats: () => set({ stats: initialStats }),

      setChatMode: (mode) => set({ chatMode: mode }),

      setStreamEnabled: (enabled) => set({ streamEnabled: enabled }),

      setAgentModeEnabled: (enabled) => set({ agentModeEnabled: enabled })
    }),
    {
      name: 'lightrag-chat-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist a compact representation to avoid exceeding localStorage quota.
      partialize: (state) => {
        const serializeMessage = (m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          responseTime: m.responseTime,
          mode: m.mode,
          queryType: m.queryType,
          isThinking: m.isThinking,
        })

        const messages = state.messages.slice(-100).map(serializeMessage)

        const conversations = state.conversations.slice(0, 50).map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messages: (c.messages || []).slice(-50).map(serializeMessage),
        }))

        return {
          messages,
          conversations,
          currentConversationId: state.currentConversationId,
          stats: state.stats,
          chatMode: state.chatMode,
          streamEnabled: state.streamEnabled,
          agentModeEnabled: state.agentModeEnabled,
        }
      }
    }
  )
)

export const useChatStore = createSelectors(useChatStoreBase)
