import { supabase } from '../supabase'
import type { Database } from '../supabase'
import { cache, CACHE_KEYS } from '../cache'

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

export const examApi = {
  // Exams
  async getExams(filters?: { status?: string; subjectId?: string }) {
    // Query đơn giản, không join để tránh recursion
    // Sẽ query riêng subjects và profiles nếu cần
    let query = supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.subjectId) {
      query = query.eq('subject_id', filters.subjectId)
    }

    const { data, error } = await query
    if (error) throw error

    if (!data || data.length === 0) {
      return []
    }

    // Query riêng subjects và profiles để tránh recursion
    const subjectIds = [...new Set(data.map((e: any) => e.subject_id).filter(Boolean))]
    const teacherIds = [...new Set(data.map((e: any) => e.teacher_id).filter(Boolean))]

    let subjectsMap: Record<string, any> = {}
    let profilesMap: Record<string, any> = {}

    if (subjectIds.length > 0) {
      try {
        const { data: subjects } = await supabase
          .from('subjects')
          .select('*')
          .in('id', subjectIds)
        
        if (subjects) {
          subjects.forEach((s: any) => {
            subjectsMap[s.id] = s
          })
        }
      } catch (e) {
        // Ignore errors
      }
    }

    if (teacherIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', teacherIds)
        
        if (profiles) {
          profiles.forEach((p: any) => {
            profilesMap[p.id] = p
          })
        }
      } catch (e) {
        // Ignore errors
      }
    }

    // Combine data
    return data.map((exam: any) => ({
      ...exam,
      subject: subjectsMap[exam.subject_id] || null,
      teacher: profilesMap[exam.teacher_id] || null,
      questions_count: exam.total_questions || 0,
    })) as ExamWithDetails[]
  },

  async getExamById(id: string) {
    const { data, error } = await supabase
      .from('exams')
      .select(`
        *,
        subject:subjects(*),
        teacher:profiles(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as ExamWithDetails
  },

  async createExam(exam: Database['public']['Tables']['exams']['Insert']) {
    // Chuyển chuỗi rỗng thành null cho timestamp fields
    const examData = {
      ...exam,
      start_time: (exam.start_time === '' || exam.start_time === null) ? null : exam.start_time,
      end_time: (exam.end_time === '' || exam.end_time === null) ? null : exam.end_time,
    }
    
    const { data, error } = await supabase
      .from('exams')
      .insert(examData)
      .select()
      .single()

    if (error) throw error
    return data as Exam
  },

  async updateExam(id: string, exam: Database['public']['Tables']['exams']['Update']) {
    // Chuyển chuỗi rỗng thành null cho timestamp fields
    const examData = {
      ...exam,
      start_time: (exam.start_time === '' || exam.start_time === null || exam.start_time === undefined) ? null : exam.start_time,
      end_time: (exam.end_time === '' || exam.end_time === null || exam.end_time === undefined) ? null : exam.end_time,
    }
    
    const { data, error } = await supabase
      .from('exams')
      .update(examData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Exam
  },

  async deleteExam(id: string) {
    const { error } = await supabase
      .from('exams')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Questions
  async getQuestions(examId: string) {
    const { data, error } = await supabase
      .from('questions')
      .select(`
        *,
        answers(*)
      `)
      .eq('exam_id', examId)
      .order('order_index', { ascending: true })

    if (error) throw error
    return data as QuestionWithAnswers[]
  },

  async createQuestion(question: Database['public']['Tables']['questions']['Insert']) {
    const { data, error } = await supabase
      .from('questions')
      .insert(question)
      .select()
      .single()

    if (error) throw error
    return data as Question
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
    const questionsData = questions.map((q, index) => ({
      exam_id: examId,
      content: q.content,
      question_type: q.question_type || 'multiple_choice',
      difficulty: q.difficulty,
      points: q.points,
      order_index: index + 1,
      image_url: q.image_url || null,
      correct_answer: q.correct_answer || null,
    }))

    const { data: createdQuestions, error: questionsError } = await supabase
      .from('questions')
      .insert(questionsData)
      .select()

    if (questionsError) throw questionsError

    const answersData: Database['public']['Tables']['answers']['Insert'][] = []
    createdQuestions.forEach((question, qIndex) => {
      // Chỉ tạo answers cho multiple_choice và true_false_multi
      if (questions[qIndex].answers && questions[qIndex].answers.length > 0) {
        questions[qIndex].answers.forEach((answer, aIndex) => {
          answersData.push({
            question_id: question.id,
            content: answer.content,
            is_correct: answer.is_correct,
            order_index: aIndex + 1,
          })
        })
      }
    })

    const { error: answersError } = await supabase
      .from('answers')
      .insert(answersData)

    if (answersError) throw answersError

    // Cập nhật total_questions
    await supabase
      .from('exams')
      .update({ total_questions: createdQuestions.length })
      .eq('id', examId)

    return createdQuestions
  },

  async updateQuestion(
    id: string,
    question: Database['public']['Tables']['questions']['Update']
  ) {
    const { data, error } = await supabase
      .from('questions')
      .update(question)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Question
  },

  async deleteQuestion(id: string) {
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Answers
  async createAnswer(answer: Database['public']['Tables']['answers']['Insert']) {
    const { data, error } = await supabase
      .from('answers')
      .insert(answer)
      .select()
      .single()

    if (error) throw error
    return data as Answer
  },

  async updateAnswer(
    id: string,
    answer: Database['public']['Tables']['answers']['Update']
  ) {
    const { data, error } = await supabase
      .from('answers')
      .update(answer)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Answer
  },

  async deleteAnswer(id: string) {
    const { error } = await supabase
      .from('answers')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Exam Assignments
  async assignExamToStudents(examId: string, studentIds: string[], classId?: string | null) {
    const assignments = studentIds.map(studentId => ({
      exam_id: examId,
      student_id: studentId,
      class_id: classId || null,
    }))

    const { data, error } = await supabase
      .from('exam_assignments')
      .insert(assignments)
      .select()

    if (error) throw error
    return data
  },

  // Giao bài cho lớp (tự động giao cho tất cả học sinh trong lớp)
  async assignExamToClass(examId: string, classId: string, startTime: string, endTime: string) {
    // Cập nhật exam status và thời gian (nếu chưa có start_time/end_time trong exam)
    const { data: examData } = await supabase
      .from('exams')
      .select('status, start_time, end_time')
      .eq('id', examId)
      .single()

    const updateData: any = {}
    if (examData && examData.status === 'draft') {
      updateData.status = 'published'
    }
    
    // Nếu exam chưa có start_time/end_time, set vào exam (fallback cho trường hợp cột assignment chưa tồn tại)
    if (!examData?.start_time || !examData?.end_time) {
      updateData.start_time = startTime
      updateData.end_time = endTime
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('exams')
        .update(updateData)
        .eq('id', examId)

      if (updateError) throw updateError
    }

    // Lấy tất cả học sinh trong lớp
    const { data: classStudents, error: studentsError } = await supabase
      .from('class_students')
      .select('student_id')
      .eq('class_id', classId)

    if (studentsError) throw studentsError

    if (!classStudents || classStudents.length === 0) {
      throw new Error('Lớp học không có học sinh nào')
    }

    const studentIds = classStudents.map((cs) => cs.student_id)

    // Xóa assignments cũ cho class này (nếu có) để tránh duplicate
    await supabase
      .from('exam_assignments')
      .delete()
      .eq('exam_id', examId)
      .eq('class_id', classId)

    // Giao bài cho tất cả học sinh trong lớp với start_time và end_time riêng (nếu cột tồn tại)
    const assignments: any[] = studentIds.map(studentId => ({
      exam_id: examId,
      student_id: studentId,
      class_id: classId,
    }))
    
    // Thêm start_time và end_time nếu cột tồn tại
    try {
      assignments.forEach((a: any) => {
        a.start_time = startTime
        a.end_time = endTime
      })
    } catch (e) {
      // Cột chưa tồn tại, bỏ qua
    }

    const { data, error } = await supabase
      .from('exam_assignments')
      .insert(assignments)
      .select()

    if (error) {
      // Nếu lỗi do cột start_time/end_time chưa tồn tại, thử insert lại không có các cột đó
      if (error.message?.includes('start_time') || error.message?.includes('end_time') || error.message?.includes('column')) {
        const assignmentsWithoutTimes = studentIds.map(studentId => ({
          exam_id: examId,
          student_id: studentId,
          class_id: classId,
        }))
        
        const { data: data2, error: error2 } = await supabase
          .from('exam_assignments')
          .insert(assignmentsWithoutTimes)
          .select()
        
        if (error2) throw error2
        return data2
      }
      throw error
    }
    return data
  },

  // Tự động nộp bài khi hết giờ
  async autoSubmitExpiredAttempts() {
    const now = new Date()
    const nowISO = now.toISOString()
    
    // Tìm các attempt đang in_progress
    const { data: expiredAttempts, error } = await supabase
      .from('exam_attempts')
      .select(`
        id,
        exam_id,
        student_id,
        started_at,
        exam:exams!exam_attempts_exam_id_fkey(
          id,
          duration_minutes,
          end_time
        )
      `)
      .eq('status', 'in_progress')

    if (error) throw error
    if (!expiredAttempts || expiredAttempts.length === 0) return []

    // Lấy assignment để kiểm tra end_time từ assignment
    const studentIds = [...new Set(expiredAttempts.map((a: any) => a.student_id))]
    const examIds = [...new Set(expiredAttempts.map((a: any) => a.exam_id))]

    // Lấy assignments với start_time và end_time (nếu cột tồn tại)
    let assignmentsMap: Record<string, any> = {}
    try {
      const { data: assignments } = await supabase
        .from('exam_assignments')
        .select('exam_id, student_id, start_time, end_time')
        .in('exam_id', examIds)
        .in('student_id', studentIds)

      assignments?.forEach((a: any) => {
        const key = `${a.exam_id}_${a.student_id}`
        if (!assignmentsMap[key] || (a.end_time && new Date(a.end_time) > new Date(assignmentsMap[key]?.end_time || 0))) {
          assignmentsMap[key] = a
        }
      })
    } catch (e: any) {
      if (e.message?.includes('start_time') || e.message?.includes('end_time')) {
        // Ignore - columns may not exist yet
      } else {
        throw e
      }
    }

    const expired = expiredAttempts.filter((attempt: any) => {
      const exam = attempt.exam
      if (!exam) return false
      
      // Kiểm tra end_time từ assignment (ưu tiên)
      const assignmentKey = `${attempt.exam_id}_${attempt.student_id}`
      const assignment = assignmentsMap[assignmentKey]
      if (assignment?.end_time && new Date(assignment.end_time) < now) {
        return true
      }
      
      // Kiểm tra nếu exam đã hết thời gian (fallback)
      if (exam.end_time && new Date(exam.end_time) < now) {
        return true
      }
      
      // Kiểm tra nếu đã hết thời gian làm bài (started_at + duration_minutes)
      if (attempt.started_at && exam.duration_minutes) {
        const startTime = new Date(attempt.started_at)
        const endTime = new Date(startTime.getTime() + exam.duration_minutes * 60 * 1000)
        return endTime < now
      }
      
      return false
    })

    // Tự động nộp bài cho các attempt hết giờ
    const results = []
    for (const attempt of expired) {
      try {
        // Tính thời gian đã làm
        const startedAt = new Date(attempt.started_at)
        const nowDate = new Date()
        const timeSpent = Math.floor((nowDate.getTime() - startedAt.getTime()) / 1000)

        // Cập nhật attempt
        await supabase
          .from('exam_attempts')
          .update({
            status: 'timeout',
            submitted_at: nowISO,
            time_spent_seconds: timeSpent,
          })
          .eq('id', attempt.id)

        // Tính điểm và cập nhật
        await this.submitExam(attempt.id, timeSpent, [])

        results.push(attempt.id)
      } catch (err) {
        // Ignore errors
      }
    }

    return results
  },

  async getAssignedExams(studentId?: string, useCache = true) {
    const { data: { user } } = await supabase.auth.getUser()
    const currentStudentId = studentId || user?.id

    if (!currentStudentId) {
      return []
    }

    if (useCache) {
      const cached = cache.get<any[]>(CACHE_KEYS.assignedExams(currentStudentId))
      if (cached) {
        return cached
      }
    }

    const { data: assignments, error } = await supabase
      .from('exam_assignments')
      .select('id, exam_id, student_id, assigned_at')
      .eq('student_id', currentStudentId)
      .order('assigned_at', { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }
    if (!assignments || assignments.length === 0) {
      return []
    }

    // Lấy exam_ids và query exams với thông tin tối thiểu
    const examIds = [...new Set(assignments.map((a: any) => a.exam_id).filter(Boolean))]
    if (examIds.length === 0) return []

    // Chỉ lấy những field cần thiết
    const { data: exams, error: examsError } = await supabase
      .from('exams')
      .select('id, title, description, subject_id, teacher_id, duration_minutes, total_questions, status, passing_score')
      .in('id', examIds)

    if (examsError) throw examsError
    if (!exams || exams.length === 0) return []

    // Lấy subject_ids và teacher_ids (chỉ lấy name)
    const subjectIds = [...new Set(exams.map((e: any) => e.subject_id).filter(Boolean))]
    const teacherIds = [...new Set(exams.map((e: any) => e.teacher_id).filter(Boolean))]

    let subjectsMap: Record<string, any> = {}
    let teachersMap: Record<string, any> = {}

    // Query song song
    const promises: Promise<void>[] = []

    if (subjectIds.length > 0) {
      promises.push(
        (async () => {
          const { data } = await supabase
            .from('subjects')
            .select('id, name')
            .in('id', subjectIds)
          if (data) {
            data.forEach((s: any) => {
              subjectsMap[s.id] = s
            })
          }
        })()
      )
    }

    if (teacherIds.length > 0) {
      promises.push(
        (async () => {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', teacherIds)
          if (data) {
            data.forEach((t: any) => {
              teachersMap[t.id] = t
            })
          }
        })()
      )
    }

    // Đợi tất cả queries hoàn thành
    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }

    // Thử lấy start_time và end_time từ assignments nếu cột tồn tại
    const assignmentIds = assignments.map((a: any) => a.id)
    let timesMap: Record<string, { start_time?: string; end_time?: string }> = {}
    
    if (assignmentIds.length > 0) {
      try {
        const { data: assignmentsWithTimes } = await supabase
          .from('exam_assignments')
          .select('id, start_time, end_time')
          .in('id', assignmentIds)
        
        if (assignmentsWithTimes) {
          assignmentsWithTimes.forEach((a: any) => {
            timesMap[a.id] = { start_time: a.start_time, end_time: a.end_time }
          })
        }
      } catch (e: any) {
        // Cột chưa tồn tại, bỏ qua và dùng thời gian từ exam
        if (e.message?.includes('start_time') || e.message?.includes('end_time') || e.message?.includes('column')) {
          // Ignore - columns may not exist yet
        }
      }
    }

    // Combine data - sử dụng start_time và end_time từ assignment nếu có
    const result = assignments.map((assignment: any) => {
      const exam = exams.find((e: any) => e.id === assignment.exam_id)
      const times = timesMap[assignment.id] || {}
      return {
        ...assignment,
        exam: exam ? {
          ...exam,
          // Sử dụng start_time và end_time từ assignment nếu có, nếu không thì dùng từ exam
          start_time: times.start_time || (exam as any).start_time || null,
          end_time: times.end_time || (exam as any).end_time || null,
          subject: exam.subject_id ? subjectsMap[exam.subject_id] || null : null,
          teacher: exam.teacher_id ? teachersMap[exam.teacher_id] || null : null,
        } : null,
      }
    })

    // Cache kết quả (30 giây)
    if (useCache) {
      cache.set(CACHE_KEYS.assignedExams(currentStudentId), result, 30000)
    }

    return result
  },

  // Exam Attempts
  async startAttempt(examId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('exam_attempts')
      .insert({
        exam_id: examId,
        student_id: user.id,
        status: 'in_progress',
      })
      .select()
      .single()

    if (error) throw error
    return data as ExamAttempt
  },

  async getAttempt(attemptId: string) {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(`
        *,
        exam:exams(*),
        student:profiles(*)
      `)
      .eq('id', attemptId)
      .single()

    if (error) throw error
    return data as ExamAttemptWithDetails
  },

  async submitResponse(
    attemptId: string,
    questionId: string,
    answerId: string | null,
    textAnswer?: string
  ) {
    // Lấy thông tin question và exam để tính điểm
    const { data: question } = await supabase
      .from('questions')
      .select('question_type, points, correct_answer, exam_id')
      .eq('id', questionId)
      .single()

    if (!question) throw new Error('Question not found')

    // Lấy thông tin exam để biết điểm cho từng phần
    const { data: exam } = await supabase
      .from('exams')
      .select('total_score, multiple_choice_score, true_false_multi_score, short_answer_score')
      .eq('id', question.exam_id)
      .single()

    // Đếm số câu hỏi trong mỗi phần
    const { data: allQuestions } = await supabase
      .from('questions')
      .select('question_type')
      .eq('exam_id', question.exam_id)

    const multipleChoiceCount = allQuestions?.filter(q => q.question_type === 'multiple_choice').length || 0
    const trueFalseMultiCount = allQuestions?.filter(q => q.question_type === 'true_false_multi').length || 0
    const shortAnswerCount = allQuestions?.filter(q => q.question_type === 'short_answer').length || 0

    // Tính điểm cho mỗi câu hỏi dựa trên phần của nó
    let pointsPerQuestion = 0
    if (question.question_type === 'multiple_choice') {
      pointsPerQuestion = multipleChoiceCount > 0 
        ? (exam?.multiple_choice_score || 0) / multipleChoiceCount 
        : 0
    } else if (question.question_type === 'true_false_multi') {
      pointsPerQuestion = trueFalseMultiCount > 0 
        ? (exam?.true_false_multi_score || 0) / trueFalseMultiCount 
        : 0
    } else if (question.question_type === 'short_answer') {
      pointsPerQuestion = shortAnswerCount > 0 
        ? (exam?.short_answer_score || 0) / shortAnswerCount 
        : 0
    }

    let isCorrect = false
    let pointsEarned = 0

    // Xử lý theo loại câu hỏi
    if (question.question_type === 'short_answer' && textAnswer !== undefined) {
      // So sánh đáp án số
      const correctAnswer = question.correct_answer?.trim() || ''
      const studentAnswer = textAnswer.trim()
      isCorrect = correctAnswer === studentAnswer
      pointsEarned = isCorrect ? pointsPerQuestion : 0
    } else if (question.question_type === 'true_false_multi' && answerId && textAnswer !== undefined) {
      // True/False Multi: So sánh text_answer với is_correct của answer
      const { data: answer } = await supabase
        .from('answers')
        .select('is_correct')
        .eq('id', answerId)
        .single()

      if (answer) {
        // textAnswer là "true" hoặc "false" (string)
        // answer.is_correct là boolean
        const studentChoice = textAnswer === 'true'
        const correctAnswer = answer.is_correct === true
        isCorrect = studentChoice === correctAnswer
        // Tính điểm: chia đều điểm của phần true_false_multi cho số lượng answers trong câu hỏi
        const { data: questionAnswers } = await supabase
          .from('answers')
          .select('id')
          .eq('question_id', questionId)
        const answersCount = questionAnswers?.length || 1
        pointsEarned = isCorrect ? pointsPerQuestion / answersCount : 0
      }
    } else if (answerId) {
      // Multiple choice
      const { data: answer } = await supabase
        .from('answers')
        .select('is_correct')
        .eq('id', answerId)
        .single()

      if (answer) {
        isCorrect = answer.is_correct
        pointsEarned = isCorrect ? pointsPerQuestion : 0
      }
    }

    // Kiểm tra xem đã có response chưa
    // Với true_false_multi, mỗi answer có một response riêng, nên cần kiểm tra cả answer_id
    let existing: any = null
    if (question.question_type === 'true_false_multi' && answerId) {
      const { data } = await supabase
      .from('exam_responses')
      .select('id')
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId)
        .eq('answer_id', answerId)
        .maybeSingle()
      existing = data
    } else {
      const { data } = await supabase
        .from('exam_responses')
        .select('id')
        .eq('attempt_id', attemptId)
        .eq('question_id', questionId)
        .maybeSingle()
      existing = data
    }

    // Đảm bảo user đã authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Kiểm tra attempt thuộc về user này và đang in_progress
    const { data: attemptCheck } = await supabase
      .from('exam_attempts')
      .select('id, student_id, status')
      .eq('id', attemptId)
      .single()

    if (!attemptCheck) throw new Error('Attempt not found')
    if (attemptCheck.student_id !== user.id) {
      throw new Error('Unauthorized: This attempt does not belong to you')
    }
    if (attemptCheck.status !== 'in_progress') {
      throw new Error('Cannot modify responses: Exam has already been submitted')
    }

    if (existing) {
      const { data, error } = await supabase
        .from('exam_responses')
        .update({
          answer_id: answerId,
          text_answer: textAnswer || null,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        throw error
      }
      return data as ExamResponse
    } else {
      const { data, error } = await supabase
        .from('exam_responses')
        .insert({
          attempt_id: attemptId,
          question_id: questionId,
          answer_id: answerId,
          text_answer: textAnswer || null,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .select()
        .single()

      if (error) {
        throw error
      }
      return data as ExamResponse
    }
  },

  async submitExam(
    attemptId: string,
    timeSpent: number,
    violations: any[],
    forceStatus?: 'submitted' | 'violation' // Cho phép admin/teacher đình chỉ thi
  ) {
    // Đảm bảo user đã authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Kiểm tra attempt
    const { data: attemptCheck } = await supabase
      .from('exam_attempts')
      .select('id, student_id, status')
      .eq('id', attemptId)
      .single()

    if (!attemptCheck) throw new Error('Attempt not found')
    
    // Kiểm tra quyền: student chỉ có thể submit attempt của mình
    // Admin/teacher có thể submit bất kỳ attempt nào (để đình chỉ thi)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    const isAdminOrTeacher = profile?.role === 'admin' || profile?.role === 'teacher'
    
    if (!isAdminOrTeacher && attemptCheck.student_id !== user.id) {
      throw new Error('Unauthorized: This attempt does not belong to you')
    }
    
    if (!isAdminOrTeacher && attemptCheck.status !== 'in_progress') {
      throw new Error('Cannot modify responses: Exam has already been submitted')
    }

    // Tính điểm
    const { data: responses } = await supabase
      .from('exam_responses')
      .select('points_earned')
      .eq('attempt_id', attemptId)

    const totalPoints = responses?.reduce((sum, r) => sum + (parseFloat(r.points_earned) || 0), 0) || 0

    // Lấy thông tin exam để biết thang điểm
    const { data: attempt } = await supabase
      .from('exam_attempts')
      .select('exam:exams(total_score, total_questions)')
      .eq('id', attemptId)
      .single()

    const exam = (attempt?.exam as any)
    const totalScore = exam?.total_score || 10 // Thang điểm tổng
    const percentage = Math.round((totalPoints / totalScore) * 100)

    // Xác định status
    // Nếu forceStatus được truyền vào (từ admin/teacher), sử dụng nó
    // Nếu không, tự động xác định dựa trên số lượng violations
    let status: 'submitted' | 'violation' = forceStatus || 'submitted'
    if (!forceStatus && violations.length > 5) {
      status = 'violation'
    }

    // Update attempt
    let updateQuery = supabase
      .from('exam_attempts')
      .update({
        submitted_at: new Date().toISOString(),
        time_spent_seconds: timeSpent,
        score: totalPoints,
        percentage,
        status,
        violations_count: violations.length,
        violations_data: violations,
      })
      .eq('id', attemptId)

    // Nếu là admin/teacher, không cần check student_id và status
    // Nếu là student, chỉ update attempt của chính mình và khi còn in_progress
    if (!isAdminOrTeacher) {
      updateQuery = updateQuery
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
    }

    const { data, error } = await updateQuery.select().single()

    if (error) {
      // Nếu lỗi vì status đã thay đổi, thử update không cần điều kiện status
      if (error.message?.includes('row-level security') || error.message?.includes('status')) {
        const { data: retryData, error: retryError } = await supabase
          .from('exam_attempts')
          .update({
            submitted_at: new Date().toISOString(),
            time_spent_seconds: timeSpent,
            score: totalPoints,
            percentage,
            status,
            violations_count: violations.length,
            violations_data: violations,
          })
          .eq('id', attemptId)
          .eq('student_id', user.id)
      .select()
      .single()

        if (retryError) throw retryError
        return retryData as ExamAttempt
      }
      throw error
    }
    return data as ExamAttempt
  },

  async getAttempts(examId?: string, useCache = true) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Kiểm tra role của user
    let userRole: string | null = null
    if (examId) {
      // Nếu có examId, kiểm tra role để quyết định có filter theo student_id không
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      userRole = profile?.role || null
    }

    // Kiểm tra cache trước (chỉ khi không filter theo examId và là student)
    if (useCache && !examId && userRole !== 'admin' && userRole !== 'teacher') {
      const cached = cache.get<ExamAttemptWithDetails[]>(CACHE_KEYS.attempts(user.id))
      if (cached) return cached
    }

    let query = supabase
      .from('exam_attempts')
      .select('id, exam_id, student_id, status, score, percentage, time_spent_seconds, created_at, submitted_at, violations_count, violations_data')
      .order('created_at', { ascending: false })

    if (examId && (userRole === 'admin' || userRole === 'teacher')) {
      query = query.eq('exam_id', examId)
    } else {
      query = query.eq('student_id', user.id)
    if (examId) {
      query = query.eq('exam_id', examId)
      }
      query = query.limit(50)
    }

    const { data: attempts, error } = await query
    
    if (error) {
      throw error
    }
    if (!attempts || attempts.length === 0) {
      return []
    }

    // Chỉ lấy exam_ids và query exams với thông tin tối thiểu
    const examIds = [...new Set(attempts.map((a: any) => a.exam_id).filter(Boolean))]
    let examsMap: Record<string, any> = {}

    if (examIds.length > 0) {
      const { data: exams } = await supabase
        .from('exams')
        .select('id, title, total_questions, passing_score, total_score')
        .in('id', examIds)
      if (exams) {
        exams.forEach((e: any) => {
          examsMap[e.id] = e
        })
      }
    }

    // Lấy thông tin student nếu là admin/teacher xem kết quả bài thi
    let studentsMap: Record<string, any> = {}
    if (examId && (userRole === 'admin' || userRole === 'teacher')) {
      const studentIds = [...new Set(attempts.map((a: any) => a.student_id).filter(Boolean))]
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', studentIds)
        if (students) {
          students.forEach((s: any) => {
            studentsMap[s.id] = s
          })
        }
      }
    }

    // Không query response counts để nhanh hơn - có thể tính sau nếu cần

    const result = attempts.map((attempt: any) => ({
      ...attempt,
      exam: attempt.exam_id ? examsMap[attempt.exam_id] || null : null,
      student: attempt.student_id && (userRole === 'admin' || userRole === 'teacher') 
        ? studentsMap[attempt.student_id] || null 
        : null,
      responses_count: 0, // Không query để nhanh hơn
    })) as ExamAttemptWithDetails[]

    // Cache kết quả (30 giây, chỉ khi không filter)
    if (useCache && !examId) {
      cache.set(CACHE_KEYS.attempts(user.id), result, 30000)
    }

    return result
  },
}

