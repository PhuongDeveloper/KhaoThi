import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function StudentExamResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [exam, setExam] = useState<any>(null)
  const [attempt, setAttempt] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  const fetchData = async () => {
    try {
      const examData = await examApi.getExamById(id!)
      const attempts = await examApi.getAttempts()
      
      // Lấy attempt của học sinh hiện tại cho bài thi này
      const myAttempt = attempts.find(
        (a: any) => a.exam_id === id && a.student_id === profile?.id
      )

      if (!myAttempt) {
        toast.error('Không tìm thấy kết quả bài thi')
        navigate('/student/exams')
        return
      }

      setExam(examData)
      setAttempt(myAttempt)

      // Lấy responses
      const { data: responsesData } = await supabase
        .from('exam_responses')
        .select('*')
        .eq('attempt_id', myAttempt.id)

      setResponses(responsesData || [])
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải kết quả')
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

  const isPassed = (attempt?.percentage || 0) >= (exam?.passing_score || 50)

  return (
    <div>
      <div className="card mb-6">
        <div className="text-center">
          {isPassed ? (
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          ) : (
            <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isPassed ? 'Chúc mừng! Bạn đã đạt' : 'Bạn chưa đạt'}
          </h1>
          <p className="text-2xl font-bold text-primary-600 mb-4">
            {attempt?.score?.toFixed(2) || 0}/{exam?.total_score || 10} điểm ({attempt?.percentage || 0}%)
          </p>
          <p className="text-gray-600">
            Điểm đạt: {exam?.passing_score}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-blue-600 mr-4" />
            <div>
              <p className="text-sm text-gray-600">Thời gian làm bài</p>
              <p className="text-xl font-bold text-gray-900">
                {attempt?.time_spent_seconds
                  ? `${Math.floor(attempt.time_spent_seconds / 60)}:${String(
                      attempt.time_spent_seconds % 60
                    ).padStart(2, '0')}`
                  : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600 mr-4" />
            <div>
              <p className="text-sm text-gray-600">Câu đúng</p>
              <p className="text-xl font-bold text-gray-900">
                {responses.filter((r) => r.is_correct).length}/{exam?.total_questions}
              </p>
            </div>
          </div>
        </div>

        {attempt?.violations_count > 0 && (
          <div className="card">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600 mr-4" />
              <div>
                <p className="text-sm text-gray-600">Vi phạm</p>
                <p className="text-xl font-bold text-gray-900">{attempt.violations_count}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center space-x-4">
        <Link to={`/student/exams/${id}/review`} className="btn btn-primary">
          Xem lại đề thi
        </Link>
        <Link to="/student/exams" className="btn btn-secondary">
          Xem bài thi khác
        </Link>
        <Link to="/student/history" className="btn btn-secondary">
          Lịch sử làm bài
        </Link>
      </div>
    </div>
  )
}

