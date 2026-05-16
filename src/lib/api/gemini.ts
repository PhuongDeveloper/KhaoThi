// ============================================================
// gemini.ts — Luồng Gemini dùng cho tạo văn bản/chat (Text Generation)
// ============================================================
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
// Auth: API key qua query param ?key=VITE_GEMINI_API_KEY
// Payload: { contents: [{ parts: [{ text: prompt }] }] }
// Parse: data.candidates[0].content.parts[0].text
//
// File giữ nguyên tên và tất cả interface/export
// để TƯƠNG THÍCH NGƯỢC với Frontend hiện tại (không cần sửa import).
// ============================================================

import { db } from '../firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore'

// --- Gemini API Configuration ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ============================================================
// INTERFACES — Giữ nguyên để tương thích ngược với Frontend
// ============================================================

export interface QuestionGenerationRequest {
  inputText: string
  difficulty?: 'easy' | 'medium' | 'hard'
  numQuestions?: number
  examId: string
}

export interface GeneratedQuestion {
  content: string
  question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
  answers?: Array<{
    content: string
    is_correct: boolean
  }>
  correct_answer?: string
  difficulty: 'easy' | 'medium' | 'hard'
  points: number
}

export interface ExamAnalysisRequest {
  attemptId: string
  examId: string
  studentId: string
  responses: Array<{
    questionId: string
    answerId: string | null
    isCorrect: boolean
    timeSpent: number
  }>
  totalTime: number
  score: number
  violations: any[]
}

export interface ExamAnalysis {
  summary: string
  anomalies: string[]
  recommendations: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

// ============================================================
// GIỚI HẠN API — Kiểm soát số lần gọi mỗi ngày
// ============================================================

const MAX_DAILY_API_CALLS = 100

async function checkApiLimit(teacherId: string): Promise<boolean> {
  if (!teacherId) return true

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const generationsCol = collection(db, 'ai_question_generations')

  try {
    const snapshot = await getDocs(
      query(generationsCol, where('teacher_id', '==', teacherId))
    )

    const totalCalls =
      snapshot.docs.reduce((sum, docSnap) => {
        const data = docSnap.data() as any
        const createdAtRaw = data.created_at
        const createdAt: Date | null =
          createdAtRaw?.toDate?.() instanceof Date
            ? createdAtRaw.toDate()
            : createdAtRaw
              ? new Date(createdAtRaw)
              : null

        if (!createdAt) return sum
        if (createdAt < today || createdAt >= tomorrow) return sum
        return sum + (data.api_calls_count || 0)
      }, 0) || 0

    return totalCalls < MAX_DAILY_API_CALLS
  } catch (error) {
    console.error('[Gemini] Lỗi khi kiểm tra giới hạn API:', error)
    return true
  }
}

async function recordApiCall(teacherId: string, examId: string, calls: number = 1) {
  await addDoc(collection(db, 'ai_question_generations'), {
    teacher_id: teacherId,
    exam_id: examId,
    api_calls_count: calls,
    input_text: '',
    generated_questions: null,
    created_at: Timestamp.fromDate(new Date()),
  })
}

// ============================================================
// HELPER — Gọi Gemini API (dùng chung cho mọi hàm tạo văn bản)
// ============================================================
// Bảo vệ server: try-catch bên trong, log lỗi rõ ràng, không crash app.
// ============================================================

async function callGeminiText(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key chưa được cấu hình (VITE_GEMINI_API_KEY)')
  }

  console.log('[Gemini] Đang gọi API tạo văn bản...')

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[Gemini] API trả về lỗi HTTP ${response.status}:`, errorData)
    throw new Error(`Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!text) {
    console.warn('[Gemini] API trả về content rỗng')
    throw new Error('Gemini API trả về nội dung rỗng')
  }

  console.log('[Gemini] Gọi API thành công.')
  return text
}

// Helper: Gọi Gemini API kèm file inline (base64)
async function callGeminiWithFile(prompt: string, mimeType: string, fileData: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key chưa được cấu hình (VITE_GEMINI_API_KEY)')
  }

  console.log('[Gemini] Đang gọi API với file đính kèm...')

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: fileData } },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[Gemini] API trả về lỗi HTTP ${response.status}:`, errorData)
    throw new Error(`Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!text) {
    throw new Error('Gemini API trả về nội dung rỗng')
  }

  console.log('[Gemini] Gọi API với file thành công.')
  return text
}

// Helper: Parse JSON từ response text của Gemini
function parseJsonFromGemini(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Gemini trả về format không hợp lệ (không tìm thấy JSON)')
  }
  return JSON.parse(jsonMatch[0])
}

// ============================================================
// HELPER — Chuyển file sang base64
// ============================================================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ============================================================
// HELPER — Xác định MIME type từ tên file
// ============================================================

