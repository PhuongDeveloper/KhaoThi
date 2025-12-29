import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cache, CACHE_KEYS } from '../../lib/cache'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAutoSubmitExams } from '../../hooks/useAutoSubmitExams'

export default function StudentExams() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<any[]>([])
  const [attempts, setAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Tự động nộp bài khi hết giờ (kiểm tra mỗi phút)
  useAutoSubmitExams(60000)

  useEffect(() => {
    if (profile?.id) {
      fetchExams()
    }

    // Setup realtime subscription và auto-refresh
    if (profile?.id) {
      const channel = supabase
        .channel(`student-exams-assignments-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exam_assignments',
            filter: `student_id=eq.${profile.id}`,
          },
          () => {
            console.log('[StudentExams] Assignment changed, refreshing...')
            cache.invalidate(CACHE_KEYS.assignedExams(profile.id))
            fetchExams()
          }
        )
        .subscribe()

      // Auto-refresh mỗi 30 giây
      const refreshInterval = setInterval(() => {
        console.log('[StudentExams] Auto-refreshing...')
        fetchExams()
      }, 30000)

      return () => {
        console.log('[StudentExams] Cleaning up subscriptions')
        supabase.removeChannel(channel)
        clearInterval(refreshInterval)
      }
    }
  }, [profile?.id]) // Chỉ chạy khi profile.id thay đổi

  const fetchExams = async () => {
    try {
      // Sử dụng cache
      const [assignmentsData, attemptsData] = await Promise.all([
        examApi.getAssignedExams(profile?.id, true),
        examApi.getAttempts(undefined, true)
      ])
      setAssignments(assignmentsData || [])
      setAttempts(attemptsData || [])
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách bài thi')
      setAssignments([])
      setAttempts([])
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    cache.invalidate(CACHE_KEYS.assignedExams(profile?.id || ''))
    fetchExams()
  }

  if (loading && assignments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const publishedExams = assignments.filter(
    (a: any) => a.exam && a.exam.status === 'published'
  )

  // Kiểm tra xem có bài thi đang làm không - chỉ tính những attempt chưa hết thời gian
  const inProgressAttempt = attempts.find((a) => {
    if (a.status !== 'in_progress') return false
    
    // Kiểm tra xem attempt đã hết thời gian chưa
    const exam = a.exam
    if (!exam) return false
    
    const now = new Date()
    
    // Kiểm tra end_time từ exam
    if (exam.end_time && new Date(exam.end_time) < now) {
      return false
    }
    
    // Kiểm tra thời gian làm bài (started_at + duration_minutes)
    if (a.started_at && exam.duration_minutes) {
      const startTime = new Date(a.started_at)
      const endTime = new Date(startTime.getTime() + exam.duration_minutes * 60 * 1000)
      if (endTime < now) {
        return false
      }
    }
    
    return true
  })
  
  // Kiểm tra xem có thể làm bài thi không
  const canTakeExam = (exam: any) => {
    if (inProgressAttempt) {
      return false
    }
    
    const now = new Date()
    if (exam.start_time) {
      const startTime = new Date(exam.start_time)
      const fiveMinutesBefore = new Date(startTime.getTime() - 5 * 60 * 1000)
      if (now < fiveMinutesBefore) {
        return false
      }
    }
    
    if (exam.end_time && new Date(exam.end_time) < now) {
      return false
    }
    
    return true
  }

  const handleTakeExam = (exam: any) => {
    if (inProgressAttempt) {
      toast.error('Bạn đang có bài thi đang làm. Vui lòng hoàn thành bài thi hiện tại trước.')
      navigate(`/student/exams/${inProgressAttempt.exam_id}/take`)
      return
    }
    
    if (!canTakeExam(exam)) {
      if (exam.start_time) {
        const startTime = new Date(exam.start_time)
        const fiveMinutesBefore = new Date(startTime.getTime() - 5 * 60 * 1000)
        if (new Date() < fiveMinutesBefore) {
          toast.error(`Bài thi sẽ bắt đầu lúc ${startTime.toLocaleString('vi-VN')}. Bạn có thể truy cập trước 5 phút.`)
        }
      }
      if (exam.end_time && new Date(exam.end_time) < new Date()) {
        toast.error('Bài thi đã kết thúc')
      }
      return
    }
    
    navigate(`/student/exams/${exam.id}/take`)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bài thi của tôi</h1>
          <p className="text-gray-600 mt-1">Danh sách tất cả bài thi được giao</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="btn btn-outline flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Alert nếu có bài thi đang làm */}
      {inProgressAttempt && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-orange-600 mr-3" />
            <div className="flex-1">
              <p className="font-medium text-orange-900">
                Bạn đang có bài thi đang làm
              </p>
              <p className="text-sm text-orange-700 mt-1">
                Vui lòng hoàn thành bài thi hiện tại trước khi làm bài thi khác
              </p>
            </div>
            <button
              onClick={() => navigate(`/student/exams/${inProgressAttempt.exam_id}/take`)}
              className="btn btn-primary ml-4"
            >
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {publishedExams.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Chưa có bài thi nào được giao</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {publishedExams.map((assignment: any) => {
              const exam = assignment.exam
              const now = new Date()
              const startTime = exam.start_time ? new Date(exam.start_time) : null
              const endTime = exam.end_time ? new Date(exam.end_time) : null
              const canTake = canTakeExam(exam)
              const isExpired = endTime && endTime < now
              const isUpcoming = startTime && startTime > now

              return (
                <div
                  key={assignment.id}
                  className={`p-6 transition-all ${
                    canTake && !inProgressAttempt
                      ? 'hover:bg-primary-50'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{exam.title}</h3>
                        {isExpired && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Đã kết thúc
                          </span>
                        )}
                        {isUpcoming && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            Sắp tới
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                        <span>{(exam.subject as any)?.name || 'Chưa có môn'}</span>
                        <span>•</span>
                        <span>{exam.total_questions} câu hỏi</span>
                        <span>•</span>
                        <span>{exam.duration_minutes} phút</span>
                      </div>
                      {startTime && (
                        <p className="text-sm text-gray-500">
                          Bắt đầu: {startTime.toLocaleString('vi-VN')}
                          {endTime && ` • Kết thúc: ${endTime.toLocaleString('vi-VN')}`}
                        </p>
                      )}
                      {exam.description && (
                        <p className="text-sm text-gray-600 mt-2">{exam.description}</p>
                      )}
                    </div>
                    <div className="ml-4">
                      {inProgressAttempt ? (
                        <button
                          disabled
                          className="btn btn-secondary opacity-50 cursor-not-allowed"
                        >
                          Đang làm bài khác
                        </button>
                      ) : canTake ? (
                        <button
                          onClick={() => handleTakeExam(exam)}
                          className="btn btn-primary"
                        >
                          Làm bài
                        </button>
                      ) : isExpired ? (
                        <button disabled className="btn btn-secondary opacity-50">
                          Đã kết thúc
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTakeExam(exam)}
                          disabled
                          className="btn btn-secondary opacity-50"
                        >
                          Chưa đến giờ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
