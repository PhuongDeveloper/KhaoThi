import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { Clock, CheckCircle, ChevronLeft, ChevronRight, X, Eye } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function ExamPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  
  const [exam, setExam] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [attempt, setAttempt] = useState<any>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [shortAnswers, setShortAnswers] = useState<Record<string, string[]>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [examStarted, setExamStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, string>>({})
  const [startTime, setStartTime] = useState<Date | null>(null)

  useEffect(() => {
    if (id) {
      initializeExam()
    }
  }, [id])

  useEffect(() => {
    if (timeRemaining > 0 && examStarted && !submitted) {
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
  }, [timeRemaining, examStarted, submitted])

  const initializeExam = async () => {
    try {
      const examData = await examApi.getExamById(id!)
      setExam(examData)

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
          if (q.question_type === 'multiple_choice' || q.question_type === 'true_false_multi') {
            return {
              ...q,
              answers: [...(q.answers || [])].sort(() => Math.random() - 0.5),
            }
          }
          return q
        })
      }

      setQuestions(shuffledQuestions)

      // Lấy đáp án đúng để hiển thị sau khi submit
      const correctAnswersMap: Record<string, string> = {}
      shuffledQuestions.forEach((q) => {
        if (q.question_type === 'multiple_choice') {
          const correctAnswer = q.answers?.find((a: any) => a.is_correct)
          if (correctAnswer) {
            correctAnswersMap[q.id] = correctAnswer.id
          }
        } else if (q.question_type === 'true_false_multi') {
          q.answers?.forEach((a: any) => {
            if (a.is_correct !== null) {
              correctAnswersMap[`${q.id}-${a.id}`] = a.is_correct ? 'true' : 'false'
            }
          })
        } else if (q.question_type === 'short_answer') {
          // Short answer sẽ được chấm sau
        }
      })
      setCorrectAnswers(correctAnswersMap)

      // Tạo attempt để có thể submit
      try {
        const attemptData = await examApi.startAttempt(id!)
        setAttempt(attemptData)
        const durationSeconds = examData.duration_minutes * 60
        setTimeRemaining(durationSeconds)
        setExamStarted(true)
        setStartTime(new Date())
      } catch (error: any) {
        toast.error('Lỗi khi khởi tạo preview. Vui lòng thử lại.')
        console.error(error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi khởi tạo bài thi')
      navigate(`${basePath}/exams`)
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerSelect = async (questionId: string, answerId: string) => {
    setSelectedAnswers({ ...selectedAnswers, [questionId]: answerId })

    if (attempt) {
      try {
        await examApi.submitResponse(attempt.id, questionId, answerId)
      } catch (error) {
        console.error('Error saving response:', error)
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
        console.error('Error saving true/false response:', error)
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
        console.error('Error saving short answer:', error)
      }
    }
  }

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return

    setSubmitting(true)
    try {
      if (attempt) {
        const timeSpent = startTime ? Math.floor((new Date().getTime() - startTime.getTime()) / 1000) : 0
        await examApi.submitExam(attempt.id, timeSpent, [])
        
        // Tính điểm
        let totalScore = 0
        let maxScore = 0
        
        questions.forEach((q) => {
          if (q.question_type === 'multiple_choice') {
            maxScore += exam.multiple_choice_score || 0
            const selected = selectedAnswers[q.id]
            const correct = correctAnswers[q.id]
            if (selected === correct) {
              totalScore += exam.multiple_choice_score || 0
            }
          } else if (q.question_type === 'true_false_multi') {
            q.answers?.forEach((a: any) => {
              maxScore += (exam.true_false_multi_score || 0) / (q.answers?.length || 1)
              const selected = selectedAnswers[`${q.id}-${a.id}`]
              const correct = correctAnswers[`${q.id}-${a.id}`]
              if (selected === correct) {
                totalScore += (exam.true_false_multi_score || 0) / (q.answers?.length || 1)
              }
            })
          } else if (q.question_type === 'short_answer') {
            maxScore += exam.short_answer_score || 0
            // Short answer sẽ được chấm tự động sau khi submit
            // Tạm thời cho điểm tối đa nếu có đáp án
            if (shortAnswers[q.id]?.some(v => v)) {
              totalScore += exam.short_answer_score || 0
            }
          }
        })
        
        const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
        setScore(percentage)
        setSubmitted(true)
        toast.success(`Nộp bài thành công! Điểm: ${percentage}%`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nộp bài')
    } finally {
      setSubmitting(false)
    }
  }, [attempt, startTime, questions, selectedAnswers, shortAnswers, correctAnswers, exam, submitting, submitted])

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

  const isAnswerCorrect = (questionId: string, answerId?: string) => {
    if (!submitted) return null
    const question = questions.find(q => q.id === questionId)
    if (!question) return null
    
    if (question.question_type === 'multiple_choice') {
      return selectedAnswers[questionId] === correctAnswers[questionId]
    } else if (question.question_type === 'true_false_multi' && answerId) {
      return selectedAnswers[`${questionId}-${answerId}`] === correctAnswers[`${questionId}-${answerId}`]
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-lg font-medium text-gray-700 mt-4">Đang tải preview bài thi...</p>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100
  const answeredCount = questions.filter(q => getQuestionStatus(q.id, q.question_type) === 'answered').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Eye className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 line-clamp-1">
                    Preview: {exam?.title}
                  </h1>
                  <p className="text-xs text-gray-500">
                    Câu {currentQuestionIndex + 1}/{questions.length} • Đã làm: {answeredCount}/{questions.length}
                    {submitted && score !== null && (
                      <span className="ml-2 text-green-600 font-semibold">• Điểm: {score}%</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {!submitted && (
                <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono font-bold ${
                  timeRemaining < 300 ? 'bg-red-100 text-red-700 border border-red-300' : 
                  timeRemaining < 600 ? 'bg-orange-100 text-orange-700 border border-orange-300' :
                  'bg-green-100 text-green-700 border border-green-300'
                }`}>
                  <Clock className="h-5 w-5" />
                  <span className="text-lg">{formatTime(timeRemaining)}</span>
                </div>
              )}
              <button
                onClick={() => navigate(`${basePath}/exams`)}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
                <span>Đóng</span>
              </button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-300"
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
                <div className={`px-6 py-4 ${
                  submitted && isAnswerCorrect(currentQuestion.id) === false
                    ? 'bg-red-500'
                    : submitted && isAnswerCorrect(currentQuestion.id) === true
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}>
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
                    {submitted && (
                      <div className={`rounded-full p-1.5 ${
                        isAnswerCorrect(currentQuestion.id) === true
                          ? 'bg-green-600'
                          : isAnswerCorrect(currentQuestion.id) === false
                          ? 'bg-red-600'
                          : 'bg-gray-400'
                      }`}>
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                    {!submitted && getQuestionStatus(currentQuestion.id, currentQuestion.question_type) === 'answered' && (
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
                      {currentQuestion.answers?.map((answer: any, idx: number) => {
                        const isSelected = selectedAnswers[currentQuestion.id] === answer.id
                        const isCorrect = answer.is_correct
                        const showResult = submitted
                        
                        return (
                          <label
                            key={answer.id}
                            className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              showResult && isCorrect
                                ? 'border-green-500 bg-green-50 shadow-md'
                                : showResult && isSelected && !isCorrect
                                ? 'border-red-500 bg-red-50 shadow-md'
                                : isSelected
                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-4 mt-0.5 ${
                              showResult && isCorrect
                                ? 'bg-green-600 text-white'
                                : showResult && isSelected && !isCorrect
                                ? 'bg-red-600 text-white'
                                : isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <input
                              type="radio"
                              name={`question-${currentQuestion.id}`}
                              value={answer.id}
                              checked={isSelected}
                              onChange={() => handleAnswerSelect(currentQuestion.id, answer.id)}
                              disabled={submitted}
                              className="sr-only"
                            />
                            <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                            {showResult && isCorrect && (
                              <span className="ml-2 text-green-600 font-semibold">✓ Đúng</span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  {/* True/False Multi */}
                  {currentQuestion.question_type === 'true_false_multi' && (
                    <div className="space-y-4">
                      {currentQuestion.answers?.map((answer: any, idx: number) => {
                        const selected = selectedAnswers[`${currentQuestion.id}-${answer.id}`]
                        const correct = answer.is_correct ? 'true' : 'false'
                        const showResult = submitted
                        
                        return (
                          <div
                            key={answer.id}
                            className={`border-2 rounded-xl p-4 transition-colors ${
                              showResult && selected === correct
                                ? 'border-green-500 bg-green-50'
                                : showResult && selected && selected !== correct
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-200 hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-start flex-1">
                                <span className="font-semibold text-blue-600 mr-3 mt-1 min-w-[24px]">
                                  {String.fromCharCode(97 + idx)}.
                                </span>
                                <span className="text-gray-900 flex-1 leading-relaxed">{answer.content}</span>
                              </div>
                              <div className="flex items-center space-x-3 ml-4">
                                <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all ${
                                  selected === 'true'
                                    ? showResult && correct === 'true'
                                      ? 'bg-green-500 border-2 border-green-600 text-white'
                                      : showResult && correct !== 'true'
                                      ? 'bg-red-500 border-2 border-red-600 text-white'
                                      : 'bg-green-100 border-2 border-green-500'
                                    : 'bg-gray-50 border-2 border-gray-200 hover:border-green-300'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`tf-${currentQuestion.id}-${answer.id}`}
                                    checked={selected === 'true'}
                                    onChange={() => {
                                      handleTrueFalseSelect(currentQuestion.id, answer.id, 'true')
                                    }}
                                    disabled={submitted}
                                    className="sr-only"
                                  />
                                  <span className={`font-semibold ${selected === 'true' && showResult && correct === 'true' ? 'text-white' : selected === 'true' ? 'text-green-700' : 'text-gray-700'}`}>
                                    Đúng
                                  </span>
                                </label>
                                <label className={`flex items-center cursor-pointer px-4 py-2 rounded-lg transition-all ${
                                  selected === 'false'
                                    ? showResult && correct === 'false'
                                      ? 'bg-green-500 border-2 border-green-600 text-white'
                                      : showResult && correct !== 'false'
                                      ? 'bg-red-500 border-2 border-red-600 text-white'
                                      : 'bg-red-100 border-2 border-red-500'
                                    : 'bg-gray-50 border-2 border-gray-200 hover:border-red-300'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`tf-${currentQuestion.id}-${answer.id}`}
                                    checked={selected === 'false'}
                                    onChange={() => {
                                      handleTrueFalseSelect(currentQuestion.id, answer.id, 'false')
                                    }}
                                    disabled={submitted}
                                    className="sr-only"
                                  />
                                  <span className={`font-semibold ${selected === 'false' && showResult && correct === 'false' ? 'text-white' : selected === 'false' ? 'text-red-700' : 'text-gray-700'}`}>
                                    Sai
                                  </span>
                                </label>
                              </div>
                            </div>
                            {showResult && (
                              <div className="mt-2 text-sm font-medium">
                                {selected === correct ? (
                                  <span className="text-green-600">✓ Đáp án đúng</span>
                                ) : (
                                  <span className="text-red-600">✗ Đáp án đúng: {correct === 'true' ? 'Đúng' : 'Sai'}</span>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
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
                            disabled={submitted}
                            className="w-20 h-20 text-center text-3xl font-bold border-3 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-200 transition-all bg-white shadow-sm disabled:opacity-50"
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
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 text-gray-700 hover:text-blue-700"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Câu trước</span>
                  </button>

                  {currentQuestionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg"
                    >
                      <span>Câu sau</span>
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  ) : (
                    !submitted && (
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-all bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg disabled:opacity-50"
                      >
                        <CheckCircle className="h-5 w-5" />
                        <span>{submitting ? 'Đang nộp...' : 'Nộp bài'}</span>
                      </button>
                    )
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
                  {submitted && score !== null && (
                    <span className="block mt-1 text-green-600 font-semibold">Điểm: {score}%</span>
                  )}
                </p>
              </div>
              <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const status = getQuestionStatus(q.id, q.question_type)
                    const isCurrent = idx === currentQuestionIndex
                    const isCorrect = submitted ? isAnswerCorrect(q.id) : null
                    
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentQuestionIndex(idx)}
                        className={`aspect-square rounded-lg font-semibold text-sm transition-all ${
                          isCurrent
                            ? 'bg-blue-600 text-white shadow-lg scale-110 ring-4 ring-blue-200'
                            : submitted && isCorrect === true
                            ? 'bg-green-100 text-green-700 border-2 border-green-300'
                            : submitted && isCorrect === false
                            ? 'bg-red-100 text-red-700 border-2 border-red-300'
                            : status === 'answered'
                            ? 'bg-blue-100 text-blue-700 border-2 border-blue-300 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
              {!submitted && (
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-2.5 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>{submitting ? 'Đang nộp...' : 'Nộp bài'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

