import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { RefreshCw, AlertCircle, BookOpen, Clock, ChevronRight, Sparkles, Calendar } from 'lucide-react'
import { db } from '../../lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { cache, CACHE_KEYS } from '../../lib/cache'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAutoSubmitExams } from '../../hooks/useAutoSubmitExams'

export default function StudentExams() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<any[]>([])
  const [attempts, setAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newExamIds, setNewExamIds] = useState<Set<string>>(new Set())

  useAutoSubmitExams(60000)

  useEffect(() => {
    if (profile?.id) {
      fetchExams()
    }
    if (profile?.id) {
      const assignmentsQuery = query(
        collection(db, 'exam_assignments'),
        where('student_id', '==', profile.id)
      )
      const unsubscribe = onSnapshot(assignmentsQuery, (snapshot) => {
        // Mark newly arrived exams
        const newIds = new Set<string>()
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            newIds.add(change.doc.data().exam_id)
          }
        })
        if (newIds.size > 0) {
          setNewExamIds(prev => new Set([...prev, ...newIds]))
          toast('📚 Có bài kiểm tra mới!', { icon: '🎉', duration: 4000 })
        }
        cache.invalidate(CACHE_KEYS.assignedExams(profile.id))
        fetchExams()
      })
      const refreshInterval = setInterval(() => { fetchExams() }, 30000)
      return () => { unsubscribe(); clearInterval(refreshInterval) }
    }
  }, [profile?.id])

  const fetchExams = async () => {
    try {
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

  const publishedExams = assignments.filter((a: any) => a.exam && a.exam.status === 'published')

  const inProgressAttempt = attempts.find(a => {
    if (a.status !== 'in_progress') return false
    const exam = a.exam
    if (!exam) return false
    const now = new Date()
    if (exam.end_time && new Date(exam.end_time) < now) return false
    if (a.started_at && exam.duration_minutes) {
      const endTime = new Date(new Date(a.started_at).getTime() + exam.duration_minutes * 60 * 1000)
      if (endTime < now) return false
    }
    return true
  })

  const canTakeExam = (exam: any) => {
    if (inProgressAttempt) return false
    const now = new Date()
    if (exam.start_time) {
      const startTime = new Date(exam.start_time)
      const fiveMinutesBefore = new Date(startTime.getTime() - 5 * 60 * 1000)
      if (now < fiveMinutesBefore) return false
    }
    if (exam.end_time && new Date(exam.end_time) < now) return false
    return true
  }

  const handleTakeExam = (exam: any) => {
    if (inProgressAttempt) {
      toast.error('Bạn đang có bài thi đang làm. Vui lòng hoàn thành trước.')
      navigate(`/student/exams/${inProgressAttempt.exam_id}/take`)
      return
    }
    if (!canTakeExam(exam)) {
      if (exam.start_time) {
        const st = new Date(exam.start_time)
        const fmb = new Date(st.getTime() - 5 * 60 * 1000)
        if (new Date() < fmb) toast.error(`Bài thi sẽ bắt đầu lúc ${st.toLocaleString('vi-VN')}. Truy cập trước 5 phút.`)
      }
      if (exam.end_time && new Date(exam.end_time) < new Date()) toast.error('Bài thi đã kết thúc')
      return
    }
    // Clear new exam marker
    setNewExamIds(prev => { const next = new Set(prev); next.delete(exam.id); return next })
    navigate(`/student/exams/${exam.id}/take`)
  }

  const getTimeStatus = (exam: any) => {
    const now = new Date()
    const startTime = exam.start_time ? new Date(exam.start_time) : null
    const endTime = exam.end_time ? new Date(exam.end_time) : null
    if (endTime && endTime < now) return { label: 'Đã kết thúc', color: 'bg-gray-100 text-gray-600 border-gray-200' }
    if (startTime && startTime > now) {
      const diffMs = startTime.getTime() - now.getTime()
      const diffH = Math.floor(diffMs / 3600000)
      const diffM = Math.floor((diffMs % 3600000) / 60000)
      const label = diffH > 0 ? `${diffH}g ${diffM}ph nữa` : `${diffM} phút nữa`
      return { label: `Bắt đầu sau ${label}`, color: 'bg-blue-50 text-blue-600 border-blue-200' }
    }
    return { label: 'Đang diễn ra', color: 'bg-green-50 text-green-600 border-green-200' }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài thi của tôi</h1>
          <p className="text-gray-500 text-sm mt-1">{publishedExams.length} bài thi đang hiển thị</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all text-sm font-medium"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* In progress alert */}
      {inProgressAttempt && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Bạn đang có bài thi chưa hoàn thành</p>
                <p className="text-orange-100 text-sm mt-0.5">Vui lòng hoàn thành bài thi hiện tại trước khi làm bài khác</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/student/exams/${inProgressAttempt.exam_id}/take`)}
              className="bg-white text-orange-600 font-semibold px-4 py-2 rounded-lg hover:bg-orange-50 transition-all flex items-center gap-2 flex-shrink-0 ml-4"
            >
              Tiếp tục <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Exam list */}
      {publishedExams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">Chưa có bài thi nào được giao</p>
          <p className="text-gray-400 text-sm mt-1">Giáo viên chưa giao bài thi cho bạn</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publishedExams.map((assignment: any) => {
            const exam = assignment.exam
            const now = new Date()
            const endTime = exam.end_time ? new Date(exam.end_time) : null
            const startTime = exam.start_time ? new Date(exam.start_time) : null
            const canTake = canTakeExam(exam)
            const isExpired = endTime && endTime < now
            const isNew = newExamIds.has(exam.id)
            const timeStatus = getTimeStatus(exam)
            const hasAttempt = attempts.some(a => a.exam_id === exam.id && (a.status === 'submitted' || a.status === 'timeout'))

            return (
              <div
                key={assignment.id}
                className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${isNew ? 'border-yellow-400 shadow-md shadow-yellow-100' :
                  canTake && !inProgressAttempt ? 'border-primary-200 hover:border-primary-400 hover:shadow-md' :
                    'border-gray-200'
                  }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title + badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="text-base font-bold text-gray-900">{exam.title}</h3>
                        {isNew && (
                          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full border border-yellow-300">
                            <Sparkles className="h-3 w-3" />
                            Mới
                          </span>
                        )}
                        {hasAttempt && (
                          <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full border border-green-200">
                            ✓ Đã làm
                          </span>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                        <span className="font-medium text-gray-700">{(exam.subject as any)?.name || 'Chưa có môn'}</span>
                        <span>•</span>
                        <span>{exam.total_questions} câu hỏi</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {exam.duration_minutes} phút
                        </span>
                      </div>

                      {/* Time info */}
                      {startTime && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            {startTime.toLocaleString('vi-VN')}
                            {endTime && ` → ${endTime.toLocaleString('vi-VN')}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right side: status + button */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${timeStatus.color}`}>
                        {timeStatus.label}
                      </span>

                      {inProgressAttempt ? (
                        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
                          Đang bận
                        </button>
                      ) : canTake ? (
                        <button
                          onClick={() => handleTakeExam(exam)}
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition-all shadow-sm hover:shadow-md flex items-center gap-1.5"
                        >
                          {hasAttempt ? 'Làm lại' : 'Vào thi'}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      ) : isExpired ? (
                        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed">
                          Đã kết thúc
                        </button>
                      ) : (
                        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-500 cursor-not-allowed border border-blue-200">
                          Chưa đến giờ
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar for active exams */}
                {canTake && !isExpired && !inProgressAttempt && (
                  <div className="h-1 bg-gradient-to-r from-primary-500 to-primary-600" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
