// ============================================================
// ai-student.ts — Luồng Gemini dùng cho AI học sinh (Student-facing)
// ============================================================
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
// Auth: API key qua query param ?key=VITE_GEMINI_API_KEY
// Payload: { contents: [{ parts: [{ text: prompt }] }] }
// Parse: data.candidates[0].content.parts[0].text
//
// File giữ nguyên interface & export để tương thích ngược với Frontend.
// ============================================================

import { db } from '../firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
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
  accuracy: number
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
  relatedToOriginal: string
}

export interface PracticeSession {
  id?: string
  student_id: string
  subject_id: string
  subject_name: string
  topic: string
  questions: PracticeQuestion[]
  student_answers: Record<string, string>
  score: number
  total: number
  ai_feedback: string
  status: 'pending' | 'completed'
  created_at: any
  completed_at?: any
}

// ============================================================
// CORE: Thu thập câu sai của học sinh (không gọi AI — giữ nguyên)
// ============================================================

export async function getStudentWrongAnswers(studentId: string): Promise<WrongAnswer[]> {
  const wrongAnswers: WrongAnswer[] = []

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

    const examDoc = await getDoc(doc(db, 'exams', examId))
    if (!examDoc.exists()) continue
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

    const responsesSnap = await getDocs(
      query(
        collection(db, 'exam_responses'),
        where('attempt_id', '==', attemptDoc.id),
        where('is_correct', '==', false)
      )
    )

    for (const respDoc of responsesSnap.docs) {
      const resp = respDoc.data()
      const qDoc = await getDoc(doc(db, 'questions', resp.question_id))
      if (!qDoc.exists()) continue
      const question = qDoc.data()

      let correctAnswer = ''
      if (question.question_type === 'multiple_choice' && question.answers) {
        const correct = question.answers.find((a: any) => a.is_correct)
        correctAnswer = correct?.content || ''
      } else if (question.question_type === 'short_answer') {
        correctAnswer = question.correct_answer || ''
      }

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
// AI: Phân tích học tập cá nhân hóa (Gemini text)
// ============================================================

export async function analyzeStudentLearning(
  studentId: string,
  wrongAnswers: WrongAnswer[],
  allAttempts: any[]
): Promise<LearningAnalysis> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API chưa được cấu hình')

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

  const prompt = `Bạn là trợ lý AI học tập. Phân tích NGẮN GỌN kết quả học tập của học sinh.

DỮ LIỆU:
${subjectSummaries}
Tổng câu sai: ${wrongAnswers.length}, Tổng bài thi: ${allAttempts.length}

Trả về JSON (NGẮN GỌN, XÚC TÍCH - mỗi trường tối đa 1-2 câu):
{
  "overallSummary": "1 câu tóm tắt ngắn gọn tình trạng học tập",
  "strengths": [
    {"subject": "Tên môn", "topics": ["Chủ đề mạnh"], "detail": "1 câu ngắn"}
  ],
  "weaknesses": [
    {"subject": "Tên môn", "topics": ["Chủ đề yếu"], "detail": "1 câu ngắn", "priority": "high|medium|low"}
  ],
  "recommendations": ["Lời khuyên ngắn 1", "Lời khuyên ngắn 2", "Lời khuyên ngắn 3"],
  "encouragement": "1 câu động viên ngắn",
  "studyPlan": ["Bước 1 ngắn gọn", "Bước 2 ngắn gọn", "Bước 3 ngắn gọn"]
}

QUY TẮC BẮT BUỘC:
- Tối đa 3 strengths, 3 weaknesses, 3 recommendations, 3 studyPlan
- Mỗi detail/recommendation/studyPlan CHỈ 1 CÂU NGẮN (dưới 30 từ)
- overallSummary và encouragement CHỈ 1 CÂU
- priority: high = cần ôn ngay, medium = lưu ý, low = theo dõi
- Tiếng Việt, không emoji, không ký tự đặc biệt

Chỉ trả về JSON.`

  try {
    // Gọi Gemini API
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

    await addDoc(collection(db, 'ai_learning_analyses'), {
      student_id: studentId,
      ...analysis,
      created_at: Timestamp.fromDate(new Date()),
    })

    return analysis
  } catch (error) {
    // Xử lý lỗi — log rõ ràng, không crash app
    console.error('[Gemini] Lỗi khi phân tích học tập:', error)
    throw error
  }
}

// ============================================================
// AI: Tạo bài luyện tập từ câu sai (Gemini text)
// ============================================================

export async function generatePracticeFromWrongAnswers(
  studentId: string,
  wrongAnswers: WrongAnswer[],
  subjectFilter?: string
): Promise<PracticeSession | null> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API chưa được cấu hình')
  if (wrongAnswers.length === 0) return null

  const filtered = subjectFilter
    ? wrongAnswers.filter(w => w.subjectId === subjectFilter || w.subjectName === subjectFilter)
    : wrongAnswers

  if (filtered.length === 0) return null

  const sampleWrong = filtered.slice(0, 10)
  const subjectName = sampleWrong[0].subjectName
  const subjectId = sampleWrong[0].subjectId

  const wrongQuestionsText = sampleWrong.map((w, i) =>
    `${i + 1}. Câu hỏi gốc: "${w.questionContent}"\n   Đáp án đúng: "${w.correctAnswer}"\n   Học sinh trả lời: "${w.studentAnswer}"\n   Môn: ${w.subjectName}`
  ).join('\n\n')

  const prompt = `Bạn là giáo viên AI. Học sinh đã làm sai các câu hỏi sau. Nhiệm vụ của bạn là tạo 10 câu hỏi luyện tập MỚI để giúp học sinh ôn lại.

CÂU HỎI HỌC SINH LÀM SAI:
${wrongQuestionsText}

QUY TẮC TẠO CÂU HỎI (RẤT QUAN TRỌNG):
1. Đa số câu hỏi (7-8/10 câu) phải RẤT TƯƠNG TỰ với câu gốc mà học sinh làm sai
2. Còn lại 2-3 câu có thể mở rộng sang kiến thức liên quan gần nhất
3. Tạo đúng 10 câu hỏi trắc nghiệm (4 đáp án, 1 đáp án đúng)
4. Mỗi câu có giải thích ngắn gọn cho đáp án đúng
5. Không dùng emoji

Trả về JSON:
{
  "topic": "Tên chủ đề chung",
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

  try {
    // Gọi Gemini API
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
  } catch (error) {
    // Xử lý lỗi — log rõ ràng, không crash app
    console.error('[Gemini] Lỗi khi tạo bài luyện tập:', error)
    throw error
  }
}

// ============================================================
// Chấm bài luyện tập + nhận xét (không gọi AI — giữ nguyên)
// ============================================================

export async function submitPracticeSession(
  sessionId: string,
  answers: Record<string, string>
): Promise<{ score: number; total: number; feedback: string; passed: boolean }> {
  const sessionDoc = await getDoc(doc(db, 'ai_practice_sessions', sessionId))
  if (!sessionDoc.exists()) throw new Error('Không tìm thấy bài luyện tập')

  const session = sessionDoc.data() as PracticeSession

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

  let feedback = ''
  if (passed) {
    feedback = `Tuyệt vời! Em đã đạt ${score}/${total} câu đúng (${scoreOutOf10}/10 điểm). Em đã nắm vững chủ đề "${session.topic}". Hãy tiếp tục phát huy!`
  } else {
    feedback = `Em đạt ${score}/${total} câu đúng (${scoreOutOf10}/10 điểm) cho chủ đề "${session.topic}". Cần ôn thêm một chút nữa. Hãy thử lại với bộ câu hỏi mới!`
  }

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
// Lấy danh sách bài luyện tập của học sinh (không gọi AI — giữ nguyên)
// ============================================================

export async function getStudentPracticeSessions(studentId: string): Promise<PracticeSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'ai_practice_sessions'),
      where('student_id', '==', studentId)
    )
  )

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as PracticeSession))
    .sort((a, b) => {
      const tA = a.created_at?.toDate?.() || new Date(a.created_at)
      const tB = b.created_at?.toDate?.() || new Date(b.created_at)
      return tB.getTime() - tA.getTime()
    })
    .slice(0, 20)
}

// ============================================================
// Auto-generate sau khi nộp bài thi (gọi ở StudentExamResult)
// ============================================================

export async function autoGeneratePracticeAfterExam(
  studentId: string,
  examId: string
): Promise<PracticeSession | null> {
  try {
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

    const responsesSnap = await getDocs(
      query(
        collection(db, 'exam_responses'),
        where('attempt_id', '==', latestAttempt.id),
        where('is_correct', '==', false)
      )
    )

    if (responsesSnap.empty) return null

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

    return await generatePracticeFromWrongAnswers(studentId, wrongAnswers)
  } catch (error) {
    // Bảo vệ: không crash app nếu tạo bài luyện tập thất bại
    console.error('[Gemini] Lỗi khi tạo bài luyện tập tự động:', error)
    return null
  }
}