function getMimeType(fileName: string, fileType: string): string {
  const ext = fileName.toLowerCase().split('.').pop()
  if (fileType) return fileType
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc': return 'application/msword'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls': return 'application/vnd.ms-excel'
    case 'txt': return 'text/plain'
    default: return 'application/octet-stream'
  }
}

// ============================================================
// Phân tích file và trích xuất câu hỏi (Gemini — gửi file trực tiếp)
// ============================================================

export async function analyzeFileAndExtractQuestions(
  file: File,
  examId: string,
  teacherId: string
): Promise<GeneratedQuestion[]> {
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  const fileData = await fileToBase64(file)
  const mimeType = getMimeType(file.name, file.type)

  const prompt = `Bạn là một hệ thống AI chuyên phân tích tài liệu giáo dục. Nhiệm vụ của bạn là đọc và phân tích file "${file.name}" và trích xuất tất cả các câu hỏi.

File đã được gửi kèm trong request này.

Yêu cầu:
1. Phân tích và xác định loại câu hỏi cho mỗi câu:
   - "multiple_choice": Câu hỏi trắc nghiệm có 4 phương án (A, B, C, D hoặc 1, 2, 3, 4)
   - "true_false_multi": Câu hỏi đúng/sai có 4 ý (a, b, c, d)
   - "short_answer": Câu hỏi trả lời ngắn yêu cầu đáp án là số (ví dụ: 1234, 12.34, -12.34)

2. Trích xuất đầy đủ thông tin:
   - Nội dung câu hỏi
   - Loại câu hỏi
   - Đáp án (nếu có trong file)
   - Đáp án đúng (nếu có trong file, có thể đánh dấu bằng *, ✓, hoặc ghi rõ "Đáp án: ...")

3. Trả về dưới dạng JSON với format:
{
  "questions": [
    {
      "content": "Nội dung câu hỏi đầy đủ",
      "question_type": "multiple_choice" | "true_false_multi" | "short_answer",
      "answers": [
        {"content": "Đáp án A", "is_correct": true/false},
        {"content": "Đáp án B", "is_correct": true/false},
        {"content": "Đáp án C", "is_correct": true/false},
        {"content": "Đáp án D", "is_correct": true/false}
      ],
      "correct_answer": "1234"
    }
  ]
}

Lưu ý:
- Nếu file có đáp án, hãy đánh dấu is_correct = true cho đáp án đúng
- Nếu file không có đáp án, đặt tất cả is_correct = false (giáo viên sẽ chọn sau)
- Cho câu hỏi short_answer, nếu có đáp án trong file, điền vào correct_answer
- Giữ nguyên format và cấu trúc câu hỏi từ file gốc

Chỉ trả về JSON, không có text thêm.`

  try {
    // Gọi Gemini API — gửi file trực tiếp qua inline_data
    const text = await callGeminiWithFile(prompt, mimeType, fileData)
    const parsed = parseJsonFromGemini(text)

    const questions: GeneratedQuestion[] = (parsed.questions || []).map((q: any) => ({
      ...q,
      difficulty: 'medium' as const,
      points: 1,
    }))

    await recordApiCall(teacherId, examId, 1)
    return questions
  } catch (error) {
    // Xử lý lỗi — log rõ ràng, không crash server
    console.error('[Gemini] Lỗi khi phân tích file:', error)
    throw error
  }
}

// ============================================================
// Tự động tính toán đáp án cho các câu hỏi (Gemini text)
// ============================================================

