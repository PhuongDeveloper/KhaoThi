// ============================================================
// DeepSeek API Helper — Thay thế Gemini cho tạo văn bản (Text/Chat)
// ============================================================
// Luồng cũ (Gemini): gọi generativelanguage.googleapis.com, parse candidates[0].content.parts[0].text
// Luồng mới (DeepSeek): gọi máy chủ AI tự host chuẩn OpenAI Compatible, parse choices[0].message.content
// ============================================================
//add deepseek
// --- CẤU HÌNH CỨNG cho máy chủ AI tự host (OpenAI Compatible) ---
const DEEPSEEK_API_URL = 'http://36.50.135.174:20128/v1/chat/completions'
const DEEPSEEK_API_KEY = 'sk-1b3e1db5a7217c40-rdqzqx-8cdc26e7'
const DEEPSEEK_MODEL = 'my-deepseek'

/**
 * Gọi API DeepSeek (chuẩn OpenAI Compatible) để tạo văn bản.
 * Bao gồm try-catch + timeout bảo vệ chương trình, log lỗi rõ ràng.
 *
 * @param prompt - Nội dung câu hỏi / prompt gửi cho AI
 * @param timeoutMs - Thời gian timeout tính bằng ms (mặc định 120 giây)
 * @returns Chuỗi text trả về từ AI
 */
export async function callDeepSeekAPI(prompt: string, timeoutMs: number = 120_000): Promise<string> {
  try {
    // Tạo AbortController để xử lý timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    console.log('[DeepSeek] Đang gọi API....')

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(không đọc được body)')
      console.error(`[DeepSeek] API trả về lỗi HTTP ${response.status}: ${errorBody}`)
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`)
    }

    // Parse theo chuẩn OpenAI: response.choices[0].message.content
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''

    if (!content) {
      console.warn('[DeepSeek] API trả về content rỗng:', JSON.stringify(data).substring(0, 500))
      throw new Error('DeepSeek API trả về nội dung rỗng')
    }

    console.log('[DeepSeek] Gọi API thành công.')
    return content
  } catch (error: any) {
    // Phân loại lỗi để log rõ ràng
    if (error.name === 'AbortError') {
      console.error(`[DeepSeek] Timeout sau ${timeoutMs / 1000}s khi gọi API.`)
      throw new Error(`DeepSeek API timeout sau ${timeoutMs / 1000} giây`)
    }
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      console.error('[DeepSeek] Lỗi mạng — không thể kết nối tới máy chủ AI:', error.message)
      throw new Error('Không thể kết nối tới máy chủ AI. Vui lòng kiểm tra mạng.')
    }
    // Lỗi khác — log và ném lại
    console.error('[DeepSeek] Lỗi không xác định:', error)
    throw error
  }
}

/**
 * Trích xuất JSON từ chuỗi text trả về bởi AI.
 * Hỗ trợ cả trường hợp AI trả về JSON thuần hoặc bọc trong markdown code block.
 */
export function extractJSON(text: string): any {
  // Thử parse trực tiếp trước
  try {
    return JSON.parse(text.trim())
  } catch {
    // Tìm JSON object trong text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Không tìm thấy JSON hợp lệ trong phản hồi của AI')
    }
    return JSON.parse(jsonMatch[0])
  }
}
