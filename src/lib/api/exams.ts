import type { Database } from '../supabase'
import { cache, CACHE_KEYS } from '../cache'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

type Exam = Database['public']['Tables']['exams']['Row']
type Question = Database['public']['Tables']['questions']['Row']
type Answer = Database['public']['Tables']['answers']['Row']
type ExamAttempt = Database['public']['Tables']['exam_attempts']['Row']
type ExamResponse = Database['public']['Tables']['exam_responses']['Row']

export interface ExamWithDetails extends Exam {
  subject: Database['public']['Tables']['subjects']['Row'] | null
  teacher: Database['public']['Tables']['profiles']['Row'] | null
  questions_count: number
}

export interface QuestionWithAnswers extends Question {
  answers: Answer[]
}

export interface ExamAttemptWithDetails extends ExamAttempt {
  exam: Exam | null
  student: Database['public']['Tables']['profiles']['Row'] | null
  responses_count: number
}

function normalizeId<T extends { id: string }>(docId: string, data: any): T {
  return { id: (data.id as string) || docId, ...(data as Omit<T, 'id'>) } as T
}

export const examApi = {
  // Exams
  async getExams(filters?: { status?: string; subjectId?: string }) {
    const examsCol = collection(db, 'exams')
    // Tránh composite index: nếu có filter thì bỏ orderBy trong query, sort ở client
    const hasFilters = !!(filters?.status || filters?.subjectId)
    const constraints: any[] = []

    if (filters?.status) constraints.push(where('status', '==', filters.status))
    if (filters?.subjectId) constraints.push(where('subject_id', '==', filters.subjectId))

    const q = hasFilters
      ? query(examsCol, ...constraints)
      : query(examsCol, orderBy('created_at', 'desc'))
    const snapshot = await getDocs(q)
    if (snapshot.empty) return []

    const exams: any[] = []
    snapshot.forEach((docSnap) => exams.push(normalizeId<Exam>(docSnap.id, docSnap.data())))

    // Sort client-side để đảm bảo consistent (mới nhất trước)
    if (hasFilters) {
      exams.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    }

    const subjectIds = [...new Set(exams.map((e) => e.subject_id).filter(Boolean))]
    const teacherIds = [...new Set(exams.map((e) => e.teacher_id).filter(Boolean))]

    const subjectsMap: Record<string, any> = {}
    const profilesMap: Record<string, any> = {}

    if (subjectIds.length > 0) {
      const subjectsSnaps = await Promise.all(subjectIds.map(id => getDoc(doc(db, 'subjects', id))))
      subjectsSnaps.forEach((s) => {
        if (s.exists()) {
          const data = normalizeId<Database['public']['Tables']['subjects']['Row']>(s.id, s.data())
          subjectsMap[data.id] = data
        }
      })
    }

    if (teacherIds.length > 0) {
      const profilesSnaps = await Promise.all(teacherIds.map(id => getDoc(doc(db, 'profiles', id))))
      profilesSnaps.forEach((p) => {
        if (p.exists()) {
          const data = normalizeId<Database['public']['Tables']['profiles']['Row']>(p.id, p.data())
          profilesMap[data.id] = data
        }
      })
    }

    return exams.map((exam: any) => ({
      ...exam,
      subject: subjectsMap[exam.subject_id] || null,
      teacher: profilesMap[exam.teacher_id] || null,
      questions_count: exam.total_questions || 0,
    })) as ExamWithDetails[]
  },

  async getExamById(id: string) {
    const examRef = doc(db, 'exams', id)
    const examSnap = await getDoc(examRef)
    if (!examSnap.exists()) throw new Error('Exam not found')
    const exam = normalizeId<Exam>(examSnap.id, examSnap.data())

    let subject: any = null
    let teacher: any = null

    if (exam.subject_id) {
      const subjectSnap = await getDoc(doc(db, 'subjects', exam.subject_id))
      if (subjectSnap.exists()) {
        subject = normalizeId<Database['public']['Tables']['subjects']['Row']>(subjectSnap.id, subjectSnap.data())
      }
    }

    if (exam.teacher_id) {
      const teacherSnap = await getDoc(doc(db, 'profiles', exam.teacher_id))
      if (teacherSnap.exists()) {
        teacher = normalizeId<Database['public']['Tables']['profiles']['Row']>(teacherSnap.id, teacherSnap.data())
      }
    }

    return {
      ...exam,
      subject,
      teacher,
      questions_count: exam.total_questions || 0,
    } as ExamWithDetails
  },

  async createExam(exam: Database['public']['Tables']['exams']['Insert']) {
    const now = new Date().toISOString()
    const examData = {
      ...exam,
      // Không cho Firestore nhận undefined
      subject_id: exam.subject_id ?? null,
      teacher_id: exam.teacher_id ?? null,
      start_time: (exam.start_time === '' || exam.start_time === null) ? null : exam.start_time,
      end_time: (exam.end_time === '' || exam.end_time === null) ? null : exam.end_time,
      created_at: now,
      updated_at: now,
    }

    const examsCol = collection(db, 'exams')
    const docRef = await addDoc(examsCol, examData)
    const snap = await getDoc(docRef)
    return normalizeId<Exam>(snap.id, snap.data())
  },

  async updateExam(id: string, exam: Database['public']['Tables']['exams']['Update']) {
    const examData = {
      ...exam,
      // Không cho Firestore nhận undefined
      subject_id: exam.subject_id ?? null,
      teacher_id: exam.teacher_id ?? null,
      start_time: (exam.start_time === '' || exam.start_time === null || exam.start_time === undefined) ? null : exam.start_time,
      end_time: (exam.end_time === '' || exam.end_time === null || exam.end_time === undefined) ? null : exam.end_time,
      updated_at: new Date().toISOString(),
    }

    const examRef = doc(db, 'exams', id)
    await updateDoc(examRef, examData as any)
    const snap = await getDoc(examRef)
    return normalizeId<Exam>(snap.id, snap.data())
  },

  async deleteExam(id: string) {
    await deleteDoc(doc(db, 'exams', id))
  },

  // Questions
  async getQuestions(examId: string) {
    // Tránh composite index (where + orderBy): chỉ where rồi sort ở client
    const qSnap = await getDocs(query(collection(db, 'questions'), where('exam_id', '==', examId)))

    const questions: QuestionWithAnswers[] = []
    const questionDocs = qSnap.docs
      .map((qDoc) => normalizeId<Question>(qDoc.id, qDoc.data()))
      .sort((a, b) => ((a.order_index ?? 1e9) as number) - ((b.order_index ?? 1e9) as number))

    for (const question of questionDocs) {
      // Tránh composite index (where + orderBy): chỉ where rồi sort ở client
      const ansSnap = await getDocs(
        query(collection(db, 'answers'), where('question_id', '==', question.id))
      )
      const answers: Answer[] = ansSnap.docs
        .map((a) => normalizeId<Answer>(a.id, a.data()))
        .sort((a, b) => ((a.order_index ?? 1e9) as number) - ((b.order_index ?? 1e9) as number))

      questions.push({ ...question, answers })
    }

    return questions
  },

  async createQuestion(question: Database['public']['Tables']['questions']['Insert']) {
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, 'questions'), {
      ...question,
      created_at: now,
    })
    const snap = await getDoc(ref)
    return normalizeId<Question>(snap.id, snap.data())
  },

  async createQuestionsWithAnswers(
    examId: string,
    questions: Array<{
      content: string
      question_type?: 'multiple_choice' | 'true_false_multi' | 'short_answer'
      difficulty: 'easy' | 'medium' | 'hard'
      points: number
      image_url?: string
      correct_answer?: string
      answers?: Array<{
        content: string
        is_correct: boolean
      }>
    }>
  ) {
    const created: Question[] = []
    const now = new Date().toISOString()

    for (let index = 0; index < questions.length; index++) {
      const q = questions[index]
      const qRef = await addDoc(collection(db, 'questions'), {
        exam_id: examId,
        content: q.content,
        question_type: q.question_type || 'multiple_choice',
        difficulty: q.difficulty,
        points: q.points,
        order_index: index + 1,
        image_url: q.image_url || null,
        correct_answer: q.correct_answer || null,
        created_at: now,
      } as Database['public']['Tables']['questions']['Insert'])

      const qSnap = await getDoc(qRef)
      const question = normalizeId<Question>(qSnap.id, qSnap.data())
      created.push(question)

      if (q.answers && q.answers.length > 0) {
        for (let aIndex = 0; aIndex < q.answers.length; aIndex++) {
          const ans = q.answers[aIndex]
          await addDoc(collection(db, 'answers'), {
            question_id: question.id,
            content: ans.content,
            is_correct: ans.is_correct,
            order_index: aIndex + 1,
            created_at: now,
          } as Database['public']['Tables']['answers']['Insert'])
        }
      }
    }

    await updateDoc(doc(db, 'exams', examId), {
      total_questions: created.length,
      updated_at: now,
    } as any)

    return created
  },

  async updateQuestion(
    id: string,
    question: Database['public']['Tables']['questions']['Update']
  ) {
    const qRef = doc(db, 'questions', id)
    await updateDoc(qRef, question as any)
    const snap = await getDoc(qRef)
    return normalizeId<Question>(snap.id, snap.data())
  },

  async deleteQuestion(id: string) {
    await deleteDoc(doc(db, 'questions', id))
  },

  // Answers
  async createAnswer(answer: Database['public']['Tables']['answers']['Insert']) {
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, 'answers'), {
      ...answer,
      created_at: now,
    })
    const snap = await getDoc(ref)
    return normalizeId<Answer>(snap.id, snap.data())
  },

  async updateAnswer(
    id: string,
    answer: Database['public']['Tables']['answers']['Update']
  ) {
    const aRef = doc(db, 'answers', id)
    await updateDoc(aRef, answer as any)
    const snap = await getDoc(aRef)
    return normalizeId<Answer>(snap.id, snap.data())
  },

  async deleteAnswer(id: string) {
    await deleteDoc(doc(db, 'answers', id))
  },

  // Exam Assignments
  async assignExamToStudents(examId: string, studentIds: string[], classId?: string | null) {
    const now = new Date().toISOString()
    const created: any[] = []
    for (const studentId of studentIds) {
      const ref = await addDoc(collection(db, 'exam_assignments'), {
        exam_id: examId,
        student_id: studentId,
        class_id: classId || null,
        assigned_at: now,
      })
      const snap = await getDoc(ref)
      created.push(normalizeId<any>(snap.id, snap.data()))
    }
    return created
  },

  // Giao bài cho lớp (tự động giao cho tất cả học sinh trong lớp)
  async assignExamToClass(examId: string, classId: string, startTime: string, endTime: string) {
    const examRef = doc(db, 'exams', examId)
    const examSnap = await getDoc(examRef)
    if (!examSnap.exists()) throw new Error('Exam not found')

    const examData = examSnap.data() as any
    const updateData: any = {}
    if (examData && examData.status === 'draft') updateData.status = 'published'
    if (!examData?.start_time || !examData?.end_time) {
      updateData.start_time = startTime
      updateData.end_time = endTime
    }
    if (Object.keys(updateData).length > 0) {
      await updateDoc(examRef, updateData)
    }

    const classStudentsSnap = await getDocs(
      query(collection(db, 'class_students'), where('class_id', '==', classId))
    )
    const classStudents = classStudentsSnap.docs.map((d) => d.data() as any)
    if (!classStudents || classStudents.length === 0) {
      throw new Error('Lớp học không có học sinh nào')
    }

    const studentIds = classStudents.map((cs) => cs.student_id)

    const existingAssignmentsSnap = await getDocs(
      query(
        collection(db, 'exam_assignments'),
        where('exam_id', '==', examId),
        where('class_id', '==', classId)
      )
    )
    for (const docSnap of existingAssignmentsSnap.docs) {
      await deleteDoc(docSnap.ref)
    }

    const now = new Date().toISOString()
    const assignments: any[] = []
    for (const studentId of studentIds) {
      const ref = await addDoc(collection(db, 'exam_assignments'), {
        exam_id: examId,
        student_id: studentId,
        class_id: classId,
        start_time: startTime,
        end_time: endTime,
        assigned_at: now,
      })
      const snap = await getDoc(ref)
      assignments.push(normalizeId<any>(snap.id, snap.data()))
    }

    return assignments
  },

  // Tự động nộp bài khi hết giờ (bản đơn giản trên Firestore)
  async autoSubmitExpiredAttempts() {
    const now = new Date()
    const nowISO = now.toISOString()

    const attemptsSnap = await getDocs(
      query(collection(db, 'exam_attempts'), where('status', '==', 'in_progress'))
    )
    if (attemptsSnap.empty) return []

    const expiredIds: string[] = []
    for (const docSnap of attemptsSnap.docs) {
      const attempt = normalizeId<ExamAttempt>(docSnap.id, docSnap.data())
      const examSnap = await getDoc(doc(db, 'exams', attempt.exam_id))
      let exam: any = null
      if (examSnap.exists()) {
        exam = normalizeId<Exam>(examSnap.id, examSnap.data())
      }
      if (!exam) continue

      let isExpired = false
      if (exam.end_time && new Date(exam.end_time) < now) {
        isExpired = true
      } else if (attempt.started_at && exam.duration_minutes) {
        const startTime = new Date(attempt.started_at)
        const endTime = new Date(startTime.getTime() + exam.duration_minutes * 60 * 1000)
        if (endTime < now) isExpired = true
      }

      if (!isExpired) continue

      try {
        const startedAt = new Date(attempt.started_at)
        const nowDate = new Date()
        const timeSpent = Math.floor((nowDate.getTime() - startedAt.getTime()) / 1000)

        await updateDoc(doc(db, 'exam_attempts', attempt.id), {
          status: 'timeout',
          submitted_at: nowISO,
          time_spent_seconds: timeSpent,
        } as any)

        await this.submitExam(attempt.id, timeSpent, [])
        expiredIds.push(attempt.id)
      } catch {
        // ignore per-attempt errors
      }
    }

    return expiredIds
  },

  async getAssignedExams(studentId?: string, useCache = true) {
    const user = auth.currentUser
    const currentStudentId = studentId || user?.uid
    if (!currentStudentId) return []

    if (useCache) {
      const cached = cache.get<any[]>(CACHE_KEYS.assignedExams(currentStudentId))
      if (cached) return cached
    }

    // Tránh composite index (where + orderBy): chỉ where rồi sort & slice ở client
    const assignmentsSnap = await getDocs(
      query(collection(db, 'exam_assignments'), where('student_id', '==', currentStudentId))
    )
    if (assignmentsSnap.empty) return []

    const assignments = assignmentsSnap.docs
      .map((d) => normalizeId<any>(d.id, d.data()))
      .sort((a, b) => new Date(b.assigned_at || 0).getTime() - new Date(a.assigned_at || 0).getTime())
      .slice(0, 20)

    const examIds = [...new Set(assignments.map((a) => a.exam_id).filter(Boolean))]
    if (examIds.length === 0) return []

    const examPromiseSnaps = await Promise.all(examIds.map(id => getDoc(doc(db, 'exams', id))))
    const exams: any[] = []
    examPromiseSnaps.forEach((e) => {
      if (e.exists()) exams.push(normalizeId<Exam>(e.id, e.data()))
    })
    if (exams.length === 0) return []

    const subjectIds = [...new Set(exams.map((e) => e.subject_id).filter(Boolean))]
    const teacherIds = [...new Set(exams.map((e) => e.teacher_id).filter(Boolean))]

    const subjectsMap: Record<string, any> = {}
    const teachersMap: Record<string, any> = {}

    const promises: Promise<void>[] = []

    if (subjectIds.length > 0) {
      promises.push(
        (async () => {
          const snaps = await Promise.all(subjectIds.map(id => getDoc(doc(db, 'subjects', id))))
          snaps.forEach((s) => {
            if (s.exists()) {
              const data = normalizeId<Database['public']['Tables']['subjects']['Row']>(s.id, s.data())
              subjectsMap[data.id] = data
            }
          })
        })()
      )
    }

    if (teacherIds.length > 0) {
      promises.push(
        (async () => {
          const snaps = await Promise.all(teacherIds.map(id => getDoc(doc(db, 'profiles', id))))
          snaps.forEach((t) => {
            if (t.exists()) {
              const data = normalizeId<Database['public']['Tables']['profiles']['Row']>(t.id, t.data())
              teachersMap[data.id] = data
            }
          })
        })()
      )
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }

    const timesMap: Record<string, { start_time?: string; end_time?: string }> = {}
    const assignmentIds = assignments.map((a) => a.id)
    if (assignmentIds.length > 0) {
      const timesSnaps = await Promise.all(assignmentIds.map(id => getDoc(doc(db, 'exam_assignments', id))))
      timesSnaps.forEach((a) => {
        if (a.exists()) {
          const data = a.data() as any
          timesMap[a.id] = { start_time: data.start_time, end_time: data.end_time }
        }
      })
    }

    const result = assignments.map((assignment) => {
      const exam = exams.find((e) => e.id === assignment.exam_id)
      const times = timesMap[assignment.id] || {}
      return {
        ...assignment,
        exam: exam
          ? {
            ...exam,
            start_time: times.start_time || (exam as any).start_time || null,
            end_time: times.end_time || (exam as any).end_time || null,
            subject: exam.subject_id ? subjectsMap[exam.subject_id] || null : null,
            teacher: exam.teacher_id ? teachersMap[exam.teacher_id] || null : null,
          }
          : null,
      }
    })

    if (useCache) {
      cache.set(CACHE_KEYS.assignedExams(currentStudentId), result, 30000)
    }

    return result
  },

  // Exam Attempts
  async startAttempt(examId: string) {
    const user = auth.currentUser
    if (!user) throw new Error('Not authenticated')

    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, 'exam_attempts'), {
      exam_id: examId,
      student_id: user.uid,
      status: 'in_progress',
      started_at: now,
      submitted_at: null,
      time_spent_seconds: null,
      score: null,
      percentage: null,
      violations_count: 0,
      violations_data: [],
      ai_analysis: null,
      created_at: now,
    } as any)

    const snap = await getDoc(ref)
    return normalizeId<ExamAttempt>(snap.id, snap.data())
  },

  async getAttempt(attemptId: string) {
    const attemptRef = doc(db, 'exam_attempts', attemptId)
    const snap = await getDoc(attemptRef)
    if (!snap.exists()) throw new Error('Attempt not found')
    const attempt = normalizeId<ExamAttempt>(snap.id, snap.data())

    let exam: any = null
    if (attempt.exam_id) {
      const examSnap = await getDoc(doc(db, 'exams', attempt.exam_id))
      if (examSnap.exists()) {
        exam = normalizeId<Exam>(examSnap.id, examSnap.data())
      }
    }

    let student: any = null
    if (attempt.student_id) {
      const studentSnap = await getDoc(doc(db, 'profiles', attempt.student_id))
      if (studentSnap.exists()) {
        student = normalizeId<Database['public']['Tables']['profiles']['Row']>(studentSnap.id, studentSnap.data())
      }
    }

    return {
      ...attempt,
      exam,
      student,
      responses_count: 0,
    } as ExamAttemptWithDetails
  },

  async submitResponse(
    attemptId: string,
    questionId: string,
    answerId: string | null,
    textAnswer?: string
  ) {
    const questionSnap = await getDoc(doc(db, 'questions', questionId))
    let question: any = null
    if (questionSnap.exists()) {
      question = normalizeId<Question>(questionSnap.id, questionSnap.data())
    }
    if (!question) throw new Error('Question not found')

    const examSnap = await getDoc(doc(db, 'exams', question.exam_id))
    let exam: any = null
    if (examSnap.exists()) {
      exam = normalizeId<Exam>(examSnap.id, examSnap.data())
    }

    const allQuestionsSnap = await getDocs(
      query(collection(db, 'questions'), where('exam_id', '==', question.exam_id))
    )
    const allQuestions: any[] = []
    allQuestionsSnap.forEach((q) => allQuestions.push(q.data()))

    const multipleChoiceCount =
      allQuestions.filter((q) => q.question_type === 'multiple_choice').length || 0
    const trueFalseMultiCount =
      allQuestions.filter((q) => q.question_type === 'true_false_multi').length || 0
    const shortAnswerCount =
      allQuestions.filter((q) => q.question_type === 'short_answer').length || 0

    let pointsPerQuestion = 0
    if (question.question_type === 'multiple_choice') {
      pointsPerQuestion =
        multipleChoiceCount > 0
          ? (exam?.multiple_choice_score || 0) / multipleChoiceCount
          : 0
    } else if (question.question_type === 'true_false_multi') {
      pointsPerQuestion =
        trueFalseMultiCount > 0
          ? (exam?.true_false_multi_score || 0) / trueFalseMultiCount
          : 0
    } else if (question.question_type === 'short_answer') {
      pointsPerQuestion =
        shortAnswerCount > 0
          ? (exam?.short_answer_score || 0) / shortAnswerCount
          : 0
    }

    let isCorrect = false
    let pointsEarned = 0

    if (question.question_type === 'short_answer' && textAnswer !== undefined) {
      const correctAnswer = (question.correct_answer || '').trim()
      const studentAnswer = textAnswer.trim()
      isCorrect = correctAnswer === studentAnswer
      pointsEarned = isCorrect ? pointsPerQuestion : 0
    } else if (question.question_type === 'true_false_multi' && answerId && textAnswer !== undefined) {
      const ansSnap = await getDoc(doc(db, 'answers', answerId))
      let answer: any = null
      if (ansSnap.exists()) {
        answer = normalizeId<Answer>(ansSnap.id, ansSnap.data())
      }
      if (answer) {
        const studentChoice = textAnswer === 'true'
        const correctAnswer = answer.is_correct === true
        isCorrect = studentChoice === correctAnswer

        const qAnsSnap = await getDocs(
          query(collection(db, 'answers'), where('question_id', '==', questionId))
        )
        const answersCount = qAnsSnap.size || 1
        pointsEarned = isCorrect ? pointsPerQuestion / answersCount : 0
      }
    } else if (answerId) {
      const ansSnap = await getDoc(doc(db, 'answers', answerId))
      let answer: any = null
      if (ansSnap.exists()) {
        answer = normalizeId<Answer>(ansSnap.id, ansSnap.data())
      }
      if (answer) {
        isCorrect = !!answer.is_correct
        pointsEarned = isCorrect ? pointsPerQuestion : 0
      }
    }

    // Check existing response
    let existing: any = null
    if (question.question_type === 'true_false_multi' && answerId) {
      const existingSnap = await getDocs(
        query(
          collection(db, 'exam_responses'),
          where('attempt_id', '==', attemptId),
          where('question_id', '==', questionId),
          where('answer_id', '==', answerId)
        )
      )
      if (!existingSnap.empty) {
        const d = existingSnap.docs[0]
        existing = normalizeId<ExamResponse>(d.id, d.data())
      }
    } else {
      const existingSnap = await getDocs(
        query(
          collection(db, 'exam_responses'),
          where('attempt_id', '==', attemptId),
          where('question_id', '==', questionId)
        )
      )
      if (!existingSnap.empty) {
        const d = existingSnap.docs[0]
        existing = normalizeId<ExamResponse>(d.id, d.data())
      }
    }

    const user = auth.currentUser
    if (!user) throw new Error('Not authenticated')

    const attemptSnap = await getDoc(doc(db, 'exam_attempts', attemptId))
    if (!attemptSnap.exists()) throw new Error('Attempt not found')
    const attemptCheck = normalizeId<ExamAttempt>(attemptSnap.id, attemptSnap.data())

    if (attemptCheck.student_id !== user.uid) {
      throw new Error('Unauthorized: This attempt does not belong to you')
    }
    if (attemptCheck.status !== 'in_progress') {
      throw new Error('Cannot modify responses: Exam has already been submitted')
    }

    if (existing) {
      const respRef = doc(db, 'exam_responses', existing.id)
      await updateDoc(respRef, {
        answer_id: answerId,
        text_answer: textAnswer || null,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        answered_at: new Date().toISOString(),
      } as any)
      const snap = await getDoc(respRef)
      return normalizeId<ExamResponse>(snap.id, snap.data())
    } else {
      const ref = await addDoc(collection(db, 'exam_responses'), {
        attempt_id: attemptId,
        question_id: questionId,
        answer_id: answerId,
        text_answer: textAnswer || null,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        answered_at: new Date().toISOString(),
      } as Database['public']['Tables']['exam_responses']['Insert'])
      const snap = await getDoc(ref)
      return normalizeId<ExamResponse>(snap.id, snap.data())
    }
  },

  async submitExam(
    attemptId: string,
    timeSpent: number,
    violations: any[],
    forceStatus?: 'submitted' | 'violation'
  ) {
    const user = auth.currentUser
    if (!user) throw new Error('Not authenticated')

    const attemptRef = doc(db, 'exam_attempts', attemptId)
    const attemptSnap = await getDoc(attemptRef)
    if (!attemptSnap.exists()) throw new Error('Attempt not found')
    const attemptCheck = normalizeId<ExamAttempt>(attemptSnap.id, attemptSnap.data())

    const profileSnap = await getDoc(doc(db, 'profiles', user.uid))
    const profile = profileSnap.exists()
      ? (normalizeId<Database['public']['Tables']['profiles']['Row']>(
        profileSnap.id,
        profileSnap.data()
      ) as any)
      : null

    const isAdminOrTeacher = profile?.role === 'admin' || profile?.role === 'teacher'

    if (!isAdminOrTeacher && attemptCheck.student_id !== user.uid) {
      throw new Error('Unauthorized: This attempt does not belong to you')
    }
    if (!isAdminOrTeacher && attemptCheck.status !== 'in_progress') {
      throw new Error('Cannot modify responses: Exam has already been submitted')
    }

    const responsesSnap = await getDocs(
      query(collection(db, 'exam_responses'), where('attempt_id', '==', attemptId))
    )
    const responses: any[] = []
    responsesSnap.forEach((r) => responses.push(r.data()))
    const totalPoints =
      responses.reduce(
        (sum, r) => sum + (parseFloat(r.points_earned as any) || 0),
        0
      ) || 0

    const examSnap = await getDoc(doc(db, 'exams', attemptCheck.exam_id))
    let exam: any = null
    if (examSnap.exists()) {
      exam = normalizeId<Exam>(examSnap.id, examSnap.data())
    }

    const totalScore = exam?.total_score || 10
    const percentage = Math.round((totalPoints / totalScore) * 100)

    let status: 'submitted' | 'violation' = forceStatus || 'submitted'
    if (!forceStatus && violations.length > 5) {
      status = 'violation'
    }

    const updateData = {
      submitted_at: new Date().toISOString(),
      time_spent_seconds: timeSpent,
      score: totalPoints,
      percentage,
      status,
      violations_count: violations.length,
      violations_data: violations,
    }

    if (!isAdminOrTeacher) {
      if (attemptCheck.student_id !== user.uid || attemptCheck.status !== 'in_progress') {
        throw new Error('Cannot modify responses: Exam has already been submitted')
      }
    }

    await updateDoc(attemptRef, updateData as any)
    const updatedSnap = await getDoc(attemptRef)
    return normalizeId<ExamAttempt>(updatedSnap.id, updatedSnap.data())
  },

  async getAttempts(examId?: string, useCache = true) {
    const user = auth.currentUser
    if (!user) return []

    let userRole: string | null = null
    if (examId) {
      const profileSnap = await getDoc(doc(db, 'profiles', user.uid))
      if (profileSnap.exists()) {
        const profile = normalizeId<Database['public']['Tables']['profiles']['Row']>(
          profileSnap.id,
          profileSnap.data()
        ) as any
        userRole = profile.role || null
      }
    }

    if (useCache && !examId && userRole !== 'admin' && userRole !== 'teacher') {
      const cached = cache.get<ExamAttemptWithDetails[]>(CACHE_KEYS.attempts(user.uid))
      if (cached) return cached
    }

    // Tránh composite index (where + orderBy): chỉ where rồi sort ở client
    const constraints: any[] = []
    if (examId && (userRole === 'admin' || userRole === 'teacher')) {
      constraints.push(where('exam_id', '==', examId))
    } else {
      constraints.push(where('student_id', '==', user.uid))
      if (examId) constraints.push(where('exam_id', '==', examId))
    }

    const attemptsSnap = await getDocs(query(collection(db, 'exam_attempts'), ...constraints))
    if (attemptsSnap.empty) return []

    const attempts: any[] = []
    attemptsSnap.forEach((a) =>
      attempts.push(normalizeId<ExamAttempt>(a.id, a.data()))
    )
    attempts.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

    const examIds = [...new Set(attempts.map((a) => a.exam_id).filter(Boolean))]
    const examsMap: Record<string, any> = {}
    if (examIds.length > 0) {
      const examsSnaps = await Promise.all(examIds.map(id => getDoc(doc(db, 'exams', id))))
      examsSnaps.forEach((e) => {
        if (e.exists()) {
          const data = normalizeId<Exam>(e.id, e.data())
          examsMap[data.id] = data
        }
      })
    }

    const studentsMap: Record<string, any> = {}
    if (examId && (userRole === 'admin' || userRole === 'teacher')) {
      const studentIds = [...new Set(attempts.map((a) => a.student_id).filter(Boolean))]
      if (studentIds.length > 0) {
        const studentsSnaps = await Promise.all(studentIds.map(id => getDoc(doc(db, 'profiles', id))))
        studentsSnaps.forEach((s) => {
          if (s.exists()) {
            const data = normalizeId<Database['public']['Tables']['profiles']['Row']>(s.id, s.data())
            studentsMap[data.id] = data
          }
        })
      }
    }

    const result = attempts.map((attempt) => ({
      ...attempt,
      exam: attempt.exam_id ? examsMap[attempt.exam_id] || null : null,
      student:
        attempt.student_id && (userRole === 'admin' || userRole === 'teacher')
          ? studentsMap[attempt.student_id] || null
          : null,
      responses_count: 0,
    })) as ExamAttemptWithDetails[]

    if (useCache && !examId) {
      cache.set(CACHE_KEYS.attempts(user.uid), result, 30000)
    }

    return result
  },
}