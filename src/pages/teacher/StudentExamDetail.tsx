import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, ArrowLeft, User } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function StudentExamDetail() {
  const { id, attemptId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  
  const [exam, setExam] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [attempt, setAttempt] = useState<any>(null)
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id && attemptId) {
      fetchData()
    }
  }, [id, attemptId])

  const fetchData = async () => {
    try {
      const [examData, questionsData, attemptData] = await Promise.all([
        examApi.getExamById(id!),
        examApi.getQuestions(id!),
        examApi.getAttempt(attemptId!),
      ])

      const { data: responsesData } = await supabase
        .from('exam_responses')
        .select('*')
        .eq('attempt_id', attemptId!)

      const responsesMap: Record<string, any> = {}
      responsesData?.forEach((r: any) => {
        if (r.question_id) {
          if (!responsesMap[r.question_id]) {
            responsesMap[r.question_id] = []
          }
          responsesMap[r.question_id].push(r)
        }
      })

      setExam(examData)
      setQuestions(questionsData)
      setAttempt(attemptData)
      setResponses(responsesMap)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
      navigate(`${basePath}/exams/${id}/results`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const getResponsesForQuestion = (questionId: string) => {
    return responses[questionId] || []
  }

  const isCorrect = (question: any, responses: any[]) => {
    if (!responses || responses.length === 0) return false
    
    if (question.question_type === 'multiple_choice') {
      const response = responses[0]
      const correctAnswer = question.answers?.find((a: any) => a.is_correct)
      return response?.answer_id === correctAnswer?.id
    } else if (question.question_type === 'true_false_multi') {
      // Kiểm tra tất cả các câu trả lời
      let allCorrect = true
      question.answers?.forEach((answer: any) => {
        const response = responses.find((r: any) => r.answer_id === answer.id)
        if (response) {
          const studentAnswer = response.text_answer === 'true' || response.text_answer === true
          const correctAnswer = answer.is_correct === true
          if (studentAnswer !== correctAnswer) {
            allCorrect = false
          }
        } else {
          allCorrect = false
        }
      })
      return allCorrect
    } else if (question.question_type === 'short_answer') {
      const response = responses[0]
      return response?.is_correct || false
    }
    return false
  }

  const getStudentAnswerForTF = (questionId: string, answerId: string) => {
    const questionResponses = responses[questionId] || []
    const response = questionResponses.find((r: any) => r.answer_id === answerId)
    if (response) {
      return response.text_answer === 'true' || response.text_answer === true
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(`${basePath}/exams/${id}/results`)}
              className="inline-flex items-center text-white/90 hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại
            </button>
            <h1 className="text-3xl font-bold mb-2">{exam?.title}</h1>
            <div className="flex items-center space-x-4 text-white/90">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span className="font-medium">{(attempt?.student as any)?.full_name || 'Học sinh'}</span>
              </div>
              <span>•</span>
              <span>Xem chi tiết bài làm</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              {attempt?.score?.toFixed(2) || 0}/{exam?.total_score || 10}
            </p>
            <p className="text-white/90">Điểm số</p>
            <p className="text-lg font-semibold mt-1">
              {attempt?.percentage || 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {questions.map((question, idx) => {
          const questionResponses = getResponsesForQuestion(question.id)
          const correct = isCorrect(question, questionResponses)
          
          return (
            <div
              key={question.id}
              className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
                correct ? 'border-green-300' : 'border-red-300'
              }`}
            >
              {/* Question Header */}
              <div className={`px-6 py-4 ${
                correct ? 'bg-green-50 border-b-2 border-green-300' : 'bg-red-50 border-b-2 border-red-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Câu {idx + 1}</h3>
                      <p className="text-sm text-gray-600">
                        {question.question_type === 'multiple_choice' && 'Trắc nghiệm'}
                        {question.question_type === 'true_false_multi' && 'Đúng/Sai'}
                        {question.question_type === 'short_answer' && 'Trả lời ngắn'}
                      </p>
                    </div>
                  </div>
                  {correct ? (
                    <div className="flex items-center text-green-700">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      <span className="font-semibold">Đúng</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-700">
                      <XCircle className="h-5 w-5 mr-2" />
                      <span className="font-semibold">Sai</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Question Content */}
              <div className="p-6">
                <p className="text-lg font-semibold text-gray-900 mb-4">{question.content}</p>

                {/* Image */}
                {question.image_url && (
                  <div className="mb-6 flex justify-center bg-gray-50 p-4 rounded-lg">
                    <img 
                      src={question.image_url} 
                      alt="Question" 
                      className="max-w-full max-h-[300px] rounded-lg object-contain"
                    />
                  </div>
                )}

                {/* Multiple Choice */}
                {question.question_type === 'multiple_choice' && (
                  <div className="space-y-3">
                    {question.answers?.map((answer: any, aidx: number) => {
                      const studentResponse = questionResponses[0]
                      const isSelected = studentResponse?.answer_id === answer.id
                      const isCorrectAnswer = answer.is_correct
                      
                      return (
                        <div
                          key={answer.id}
                          className={`p-4 rounded-lg border-2 ${
                            isCorrectAnswer
                              ? 'bg-green-50 border-green-500'
                              : isSelected
                              ? 'bg-red-50 border-red-500'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              isCorrectAnswer
                                ? 'bg-green-500 text-white'
                                : isSelected
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}>
                              {String.fromCharCode(65 + aidx)}
                            </div>
                            <span className="flex-1 text-gray-900">{answer.content}</span>
                            {isCorrectAnswer && (
                              <div className="flex items-center text-green-600">
                                <CheckCircle className="h-5 w-5 mr-1" />
                                <span className="text-sm font-semibold">Đúng</span>
                              </div>
                            )}
                            {isSelected && !isCorrectAnswer && (
                              <div className="flex items-center text-red-600">
                                <XCircle className="h-5 w-5 mr-1" />
                                <span className="text-sm font-semibold">Học sinh chọn</span>
                              </div>
                            )}
                          </div>
                          {isSelected && !isCorrectAnswer && (
                            <p className="text-sm text-red-600 mt-2 ml-11 font-medium">
                              ❌ Đáp án học sinh chọn (Sai)
                            </p>
                          )}
                          {isCorrectAnswer && (
                            <p className="text-sm text-green-600 mt-2 ml-11 font-medium">
                              ✅ Đáp án đúng
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* True/False Multi */}
                {question.question_type === 'true_false_multi' && (
                  <div className="space-y-4">
                    {question.answers?.map((answer: any, aidx: number) => {
                      const studentAnswer = getStudentAnswerForTF(question.id, answer.id)
                      const correctAnswer = answer.is_correct === true
                      const isCorrect = studentAnswer === correctAnswer
                      
                      return (
                        <div
                          key={answer.id}
                          className={`p-4 rounded-lg border-2 ${
                            isCorrect && studentAnswer !== null
                              ? 'bg-green-50 border-green-500'
                              : studentAnswer !== null
                              ? 'bg-red-50 border-red-500'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 flex-1">
                              <span className="font-semibold text-blue-600">
                                {String.fromCharCode(97 + aidx)}.
                              </span>
                              <span className="text-gray-900">{answer.content}</span>
                            </div>
                            <div className="flex items-center space-x-3 ml-4">
                              {/* Đáp án đúng */}
                              <div className={`px-3 py-1 rounded-lg font-semibold ${
                                correctAnswer
                                  ? 'bg-green-500 text-white'
                                  : 'bg-red-500 text-white'
                              }`}>
                                {correctAnswer ? 'Đúng' : 'Sai'}
                              </div>
                              {/* Đáp án học sinh chọn */}
                              {studentAnswer !== null && (
                                <div className={`px-3 py-1 rounded-lg font-semibold border-2 ${
                                  studentAnswer
                                    ? 'bg-green-100 text-green-700 border-green-500'
                                    : 'bg-red-100 text-red-700 border-red-500'
                                }`}>
                                  {studentAnswer ? 'Đúng' : 'Sai'}
                                </div>
                              )}
                              {studentAnswer === null && (
                                <span className="text-sm text-gray-500">Chưa trả lời</span>
                              )}
                              {isCorrect && studentAnswer !== null && (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              )}
                              {!isCorrect && studentAnswer !== null && (
                                <XCircle className="h-5 w-5 text-red-600" />
                              )}
                            </div>
                          </div>
                          {!isCorrect && studentAnswer !== null && (
                            <p className="text-sm text-red-600 mt-2 ml-8 font-medium">
                              ❌ Học sinh chọn sai
                            </p>
                          )}
                          {isCorrect && studentAnswer !== null && (
                            <p className="text-sm text-green-600 mt-2 ml-8 font-medium">
                              ✅ Học sinh trả lời đúng
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Short Answer */}
                {question.question_type === 'short_answer' && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-green-900 mb-2">Đáp án đúng:</p>
                      <p className="text-2xl font-bold text-green-700">{question.correct_answer || '-'}</p>
                    </div>
                    {questionResponses[0]?.text_answer && (
                      <div className={`border-2 rounded-lg p-4 ${
                        correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <p className="text-sm font-medium text-gray-700 mb-2">Đáp án học sinh:</p>
                        <p className={`text-2xl font-bold ${correct ? 'text-green-700' : 'text-red-700'}`}>
                          {questionResponses[0].text_answer}
                        </p>
                      </div>
                    )}
                    {!questionResponses[0]?.text_answer && (
                      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
                        <p className="text-sm text-gray-500">Học sinh chưa trả lời</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Points */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Điểm: <span className="font-semibold text-gray-900">
                      {questionResponses[0]?.points_earned || 0} điểm
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Tóm tắt</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {questions.filter((q) => isCorrect(q, getResponsesForQuestion(q.id))).length}
            </p>
            <p className="text-sm text-gray-600">Câu đúng</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {questions.filter((q) => !isCorrect(q, getResponsesForQuestion(q.id))).length}
            </p>
            <p className="text-sm text-gray-600">Câu sai</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {attempt?.score?.toFixed(2) || 0}
            </p>
            <p className="text-sm text-gray-600">Tổng điểm</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {attempt?.percentage || 0}%
            </p>
            <p className="text-sm text-gray-600">Tỷ lệ</p>
          </div>
        </div>
      </div>
    </div>
  )
}

