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

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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
  correct_answer?: string // Cho short_answer
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

// Giới hạn số lần gọi API mỗi ngày
const MAX_DAILY_API_CALLS = 100

async function checkApiLimit(teacherId: string): Promise<boolean> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const generationsCol = collection(db, 'ai_question_generations')
  const q = query(
    generationsCol,
    where('teacher_id', '==', teacherId),
    where('created_at', '>=', Timestamp.fromDate(today)),
    where('created_at', '<', Timestamp.fromDate(tomorrow))
  )

  try {
    const snapshot = await getDocs(q)
    const totalCalls =
      snapshot.docs.reduce((sum, doc) => {
        const data = doc.data()
        return sum + (data.api_calls_count || 0)
      }, 0) || 0
    return totalCalls < MAX_DAILY_API_CALLS
  } catch (error) {
    return false
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

// Hàm chuyển file sang base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Lấy phần base64 (bỏ qua data:...;base64,)
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Hàm xác định MIME type
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

// Hàm phân tích file và trích xuất câu hỏi - gửi file trực tiếp cho AI
export async function analyzeFileAndExtractQuestions(
  file: File,
  examId: string,
  teacherId: string
): Promise<GeneratedQuestion[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  // Kiểm tra giới hạn API
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  // Chuyển file sang base64
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
      "correct_answer": "1234" // Chỉ cho short_answer
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
    // Gửi file kèm prompt cho Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: fileData,
                },
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    const text = data.candidates[0]?.content?.parts[0]?.text || ''

    // Parse JSON từ response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid response format from Gemini')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const questions: GeneratedQuestion[] = (parsed.questions || []).map((q: any) => ({
      ...q,
      difficulty: 'medium' as const,
      points: 1,
    }))

    // Ghi nhận API call
    await recordApiCall(teacherId, examId, 1)

    return questions
  } catch (error) {
    throw error
  }
}

// Hàm tự động tính toán kết quả cho các câu hỏi
export async function autoCalculateAnswers(
  questions: Array<{
    content: string
    question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
    answers?: Array<{
      content: string
      is_correct?: boolean
    }>
    correct_answer?: string
    image_url?: string
  }>,
  teacherId: string
): Promise<Array<{
  index: number
  question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
  correct_answer_index?: number // Cho multiple_choice
  correct_answers?: number[] // Cho true_false_multi (mảng các index đúng)
  correct_answer?: string // Cho short_answer
}>> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  // Kiểm tra giới hạn API
  const canCall = await checkApiLimit(teacherId)
  if (!canCall) {
    throw new Error('Đã vượt quá giới hạn số lần gọi API trong ngày')
  }

  // Tạo prompt với tất cả câu hỏi
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
    {
      "index": 0,
      "question_type": "multiple_choice",
      "correct_answer_index": 2  // Index của đáp án đúng (0-3)
    },
    {
      "index": 1,
      "question_type": "true_false_multi",
      "correct_answers": [0, 2]  // Mảng các index đúng (0-3)
    },
    {
      "index": 2,
      "question_type": "short_answer",
      "correct_answer": "1234"  // Đáp án số
    }
  ]
}

Lưu ý:
- Phân tích kỹ từng câu hỏi để đưa ra đáp án chính xác nhất
- Nếu không chắc chắn, hãy đưa ra đáp án có khả năng đúng nhất
- Index bắt đầu từ 0

Chỉ trả về JSON, không có text thêm.`

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    const text = data.candidates[0]?.content?.parts[0]?.text || ''

    // Parse JSON từ response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid response format from Gemini')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const answers = parsed.answers || []

    // Ghi nhận API call (không có examId vì đây là tính toán tạm thời)
    // Sử dụng một UUID tạm để ghi nhận
    const tempExamId = '00000000-0000-0000-0000-000000000000'
    await recordApiCall(teacherId, tempExamId, 1)

    return answers
  } catch (error) {
    throw error
  }
}

// Hàm cũ - giữ lại để tương thích (có thể xóa sau)
export async function generateQuestions(
  request: QuestionGenerationRequest
): Promise<GeneratedQuestion[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  // Lấy teacher_id từ exam
  const examDoc = await getDoc(doc(db, 'exams', request.examId))
  if (!examDoc.exists()) {
    throw new Error('Exam not found')
  }

  const exam = examDoc.data()

  // Kiểm tra giới hạn API
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
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const data = await response.json()
    const text = data.candidates[0]?.content?.parts[0]?.text || ''

    // Parse JSON từ response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid response format from Gemini')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const questions: GeneratedQuestion[] = parsed.questions || []

    // Ghi nhận API call
    await recordApiCall(exam.teacher_id, request.examId, 1)

    return questions
  } catch (error) {
    throw error
  }
}

export async function analyzeExamResults(
  request: ExamAnalysisRequest
): Promise<ExamAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  const examDoc = await getDoc(doc(db, 'exams', request.examId))
  if (!examDoc.exists()) {
    throw new Error('Exam not found')
  }

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
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const data = await response.json()
    const text = data.candidates[0]?.content?.parts[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid response format from Gemini')
    }

    const analysis: ExamAnalysis = JSON.parse(jsonMatch[0])

    // Lưu phân tích vào database
    const attemptRef = doc(db, 'exam_attempts', request.attemptId)
    await updateDoc(attemptRef, { ai_analysis: analysis })

    return analysis
  } catch (error) {
    throw error
  }
}

