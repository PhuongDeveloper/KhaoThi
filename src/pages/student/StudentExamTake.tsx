import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { useAntiCheat } from '../../hooks/useAntiCheat'
import toast from 'react-hot-toast'
import { Clock, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, FileText, Maximize2 } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

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

  const { violations, violationCount, currentViolation, requestFullscreen, isFullscreen } = useAntiCheat({
    onViolation: (violation) => {
      // Violation detected
      // Hiển thị toast với thông báo chi tiết
      toast.error(`Vi phạm: ${violation.description}`, {
        duration: 5000,
        icon: '⚠️',
      })
    },
    onMaxViolations: () => {
      toast.error('Bạn đã vi phạm quá nhiều lần. Bài thi sẽ tự động nộp.')
      handleSubmit()
    },
    requireFullscreen: true,
    attemptId: attempt?.id,
  })

  useEffect(() => {
    if (id) {
      initializeExam()
    }
  }, [id])

  useEffect(() => {
    if (countdownBeforeStart > 0 && !examStarted) {
      const timer = setInterval(() => {
        setCountdownBeforeStart((prev) => {
          if (prev <= 1) {
            setExamStarted(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [countdownBeforeStart, examStarted])

  useEffect(() => {
    if (timeRemaining > 0 && examStarted) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeRemaining, examStarted])

  useEffect(() => {
    if (exam && exam.end_time && examStarted) {
      const checkInterval = setInterval(() => {
        const now = new Date()
        const endTime = new Date(exam.end_time)
        if (now >= endTime) {
          handleSubmit()
        }
      }, 1000)
      return () => clearInterval(checkInterval)
    }
  }, [exam, examStarted])

  const initializeExam = async () => {
    try {
      const examData = await examApi.getExamById(id!)
      
      // Lấy assignment để có start_time và end_time chính xác
      const assignments = await examApi.getAssignedExams(undefined, false)
      const assignment = assignments.find((a: any) => a.exam_id === id)
      
      // Sử dụng start_time và end_time từ assignment nếu có, nếu không thì dùng từ exam
      const startTime = assignment?.start_time || examData.start_time
      const endTime = assignment?.end_time || examData.end_time
      
      if (!startTime) {
        toast.error('Bài thi chưa được giao')
        navigate('/student/exams')
        return
      }

      const now = new Date()
      const startTimeDate = new Date(startTime)
      const fiveMinutesBefore = new Date(startTimeDate.getTime() - 5 * 60 * 1000)

      if (now < fiveMinutesBefore) {
        toast.error(`Bài thi sẽ bắt đầu lúc ${startTimeDate.toLocaleString('vi-VN')}. Bạn có thể truy cập trước 5 phút.`)
        navigate('/student/exams')
        return
      }

      if (endTime && new Date(endTime) < now) {
        toast.error('Bài thi đã kết thúc')
        navigate('/student/exams')
        return
      }

      // Cập nhật exam với start_time và end_time từ assignment
      const examWithTimes = {
        ...examData,
        start_time: startTime,
        end_time: endTime,
      }
      setExam(examWithTimes)

      if (now < startTimeDate) {
        const secondsUntilStart = Math.floor((startTimeDate.getTime() - now.getTime()) / 1000)
        setCountdownBeforeStart(secondsUntilStart)
        setExamStarted(false)
      } else {
        setExamStarted(true)
      }

      const questionsData = await examApi.getQuestions(id!)
      const sortedByType = [...questionsData].sort((a, b) => {
        const order: Record<string, number> = {
          multiple_choice: 1,
          true_false_multi: 2,
          short_answer: 3,
        }
        return (order[a.question_type] || 0) - (order[b.question_type] || 0)
      })

      let shuffledQuestions = sortedByType
      if (examData.shuffle_questions) {
        const groupedByType: Record<string, any[]> = {}
        sortedByType.forEach((q) => {
          if (!groupedByType[q.question_type]) {
            groupedByType[q.question_type] = []
          }
          groupedByType[q.question_type].push(q)
        })

        shuffledQuestions = []
        Object.keys(groupedByType).forEach((type) => {
          const shuffled = [...groupedByType[type]].sort(() => Math.random() - 0.5)
          shuffledQuestions.push(...shuffled)
        })
      }

      if (examData.shuffle_answers) {
        shuffledQuestions = shuffledQuestions.map((q) => {
          const questionType = q.question_type as string
          if (questionType === 'multiple_choice' || questionType === 'true_false_multi') {
            return {
              ...q,
              answers: [...(q.answers || [])].sort(() => Math.random() - 0.5),
            }
          }
          return q
        })
      }

      setQuestions(shuffledQuestions)

      if (now >= startTimeDate) {
        try {
          const attemptData = await examApi.startAttempt(id!)
          setAttempt(attemptData)
          const durationSeconds = examData.duration_minutes * 60
          setTimeRemaining(durationSeconds)
        } catch (error: any) {
          // Nếu lỗi RLS, thử lại với student_id từ profile
          if (error.message?.includes('row-level security')) {
            // RLS error, retrying
            // Không cần làm gì, vì startAttempt đã tự động dùng auth.uid()
            toast.error('Lỗi khi bắt đầu làm bài. Vui lòng thử lại.')
          } else {
            throw error
          }
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

  useEffect(() => {
    if (examStarted && !attempt && exam && id) {
      const startAttempt = async () => {
        try {
          const attemptData = await examApi.startAttempt(id)
          setAttempt(attemptData)
          const durationSeconds = exam.duration_minutes * 60
          setTimeRemaining(durationSeconds)
        } catch (error: any) {
          toast.error(error.message || 'Lỗi khi bắt đầu làm bài')
        }
      }
      startAttempt()
    }
  }, [examStarted, attempt, exam, id])

  const handleAnswerSelect = async (questionId: string, answerId: string) => {
    setSelectedAnswers({ ...selectedAnswers, [questionId]: answerId })

    if (attempt) {
      try {
        await examApi.submitResponse(attempt.id, questionId, answerId)
      } catch (error) {
        // Ignore errors
      }
    }
  }

  const handleTrueFalseSelect = async (questionId: string, answerId: string, value: 'true' | 'false') => {
    const key = `${questionId}-${answerId}`
    setSelectedAnswers({ ...selectedAnswers, [key]: value })

    if (attempt) {
      try {
        await examApi.submitResponse(attempt.id, questionId, answerId, value)
      } catch (error) {
        // Ignore errors
      }
    }
  }

  const handleShortAnswerChange = async (questionId: string, answerArray: string[]) => {
    setShortAnswers({ ...shortAnswers, [questionId]: answerArray })
    const textAnswer = answerArray.join('')
    
    if (attempt && textAnswer) {
      try {
        await examApi.submitResponse(attempt.id, questionId, null, textAnswer)
      } catch (error) {
        // Ignore errors
      }
    }
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return

    setSubmitting(true)
    try {
      if (attempt) {
        const timeSpent = exam.duration_minutes * 60 - timeRemaining
        await examApi.submitExam(attempt.id, timeSpent, violations)
        toast.success('Nộp bài thành công')
        navigate(`/student/exams/${id}/result`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nộp bài')
    } finally {
      setSubmitting(false)
    }
  }, [attempt, exam, timeRemaining, violations, id, navigate, submitting])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getQuestionStatus = (questionId: string, questionType: string) => {
    if (questionType === 'short_answer') {
      return shortAnswers[questionId]?.some(v => v) ? 'answered' : 'unanswered'
    }
    if (questionType === 'true_false_multi') {
      const hasAnswer = questions.find(q => q.id === questionId)?.answers?.some((a: any) => 
        selectedAnswers[`${questionId}-${a.id}`]
      )
      return hasAnswer ? 'answered' : 'unanswered'
    }
    return selectedAnswers[questionId] ? 'answered' : 'unanswered'
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
          <div className="mb-6">
            <Clock className="h-16 w-16 text-primary-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{exam?.title}</h1>
            <p className="text-lg text-gray-600">Bài thi sẽ bắt đầu sau:</p>
          </div>
          <div className="text-7xl font-bold text-primary-600 mb-8 font-mono">
            {formatTime(countdownBeforeStart)}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Vui lòng chờ đợi. Bạn sẽ được tự động chuyển đến trang làm bài khi đến giờ.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100
  const answeredCount = questions.filter(q => getQuestionStatus(q.id, q.question_type) === 'answered').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Violation Alert Banner */}
      {currentViolation && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white shadow-lg animate-slideDown">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 animate-pulse" />
                <div>
                  <p className="font-semibold">⚠️ Cảnh báo vi phạm!</p>
                  <p className="text-sm text-red-100">{currentViolation.description}</p>
                  <p className="text-xs text-red-200 mt-1">
                    Số lần vi phạm: {violationCount}/5
                  </p>
                </div>
              </div>
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
              <p className="text-gray-600">
                Bạn đã thoát khỏi chế độ toàn màn hình. Đây là một vi phạm quy định thi.
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 font-medium mb-2">Lưu ý:</p>
              <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                <li>Bạn phải ở chế độ toàn màn hình trong suốt quá trình thi</li>
                <li>Vi phạm nhiều lần có thể dẫn đến đình chỉ thi</li>
              </ul>
            </div>
            <button
              onClick={requestFullscreen}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Maximize2 className="h-5 w-5" />
              <span>Quay lại chế độ toàn màn hình</span>
            </button>
          </div>
        </div>
      )}

      {/* Fixed Header */}
      <div className={`sticky top-0 z-50 bg-white shadow-lg border-b border-gray-200 ${currentViolation ? 'mt-14' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex items-center space-x-3">
                <div className="bg-primary-100 p-2 rounded-lg">
                  <FileText className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 line-clamp-1">{exam?.title}</h1>
                  <p className="text-xs text-gray-500">
                    Câu {currentQuestionIndex + 1}/{questions.length} • Đã làm: {answeredCount}/{questions.length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {violationCount > 0 && (
                <div className="flex items-center space-x-2 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700">
                    Vi phạm: {violationCount}
                  </span>
                </div>
              )}
              <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono font-bold ${
                timeRemaining < 300 ? 'bg-red-100 text-red-700 border border-red-300' : 
                timeRemaining < 600 ? 'bg-orange-100 text-orange-700 border border-orange-300' :
                'bg-green-100 text-green-700 border border-green-300'
              }`}>
                <Clock className="h-5 w-5" />
                <span className="text-lg">{formatTime(timeRemaining)}</span>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {currentQuestion && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                {/* Question Header */}
                <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                        <span className="text-white font-bold text-sm">
                          Câu {currentQuestionIndex + 1}
                        </span>
                      </div>
                      <span className="text-white/90 text-sm font-medium">
                        {currentQuestion.question_type === 'multiple_choice' && 'Trắc nghiệm'}
                        {currentQuestion.question_type === 'true_false_multi' && 'Đúng/Sai'}
                        {currentQuestion.question_type === 'short_answer' && 'Trả lời ngắn'}
                      </span>
                    </div>
                    {getQuestionStatus(currentQuestion.id, currentQuestion.question_type) === 'answered' && (
                      <div className="bg-green-500 rounded-full p-1.5">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Question Content */}
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 leading-relaxed">
                    {currentQuestion.content}
                  </h2>

                  {/* Image */}
                  {currentQuestion.image_url && (
                    <div className="mb-6 flex justify-center bg-gray-50 p-4 rounded-xl border-2 border-gray-200">
                      <img 
                        src={currentQuestion.image_url} 
                        alt="Question" 
                        className="max-w-full max-h-[400px] rounded-lg shadow-md object-contain"
                      />
                    </div>
                  )}

                  {/* Multiple Choice */}
                  {currentQuestion.question_type === 'multiple_choice' && (
                    <div className="space-y-3">
                      {currentQuestion.answers?.map((answer: any, idx: number) => (
                        <label
                          key={answer.id}
                          className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedAnswers[currentQuestion.id] === answer.id
                              ? 'border-primary-500 bg-primary-50 shadow-md'
                              : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-4 mt-0.5 ${
                            selectedAnswers[currentQuestion.id] === answer.id
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <input
                            type="radio"
                            name={`question-${currentQuestion.id}`}
                            value={answer.id}
                            checked={selectedAnswers[currentQuestion.id] === answer.id}
                            onChange={() => handleAnswerSelect(currentQuestion.id, answer.id)}
                            className="sr-only"
                          />
                          <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* True/False Multi */}
                  {currentQuestion.question_type === 'true_false_multi' && (
                    <div className="space-y-4">
                      {currentQuestion.answers?.map((answer: any, idx: number) => (
                        <div
                          key={answer.id}
                          className="border-2 border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-start flex-1">
                              <span className="font-semibold text-primary-600 mr-3 mt-1 min-w-[24px]">
                                {String.fromCharCode(97 + idx)}.
                              </span>
                              <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                            </div>
                            <div className="flex items-center space-x-3 ml-4">
                              <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all ${
                                selectedAnswers[`${currentQuestion.id}-${answer.id}`] === 'true'
                                  ? 'bg-green-100 border-2 border-green-500'
                                  : 'bg-gray-50 border-2 border-gray-200 hover:border-green-300'
                              }`}>
                                <input
                                  type="radio"
                                  name={`tf-${currentQuestion.id}-${answer.id}`}
                                  checked={selectedAnswers[`${currentQuestion.id}-${answer.id}`] === 'true'}
                                  onChange={() => {
                                    handleTrueFalseSelect(currentQuestion.id, answer.id, 'true')
                                  }}
                                  className="sr-only"
                                />
                                <span className="text-green-700 font-semibold">Đúng</span>
                              </label>
                              <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all ${
                                selectedAnswers[`${currentQuestion.id}-${answer.id}`] === 'false'
                                  ? 'bg-red-100 border-2 border-red-500'
                                  : 'bg-gray-50 border-2 border-gray-200 hover:border-red-300'
                              }`}>
                                <input
                                  type="radio"
                                  name={`tf-${currentQuestion.id}-${answer.id}`}
                                  checked={selectedAnswers[`${currentQuestion.id}-${answer.id}`] === 'false'}
                                  onChange={() => {
                                    handleTrueFalseSelect(currentQuestion.id, answer.id, 'false')
                                  }}
                                  className="sr-only"
                                />
                                <span className="text-red-700 font-semibold">Sai</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Short Answer */}
                  {currentQuestion.question_type === 'short_answer' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                      <p className="text-sm text-blue-800 mb-4 font-medium">
                        Nhập đáp án số vào 4 ô bên dưới (chỉ nhập: - . 0-9)
                      </p>
                      <div className="flex gap-3 justify-center">
                        {[0, 1, 2, 3].map((idx) => (
                          <input
                            key={idx}
                            type="text"
                            maxLength={1}
                            value={shortAnswers[currentQuestion.id]?.[idx] || ''}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value === '' || /[-.0-9]/.test(value)) {
                                const current = shortAnswers[currentQuestion.id] || ['', '', '', '']
                                const newShortAnswers = { ...shortAnswers }
                                newShortAnswers[currentQuestion.id] = [...current]
                                newShortAnswers[currentQuestion.id][idx] = value
                                setShortAnswers(newShortAnswers)
                                handleShortAnswerChange(currentQuestion.id, newShortAnswers[currentQuestion.id])
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key) && !/[-.0-9]/.test(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            className="w-20 h-20 text-center text-3xl font-bold border-3 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 transition-all bg-white shadow-sm"
                            placeholder="?"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between">
                  <button
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white border-2 border-gray-300 hover:border-primary-500 hover:bg-primary-50 text-gray-700 hover:text-primary-700"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Câu trước</span>
                  </button>

                  {currentQuestionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg"
                    >
                      <span>Câu sau</span>
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-all bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                      <CheckCircle className="h-5 w-5" />
                      <span>{submitting ? 'Đang nộp...' : 'Nộp bài'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Question List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 sticky top-24">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-900">Danh sách câu hỏi</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {answeredCount}/{questions.length} câu đã làm
                </p>
              </div>
              <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const status = getQuestionStatus(q.id, q.question_type)
                    const isCurrent = idx === currentQuestionIndex
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentQuestionIndex(idx)}
                        className={`aspect-square rounded-lg font-semibold text-sm transition-all ${
                          isCurrent
                            ? 'bg-primary-600 text-white shadow-lg scale-110 ring-4 ring-primary-200'
                            : status === 'answered'
                            ? 'bg-green-100 text-green-700 border-2 border-green-300 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
                    <span className="text-gray-600">Đã làm</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300"></div>
                    <span className="text-gray-600">Chưa làm</span>
                  </div>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{submitting ? 'Đang nộp...' : 'Nộp bài'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
