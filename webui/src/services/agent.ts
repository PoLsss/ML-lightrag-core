/**
 * Agent Service - Handles intelligent routing between RAG and direct LLM responses
 * Specialized for UIT Graduate School (SDH.UIT.EDU.VN) content
 * Uses LLM-based classification for accurate query routing
 */

import { Message } from '@/api/lightrag'
import { QueryType } from '@/stores/chat'

// ============================================================================
// CLASSIFICATION PROMPT - Sử dụng LLM để phân loại chính xác
// ============================================================================
export const CLASSIFICATION_PROMPT = `Bạn là một agent phân loại câu hỏi. Nhiệm vụ của bạn là xác định xem câu hỏi của người dùng có liên quan đến TÀI LIỆU của Trường Đại học Công nghệ Thông tin (UIT) hay không.

=== CÁC CHỦ ĐỀ LIÊN QUAN ĐẾN TÀI LIỆU (cần truy xuất RAG) ===

A. TUYỂN SINH
- Tuyển sinh đại học, thạc sĩ, tiến sĩ
- Phương thức xét tuyển
- Điều kiện dự tuyển
- Hồ sơ, thủ tục nhập học
- Thời gian nhận hồ sơ
- Chỉ tiêu tuyển sinh
- Điểm chuẩn
- Chương trình liên kết đào tạo
- Các thông báo tuyển sinh

B. ĐÀO TẠO – HỌC VỤ
- Đăng ký học phần
- Thời khóa biểu, lịch học, lịch học bù
- Thông báo nghỉ học
- Thi cử – lịch thi – điểm thi – phúc khảo
- Cảnh báo học vụ
- Điều kiện tốt nghiệp
- Quy chế đào tạo
- Xét tốt nghiệp

C. HỌC PHÍ – HỌC BỔNG – HỖ TRỢ TÀI CHÍNH
- Mức học phí các bậc học
- Lộ trình tăng học phí
- Học bổng khuyến khích học tập
- Học bổng tài trợ
- Miễn giảm học phí

D. CHƯƠNG TRÌNH ĐÀO TẠO
- Các ngành đào tạo
- Khung chương trình
- Danh sách môn học
- Mô tả môn học
- Chuẩn đầu ra
- Đề cương môn học

E. SINH VIÊN – HỌC VIÊN – NGHIÊN CỨU SINH
- Thông tin, thủ tục cho sinh viên UIT
- Học viên cao học
- Nghiên cứu sinh
- Tạm ngưng học, bảo lưu, thôi học

F. KHOÁ LUẬN – LUẬN VĂN – LUẬN ÁN
- Đề tài khoá luận, luận văn thạc sĩ, luận án tiến sĩ
- Điều kiện làm khoá luận
- Quy trình đăng ký đề tài
- Hội đồng bảo vệ, lịch bảo vệ

G. GIẢNG VIÊN – NGHIÊN CỨU
- Thông tin giảng viên
- Giảng viên hướng dẫn
- Nhóm nghiên cứu, hướng nghiên cứu
- Công bố khoa học, đề tài nghiên cứu

H. WEBSITE SAU ĐẠI HỌC (SDH.UIT.EDU.VN)
- Thông báo đào tạo
- Tuyển sinh SDH
- Chương trình đào tạo thạc sĩ / tiến sĩ
- Tin tức hội thảo – seminar
- Thông báo học vụ cao học – NCS

=== CHITCHAT (không liên quan đến tài liệu) ===
- Chào hỏi (xin chào, hi, hello...)
- Cảm ơn, tạm biệt
- Hỏi về bot (bạn là ai, tên bạn là gì...)
- Hỏi thăm sức khỏe
- Kể chuyện cười, giải trí
- Thời tiết, giờ giấc
- Các chủ đề không liên quan đến giáo dục UIT

=== QUY TẮC PHÂN LOẠI ===
1. Nếu câu hỏi thuộc BẤT KỲ nhóm A-H ở trên → trả lời "RETRIEVAL"
2. Nếu câu hỏi là chitchat hoặc không liên quan → trả lời "CHAT"
3. Nếu không chắc chắn nhưng có vẻ liên quan đến UIT/giáo dục → trả lời "RETRIEVAL"

CHỈ TRẢ LỜI MỘT TỪ DUY NHẤT: "RETRIEVAL" hoặc "CHAT"`

