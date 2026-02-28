import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { db } from '../../lib/firebase'
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Eye, AlertTriangle, User, Ban, Activity, Clock, Wifi } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import { useConfirm } from '../../hooks/useConfirm'

interface ActivityEvent {
  time: string
  type: 'start' | 'answer' | 'violation' | 'submit'
  message: string
}

export default function ExamMonitoring() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'

  const [exam, setExam] = useState<any>(null)
  const [activeAttempts, setActiveAttempts] = useState<any[]>([])
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null)
  const [selectedResponses, setSelectedResponses] = useState<Record<string, any[]>>({})
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activityTimeline, setActivityTimeline] = useState<ActivityEvent[]>([])
  const [studentTimers, setStudentTimers] = useState<Record<string, number>>({})
  const selectedAttemptRef = useRef<any>(null)
  const confirm = useConfirm()

  useEffect(() => {
    selectedAttemptRef.current = selectedAttempt
  }, [selectedAttempt])

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  // Realtime subscription for attempt list
  useEffect(() => {
    if (!id) return
    const attemptsQuery = query(
      collection(db, 'exam_attempts'),
      where('exam_id', '==', id)
    )
    const unsubscribe = onSnapshot(attemptsQuery, (snapshot) => {
      const allAttempts: any[] = []
      snapshot.forEach(docSnap => {
        allAttempts.push({ id: docSnap.id, ...docSnap.data() })
      })
      const inProgress = allAttempts.filter(a => a.status === 'in_progress')
      setActiveAttempts(prev => {
        // Merge with student info from previous state
        return inProgress.map(a => {
          const existing = prev.find(p => p.id === a.id)
          return existing ? { ...a, student: existing.student } : a
        })
      })
    })
    return () => unsubscribe()
  }, [id])

  // Realtime subscription for selected attempt responses
  useEffect(() => {
    if (!selectedAttempt?.id) return
    const responsesQuery = query(
      collection(db, 'exam_responses'),
      where('attempt_id', '==', selectedAttempt.id)
    )
    const unsubscribe = onSnapshot(responsesQuery, (snapshot) => {
      const responsesMap: Record<string, any[]> = {}
      snapshot.forEach(docSnap => {
        const r = { id: docSnap.id, ...docSnap.data() } as any
        if (r.question_id) {
          if (!responsesMap[r.question_id]) responsesMap[r.question_id] = []
          responsesMap[r.question_id].push(r)
        }
      })
      Object.keys(responsesMap).forEach(qid => {
        responsesMap[qid].sort((a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )
      })
      setSelectedResponses(responsesMap)
      // Build activity from responses count
      const totalAnswered = Object.keys(responsesMap).length
      setActivityTimeline(prev => {
        const last = prev[prev.length - 1]
        if (last?.type === 'answer' && last?.message?.includes(`${totalAnswered} câu`)) return prev
        if (totalAnswered > 0) {
          const newEvent: ActivityEvent = {
            time: new Date().toLocaleTimeString('vi-VN'),
            type: 'answer',
            message: `Đã trả lời ${totalAnswered} câu hỏi`
          }
          return [...prev.filter(e => e.type !== 'answer'), newEvent]
        }
        return prev
      })
    })
    return () => unsubscribe()
  }, [selectedAttempt?.id])

  // Student countdown timers
  useEffect(() => {
    if (!exam) return
    const interval = setInterval(() => {
      const now = Date.now()
      const updated: Record<string, number> = {}
      activeAttempts.forEach(a => {
        if (a.started_at) {
          const endMs = new Date(a.started_at).getTime() + exam.duration_minutes * 60 * 1000
          updated[a.id] = Math.max(0, Math.floor((endMs - now) / 1000))
        }
      })
      setStudentTimers(updated)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeAttempts, exam])

  const fetchData = async () => {
    try {
      const [examData, attemptsData, questionsData] = await Promise.all([
        examApi.getExamById(id!),
        examApi.getAttempts(id!),
        examApi.getQuestions(id!),
      ])
      setExam(examData)
      setQuestions(questionsData)
      const inProgress = attemptsData.filter((a: any) => a.status === 'in_progress')
      setActiveAttempts(inProgress)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleViewStudent = async (attempt: any) => {
    setSelectedAttempt(attempt)
    setActivityTimeline([
      {
        time: attempt.started_at ? new Date(attempt.started_at).toLocaleTimeString('vi-VN') : '--:--',
        type: 'start',
        message: 'Bắt đầu làm bài'
      },
      ...((attempt.violations_data as any[]) || []).map((v: any) => ({
        time: new Date(v.timestamp).toLocaleTimeString('vi-VN'),
        type: 'violation' as const,
        message: getViolationTypeLabel(v.type)
      }))
    ])
  }

  const handleSuspendStudent = async (attempt: any) => {
    const confirmed = await confirm.confirm({
      title: 'Đình chỉ thi học sinh',
      message: `Bạn có chắc chắn muốn đình chỉ thi cho học sinh ${(attempt.student as any)?.full_name}? Hành động này sẽ tự động nộp bài và đóng phiên thi của học sinh.`,
      confirmText: 'Đình chỉ',
      variant: 'danger',
    })
    if (!confirmed) return
    try {
      const attemptRef = doc(db, 'exam_attempts', attempt.id)
      await updateDoc(attemptRef, {
        status: 'violation',
        submitted_at: new Date().toISOString(),
      })
      await examApi.submitExam(attempt.id, attempt.time_spent_seconds || 0, attempt.violations_data || [], 'violation')
      toast.success('Đã đình chỉ thi học sinh')
      setSelectedAttempt(null)
      setActivityTimeline([])
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi đình chỉ thi')
    }
  }

  const getViolationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      fullscreen_exit: 'Thoát toàn màn hình',
      window_blur: 'Mất focus cửa sổ',
      tab_switch: 'Chuyển tab',
      page_reload: 'Reload trang',
      right_click: 'Chuột phải',
      copy: 'Copy',
      paste: 'Paste',
      devtools: 'Mở DevTools',
    }
    return labels[type] || type
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const answeredCount = Object.keys(selectedResponses).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Giám sát: ${exam?.title || ''}`}
        description={`Theo dõi realtime bài làm và vi phạm`}
        onRefresh={() => { setRefreshing(true); fetchData() }}
        refreshing={refreshing}
        action={
          <div className="flex items-center gap-3">
            {/* LIVE Badge */}
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-full px-3 py-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-xs font-bold text-red-600">LIVE</span>
              <Wifi className="h-3.5 w-3.5 text-red-500" />
            </div>
            <button
              onClick={() => navigate(`${basePath}/exams/${id}/results`)}
              className="btn btn-secondary"
            >
              Xem kết quả
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Danh sách học sinh */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Đang thi
                <span className="ml-2 bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeAttempts.length}
                </span>
              </h3>
            </div>
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
              {activeAttempts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Không có học sinh nào đang thi</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeAttempts.map((attempt) => {
                    const violations = (attempt.violations_data as any[]) || []
                    const isSelected = selectedAttempt?.id === attempt.id
                    const timeLeft = studentTimers[attempt.id]
                    const timeWarning = timeLeft !== undefined && timeLeft < 300

                    return (
                      <div
                        key={attempt.id}
                        className={`p-4 cursor-pointer transition-all ${isSelected
                          ? 'bg-primary-50 border-l-4 border-primary-500'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                          }`}
                        onClick={() => handleViewStudent(attempt)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {(attempt.student as any)?.full_name || 'Học sinh'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Status badge */}
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400"></span>
                                </span>
                                Đang làm
                              </span>
                              {/* Timer */}
                              {timeLeft !== undefined && (
                                <span className={`text-xs font-mono font-medium flex items-center gap-0.5 ${timeWarning ? 'text-red-600' : 'text-gray-500'}`}>
                                  <Clock className="h-3 w-3" />
                                  {formatCountdown(timeLeft)}
                                </span>
                              )}
                            </div>
                          </div>
                          {violations.length > 0 && (
                            <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold flex-shrink-0">
                              <AlertTriangle className="h-3 w-3" />
                              {violations.length}
                            </div>
                          )}
                        </div>
                        {violations.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded truncate">
                              ⚠️ {getViolationTypeLabel(violations[violations.length - 1]?.type)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chi tiết */}
        <div className="lg:col-span-2">
          {selectedAttempt ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {(selectedAttempt.student as any)?.full_name || 'Học sinh'}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>
                        Đã trả lời: <strong className="text-gray-900">{answeredCount}/{questions.length}</strong> câu
                      </span>
                      {studentTimers[selectedAttempt.id] !== undefined && (
                        <span className={`font-mono font-bold flex items-center gap-1 ${studentTimers[selectedAttempt.id] < 300 ? 'text-red-600' : 'text-gray-700'}`}>
                          <Clock className="h-4 w-4" />
                          {formatCountdown(studentTimers[selectedAttempt.id])} còn lại
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(selectedAttempt.violations_data as any[])?.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-bold text-red-700">
                            {(selectedAttempt.violations_data as any[]).length} vi phạm
                          </span>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => handleSuspendStudent(selectedAttempt)}
                      className="btn btn-danger flex items-center gap-2"
                    >
                      <Ban className="h-4 w-4" />
                      Đình chỉ thi
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Activity Timeline */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-primary-600" />
                    <h4 className="font-semibold text-gray-900">Lịch sử hoạt động</h4>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activityTimeline.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Chưa có hoạt động</p>
                    ) : (
                      activityTimeline.map((event, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <span className="text-xs text-gray-400 font-mono w-14 flex-shrink-0 pt-0.5">{event.time}</span>
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${event.type === 'start' ? 'bg-green-500' :
                            event.type === 'violation' ? 'bg-red-500' :
                              event.type === 'answer' ? 'bg-blue-500' : 'bg-gray-400'
                            }`} />
                          <p className={`text-xs flex-1 ${event.type === 'violation' ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                            {event.type === 'violation' && '⚠️ '}{event.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Vi phạm */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <h4 className="font-semibold text-gray-900">Vi phạm</h4>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {!((selectedAttempt.violations_data as any[])?.length > 0) ? (
                      <p className="text-sm text-gray-400 text-center py-4">Không có vi phạm</p>
                    ) : (
                      (selectedAttempt.violations_data as any[]).map((v: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-medium text-gray-900">{getViolationTypeLabel(v.type)}</p>
                          <span className="text-xs text-gray-400">{new Date(v.timestamp).toLocaleTimeString('vi-VN')}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Bài làm */}
              {questions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <h4 className="font-semibold text-gray-900 mb-4">Tiến trình làm bài</h4>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Đã trả lời: {answeredCount} câu</span>
                      <span>{Math.round(answeredCount / questions.length * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
                    {questions.map((q: any, idx: number) => {
                      const hasResponse = selectedResponses[q.id]?.length > 0
                      return (
                        <div
                          key={q.id}
                          title={`Câu ${idx + 1}${hasResponse ? ' - Đã trả lời' : ' - Chưa trả lời'}`}
                          className={`aspect-square rounded flex items-center justify-center text-xs font-bold transition-all ${hasResponse
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-gray-100 text-gray-400 border border-gray-200'
                            }`}
                        >
                          {idx + 1}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
              <Eye className="h-16 w-16 mx-auto mb-4 text-gray-200" />
              <p className="text-gray-500">Chọn một học sinh để xem chi tiết bài làm</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
