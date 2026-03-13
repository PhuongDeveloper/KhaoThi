import { db } from '../firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ============================================================
// TYPES
// ============================================================

export interface WrongAnswer {
  questionId: string
  questionContent: string
  questionType: string
  subjectName: string
  subjectId: string
  examTitle: string
  correctAnswer: string
  studentAnswer: string
}

export interface TopicWeakness {
  topic: string
  subjectName: string
  subjectId: string
  wrongCount: number
  totalCount: number
  accuracy: number // 0-100
  sampleQuestions: string[]
}

export interface LearningAnalysis {
  overallSummary: string
  strengths: Array<{ subject: string; topics: string[]; detail: string }>
  weaknesses: Array<{ subject: string; topics: string[]; detail: string; priority: 'high' | 'medium' | 'low' }>
  recommendations: string[]
  encouragement: string
  studyPlan: string[]
}

export interface PracticeQuestion {
  id: string
  content: string
  question_type: 'multiple_choice'
  answers: Array<{ id: string; content: string; is_correct: boolean }>
  topic: string
  relatedToOriginal: string // Nội dung câu gốc mà học sinh làm sai
}

export interface PracticeSession {
  id?: string
  student_id: string
  subject_id: string
  subject_name: string
  topic: string
  questions: PracticeQuestion[]
  student_answers: Record<string, string> // questionId -> answerId
  score: number
  total: number
  ai_feedback: string
  status: 'pending' | 'completed'
  created_at: any
  completed_at?: any
}

// ============================================================
// CORE: Thu thập câu sai của học sinh
// ============================================================

export async function getStudentWrongAnswers(studentId: string): Promise<WrongAnswer[]> {
  const wrongAnswers: WrongAnswer[] = []

  // 1. Lấy tất cả attempts đã nộp của học sinh
  const attemptsSnap = await getDocs(
    query(
      collection(db, 'exam_attempts'),
      where('student_id', '==', studentId),
      where('status', 'in', ['submitted', 'timeout'])
    )
  )

  for (const attemptDoc of attemptsSnap.docs) {
    const attempt = attemptDoc.data()
    const examId = attempt.exam_id

    // 2. Lấy thông tin exam
    const examDoc = await getDoc(doc(db, 'exams', examId))
    if (!examDoc.exists()) continue
    const exam = examDoc.data()

    // 3. Lấy subject
    let subjectName = 'Chưa xác định'
    let subjectId = ''
    if (exam.subject_id) {
      const subjectDoc = await getDoc(doc(db, 'subjects', exam.subject_id))
      if (subjectDoc.exists()) {
        subjectName = subjectDoc.data().name
        subjectId = exam.subject_id
      }
    }

    // 4. Lấy responses sai
    const responsesSnap = await getDocs(
      query(
        collection(db, 'exam_responses'),
        where('attempt_id', '==', attemptDoc.id),
        where('is_correct', '==', false)
      )
    )

    for (const respDoc of responsesSnap.docs) {
      const resp = respDoc.data()

      // 5. Lấy question content
      const qDoc = await getDoc(doc(db, 'questions', resp.question_id))
      if (!qDoc.exists()) continue
      const question = qDoc.data()

      // Tìm đáp án đúng
      let correctAnswer = ''
      if (question.question_type === 'multiple_choice' && question.answers) {
        const correct = question.answers.find((a: any) => a.is_correct)
        correctAnswer = correct?.content || ''
      } else if (question.question_type === 'short_answer') {
        correctAnswer = question.correct_answer || ''
      }

      // Tìm đáp án học sinh chọn
      let studentAnswer = resp.text_answer || ''
      if (resp.answer_id && question.answers) {
        const selected = question.answers.find((a: any) => a.id === resp.answer_id)
        studentAnswer = selected?.content || resp.answer_id
      }

      wrongAnswers.push({
        questionId: resp.question_id,
        questionContent: question.content,
        questionType: question.question_type,
        subjectName,
        subjectId,
        examTitle: exam.title,
        correctAnswer,
        studentAnswer,
      })
    }
  }

  return wrongAnswers
}

// ============================================================
// AI: Phân tích học tập cá nhân hóa
// ============================================================