// ============================================================================
// Quick keyword check (fallback khi không có LLM)
// ============================================================================
const DOCUMENT_KEYWORDS = [
  // A. Tuyển sinh
  'tuyển sinh', 'xét tuyển', 'phương thức xét tuyển', 'điều kiện dự tuyển',
  'hồ sơ nhập học', 'thủ tục nhập học', 'nhập học', 'thời gian nhận hồ sơ',
  'chỉ tiêu tuyển sinh', 'chỉ tiêu', 'điểm chuẩn', 'điểm trúng tuyển',
  'liên kết đào tạo', 'chương trình liên kết', 'thông báo tuyển sinh',
  'thạc sĩ', 'tiến sĩ', 'cao học', 'nghiên cứu sinh', 'ncs',
  'đăng ký dự tuyển', 'nộp hồ sơ', 'hồ sơ dự tuyển',
  
  // B. Đào tạo - Học vụ
  'đăng ký học phần', 'học phần', 'thời khóa biểu', 'tkb',
  'lịch học', 'lịch học bù', 'học bù', 'nghỉ học', 'thông báo nghỉ',
  'thi cử', 'lịch thi', 'điểm thi', 'phúc khảo', 'kết quả thi',
  'cảnh báo học vụ', 'cảnh báo', 'điều kiện tốt nghiệp', 'tốt nghiệp',
  'quy chế đào tạo', 'quy chế', 'xét tốt nghiệp', 'công nhận tốt nghiệp',
  'học vụ', 'đào tạo',
  
  // C. Học phí - Học bổng
  'học phí', 'mức học phí', 'lộ trình học phí', 'tăng học phí',
  'học bổng', 'học bổng khuyến khích', 'học bổng tài trợ',
  'miễn giảm học phí', 'miễn giảm', 'hỗ trợ tài chính',
  'đóng học phí', 'nộp học phí', 'chi phí học',
  
  // D. Chương trình đào tạo
  'ngành đào tạo', 'ngành học', 'chuyên ngành', 'khung chương trình',
  'danh sách môn học', 'môn học', 'mô tả môn học', 'chuẩn đầu ra',
  'đề cương môn học', 'đề cương', 'chương trình đào tạo', 'ctđt',
  'tín chỉ', 'số tín chỉ', 'khối lượng kiến thức',
  
  // E. Sinh viên - Học viên - NCS
  'sinh viên', 'học viên', 'nghiên cứu sinh',
  'thủ tục sinh viên', 'thông tin sinh viên',
  'tạm ngưng học', 'bảo lưu', 'thôi học',
  'giấy xác nhận', 'xác nhận sinh viên',
  
  // F. Khóa luận - Luận văn - Luận án
  'khóa luận', 'khoá luận', 'luận văn', 'luận án',
  'đề tài', 'đề tài khóa luận', 'đề tài luận văn', 'đề tài luận án',
  'điều kiện làm khóa luận', 'đăng ký đề tài', 'quy trình đăng ký đề tài',
  'hội đồng bảo vệ', 'bảo vệ luận văn', 'bảo vệ luận án', 'lịch bảo vệ',
  'hướng dẫn luận văn', 'đề cương luận văn',
  
  // G. Giảng viên - Nghiên cứu
  'giảng viên', 'giảng viên hướng dẫn', 'gvhd',
  'nhóm nghiên cứu', 'hướng nghiên cứu', 'lĩnh vực nghiên cứu',
  'công bố khoa học', 'bài báo', 'nghiên cứu khoa học', 'nckh',
  'đề tài nghiên cứu', 'dự án nghiên cứu',
  
  // H. Website SDH.UIT
  'sdh', 'sau đại học', 'sdh.uit', 'website sdh',
  'thông báo đào tạo', 'tuyển sinh sdh',
  'hội thảo', 'seminar', 'workshop', 'uit'
]

