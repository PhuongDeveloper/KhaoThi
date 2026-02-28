import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { useAntiCheat } from '../../hooks/useAntiCheat'
import toast from 'react-hot-toast'
import {
  Clock, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight,
  FileText, Maximize2, LayoutList, AlignJustify
} from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

type ViewMode = 'single' | 'all'

export default function StudentExamTake() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [attempt, setAttempt] = useState<any>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [shortAnswers, setShortAnswers] = useState<Record<string, string[]>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [countdownBeforeStart, setCountdownBeforeStart] = useState(0)
  const [examStarted, setExamStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('single')
  const [timeAlertShown, setTimeAlertShown] = useState<Record<string, boolean>>({})
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const attemptRef = useRef<any>(null)
  const examRef = useRef<any>(null)
  const timeRemainingRef = useRef(0)
  const violationsRef = useRef<any[]>([])

  useEffect(() => { attemptRef.current = attempt }, [attempt])
  useEffect(() => { examRef.current = exam }, [exam])
  useEffect(() => { timeRemainingRef.current = timeRemaining }, [timeRemaining])

  const { violations, violationCount, currentViolation, requestFullscreen, isFullscreen } = useAntiCheat({
    onViolation: (violation) => {
      toast.error(`Vi phạm: ${violation.description}`, { duration: 5000, icon: '⚠️' })
    },
    onMaxViolations: () => {
      toast.error('Bạn đã vi phạm quá nhiều lần. Bài thi sẽ tự động nộp.')
      handleSubmit()
    },
    requireFullscreen: true,
    attemptId: attempt?.id,
  })

  useEffect(() => { violationsRef.current = violations }, [violations])

  // Load saved answers from localStorage
  const loadSavedAnswers = (attemptId: string) => {
    try {
      const saved = localStorage.getItem(`exam_answers_${attemptId}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.selectedAnswers) setSelectedAnswers(parsed.selectedAnswers)
        if (parsed.shortAnswers) setShortAnswers(parsed.shortAnswers)
      }
    } catch { /* ignore */ }
  }

  const saveAnswersToLocal = useCallback((sa: Record<string, string>, sha: Record<string, string[]>, attemptId: string) => {
    try {
      localStorage.setItem(`exam_answers_${attemptId}`, JSON.stringify({ selectedAnswers: sa, shortAnswers: sha }))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (id) initializeExam()
  }, [id])

  // Countdown before start
  useEffect(() => {
    if (countdownBeforeStart > 0 && !examStarted) {
      const timer = setInterval(() => {
        setCountdownBeforeStart(prev => {
          if (prev <= 1) { setExamStarted(true); return 0 }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [countdownBeforeStart, examStarted])

  // Main timer
  useEffect(() => {
    if (timeRemaining > 0 && examStarted) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          const next = prev - 1
          // Time alerts
          if (next === 900 && !timeAlertShown['15min']) {
            toast('⏰ Còn 15 phút!', { icon: '⚠️', duration: 5000 })
            setTimeAlertShown(s => ({ ...s, '15min': true }))
          }
          if (next === 300 && !timeAlertShown['5min']) {
            toast.error('🚨 Còn 5 phút! Hãy kiểm tra lại bài làm.', { duration: 6000 })
            setTimeAlertShown(s => ({ ...s, '5min': true }))
          }
          if (next === 60 && !timeAlertShown['1min']) {
            toast.error('🔴 Còn 1 phút!', { duration: 8000 })
            setTimeAlertShown(s => ({ ...s, '1min': true }))
          }
          if (next <= 1) { handleSubmit(); return 0 }
          return next
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeRemaining, examStarted])

  // End time check
  useEffect(() => {
    if (exam && exam.end_time && examStarted) {
      const checkInterval = setInterval(() => {
        if (new Date() >= new Date(exam.end_time)) handleSubmit()
      }, 1000)
      return () => clearInterval(checkInterval)
    }
  }, [exam, examStarted])

  const initializeExam = async () => {
    try {
      const examData = await examApi.getExamById(id!)
      const assignments = await examApi.getAssignedExams(undefined, false)
      const assignment = assignments.find((a: any) => a.exam_id === id)
      const startTime = assignment?.start_time || examData.start_time
      const endTime = assignment?.end_time || examData.end_time

      if (!startTime) { toast.error('Bài thi chưa được giao'); navigate('/student/exams'); return }

      const now = new Date()
      const startTimeDate = new Date(startTime)
      const fiveMinutesBefore = new Date(startTimeDate.getTime() - 5 * 60 * 1000)

      if (now < fiveMinutesBefore) {
        toast.error(`Bài thi sẽ bắt đầu lúc ${startTimeDate.toLocaleString('vi-VN')}. Bạn có thể truy cập trước 5 phút.`)
        navigate('/student/exams'); return
      }
      if (endTime && new Date(endTime) < now) {
        toast.error('Bài thi đã kết thúc'); navigate('/student/exams'); return
      }

      const examWithTimes = { ...examData, start_time: startTime, end_time: endTime }
      setExam(examWithTimes)

      if (now < startTimeDate) {
        setCountdownBeforeStart(Math.floor((startTimeDate.getTime() - now.getTime()) / 1000))
        setExamStarted(false)
      } else {
        setExamStarted(true)
      }

      const questionsData = await examApi.getQuestions(id!)
      const sortedByType = [...questionsData].sort((a, b) => {
        const order: Record<string, number> = { multiple_choice: 1, true_false_multi: 2, short_answer: 3 }
        return (order[a.question_type] || 0) - (order[b.question_type] || 0)
      })

      let shuffled = sortedByType
      if (examData.shuffle_questions) {
        const grouped: Record<string, any[]> = {}
        sortedByType.forEach(q => {
          if (!grouped[q.question_type]) grouped[q.question_type] = []
          grouped[q.question_type].push(q)
        })
        shuffled = []
        Object.keys(grouped).forEach(type => {
          shuffled.push(...[...grouped[type]].sort(() => Math.random() - 0.5))
        })
      }
      if (examData.shuffle_answers) {
        shuffled = shuffled.map(q => {
          if ((q.question_type as string) === 'multiple_choice' || (q.question_type as string) === 'true_false_multi') {
            return { ...q, answers: [...(q.answers || [])].sort(() => Math.random() - 0.5) }
          }
          return q
        })
      }
      setQuestions(shuffled)

      if (now >= startTimeDate) {
        try {
          const attemptData = await examApi.startAttempt(id!)
          setAttempt(attemptData)
          setTimeRemaining(examData.duration_minutes * 60)
          loadSavedAnswers(attemptData.id)
        } catch (error: any) {
          toast.error(error.message || 'Lỗi khi bắt đầu làm bài')
        }
      }

      await requestFullscreen()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi khởi tạo bài thi')
      navigate('/student/exams')
    } finally {
      setLoading(false)
    }
  }

  // Start attempt when countdown ends
  useEffect(() => {
    if (examStarted && !attempt && exam && id) {
      const startAttempt = async () => {
        try {
          const attemptData = await examApi.startAttempt(id)
          setAttempt(attemptData)
          setTimeRemaining(exam.duration_minutes * 60)
          loadSavedAnswers(attemptData.id)
        } catch (error: any) {
          toast.error(error.message || 'Lỗi khi bắt đầu làm bài')
        }
      }
      startAttempt()
    }
  }, [examStarted, attempt, exam, id])

  const handleAnswerSelect = async (questionId: string, answerId: string) => {
    const newSA = { ...selectedAnswers, [questionId]: answerId }
    setSelectedAnswers(newSA)
    if (attempt) {
      saveAnswersToLocal(newSA, shortAnswers, attempt.id)
      try { await examApi.submitResponse(attempt.id, questionId, answerId) } catch { /* ignore */ }
    }
  }

  const handleTrueFalseSelect = async (questionId: string, answerId: string, value: 'true' | 'false') => {
    const key = `${questionId}-${answerId}`
    const newSA = { ...selectedAnswers, [key]: value }
    setSelectedAnswers(newSA)
    if (attempt) {
      saveAnswersToLocal(newSA, shortAnswers, attempt.id)
      try { await examApi.submitResponse(attempt.id, questionId, answerId, value) } catch { /* ignore */ }
    }
  }

  const handleShortAnswerChange = async (questionId: string, answerArray: string[]) => {
    const newSHA = { ...shortAnswers, [questionId]: answerArray }
    setShortAnswers(newSHA)
    const textAnswer = answerArray.join('')
    if (attempt) {
      saveAnswersToLocal(selectedAnswers, newSHA, attempt.id)
      if (textAnswer) {
        try { await examApi.submitResponse(attempt.id, questionId, null, textAnswer) } catch { /* ignore */ }
      }
    }
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const currentAttempt = attemptRef.current
      const currentExam = examRef.current
      const currentTime = timeRemainingRef.current
      if (currentAttempt) {
        const timeSpent = (currentExam?.duration_minutes || 0) * 60 - currentTime
        await examApi.submitExam(currentAttempt.id, timeSpent, violationsRef.current)
        localStorage.removeItem(`exam_answers_${currentAttempt.id}`)
        toast.success('Nộp bài thành công')
        navigate(`/student/exams/${id}/result`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nộp bài')
    } finally {
      setSubmitting(false)
    }
  }, [submitting, id, navigate])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const getQuestionStatus = (questionId: string, questionType: string) => {
    if (questionType === 'short_answer') return shortAnswers[questionId]?.some(v => v) ? 'answered' : 'unanswered'
    if (questionType === 'true_false_multi') {
      const q = questions.find(q => q.id === questionId)
      const hasAnswer = q?.answers?.some((a: any) => selectedAnswers[`${questionId}-${a.id}`])
      return hasAnswer ? 'answered' : 'unanswered'
    }
    return selectedAnswers[questionId] ? 'answered' : 'unanswered'
  }

  const scrollToQuestion = (idx: number) => {
    setCurrentQuestionIndex(idx)
    if (viewMode === 'all') {
      const q = questions[idx]
      const el = questionRefs.current[q?.id]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-lg font-medium text-gray-700 mt-4">Đang tải bài thi...</p>
        </div>
      </div>
    )
  }

  if (!examStarted && countdownBeforeStart > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center bg-white rounded-2xl shadow-2xl p-12 max-w-lg mx-4">
          <Clock className="h-16 w-16 text-primary-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{exam?.title}</h1>
          <p className="text-lg text-gray-600 mb-4">Bài thi sẽ bắt đầu sau:</p>
          <div className="text-7xl font-bold text-primary-600 mb-8 font-mono">{formatTime(countdownBeforeStart)}</div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Vui lòng chờ đợi. Bạn sẽ được tự động chuyển đến trang làm bài khi đến giờ.</p>
          </div>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const answeredCount = questions.filter(q => getQuestionStatus(q.id, q.question_type) === 'answered').length
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0

  const mcQuestions = questions.filter(q => q.question_type === 'multiple_choice')
  const tfQuestions = questions.filter(q => q.question_type === 'true_false_multi')
  const saQuestions = questions.filter(q => q.question_type === 'short_answer')

  const renderQuestionCard = (question: any, globalIdx: number) => {
    const isCurrentInSingle = viewMode === 'single' && globalIdx === currentQuestionIndex
    return (
      <div
        key={question.id}
        ref={el => { questionRefs.current[question.id] = el }}
        id={`question-${question.id}`}
        className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden transition-all ${viewMode === 'single' ? 'border-gray-200' :
          getQuestionStatus(question.id, question.question_type) === 'answered'
            ? 'border-green-300' : 'border-gray-200'
          } ${isCurrentInSingle ? 'ring-2 ring-primary-300' : ''}`}
      >
        {/* Question Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                <span className="text-white font-bold text-sm">Câu {globalIdx + 1}</span>
              </div>
              <span className="text-white/90 text-sm font-medium">
                {question.question_type === 'multiple_choice' && 'Trắc nghiệm'}
                {question.question_type === 'true_false_multi' && 'Đúng/Sai'}
                {question.question_type === 'short_answer' && 'Trả lời ngắn'}
              </span>
            </div>
            {getQuestionStatus(question.id, question.question_type) === 'answered' && (
              <div className="bg-green-500 rounded-full p-1.5">
                <CheckCircle className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Question Content */}
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 leading-relaxed">{question.content}</h2>
          {question.image_url && (
            <div className="mb-6 flex justify-center bg-gray-50 p-4 rounded-xl border-2 border-gray-200">
              <img src={question.image_url} alt="Question" className="max-w-full max-h-[400px] rounded-lg shadow-md object-contain" />
            </div>
          )}

          {/* Multiple Choice */}
          {question.question_type === 'multiple_choice' && (
            <div className="space-y-3">
              {question.answers?.map((answer: any, aidx: number) => (
                <label
                  key={answer.id}
                  className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${selectedAnswers[question.id] === answer.id
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                    }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-4 mt-0.5 font-bold transition-all ${selectedAnswers[question.id] === answer.id ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {String.fromCharCode(65 + aidx)}
                  </div>
                  <input type="radio" name={`question-${question.id}`} value={answer.id}
                    checked={selectedAnswers[question.id] === answer.id}
                    onChange={() => handleAnswerSelect(question.id, answer.id)}
                    className="sr-only" />
                  <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                </label>
              ))}
            </div>
          )}

          {/* True/False Multi */}
          {question.question_type === 'true_false_multi' && (
            <div className="space-y-3">
              {question.answers?.map((answer: any, aidx: number) => (
                <div key={answer.id} className="border-2 border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start flex-1">
                      <span className="font-bold text-primary-600 mr-3 mt-0.5 min-w-[24px]">{String.fromCharCode(97 + aidx)}.</span>
                      <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all font-semibold text-sm select-none ${selectedAnswers[`${question.id}-${answer.id}`] === 'true'
                        ? 'bg-green-100 border-2 border-green-500 text-green-700'
                        : 'bg-gray-50 border-2 border-gray-200 hover:border-green-300 text-gray-600'
                        }`}>
                        <input type="radio" name={`tf-${question.id}-${answer.id}`}
                          checked={selectedAnswers[`${question.id}-${answer.id}`] === 'true'}
                          onChange={() => handleTrueFalseSelect(question.id, answer.id, 'true')}
                          className="sr-only" />
                        Đúng
                      </label>
                      <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all font-semibold text-sm select-none ${selectedAnswers[`${question.id}-${answer.id}`] === 'false'
                        ? 'bg-red-100 border-2 border-red-500 text-red-700'
                        : 'bg-gray-50 border-2 border-gray-200 hover:border-red-300 text-gray-600'
                        }`}>
                        <input type="radio" name={`tf-${question.id}-${answer.id}`}
                          checked={selectedAnswers[`${question.id}-${answer.id}`] === 'false'}
                          onChange={() => handleTrueFalseSelect(question.id, answer.id, 'false')}
                          className="sr-only" />
                        Sai
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Short Answer */}
          {question.question_type === 'short_answer' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <p className="text-sm text-blue-800 mb-4 font-medium">Nhập đáp án số vào 4 ô bên dưới (chỉ nhập: - . 0-9)</p>
              <div className="flex gap-3 justify-center">
                {[0, 1, 2, 3].map(idx => (
                  <input
                    key={idx} type="text" maxLength={1}
                    value={shortAnswers[question.id]?.[idx] || ''}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || /[-.0-9]/.test(value)) {
                        const current = shortAnswers[question.id] || ['', '', '', '']
                        const updated: string[] = [...current]
                        updated[idx] = value
                        const newSHA: Record<string, string[]> = { ...shortAnswers, [question.id]: updated }
                        setShortAnswers(newSHA)
                        handleShortAnswerChange(question.id, updated)
                      }
                    }}
                    onKeyDown={e => {
                      if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key) && !/[-.0-9]/.test(e.key)) {
                        e.preventDefault()
                      }
                    }}
                    className="w-20 h-20 text-center text-3xl font-bold border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 transition-all bg-white shadow-sm"
                    placeholder="?"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation (single mode only) */}
        {viewMode === 'single' && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between">
            <button
              onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
              disabled={currentQuestionIndex === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white border-2 border-gray-300 hover:border-primary-500 hover:bg-primary-50 text-gray-700 hover:text-primary-700"
            >
              <ChevronLeft className="h-5 w-5" />
              Câu trước
            </button>
            {currentQuestionIndex < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg"
              >
                Câu sau <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg disabled:opacity-50"
              >
                <CheckCircle className="h-5 w-5" />
                {submitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Violation Alert Banner */}
      {currentViolation && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <div>
              <p className="font-semibold">⚠️ Cảnh báo vi phạm!</p>
              <p className="text-sm text-red-100">{currentViolation.description} — Số lần vi phạm: {violationCount}/5</p>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Warning */}
      {!isFullscreen && examStarted && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cảnh báo!</h2>
              <p className="text-gray-600">Bạn đã thoát khỏi chế độ toàn màn hình. Đây là một vi phạm quy định thi.</p>
            </div>
            <button onClick={requestFullscreen}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
              <Maximize2 className="h-5 w-5" />
              Quay lại chế độ toàn màn hình
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`sticky top-0 z-50 bg-white shadow-lg border-b border-gray-200 ${currentViolation ? 'mt-14' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="bg-primary-100 p-2 rounded-lg flex-shrink-0">
                <FileText className="h-6 w-6 text-primary-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 truncate">{exam?.title}</h1>
                <p className="text-xs text-gray-500">Đã làm: {answeredCount}/{questions.length} câu</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('single')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'single' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Từng câu"
                >
                  <AlignJustify className="h-4 w-4" />
                  <span className="hidden sm:inline">Từng câu</span>
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Tất cả"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Tất cả</span>
                </button>
              </div>

              {violationCount > 0 && (
                <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700">Vi phạm: {violationCount}</span>
                </div>
              )}

              {/* Timer */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold transition-all ${timeRemaining < 60 ? 'bg-red-600 text-white animate-pulse' :
                timeRemaining < 300 ? 'bg-red-100 text-red-700 border border-red-300' :
                  timeRemaining < 900 ? 'bg-orange-100 text-orange-700 border border-orange-300' :
                    'bg-green-100 text-green-700 border border-green-300'
                }`}>
                <Clock className="h-5 w-5" />
                <span className="text-lg">{formatTime(timeRemaining)}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${progress >= 80 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                  progress >= 50 ? 'bg-gradient-to-r from-primary-500 to-primary-600' :
                    'bg-gradient-to-r from-orange-400 to-orange-500'
                  }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Questions */}
          <div className="lg:col-span-3 space-y-4">
            {viewMode === 'single' ? (
              /* Single mode */
              currentQuestion && renderQuestionCard(currentQuestion, currentQuestionIndex)
            ) : (
              /* All mode */
              <div className="space-y-8">
                {mcQuestions.length > 0 && (
                  <div>
                    <div className="sticky top-[84px] z-10 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 rounded-xl shadow-md mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">Phần I</span>
                        <span className="font-semibold">Trắc nghiệm 4 phương án</span>
                      </div>
                      <span className="text-blue-100 text-sm bg-white/10 px-2 py-0.5 rounded-full">{mcQuestions.length} câu</span>
                    </div>
                    <div className="space-y-4">
                      {mcQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        return renderQuestionCard(q, globalIdx)
                      })}
                    </div>
                  </div>
                )}
                {tfQuestions.length > 0 && (
                  <div>
                    <div className="sticky top-[84px] z-10 bg-gradient-to-r from-green-600 to-green-700 text-white px-5 py-3 rounded-xl shadow-md mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">Phần II</span>
                        <span className="font-semibold">Đúng / Sai</span>
                      </div>
                      <span className="text-green-100 text-sm bg-white/10 px-2 py-0.5 rounded-full">{tfQuestions.length} câu</span>
                    </div>
                    <div className="space-y-4">
                      {tfQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        return renderQuestionCard(q, globalIdx)
                      })}
                    </div>
                  </div>
                )}
                {saQuestions.length > 0 && (
                  <div>
                    <div className="sticky top-[84px] z-10 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-5 py-3 rounded-xl shadow-md mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">Phần III</span>
                        <span className="font-semibold">Trả lời ngắn</span>
                      </div>
                      <span className="text-purple-100 text-sm bg-white/10 px-2 py-0.5 rounded-full">{saQuestions.length} câu</span>
                    </div>
                    <div className="space-y-4">
                      {saQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        return renderQuestionCard(q, globalIdx)
                      })}
                    </div>
                  </div>
                )}
                {/* Submit in all mode */}
                <div className="text-center pt-4">
                  <button
                    onClick={handleSubmit} disabled={submitting}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-12 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-3 mx-auto text-lg"
                  >
                    <CheckCircle className="h-6 w-6" />
                    {submitting ? 'Đang nộp...' : 'Nộp bài'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 sticky top-24">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-900">Danh sách câu hỏi</h3>
                <p className="text-xs text-gray-500 mt-1">{answeredCount}/{questions.length} câu đã làm</p>
              </div>
              <div className="p-4 max-h-[calc(100vh-260px)] overflow-y-auto">
                {/* Type segments */}
                {mcQuestions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-blue-600 mb-2 uppercase">Trắc nghiệm</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {mcQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        const status = getQuestionStatus(q.id, q.question_type)
                        const isCurrent = viewMode === 'single' && globalIdx === currentQuestionIndex
                        return (
                          <button key={q.id} onClick={() => scrollToQuestion(globalIdx)}
                            className={`aspect-square rounded-lg font-semibold text-sm transition-all ${isCurrent ? 'bg-primary-600 text-white shadow-lg scale-110 ring-2 ring-primary-200' :
                              status === 'answered' ? 'bg-green-100 text-green-700 border-2 border-green-300 hover:bg-green-200' :
                                'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'}`}>
                            {globalIdx + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {tfQuestions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-green-600 mb-2 uppercase">Đúng/Sai</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {tfQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        const status = getQuestionStatus(q.id, q.question_type)
                        const isCurrent = viewMode === 'single' && globalIdx === currentQuestionIndex
                        return (
                          <button key={q.id} onClick={() => scrollToQuestion(globalIdx)}
                            className={`aspect-square rounded-lg font-semibold text-sm transition-all ${isCurrent ? 'bg-primary-600 text-white shadow-lg scale-110 ring-2 ring-primary-200' :
                              status === 'answered' ? 'bg-green-100 text-green-700 border-2 border-green-300 hover:bg-green-200' :
                                'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'}`}>
                            {globalIdx + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {saQuestions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-purple-600 mb-2 uppercase">Trả lời ngắn</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {saQuestions.map((q) => {
                        const globalIdx = questions.findIndex(gq => gq.id === q.id)
                        const status = getQuestionStatus(q.id, q.question_type)
                        const isCurrent = viewMode === 'single' && globalIdx === currentQuestionIndex
                        return (
                          <button key={q.id} onClick={() => scrollToQuestion(globalIdx)}
                            className={`aspect-square rounded-lg font-semibold text-sm transition-all ${isCurrent ? 'bg-primary-600 text-white shadow-lg scale-110 ring-2 ring-primary-200' :
                              status === 'answered' ? 'bg-green-100 text-green-700 border-2 border-green-300 hover:bg-green-200' :
                                'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'}`}>
                            {globalIdx + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-300" /><span className="text-gray-500">Đã làm</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /><span className="text-gray-500">Chưa làm</span></div>
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={handleSubmit} disabled={submitting}
                  className="w-full py-2.5 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {submitting ? 'Đang nộp...' : 'Nộp bài'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
