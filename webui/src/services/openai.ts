/**
 * OpenAI Service - Handles direct LLM calls for general chat (non-RAG queries)
 */

import { Message } from '@/api/lightrag'

// Get API key from environment or settings
const getApiKey = (): string => {
  // Try to get from localStorage first (user settings)
  const storedKey = localStorage.getItem('openai_api_key')
  if (storedKey) return storedKey
  
  // Fall back to environment variable
  return import.meta.env.VITE_OPENAI_API_KEY || ''
}

// Get model from environment or use default
const getModel = (): string => {
  return import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
}

// Get base URL (can be customized for Azure, local, etc.)
const getBaseUrl = (): string => {
  return import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1'
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIChatResponse {
  id: string
  choices: {
    index: number
    message: OpenAIChatMessage
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const SYSTEM_PROMPT = `Bạn là một trợ lý ảo thân thiện và hữu ích. 

Khi người dùng:
- Chào hỏi: Chào lại một cách thân thiện
- Cảm ơn: Đáp lại lịch sự
- Hỏi về bạn: Giới thiệu bạn là trợ lý AI
- Trò chuyện bình thường: Trả lời một cách tự nhiên và thân thiện

Lưu ý:
- Trả lời ngắn gọn, không quá dài
- Sử dụng ngôn ngữ phù hợp với ngôn ngữ người dùng sử dụng
- Nếu người dùng hỏi về tài liệu hoặc thông tin cụ thể, hãy gợi ý họ hỏi trực tiếp câu hỏi đó để hệ thống tìm kiếm trong cơ sở dữ liệu`

/**
 * Send a chat message to OpenAI/GPT
 */
export async function sendChatToOpenAI(
  query: string,
  conversationHistory: Message[] = []
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = getApiKey()
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_API_KEY in your environment or configure it in settings.')
  }
  
  const baseUrl = getBaseUrl()
  const model = getModel()
  
  // Build messages array
  const messages: OpenAIChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT }
  ]
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory.slice(-10)
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content
      })
    }
  }
  
  // Add current query
  messages.push({ role: 'user', content: query })
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_completion_tokens: 1000
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`)
    }
    
    const data: OpenAIChatResponse = await response.json()
    
    return {
      content: data.choices[0]?.message?.content || 'No response',
      tokensUsed: data.usage?.total_tokens || 0
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to communicate with OpenAI API')
  }
}

/**
 * Check if OpenAI API is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!getApiKey()
}

/**
 * Set OpenAI API key in localStorage
 */
export function setOpenAIApiKey(key: string): void {
  if (key) {
    localStorage.setItem('openai_api_key', key)
  } else {
    localStorage.removeItem('openai_api_key')
  }
}

/**
 * Get current OpenAI API key (masked for display)
 */
export function getMaskedApiKey(): string {
  const key = getApiKey()
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '...' + key.substring(key.length - 4)
}
