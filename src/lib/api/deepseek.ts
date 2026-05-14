// ============================================================
// deepseek.ts — Module gọi API DeepSeek (OpenAI Compatible)
// ============================================================
//
// LUỒNG CŨ (Gemini — ĐÃ LOẠI BỎ):
//   - Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
//   - Auth: API key qua query param ?key=...
//   - Payload: { contents: [{ parts: [{ text: prompt }] }] }
//   - Parse: data.candidates[0].content.parts[0].text
//
// LUỒNG MỚI (DeepSeek — OpenAI Compatible):
//   - Endpoint: http://36.50.135.174:20128/v1/chat/completions
//   - Auth: Bearer token trong header Authorization
//   - Payload: { model: "my-deepseek", messages: [{role:"user", content: prompt}], stream: false }
//   - Parse: data.choices[0].message.content
//   - Bảo vệ: try-catch với AbortController timeout + phân loại lỗi mạng/timeout
//
// ============================================================

// --- CẤU HÌNH CỨNG cho máy chủ AI tự host (OpenAI Compatible) ---
// Production (HTTPS): dùng Vercel Rewrite proxy tại /api/deepseek để tránh lỗi Mixed Content
// Development (HTTP localhost): gọi trực tiếp tới máy chủ AI
const DEEPSEEK_DIRECT_URL = 'http://36.50.135.174:20128/v1/chat/completions'
const DEEPSEEK_PROXY_URL = '/api/deepseek/v1/chat/completions'
const DEEPSEEK_API_URL = window.location.protocol === 'https:' ? DEEPSEEK_PROXY_URL : DEEPSEEK_DIRECT_URL
const DEEPSEEK_API_KEY = 'sk-1b3e1db5a7217c40-rdqzqx-8cdc26e7'
const DEEPSEEK_MODEL = 'my-deepseek'

/**
 * Gọi API DeepSeek (chuẩn OpenAI Compatible) để tạo văn bản.
 *
 * Thay thế hoàn toàn cho lệnh gọi Gemini generateContent cũ.
 * Bao gồm try-catch + AbortController timeout để bảo vệ chương trình,
 * log lỗi rõ ràng ra console, không làm crash server/app.
 *
 * @param prompt  - Nội dung câu hỏi / prompt gửi cho AI
 * @param timeoutMs - Thời gian timeout tính bằng ms (mặc định 120 giây)
 * @returns Chuỗi text trả về từ AI (choices[0].message.content)
 */
export async function callDeepSeekAPI(
  prompt: string,
  timeoutMs: number = 120_000
): Promise<string> {
  // --- BẢO VỆ CHƯƠNG TRÌNH: toàn bộ logic nằm trong try-catch ---
  try {
    // Tạo AbortController để xử lý timeout — tránh request treo vô hạn
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    console.log('[DeepSeek] Đang gọi API.....')

    // --- GỌI API theo chuẩn OpenAI Compatible ---
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

    // Dọn dẹp timeout sau khi nhận response
    clearTimeout(timeoutId)

    // Kiểm tra HTTP status
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(không đọc được body)')
      console.error(`[DeepSeek] API trả về lỗi HTTP ${response.status}: ${errorBody}`)
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`)
    }

    // --- PARSE DỮ LIỆU CHUẨN OpenAI: response.choices[0].message.content ---
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''

    if (!content) {
      console.warn('[DeepSeek] API trả về content rỗng:', JSON.stringify(data).substring(0, 500))
      throw new Error('DeepSeek API trả về nội dung rỗng')
    }

    console.log('[DeepSeek] Gọi API thành công, độ dài response:', content.length)
    return content
  } catch (error: any) {
    // --- PHÂN LOẠI LỖI để log rõ ràng, không crash toàn bộ app ---

    // Lỗi timeout (AbortError từ AbortController)
    if (error.name === 'AbortError') {
      console.error(`[DeepSeek] ⏱ Timeout sau ${timeoutMs / 1000}s khi gọi API.`)
      throw new Error(`DeepSeek API timeout sau ${timeoutMs / 1000} giây`)
    }

    // Lỗi mạng — không kết nối được tới server
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('NetworkError') ||
      error.message?.includes('ERR_CONNECTION_REFUSED') ||
      error.message?.includes('fetch')
    ) {
      console.error('[DeepSeek] 🌐 Lỗi mạng — không thể kết nối tới máy chủ AI:', error.message)
      throw new Error('Không thể kết nối tới máy chủ AI. Vui lòng kiểm tra mạng hoặc thử lại sau.')
    }

    // Lỗi khác — log chi tiết và ném lại
    console.error('[DeepSeek] ❌ Lỗi không xác định:', error)
    throw error
  }
}

/**
 * Trích xuất JSON từ chuỗi text trả về bởi AI.
 *
 * AI đôi khi trả về JSON thuần, đôi khi bọc trong markdown code block (```json ... ```).
 * Hàm này xử lý cả hai trường hợp.
 *
 * @param text - Chuỗi text thô từ AI
 * @returns Object JSON đã parse
 */
export function extractJSON(text: string): any {
  // Bước 1: Thử parse trực tiếp
  try {
    return JSON.parse(text.trim())
  } catch {
    // Bước 2: Tìm JSON object {...} trong text (bỏ qua markdown wrapper)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[DeepSeek] Không tìm thấy JSON trong phản hồi:', text.substring(0, 300))
      throw new Error('Không tìm thấy JSON hợp lệ trong phản hồi của AI')
    }
    return JSON.parse(jsonMatch[0])
  }
}