// Patterns that indicate casual chat (NOT document-related)
const CHAT_PATTERNS = [
  // Greetings
  /^(hi|hello|hey|chào|xin chào|alo|chào bạn|hello bạn)[\s!.]*$/i,
  // Thanks
  /^(thanks|thank you|cảm ơn|cám ơn|cảm ơn bạn|thanks bạn)[\s!.]*$/i,
  // Goodbyes
  /^(bye|goodbye|tạm biệt|hẹn gặp lại|bye bye)[\s!.]*$/i,
  // Simple responses
  /^(ok|okay|được|vâng|dạ|ừ|uhm|ồ|à|ờ|oke|okie|rồi|xong)[\s!.]*$/i,
  // Questions about the bot
  /^(bạn là ai|bạn là gì|you are|who are you|tên (của )?bạn|your name|giới thiệu bạn)/i,
  // How are you
  /^(how are you|bạn (có )?khỏe không|thế nào rồi|bạn ổn không)/i,
  // Weather/time (general chat)
  /thời tiết hôm nay|weather today|mấy giờ rồi|what time is it/i,
  // Jokes
  /kể (cho tôi )?(một )?chuyện cười|tell (me )?a joke|kể truyện cười/i,
  // Emotional expressions
  /^(haha|hihi|lol|wow|ôi|trời ơi|😀|😂|🤣|👍)[\s!.]*$/i,
  // Random topics not related to education
  /nấu ăn|cooking|recipe|công thức nấu|phim hay|movie|bài hát|music|game|trò chơi/i
]

// System prompt for the agent (when responding)
export const AGENT_SYSTEM_PROMPT = `Bạn là trợ lý ảo thông minh của Trường Đại học Công nghệ Thông tin (UIT) - Đại học Quốc gia TP.HCM.

NHIỆM VỤ:
1. Hỗ trợ giải đáp các thắc mắc về:
   - Tuyển sinh (đại học, thạc sĩ, tiến sĩ)
   - Đào tạo, học vụ
   - Học phí, học bổng
   - Chương trình đào tạo
   - Thông tin sinh viên, học viên, nghiên cứu sinh
   - Khóa luận, luận văn, luận án
   - Giảng viên, nghiên cứu khoa học

2. Trả lời rõ ràng, chính xác, thân thiện.

3. Nếu không tìm thấy thông tin trong cơ sở dữ liệu, hãy thông báo rõ ràng.`

/**
 * Classify query using LLM (async version)
 * This calls OpenAI to get accurate classification
 */
export async function classifyQueryWithLLM(
  query: string,
  conversationHistory: Message[] = []
): Promise<QueryType> {
  try {
    // Build context from conversation history
    let context = ''
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4)
      context = '\n\nLịch sử hội thoại gần đây:\n'
      for (const msg of recentHistory) {
        const role = msg.role === 'user' ? 'Người dùng' : 'Trợ lý'
        context += `${role}: ${msg.content}\n`
      }
    }

    const prompt = CLASSIFICATION_PROMPT + context + `\n\nCâu hỏi cần phân loại: "${query}"\n\nPhân loại:`

    // Get API key
    const apiKey = localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY
    
    if (!apiKey) {
      // Fallback to keyword-based classification
      console.info('No OpenAI API key, falling back to keyword classification')
      return classifyQuery(query, conversationHistory)
    }

    const baseUrl = import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Bạn là agent phân loại câu hỏi. Chỉ trả lời "RETRIEVAL" hoặc "CHAT".' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_completion_tokens: 10
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const result = data.choices[0]?.message?.content?.trim().toUpperCase()

    if (result?.includes('RETRIEVAL')) {
      return 'retrieval'
    } else if (result?.includes('CHAT')) {
      return 'chat'
    }

    // Fallback to keyword classification if unclear
    return classifyQuery(query, conversationHistory)
  } catch (error) {
    console.warn('LLM classification failed, falling back to keyword:', error)
    return classifyQuery(query, conversationHistory)
  }
}

