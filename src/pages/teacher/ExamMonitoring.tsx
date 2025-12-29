import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Eye, AlertTriangle, User, Ban } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import { useConfirm } from '../../hooks/useConfirm'

export default function ExamMonitoring() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  
  const [exam, setExam] = useState<any>(null)
  const [activeAttempts, setActiveAttempts] = useState<any[]>([])
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null)
  const [selectedResponses, setSelectedResponses] = useState<Record<string, any[]>>({})
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (id) {
      fetchData()
    }

    return () => {
      // Cleanup subscription
      const channel = supabase.channel(`exam-monitoring-${id}`)
      supabase.removeChannel(channel)
    }
  }, [id])

  useEffect(() => {
    if (id && activeAttempts.length > 0) {
      const cleanup = setupRealtimeSubscription()
      return cleanup
    }
  }, [id, activeAttempts.length])

  const fetchData = async () => {
    try {
      const [examData, attemptsData, questionsData] = await Promise.all([
        examApi.getExamById(id!),
        examApi.getAttempts(id!),
        examApi.getQuestions(id!),
      ])

      setExam(examData)
      setQuestions(questionsData)
      // Chỉ lấy các attempts đang in_progress
      const inProgressAttempts = attemptsData.filter((a: any) => a.status === 'in_progress')
      setActiveAttempts(inProgressAttempts)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const setupRealtimeSubscription = () => {
    if (!id || activeAttempts.length === 0) return () => {}

    // Subscribe to exam_attempts changes
    const channel = supabase
      .channel(`exam-monitoring-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_attempts',
          filter: `exam_id=eq.${id}`,
        },
        (payload) => {
          console.log('Attempt changed:', payload)
          fetchData()
        }
      )
      .subscribe()

    // Subscribe to responses changes cho từng attempt
    const responseChannels: any[] = []
    activeAttempts.forEach((attempt) => {
      const responseChannel = supabase
        .channel(`exam-responses-${attempt.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exam_responses',
            filter: `attempt_id=eq.${attempt.id}`,
          },
          (payload) => {
            console.log('Response changed:', payload)
            if (selectedAttempt?.id === attempt.id) {
              loadAttemptDetails(attempt.id)
            }
          }
        )
        .subscribe()
      responseChannels.push(responseChannel)
    })

    return () => {
      supabase.removeChannel(channel)
      responseChannels.forEach((responseChannel) => {
        supabase.removeChannel(responseChannel)
      })
    }
  }

  const loadAttemptDetails = async (attemptId: string) => {
    try {
      const { data: responsesData } = await supabase
        .from('exam_responses')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: true })

      const responsesMap: Record<string, any[]> = {}
      responsesData?.forEach((r: any) => {
        if (!responsesMap[r.question_id]) {
          responsesMap[r.question_id] = []
        }
        responsesMap[r.question_id].push(r)
      })

      setSelectedResponses(responsesMap)
    } catch (error: any) {
      console.error('Error loading attempt details:', error)
    }
  }

  const handleViewStudent = async (attempt: any) => {
    setSelectedAttempt(attempt)
    await loadAttemptDetails(attempt.id)
    
    // Load questions nếu chưa có
    if (!attempt.questions) {
      const questions = await examApi.getQuestions(id!)
      setSelectedAttempt({ ...attempt, questions })
    }
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
      // Update attempt status to 'violation'
      const { error } = await supabase
        .from('exam_attempts')
        .update({
          status: 'violation',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

      if (error) throw error

      // Submit the exam với status violation
      await examApi.submitExam(attempt.id, attempt.time_spent_seconds || 0, attempt.violations_data || [], 'violation')

      toast.success('Đã đình chỉ thi học sinh')
      fetchData()
      setSelectedAttempt(null)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi đình chỉ thi')
    }
  }

  const refreshData = () => {
    setRefreshing(true)
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Giám sát bài thi: ${exam?.title || ''}`}
        description={`Theo dõi realtime bài làm của học sinh và các vi phạm`}
        onRefresh={refreshData}
        refreshing={refreshing}
        action={
          <button
            onClick={() => navigate(`${basePath}/exams/${id}/results`)}
            className="btn btn-secondary"
          >
            Xem kết quả
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Danh sách học sinh đang thi */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Học sinh đang thi ({activeAttempts.length})</h3>
            </div>
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
              {activeAttempts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>Không có học sinh nào đang thi</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {activeAttempts.map((attempt) => {
                    const violations = (attempt.violations_data as any[]) || []
                    const violationCount = violations.length
                    const isSelected = selectedAttempt?.id === attempt.id
                    
                    return (
                      <div
                        key={attempt.id}
                        className={`p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleViewStudent(attempt)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {(attempt.student as any)?.full_name || 'Học sinh'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {attempt.time_spent_seconds
                                ? `${Math.floor(attempt.time_spent_seconds / 60)}:${String(
                                    attempt.time_spent_seconds % 60
                                  ).padStart(2, '0')}`
                                : '0:00'}
                            </p>
                          </div>
                          {violationCount > 0 && (
                            <div className="flex items-center space-x-1 bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold">
                              <AlertTriangle className="h-3 w-3" />
                              <span>{violationCount}</span>
                            </div>
                          )}
                        </div>
                        {violations.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {violations.slice(-3).map((v: any, idx: number) => (
                              <div key={idx} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                {getViolationTypeLabel(v.type)}
                              </div>
                            ))}
                            {violations.length > 3 && (
                              <p className="text-xs text-gray-500">+{violations.length - 3} vi phạm khác</p>
                            )}
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

        {/* Chi tiết bài làm học sinh */}
        <div className="lg:col-span-2">
          {selectedAttempt ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {(selectedAttempt.student as any)?.full_name || 'Học sinh'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Thời gian làm bài: {selectedAttempt.time_spent_seconds
                        ? `${Math.floor(selectedAttempt.time_spent_seconds / 60)}:${String(
                            selectedAttempt.time_spent_seconds % 60
                          ).padStart(2, '0')}`
                        : '0:00'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {(selectedAttempt.violations_data as any[])?.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <div>
                            <p className="text-sm font-semibold text-red-700">
                              {(selectedAttempt.violations_data as any[]).length} vi phạm
                            </p>
                            <p className="text-xs text-red-600">Cảnh báo</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => handleSuspendStudent(selectedAttempt)}
                      className="btn btn-danger flex items-center space-x-2"
                    >
                      <Ban className="h-4 w-4" />
                      <span>Đình chỉ thi</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Danh sách vi phạm */}
              {(selectedAttempt.violations_data as any[])?.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Lịch sử vi phạm</h4>
                  <div className="space-y-2">
                    {(selectedAttempt.violations_data as any[]).map((violation: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {getViolationTypeLabel(violation.type)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(violation.timestamp).toLocaleString('vi-VN')}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-red-600 font-medium">{violation.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bài làm hiện tại */}
              {questions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-4">Bài làm hiện tại</h4>
                  <div className="space-y-4">
                    {questions.map((question: any, idx: number) => {
                      const responses = selectedResponses[question.id] || []
                      
                      return (
                        <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-medium text-gray-900">Câu {idx + 1}</h5>
                            {responses.length > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                Đã trả lời
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{question.content}</p>
                          
                          {/* Hiển thị đáp án học sinh đã chọn */}
                          {question.question_type === 'multiple_choice' && responses[0] && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-2">
                              <p className="text-xs text-blue-700">
                                Đã chọn: {question.answers?.find((a: any) => a.id === responses[0].answer_id)?.content || '-'}
                              </p>
                            </div>
                          )}
                          
                          {question.question_type === 'true_false_multi' && (
                            <div className="space-y-2">
                              {question.answers?.map((answer: any) => {
                                const response = responses.find((r: any) => r.answer_id === answer.id)
                                return response ? (
                                  <div key={answer.id} className="bg-blue-50 border border-blue-200 rounded p-2">
                                    <p className="text-xs text-blue-700">
                                      {answer.content}: {response.text_answer === 'true' ? 'Đúng' : 'Sai'}
                                    </p>
                                  </div>
                                ) : null
                              })}
                            </div>
                          )}
                          
                          {question.question_type === 'short_answer' && responses[0]?.text_answer && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-2">
                              <p className="text-xs text-blue-700">
                                Đáp án: {responses[0].text_answer}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <Eye className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Chọn một học sinh để xem chi tiết bài làm</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