export async function autoCalculateAnswers(
  questions: Array<{
    content: string
    question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
    answers?: Array<{ content: string; is_correct?: boolean }>
    correct_answer?: string
    image_url?: string
  }>,
  teacherId: string
): Promise<Array<{
  index: number
  question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
  correct_answer_index?: number
  correct_answers?: number[]
  correct_answer?: string
}>> {
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  const questionsText = questions.map((q, idx) => {
    let questionText = `Câu ${idx + 1} (${q.question_type}): ${q.content}\n`
    if (q.question_type === 'multiple_choice' && q.answers) {
      questionText += 'Các đáp án:\n'
      q.answers.forEach((a, aidx) => {
        questionText += `${String.fromCharCode(65 + aidx)}. ${a.content}\n`
      })
    } else if (q.question_type === 'true_false_multi' && q.answers) {
      questionText += 'Các ý:\n'
      q.answers.forEach((a, aidx) => {
        questionText += `${String.fromCharCode(97 + aidx)}. ${a.content}\n`
      })
    } else if (q.question_type === 'short_answer') {
      questionText += `(Câu hỏi trả lời ngắn - cần đáp án số)\n`
    }
    return questionText
  }).join('\n')

  const prompt = `Bạn là một giáo viên chuyên nghiệp. Nhiệm vụ của bạn là phân tích và tính toán đáp án đúng cho các câu hỏi sau:

${questionsText}

Yêu cầu:
1. Phân tích từng câu hỏi và xác định đáp án đúng
2. Cho câu hỏi trắc nghiệm (multiple_choice): chỉ có 1 đáp án đúng, trả về index (0-3)
3. Cho câu hỏi đúng/sai (true_false_multi): có thể có nhiều đáp án đúng, trả về mảng các index (0-3)
4. Cho câu hỏi trả lời ngắn (short_answer): trả về đáp án số (ví dụ: "1234", "12.34", "-12.34")

Trả về dưới dạng JSON với format:
{
  "answers": [
    { "index": 0, "question_type": "multiple_choice", "correct_answer_index": 2 },
    { "index": 1, "question_type": "true_false_multi", "correct_answers": [0, 2] },
    { "index": 2, "question_type": "short_answer", "correct_answer": "1234" }
  ]
}

Lưu ý:
- Phân tích kỹ từng câu hỏi để đưa ra đáp án chính xác nhất
- Nếu không chắc chắn, hãy đưa ra đáp án có khả năng đúng nhất
- Index bắt đầu từ 0

Chỉ trả về JSON, không có text thêm.`

  try {
    const text = await callGeminiText(prompt)
    const parsed = parseJsonFromGemini(text)
    const answers = parsed.answers || []

    const tempExamId = '00000000-0000-0000-0000-000000000000'
    await recordApiCall(teacherId, tempExamId, 1)
    return answers
  } catch (error) {
    console.error('[Gemini] Lỗi khi tính toán đáp án:', error)
    throw error
  }
}

// ============================================================
// Tạo câu hỏi từ nội dung text (Gemini text)
// ============================================================

export async function generateQuestions(
  request: QuestionGenerationRequest
): Promise<GeneratedQuestion[]> {
  const examDoc = await getDoc(doc(db, 'exams', request.examId))
  if (!examDoc.exists()) throw new Error('Exam not found')
  const exam = examDoc.data()

  const canCall = await checkApiLimit(exam.teacher_id)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  const prompt = `Bạn là một giáo viên chuyên nghiệp. Hãy tạo ${request.numQuestions || 5} câu hỏi trắc nghiệm từ nội dung sau:

${request.inputText}

Yêu cầu:
- Mức độ khó: ${request.difficulty || 'medium'}
- Mỗi câu hỏi có 4 đáp án, chỉ 1 đáp án đúng
- Trả về dưới dạng JSON với format:
{
  "questions": [
    {
      "content": "Nội dung câu hỏi",
      "question_type": "multiple_choice",
      "answers": [
        {"content": "Đáp án 1", "is_correct": true},
        {"content": "Đáp án 2", "is_correct": false},
        {"content": "Đáp án 3", "is_correct": false},
        {"content": "Đáp án 4", "is_correct": false}
      ],
      "difficulty": "${request.difficulty || 'medium'}",
      "points": 1
    }
  ]
}

Chỉ trả về JSON, không có text thêm.`

  try {
    const text = await callGeminiText(prompt)
    const parsed = parseJsonFromGemini(text)
    const questions: GeneratedQuestion[] = parsed.questions || []

    await recordApiCall(exam.teacher_id, request.examId, 1)
    return questions
  } catch (error) {
    console.error('[Gemini] Lỗi khi tạo câu hỏi:', error)
    throw error
  }
}

// ============================================================
// Phân tích kết quả bài thi (Gemini text)
// ============================================================

export async function analyzeExamResults(
  request: ExamAnalysisRequest
): Promise<ExamAnalysis> {
  const examDoc = await getDoc(doc(db, 'exams', request.examId))
  if (!examDoc.exists()) throw new Error('Exam not found')
  const exam = examDoc.data()

  const prompt = `Phân tích kết quả bài thi với thông tin sau:

Bài thi: ${exam.title}
Thời gian làm bài: ${request.totalTime} giây (${Math.floor(request.totalTime / 60)} phút)
Thời gian cho phép: ${exam.duration_minutes} phút
Điểm số: ${request.score}/${exam.total_questions * 10} (${Math.round((request.score / (exam.total_questions * 10)) * 100)}%)
Số câu đúng: ${request.responses.filter(r => r.isCorrect).length}/${exam.total_questions}
Số lần vi phạm: ${request.violations.length}

Chi tiết vi phạm:
${request.violations.map((v, i) => `${i + 1}. ${v.type}: ${v.description}`).join('\n')}

Hãy phân tích và trả về JSON với format:
{
  "summary": "Tóm tắt ngắn gọn về kết quả thi",
  "anomalies": ["Dấu hiệu bất thường 1", "Dấu hiệu bất thường 2"],
  "recommendations": ["Khuyến nghị 1", "Khuyến nghị 2"],
  "riskLevel": "low|medium|high"
}

Chỉ trả về JSON, không có text thêm.`

  try {
    const text = await callGeminiText(prompt)
    const analysis: ExamAnalysis = parseJsonFromGemini(text)

    const attemptRef = doc(db, 'exam_attempts', request.attemptId)
    await updateDoc(attemptRef, { ai_analysis: analysis })
    return analysis
  } catch (error) {
    console.error('[Gemini] Lỗi khi phân tích kết quả thi:', error)
    throw error
  }
}

