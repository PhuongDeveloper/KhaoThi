import { useEffect, useState, useRef } from 'react'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import { getMyClass } from '../../lib/api/classes'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ClipboardList, CheckCircle, RefreshCw, BookOpen, TrendingUp, AlertCircle, Clock, Calendar, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cache, CACHE_KEYS } from '../../lib/cache'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAutoSubmitExams } from '../../hooks/useAutoSubmitExams'

export default function StudentDashboard() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [assignedExams, setAssignedExams] = useState<any[]>([])
  const [recentAttempts, setRecentAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingClass, setCheckingClass] = useState(false)
  const hasFetchedRef = useRef<string | false>(false)

  // Tự động nộp bài khi hết giờ (kiểm tra mỗi phút)
  useAutoSubmitExams(60000)

  useEffect(() => {
    if (profile?.id) {
      const currentProfileId = profile.id
      if (!hasFetchedRef.current || hasFetchedRef.current !== currentProfileId) {
        hasFetchedRef.current = currentProfileId
        
        if (!profile.class_id && !checkingClass) {
          checkClassSilently()
        }

        fetchData()
      }
    } else {
      setLoading(false)
      hasFetchedRef.current = false
    }

    if (profile?.id) {
      const assignmentsChannel = supabase
        .channel('student-assignments')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exam_assignments',
            filter: `student_id=eq.${profile.id}`,
          },
          () => {
            fetchData()
          }
        )
        .subscribe()

      const attemptsChannel = supabase
        .channel(`student-attempts-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exam_attempts',
            filter: `student_id=eq.${profile.id}`,
          },
          () => {
            cache.invalidate(CACHE_KEYS.attempts(profile.id))
            fetchData()
          }
        )
        .subscribe()

      const refreshInterval = setInterval(() => {
        fetchData()
      }, 30000)

      return () => {
        supabase.removeChannel(assignmentsChannel)
        supabase.removeChannel(attemptsChannel)
        clearInterval(refreshInterval)
      }
    }
  }, [profile?.id])

  const checkClassSilently = async () => {
    if (!profile?.id || checkingClass) return
    
    setCheckingClass(true)
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )
      
      const myClassData = await Promise.race([
        getMyClass(),
        timeoutPromise
      ]) as any
      
      if (!myClassData) {
        if (location.pathname !== '/student/select-class') {
          navigate('/student/select-class', { replace: true })
        }
      }
    } catch (error) {
      // Silent fail
    } finally {
      setCheckingClass(false)
    }
  }

  const fetchData = async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const timeout = 3000
      const fetchWithTimeout = <T,>(promise: Promise<T>): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ])
      }

      const assignmentsPromise = fetchWithTimeout(examApi.getAssignedExams(profile.id, true)).catch(() => [])
      const attemptsPromise = fetchWithTimeout(examApi.getAttempts(undefined, true)).catch(() => [])

      assignmentsPromise.then((assignments) => {
        setAssignedExams((assignments || []).slice(0, 5))
        setLoading(false)
      })

      attemptsPromise.then((attempts) => {
        setRecentAttempts((attempts || []).slice(0, 5))
      })

      await Promise.allSettled([assignmentsPromise, attemptsPromise])
    } catch (error) {
      setAssignedExams([])
      setRecentAttempts([])
      setLoading(false)
    }
  }

  // Kiểm tra attempt đang làm - chỉ tính những attempt chưa hết thời gian
  const inProgressAttempt = recentAttempts.find((a) => {
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
  
  if (loading && assignedExams.length === 0 && recentAttempts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const handleRefresh = () => {
    cache.invalidate(CACHE_KEYS.assignedExams(profile?.id || ''))
    cache.invalidate(CACHE_KEYS.attempts(profile?.id || ''))
    fetchData()
  }

  const completedCount = recentAttempts.filter((a) => a.status === 'submitted' || a.status === 'timeout').length
  const publishedExams = assignedExams.filter((a: any) => a.exam && a.exam.status === 'published')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
    <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Chào mừng, {profile?.full_name}
        </h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi tiến độ học tập của bạn</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Alert nếu có bài thi đang làm */}
      {inProgressAttempt && (
        <div className="bg-white border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">Bạn đang có bài thi đang làm</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Vui lòng hoàn thành bài thi hiện tại trước khi làm bài thi khác
                </p>
              </div>
            </div>
            <Link
              to={`/student/exams/${inProgressAttempt.exam_id}/take`}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Tiếp tục
            </Link>
          </div>
        </div>
      )}

      {/* Stats Cards - Đơn giản */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Bài thi được giao</p>
              <p className="text-3xl font-semibold text-gray-900">{publishedExams.length}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <ClipboardList className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Đã hoàn thành</p>
              <p className="text-3xl font-semibold text-gray-900">{completedCount}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Tỷ lệ hoàn thành</p>
              <p className="text-3xl font-semibold text-gray-900">
                {publishedExams.length > 0 
                  ? Math.round((completedCount / publishedExams.length) * 100) 
                  : 0}%
              </p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Bài thi được giao */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Bài thi được giao</h2>
            <Link 
              to="/student/exams" 
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center"
            >
            Xem tất cả
              <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
          </div>
        </div>
        <div className="p-6">
          {publishedExams.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Chưa có bài thi nào được giao</p>
            </div>
        ) : (
          <div className="space-y-3">
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
                    className={`border rounded-lg p-4 transition-all ${
                      canTake && !inProgressAttempt
                        ? 'border-gray-300 hover:border-gray-400 hover:shadow-sm'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-base font-semibold text-gray-900 truncate">{exam.title}</h3>
                          {isExpired && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                              Đã kết thúc
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                              Sắp tới
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-2">
                          <span>{(exam.subject as any)?.name || 'Chưa có môn'}</span>
                          <span className="text-gray-300">•</span>
                          <span>{exam.total_questions} câu</span>
                          <span className="text-gray-300">•</span>
                          <span>{exam.duration_minutes} phút</span>
                  </div>
                        {startTime && (
                          <p className="text-xs text-gray-500">
                            {startTime.toLocaleString('vi-VN')}
                            {endTime && ` - ${endTime.toLocaleString('vi-VN')}`}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        {inProgressAttempt ? (
                          <button
                            disabled
                            className="px-4 py-2 text-sm text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                          >
                            Đang làm bài khác
                          </button>
                        ) : canTake ? (
                          <button
                            onClick={() => handleTakeExam(exam)}
                            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Làm bài
                          </button>
                        ) : isExpired ? (
                          <button 
                            disabled 
                            className="px-4 py-2 text-sm text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                          >
                            Đã kết thúc
                          </button>
                        ) : (
                          <button
                            onClick={() => handleTakeExam(exam)}
                            disabled
                            className="px-4 py-2 text-sm text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
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

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/student/history"
          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gray-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Lịch sử làm bài</h3>
              <p className="text-sm text-gray-600 mt-0.5">Xem tất cả bài thi đã làm</p>
            </div>
          </div>
        </Link>

        <Link
          to="/student/grades"
          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gray-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Bảng điểm</h3>
              <p className="text-sm text-gray-600 mt-0.5">Xem điểm theo từng môn</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