export async function analyzeStudentLearning(
  studentId: string,
  wrongAnswers: WrongAnswer[],
  allAttempts: any[]
): Promise<LearningAnalysis> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API chưa được cấu hình')

  // Tổng hợp dữ liệu theo môn
  const subjectMap: Record<string, { wrong: WrongAnswer[]; attempts: any[] }> = {}
  for (const wa of wrongAnswers) {
    if (!subjectMap[wa.subjectName]) subjectMap[wa.subjectName] = { wrong: [], attempts: [] }
    subjectMap[wa.subjectName].wrong.push(wa)
  }
  for (const a of allAttempts) {
    const subName = a.exam?.subject?.name || a.exam?.subjectName || 'Khác'
    if (!subjectMap[subName]) subjectMap[subName] = { wrong: [], attempts: [] }
    subjectMap[subName].attempts.push(a)
  }

  const subjectSummaries = Object.entries(subjectMap).map(([name, data]) => {
    const avgScore = data.attempts.length > 0
      ? data.attempts.reduce((s, a) => s + (parseFloat(a.score) || 0), 0) / data.attempts.length
      : 0
    const wrongTopics = data.wrong.map(w => w.questionContent.substring(0, 80)).slice(0, 10)
    return `Môn ${name}: ${data.attempts.length} bài thi, điểm TB ${avgScore.toFixed(1)}, ${data.wrong.length} câu sai.\nCâu sai tiêu biểu:\n${wrongTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
  }).join('\n\n')

  const prompt = `Bạn là một trợ lý AI học tập cá nhân hóa cho học sinh cấp 2-3 tại Việt Nam. Hãy phân tích kết quả học tập và đưa ra đánh giá chi tiết.

DLIỆU HỌC SINH:
${subjectSummaries}

Tổng số câu sai: ${wrongAnswers.length}
Tổng số bài thi: ${allAttempts.length}

YÊU CẦU: Phân tích kỹ lưỡng và trả về JSON:
{
  "overallSummary": "Tóm tắt 2-3 câu về tình trạng học tập tổng thể",
  "strengths": [
    {"subject": "Tên môn", "topics": ["Chủ đề mạnh 1", "Chủ đề mạnh 2"], "detail": "Giải thích chi tiết"}
  ],
  "weaknesses": [
    {"subject": "Tên môn", "topics": ["Chủ đề yếu 1"], "detail": "Giải thích chi tiết, ví dụ: yếu phần giảm phân, phương trình bậc 2...", "priority": "high|medium|low"}
  ],
  "recommendations": ["Lời khuyên cụ thể 1", "Lời khuyên cụ thể 2", ...],
  "encouragement": "Lời động viên tích cực",
  "studyPlan": ["Bước 1: ...", "Bước 2: ...", ...]
}

LƯU Ý:
- Phân tích theo TỪNG CHỦ ĐỀ cụ thể trong mỗi môn (ví dụ: Sinh học - Giảm phân, Toán - Phương trình bậc 2)
- Đánh giá priority cho điểm yếu: high = rất yếu cần ôn ngay, medium = trung bình, low = chỉ cần chú ý
- Lời khuyên phải cụ thể, khả thi cho học sinh
- Viết bằng tiếng Việt, giọng thân thiện, không có các kí tự làm xấu text và emoji

Chỉ trả về JSON.`

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  })

  if (!response.ok) throw new Error(`Gemini API lỗi: ${response.statusText}`)

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI trả về format không hợp lệ')

  const analysis: LearningAnalysis = JSON.parse(jsonMatch[0])

  // Lưu vào Firestore
  await addDoc(collection(db, 'ai_learning_analyses'), {
    student_id: studentId,
    ...analysis,
    created_at: Timestamp.fromDate(new Date()),
  })

  return analysis
}

// ============================================================
// AI: Tạo bài luyện tập từ câu sai (gọi ngay sau nộp bài)
// ============================================================

export async function generatePracticeFromWrongAnswers(
  studentId: string,
  wrongAnswers: WrongAnswer[],
  subjectFilter?: string
): Promise<PracticeSession | null> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API chưa được cấu hình')
  if (wrongAnswers.length === 0) return null

  // Lọc theo môn nếu có
  const filtered = subjectFilter
    ? wrongAnswers.filter(w => w.subjectId === subjectFilter || w.subjectName === subjectFilter)
    : wrongAnswers

  if (filtered.length === 0) return null

  // Lấy tối đa 5 câu sai để làm cơ sở
  const sampleWrong = filtered.slice(0, 5)
  const subjectName = sampleWrong[0].subjectName
  const subjectId = sampleWrong[0].subjectId

  const wrongQuestionsText = sampleWrong.map((w, i) =>
    `${i + 1}. Câu hỏi gốc: "${w.questionContent}"\n   Đáp án đúng: "${w.correctAnswer}"\n   Học sinh trả lời: "${w.studentAnswer}"\n   Môn: ${w.subjectName}`
  ).join('\n\n')

  const prompt = `Bạn là giáo viên AI. Học sinh đã làm sai các câu hỏi sau. Hãy phân tích chủ đề của từng câu sai, sau đó tạo 5 câu hỏi luyện tập MỚI có liên quan đến các chủ đề đó để giúp học sinh ôn lại.

CÂU HỎI HỌC SINH LÀM SAI:
${wrongQuestionsText}

YÊU CẦU:
1. Xác định chủ đề chính từ các câu sai
2. Tạo 5 câu hỏi trắc nghiệm (4 đáp án, 1 đáp án đúng) liên quan đến các chủ đề đó
3. Câu hỏi phải ở mức độ tương tự hoặc DỄ HƠN một chút để học sinh có thể hiểu và làm được
4. Mỗi câu có giải thích ngắn gọn cho đáp án đúng

Trả về JSON:
{
  "topic": "Tên chủ đề chung (ví dụ: Giảm phân và nguyên phân)",
  "questions": [
    {
      "content": "Nội dung câu hỏi",
      "answers": [
        {"content": "Đáp án A", "is_correct": false},
        {"content": "Đáp án B", "is_correct": true},
        {"content": "Đáp án C", "is_correct": false},
        {"content": "Đáp án D", "is_correct": false}
      ],
      "explanation": "Giải thích đáp án đúng",
      "relatedToOriginal": "Nội dung câu gốc liên quan"
    }
  ]
}

Chỉ trả về JSON, tiếng Việt.`

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  })

  if (!response.ok) throw new Error(`Gemini API lỗi: ${response.statusText}`)

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI trả về format không hợp lệ')

  const parsed = JSON.parse(jsonMatch[0])

  // Format questions với IDs
  const questions: PracticeQuestion[] = (parsed.questions || []).map((q: any, idx: number) => ({
    id: `pq_${Date.now()}_${idx}`,
    content: q.content,
    question_type: 'multiple_choice' as const,
    answers: (q.answers || []).map((a: any, aidx: number) => ({
      id: `pa_${Date.now()}_${idx}_${aidx}`,
      content: a.content,
      is_correct: a.is_correct,
    })),
    topic: parsed.topic || '',
    explanation: q.explanation || '',
    relatedToOriginal: q.relatedToOriginal || '',
  }))

  // Lưu session vào Firestore
  const session: Omit<PracticeSession, 'id'> = {
    student_id: studentId,
    subject_id: subjectId,
    subject_name: subjectName,
    topic: parsed.topic || 'Luyện tập tổng hợp',
    questions,
    student_answers: {},
    score: 0,
    total: questions.length,
    ai_feedback: '',
    status: 'pending',
    created_at: Timestamp.fromDate(new Date()),
  }

  const docRef = await addDoc(collection(db, 'ai_practice_sessions'), session)

  return { ...session, id: docRef.id }
}

// ============================================================
// Chấm bài luyện tập + nhận xét AI
// ============================================================

export async function submitPracticeSession(
  sessionId: string,
  answers: Record<string, string>
): Promise<{ score: number; total: number; feedback: string; passed: boolean }> {
  const sessionDoc = await getDoc(doc(db, 'ai_practice_sessions', sessionId))
  if (!sessionDoc.exists()) throw new Error('Không tìm thấy bài luyện tập')

  const session = sessionDoc.data() as PracticeSession

  // Chấm điểm
  let correctCount = 0
  const results: Array<{ question: string; correct: boolean; explanation: string }> = []

  for (const q of session.questions) {
    const studentAnswerId = answers[q.id]
    const correctAnswer = q.answers.find(a => a.is_correct)
    const isCorrect = studentAnswerId === correctAnswer?.id

    if (isCorrect) correctCount++

    results.push({
      question: q.content.substring(0, 60),
      correct: isCorrect,
      explanation: (q as any).explanation || '',
    })
  }

  const score = correctCount
  const total = session.questions.length
  const scoreOutOf10 = Math.round((score / total) * 10 * 100) / 100
  const passed = scoreOutOf10 >= 8

  // Tạo nhận xét AI
  let feedback = ''
  if (passed) {
    feedback = `🎉 Tuyệt vời! Em đã đạt ${score}/${total} câu đúng (${scoreOutOf10}/10 điểm). Em đã nắm vững chủ đề "${session.topic}" rồi! Hãy tiếp tục phát huy nhé!`
  } else {
    feedback = `📚 Em đạt ${score}/${total} câu đúng (${scoreOutOf10}/10 điểm) cho chủ đề "${session.topic}". Cần ôn thêm một chút nữa. Hãy xem lại các câu sai và thử lại nhé!`
  }

  // Cập nhật Firestore
  const { updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(db, 'ai_practice_sessions', sessionId), {
    student_answers: answers,
    score: scoreOutOf10,
    total: 10,
    ai_feedback: feedback,
    status: 'completed',
    completed_at: Timestamp.fromDate(new Date()),
  })

  return { score: scoreOutOf10, total: 10, feedback, passed }
}

// ============================================================
// Lấy danh sách bài luyện tập của học sinh
// ============================================================

export async function getStudentPracticeSessions(studentId: string): Promise<PracticeSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'ai_practice_sessions'),
      where('student_id', '==', studentId),
      orderBy('created_at', 'desc'),
      limit(20)
    )
  )

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeSession))
}

// ============================================================
// Auto-generate sau khi nộp bài thi (gọi ở StudentExamResult)
// ============================================================

export async function autoGeneratePracticeAfterExam(
  studentId: string,
  examId: string
): Promise<PracticeSession | null> {
  try {
    // Lấy attempt mới nhất của exam này
    const attemptsSnap = await getDocs(
      query(
        collection(db, 'exam_attempts'),
        where('student_id', '==', studentId),
        where('exam_id', '==', examId),
        where('status', 'in', ['submitted', 'timeout'])
      )
    )

    if (attemptsSnap.empty) return null

    const latestAttempt = attemptsSnap.docs[attemptsSnap.docs.length - 1]

    // Lấy responses sai
    const responsesSnap = await getDocs(
      query(
        collection(db, 'exam_responses'),
        where('attempt_id', '==', latestAttempt.id),
        where('is_correct', '==', false)
      )
    )

    if (responsesSnap.empty) return null // Không có câu sai

    // Lấy exam info
    const examDoc = await getDoc(doc(db, 'exams', examId))
    if (!examDoc.exists()) return null
    const exam = examDoc.data()

    let subjectName = 'Chưa xác định'
    let subjectId = ''
    if (exam.subject_id) {
      const subjectDoc = await getDoc(doc(db, 'subjects', exam.subject_id))
      if (subjectDoc.exists()) {
        subjectName = subjectDoc.data().name
        subjectId = exam.subject_id
      }
    }

    // Build wrong answers
    const wrongAnswers: WrongAnswer[] = []
    for (const respDoc of responsesSnap.docs) {
      const resp = respDoc.data()
      const qDoc = await getDoc(doc(db, 'questions', resp.question_id))
      if (!qDoc.exists()) continue
      const question = qDoc.data()

      let correctAnswer = ''
      if (question.answers) {
        const correct = question.answers.find((a: any) => a.is_correct)
        correctAnswer = correct?.content || ''
      }

      wrongAnswers.push({
        questionId: resp.question_id,
        questionContent: question.content,
        questionType: question.question_type,
        subjectName,
        subjectId,
        examTitle: exam.title,
        correctAnswer,
        studentAnswer: resp.text_answer || '',
      })
    }

    // Tạo bài luyện tập
    return await generatePracticeFromWrongAnswers(studentId, wrongAnswers)
  } catch (error) {
    console.error('[AI] Lỗi khi tạo bài luyện tập tự động:', error)
    return null
  }
}
