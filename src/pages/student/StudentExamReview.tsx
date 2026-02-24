import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, ArrowLeft, Clock, AlertCircle } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function StudentExamReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [exam, setExam] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [attempt, setAttempt] = useState<any>(null)
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [canReview, setCanReview] = useState(false)
  const [reviewMessage, setReviewMessage] = useState('')

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  const checkCanReview = async (examData: any) => {
    try {
      const now = new Date()
      
      // Lấy assignment để có end_time chính xác
      const assignments = await examApi.getAssignedExams(undefined, false)
      const assignment = assignments.find((a: any) => a.exam_id === id)
      
      // Sử dụng end_time từ assignment nếu có, nếu không thì dùng từ exam
      const endTime = assignment?.end_time || examData.end_time
      
      // Kiểm tra 1: Bài thi đã kết thúc chưa?
      if (endTime) {
        const endTimeDate = new Date(endTime)
        if (now < endTimeDate) {
          setReviewMessage(`Bài thi chưa kết thúc. Bạn có thể xem lại sau ${endTimeDate.toLocaleString('vi-VN')}`)
          return false
        }
      } else {
        // Nếu không có end_time, kiểm tra dựa trên duration_minutes từ attempt
        // Nhưng tốt hơn là kiểm tra tất cả attempts đã submit chưa
      }

      // Kiểm tra 2: Tất cả học sinh đã nộp bài chưa?
      // Lấy tất cả attempts của bài thi này
      const attemptsQuery = query(
        collection(db, 'exam_attempts'),
        where('exam_id', '==', id!)
      )
      const allAttemptsSnap = await getDocs(attemptsQuery)
      const allAttempts = allAttemptsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))

      if (allAttempts && allAttempts.length > 0) {
        // Kiểm tra xem còn attempt nào đang in_progress không
        const inProgressAttempts = allAttempts.filter((a: any) => a.status === 'in_progress')
        
        if (inProgressAttempts.length > 0) {
          setReviewMessage(`Vẫn còn ${inProgressAttempts.length} học sinh chưa nộp bài. Vui lòng đợi tất cả học sinh hoàn thành bài thi.`)
          return false
        }
      }

      // Cả 2 điều kiện đều thỏa mãn
      setCanReview(true)
      return true
    } catch (error: any) {
      // Ignore errors
      // Nếu có lỗi, vẫn cho phép xem (fallback)
      setCanReview(true)
      return true
    }
  }

  const fetchData = async () => {
    try {
      const examData = await examApi.getExamById(id!)
      const questionsData = await examApi.getQuestions(id!)
      const attempts = await examApi.getAttempts()
      
      const myAttempt = attempts.find(
        (a: any) => a.exam_id === id && a.student_id === profile?.id && (a.status === 'submitted' || a.status === 'timeout')
      )

      if (!myAttempt) {
        toast.error('Không tìm thấy kết quả bài thi')
        navigate('/student/history')
        return
      }

      // Kiểm tra điều kiện xem lại
      const canReviewNow = await checkCanReview(examData)
      
      if (!canReviewNow) {
        setExam(examData)
        setAttempt(myAttempt)
        setLoading(false)
        return
      }

      const responsesQuery = query(
        collection(db, 'exam_responses'),
        where('attempt_id', '==', myAttempt.id)
      )
      const responsesSnap = await getDocs(responsesQuery)

      // Với true_false_multi, mỗi question có thể có nhiều responses (mỗi answer một response)
      const responsesMap: Record<string, any[]> = {}
      responsesSnap.forEach((doc) => {
        const r = { id: doc.id, ...doc.data() }
        if (!responsesMap[r.question_id]) {
          responsesMap[r.question_id] = []
        }
        responsesMap[r.question_id].push(r)
      })

      setExam(examData)
      setQuestions(questionsData)
      setAttempt(myAttempt)
      setResponses(responsesMap)
      setCanReview(true)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
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

  // Hiển thị thông báo nếu chưa đến lúc xem lại
  if (!canReview && exam && attempt) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <Link
                to="/student/history"
                className="inline-flex items-center text-white/90 hover:text-white mb-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Quay lại
              </Link>
              <h1 className="text-3xl font-bold mb-2">{exam?.title}</h1>
              <p className="text-white/90">
                Xem lại đề thi và đáp án đúng
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {attempt?.score?.toFixed(2) || 0}/{exam?.total_score || 10}
              </p>
              <p className="text-white/90">Điểm số</p>
            </div>
          </div>
        </div>

        {/* Thông báo chưa đến lúc xem lại */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-yellow-200 p-8">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Chưa đến lúc xem lại bài thi
              </h3>
              <p className="text-gray-700 mb-4">
                {reviewMessage || 'Bạn chỉ có thể xem lại bài thi sau khi tất cả học sinh đã hoàn thành và bài thi đã kết thúc.'}
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900 mb-1">
                      Lý do:
                    </p>
                    <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                      <li>Bài thi phải đã kết thúc (hết thời gian làm bài)</li>
                      <li>Tất cả học sinh phải đã nộp bài</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
      return response?.is_correct || false
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
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/student/history"
              className="inline-flex items-center text-white/90 hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại
            </Link>
            <h1 className="text-3xl font-bold mb-2">{exam?.title}</h1>
            <p className="text-white/90">
              Xem lại đề thi và đáp án đúng
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              {attempt?.score?.toFixed(2) || 0}/{exam?.total_score || 10}
            </p>
            <p className="text-white/90">Điểm số</p>
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
                correct ? 'border-green-200' : 'border-red-200'
              }`}
            >
              {/* Question Header */}
              <div className={`px-6 py-4 ${
                correct ? 'bg-green-50 border-b-2 border-green-200' : 'bg-red-50 border-b-2 border-red-200'
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
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            )}
                            {isSelected && !isCorrectAnswer && (
                              <XCircle className="h-5 w-5 text-red-600" />
                            )}
                          </div>
                          {isSelected && !isCorrectAnswer && (
                            <p className="text-sm text-red-600 mt-2 ml-11">
                              ❌ Đáp án bạn chọn (Sai)
                            </p>
                          )}
                          {isCorrectAnswer && (
                            <p className="text-sm text-green-600 mt-2 ml-11">
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
                              <span className="font-semibold text-primary-600">
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
                              {/* Đáp án bạn chọn */}
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
                              ❌ Bạn chọn sai
                            </p>
                          )}
                          {isCorrect && studentAnswer !== null && (
                            <p className="text-sm text-green-600 mt-2 ml-8 font-medium">
                              ✅ Bạn trả lời đúng
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
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-2">Đáp án đúng:</p>
                      <p className="text-2xl font-bold text-blue-700">{question.correct_answer || '-'}</p>
                    </div>
                    {questionResponses[0]?.text_answer && (
                      <div className={`border-2 rounded-lg p-4 ${
                        correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <p className="text-sm font-medium text-gray-700 mb-2">Đáp án của bạn:</p>
                        <p className={`text-2xl font-bold ${correct ? 'text-green-700' : 'text-red-700'}`}>
                          {questionResponses[0].text_answer}
                        </p>
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
            <p className="text-2xl font-bold text-gray-900">
              {questions.filter((q) => isCorrect(q, getResponsesForQuestion(q.id))).length}
            </p>
            <p className="text-sm text-gray-600">Câu đúng</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
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