// ============================================================
// Trích xuất họ và tên học sinh từ raw text của Excel (Gemini text)
// ============================================================

export async function extractStudentNamesFromText(
  text: string,
  teacherId: string = 'admin'
): Promise<string[]> {
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  const prompt = `Bạn là một trợ lý AI phân tích dữ liệu chuyên nghiệp. Nhiệm vụ của bạn là lấy ra danh sách các mảng "Họ và Tên" của học sinh có trong văn bản thô (thường là từ file Excel/CSV do người dùng đưa vào).
Hãy loại bỏ các tiêu đề thừa (SỐ THỨ TỰ, GIỚI TÍNH, SĐT, STT, NĂM SINH...).
Chỉ cần lấy đúng tên người. Bạn cần phải đảm bảo không bỏ sót tên nào thực sự là tên người.
Không lấy các cụm từ không phải là tên riêng.

Văn bản thô cần phân tích:
${text}

Yêu cầu:
Trả về duy nhất 1 JSON Array chứa danh sách các họ tên dưới dạng String.
Format JSON bắt buộc như sau:
{
  "names": [
    "Nguyễn Văn A",
    "Trần Thị B",
    "Lê Hoàng C"
  ]
}

Chỉ trả về JSON, tuyệt đối không có text nào thêm ở xung quanh.`

  try {
    const text2 = await callGeminiText(prompt)
    const parsed = parseJsonFromGemini(text2)

    await recordApiCall(teacherId, 'bulk_create_users', 1)
    return parsed.names || []
  } catch (error) {
    console.error('[Gemini] Lỗi khi trích xuất tên học sinh:', error)
    throw error
  }
}

// ============================================================
// Chỉnh sửa câu hỏi bằng AI (tạo câu tương tự, giữ cấu trúc)
// ============================================================

export async function aiEditQuestion(
  question: {
    content: string
    question_type: string
    answers?: Array<{ content: string; is_correct: boolean }>
    correct_answer?: string
  },
  teacherId: string
): Promise<{
  content: string
  question_type: string
  answers?: Array<{ content: string; is_correct: boolean }>
  correct_answer?: string
}> {
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  let questionText = `Loại: ${question.question_type}\nNội dung: ${question.content}\n`
  if (question.question_type === 'multiple_choice' && question.answers) {
    questionText += 'Đáp án:\n'
    question.answers.forEach((a, i) => {
      questionText += `${String.fromCharCode(65 + i)}. ${a.content} ${a.is_correct ? '(Đúng)' : ''}\n`
    })
  } else if (question.question_type === 'true_false_multi' && question.answers) {
    questionText += 'Các ý:\n'
    question.answers.forEach((a, i) => {
      questionText += `${String.fromCharCode(97 + i)}. ${a.content} → ${a.is_correct ? 'Đúng' : 'Sai'}\n`
    })
  } else if (question.question_type === 'short_answer') {
    questionText += `Đáp án đúng: ${question.correct_answer || 'chưa có'}\n`
  }

  const prompt = `Bạn là giáo viên AI. Đọc câu hỏi sau và tạo 1 CÂU HỎI MỚI tương tự:

${questionText}

YÊU CẦU:
1. Tạo câu hỏi TƯƠNG TỰ về chủ đề và kiến thức
2. Độ khó TƯƠNG ĐƯƠNG hoặc CAO HƠN một chút
3. KHÔNG thay đổi cấu trúc (giữ nguyên loại câu hỏi, số đáp án)
4. Nội dung phải KHÁC câu gốc (không copy)
5. Đáp án đúng phải chính xác

Trả về JSON:
{
  "content": "Nội dung câu hỏi mới",
  "question_type": "${question.question_type}",
  ${question.question_type === 'short_answer'
    ? '"correct_answer": "đáp án đúng"'
    : '"answers": [{"content": "Đáp án", "is_correct": true/false}, ...]'}
}

Chỉ trả về JSON.`

  try {
    const text = await callGeminiText(prompt)
    const parsed = parseJsonFromGemini(text)

    await recordApiCall(teacherId, 'ai_edit_question', 1)

    return {
      content: parsed.content,
      question_type: parsed.question_type || question.question_type,
      answers: parsed.answers,
      correct_answer: parsed.correct_answer,
    }
  } catch (error) {
    console.error('[Gemini] Lỗi khi chỉnh sửa câu hỏi bằng AI:', error)
    throw error
  }
}