/**
 * Classify query using keywords (sync version, fast fallback)
 * Based on UIT Graduate School content categories
 */
export function classifyQuery(
  query: string, 
  conversationHistory: Message[] = []
): QueryType {
  const lowerQuery = query.toLowerCase().trim()
  
  // ========================================
  // Step 1: Check if it's a casual chat pattern FIRST
  // ========================================
  for (const pattern of CHAT_PATTERNS) {
    if (pattern.test(lowerQuery)) {
      return 'chat'
    }
  }
  
  // Very short messages without question mark are likely casual
  if (lowerQuery.length < 5 && !lowerQuery.includes('?')) {
    return 'chat'
  }
  
  // ========================================
  // Step 2: Check if contains UIT/SDH document-related keywords
  // ========================================
  for (const keyword of DOCUMENT_KEYWORDS) {
    if (lowerQuery.includes(keyword.toLowerCase())) {
      return 'retrieval'
    }
  }
  
  // ========================================
  // Step 3: Check conversation context
  // If previous messages were about documents, this might be a follow-up
  // ========================================
  if (conversationHistory.length > 0) {
    const lastFewMessages = conversationHistory.slice(-4)
    for (const msg of lastFewMessages) {
      const content = msg.content.toLowerCase()
      for (const keyword of DOCUMENT_KEYWORDS) {
        if (content.includes(keyword.toLowerCase())) {
          // Context suggests document discussion, likely a follow-up question
          if (lowerQuery.includes('?') || 
              lowerQuery.startsWith('còn') ||
              lowerQuery.startsWith('thế') ||
              lowerQuery.startsWith('vậy') ||
              lowerQuery.startsWith('và') ||
              lowerQuery.startsWith('ngoài ra') ||
              lowerQuery.startsWith('thêm')) {
            return 'retrieval'
          }
        }
      }
    }
  }
  
  // ========================================
  // Step 4: Default behavior
  // - Questions (with ?) that are reasonably long -> might be about documents
  // - Otherwise -> chat
  // ========================================
  if (lowerQuery.includes('?') && lowerQuery.length > 15) {
    return 'retrieval'
  }
  
  // Default to chat for anything else
  return 'chat'
}

/**
 * Generate a simple chat response for non-document queries
 * This creates a prompt for the LLM to respond directly without RAG
 */
export function generateChatPrompt(
  query: string,
  conversationHistory: Message[] = []
): string {
  let prompt = AGENT_SYSTEM_PROMPT + '\n\n'
  
  // Add conversation history
  if (conversationHistory.length > 0) {
    prompt += 'Lịch sử cuộc trò chuyện:\n'
    for (const msg of conversationHistory.slice(-10)) { // Last 10 messages
      const role = msg.role === 'user' ? 'Người dùng' : 'Trợ lý'
      prompt += `${role}: ${msg.content}\n`
    }
    prompt += '\n'
  }
  
  prompt += `Người dùng: ${query}\n\nTrợ lý:`
  
  return prompt
}

/**
 * Build conversation history in the format expected by the API
 */
export function buildConversationHistory(
  messages: Message[],
  maxTurns: number = 10
): Message[] {
  // Get last N messages (user + assistant pairs)
  const history: Message[] = []
  const recentMessages = messages.slice(-maxTurns * 2)
  
  for (const msg of recentMessages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      history.push({
        role: msg.role,
        content: msg.content
      })
    }
  }
  
  return history
}
