import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { examApi } from '../../lib/api/exams'
import {
  getStudentWrongAnswers,
  analyzeStudentLearning,
  generatePracticeFromWrongAnswers,
  submitPracticeSession,
  getStudentPracticeSessions,
  type WrongAnswer,
  type LearningAnalysis,
  type PracticeSession,
} from '../../lib/api/ai-student'
import toast from 'react-hot-toast'
import {
  Brain,
  BookOpen,
  Target,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  RefreshCw,
  Award,
  Lightbulb,
  Play,
  ArrowRight,
  BarChart3,
  Loader2,
  Bell,
} from 'lucide-react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import LoadingSpinner from '../../components/LoadingSpinner'

type TabType = 'analysis' | 'practice' | 'history'

export default function StudentAIPractice() {
  const { profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('analysis')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([])
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [allAttempts, setAllAttempts] = useState<any[]>([])

  const [activePractice, setActivePractice] = useState<PracticeSession | null>(null)
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({})
  const [practiceResult, setPracticeResult] = useState<{
    score: number; total: number; feedback: string; passed: boolean
  } | null>(null)
  const [generatingPractice, setGeneratingPractice] = useState(false)
  const [submittingPractice, setSubmittingPractice] = useState(false)

  const [lastSubjectFilter, setLastSubjectFilter] = useState<string | undefined>()
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const [wrong, attempts, practiceSessions] = await Promise.all([
        getStudentWrongAnswers(profile.id),
        examApi.getAttempts(undefined, true),
        getStudentPracticeSessions(profile.id),
      ])
      setWrongAnswers(wrong)
      setAllAttempts(attempts || [])
      setSessions(practiceSessions)
    } catch (error: any) {
      console.error('[AI Practice] Lỗi tải dữ liệu:', error)
      toast.error('Lỗi khi tải dữ liệu học tập')
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Notification badge count: pending + failed (score < 8)
  const notificationCount = sessions.filter(
    s => s.status === 'pending' || (s.status === 'completed' && s.score < 8)
  ).length
  const notificationSessions = sessions.filter(
    s => s.status === 'pending' || (s.status === 'completed' && s.score < 8)
  ).slice(0, 10)

  const handleAnalyze = async () => {
    if (!profile?.id) return
    setAnalyzing(true)
    try {
      const result = await analyzeStudentLearning(profile.id, wrongAnswers, allAttempts)
      setAnalysis(result)
      toast.success('AI hoàn tất phân tích')
    } catch (error: any) {
      toast.error('Lỗi phân tích: ' + (error.message || 'Thử lại sau'))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGeneratePractice = async (subjectFilter?: string) => {
    if (!profile?.id) return
    setGeneratingPractice(true)
    setLastSubjectFilter(subjectFilter)
    try {
      const session = await generatePracticeFromWrongAnswers(profile.id, wrongAnswers, subjectFilter)
      if (session) {
        setActivePractice(session)
        setPracticeAnswers({})
        setPracticeResult(null)
        setActiveTab('practice')
        toast.success('Bắt đầu bài luyện tập: ' + session.topic)
      } else {
        toast.error('Không tìm thấy dữ liệu câu sai để tạo bài')
      }
    } catch (error: any) {
      toast.error('Lỗi tạo bài: ' + (error.message || 'Thử lại sau'))
    } finally {
      setGeneratingPractice(false)
    }
  }

  // Generate completely new questions based on mistakes
  const handleRetryPractice = async () => {
    await handleGeneratePractice(lastSubjectFilter)
  }

  const handleSubmitPractice = async () => {
    if (!activePractice?.id) return
    setSubmittingPractice(true)
    try {
      const result = await submitPracticeSession(activePractice.id, practiceAnswers)
      setPracticeResult(result)
      if (profile?.id) {
        const updated = await getStudentPracticeSessions(profile.id)
        setSessions(updated)
      }
    } catch (error: any) {
      toast.error('Lỗi nộp bài: ' + (error.message || 'Thử lại sau'))
    } finally {
      setSubmittingPractice(false)
    }
  }

  const getRadarData = () => {
    const subjectMap: Record<string, { correct: number; total: number }> = {}
    const completedAttempts = allAttempts.filter(
      (a: any) => a.status === 'submitted' || a.status === 'timeout'
    )
    for (const attempt of completedAttempts) {
      const subName = attempt.exam?.subject?.name || attempt.exam?.subjectName || 'Khác'
      if (!subjectMap[subName]) subjectMap[subName] = { correct: 0, total: 0 }
      subjectMap[subName].correct += parseFloat(attempt.score) || 0
      subjectMap[subName].total += attempt.exam?.total_score || 10
    }
    return Object.entries(subjectMap).map(([name, data]) => ({
      subject: name,
      score: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      fullMark: 100,
    }))
  }

  const getWeakSubjects = () => {
    const subjectMap: Record<string, { name: string; id: string; count: number }> = {}
    for (const wa of wrongAnswers) {
      if (!subjectMap[wa.subjectId]) {
        subjectMap[wa.subjectId] = { name: wa.subjectName, id: wa.subjectId, count: 0 }
      }
      subjectMap[wa.subjectId].count++
    }
    return Object.values(subjectMap).sort((a, b) => b.count - a.count)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const radarData = getRadarData()
  const weakSubjects = getWeakSubjects()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header aligned with overall app aesthetics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Trợ lý Học tập</h1>
          <p className="text-gray-500 mt-1">Hệ thống phân tích thông minh và đề xuất lộ trình ôn tập cá nhân hóa</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
              title="Thông báo bài luyện tập"
            >
              <Bell className="h-5 w-5 text-gray-600" />
              {notificationCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm animate-pulse">
                  {notificationCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <h4 className="font-bold text-gray-800 text-sm">Bài luyện tập cần hoàn thành</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{notificationCount} bài chưa làm hoặc chưa đạt</p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {notificationSessions.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      Không có bài luyện tập nào cần hoàn thành
                    </div>
                  ) : (
                    notificationSessions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActivePractice(s)
                          setPracticeAnswers({})
                          setPracticeResult(null)
                          setActiveTab('practice')
                          setShowNotifications(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 transition-colors text-left"
                      >
                        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                          s.status === 'pending'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {s.status === 'pending' ? (
                            <Target className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{s.topic}</p>
                          <p className="text-xs text-gray-500">
                            {s.subject_name} • {s.status === 'pending' ? 'Chưa làm' : `Chưa đạt (${s.score}/10)`}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                          s.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {s.status === 'pending' ? 'Làm ngay' : 'Thử lại'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={fetchData}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới dữ liệu
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { id: 'analysis' as TabType, label: 'Phân tích tổng quan', icon: Brain },
            { id: 'practice' as TabType, label: 'Không gian luyện tập', icon: Target },
            { id: 'history' as TabType, label: 'Lịch sử học tập', icon: BookOpen },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ========== TAB: PHÂN TÍCH AI ========== */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Cột trái: Radar Chart & Thống kê */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-gray-500" />
                  Mức độ thông thạo
                </h3>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#374151', fontSize: 13, fontWeight: 500 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Radar
                        name="Thông thạo (%)"
                        dataKey="score"
                        stroke="#0ea5e9"
                        fill="#0ea5e9"
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                    <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                    <p>Chưa đủ dữ liệu biểu đồ</p>
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Hoạt động học tập</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col items-center justify-center">
                    <p className="text-sm text-slate-500 font-medium">Bài đã thi</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">{allAttempts.length}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex flex-col items-center justify-center">
                    <p className="text-sm text-red-500 font-medium">Lỗi sai</p>
                    <p className="text-3xl font-bold text-red-600 mt-1">{wrongAnswers.length}</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex flex-col items-center justify-center">
                    <p className="text-sm text-green-600 font-medium">Bài đã luyện</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">
                      {sessions.filter(s => s.status === 'completed').length}
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex flex-col items-center justify-center">
                    <p className="text-sm text-amber-600 font-medium">Chờ luyện tập</p>
                    <p className="text-3xl font-bold text-amber-700 mt-1">
                      {sessions.filter(s => s.status === 'pending').length}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || wrongAnswers.length === 0}
                    className="w-full btn btn-primary flex justify-center items-center gap-2 py-3 disabled:opacity-50"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Trí tuệ nhân tạo đang phân tích
                      </>
                    ) : (
                      <>
                        <Brain className="h-5 w-5" />
                        {analysis ? 'Cập nhật phân tích mới' : 'Tiến hành phân tích học tập'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Danh sách môn yếu (khi chưa phân tích) */}
              {!analysis && weakSubjects.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-4">Cần ưu tiên luyện tập</h3>
                  <div className="space-y-3">
                    {weakSubjects.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleGeneratePractice(s.id)}
                        disabled={generatingPractice}
                        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 hover:shadow-sm transition-all text-left"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{s.name}</p>
                          <p className="text-sm text-red-500 font-medium">{s.count} câu cần khắc phục</p>
                        </div>
                        <div className="bg-white p-2 rounded-full shadow-sm">
                          <ArrowRight className="h-4 w-4 text-primary-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cột phải: Báo cáo AI */}
            <div className="lg:col-span-8 space-y-6">
              {analysis ? (
                <div className="space-y-6">
                  
                  {/* Tóm tắt */}
                  <div className="bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200/60 rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-primary-900 mb-2 flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary-600" />
                      Đánh giá tổng quan
                    </h3>
                    <p className="text-primary-800 leading-relaxed font-medium">{analysis.overallSummary}</p>
                  </div>

                  {/* Điểm yếu */}
                  {analysis.weaknesses.length > 0 && (
                    <div className="card border-t-4 border-t-red-500">
                      <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                        <TrendingDown className="h-5 w-5 text-red-500" />
                        Trọng tâm cần khắc phục
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analysis.weaknesses.map((w, i) => (
                          <div key={i} className="flex flex-col h-full p-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:border-gray-300 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-gray-800 text-lg">{w.subject}</h4>
                              <span className={`px-2.5 py-1 text-xs rounded-md font-bold uppercase tracking-wider ${
                                w.priority === 'high' ? 'bg-red-100 text-red-700' : 
                                w.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                              }`}>
                                {w.priority === 'high' ? 'Cấp bách' : w.priority === 'medium' ? 'Lưu ý' : 'Theo dõi'}
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mb-3">
                              {w.topics.map((t, j) => (
                                <span key={j} className="px-2 py-1 bg-white shadow-sm border border-gray-200 text-gray-700 text-xs font-medium rounded-md">
                                  {t}
                                </span>
                              ))}
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-4 flex-grow">{w.detail}</p>
                            
                            <button
                              onClick={() => handleGeneratePractice(w.subject)}
                              disabled={generatingPractice}
                              className="mt-auto w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 font-medium rounded-lg transition-all text-sm flex justify-center items-center gap-2"
                            >
                              Khắc phục ngay
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lời khuyên & Kế hoạch */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card h-full">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                        Đề xuất phương pháp
                      </h3>
                      <ul className="space-y-3">
                        {analysis.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-gray-700 text-sm leading-relaxed">{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="card h-full">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary-500" />
                        Lộ trình tiếp theo
                      </h3>
                      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                        {analysis.studyPlan.map((s, i) => (
                          <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-primary-50 text-slate-500 group-[.is-active]:text-primary-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 font-bold text-sm">
                              0{i + 1}
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] card !p-3">
                              <p className="text-sm font-medium text-slate-800">{s}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Điểm mạnh */}
                  {analysis.strengths.length > 0 && (
                    <div className="card border-t-4 border-t-green-500">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        Lĩnh vực thành thạo
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {analysis.strengths.map((s, i) => (
                          <div key={i} className="p-3 bg-green-50/50 border border-green-100 rounded-xl">
                            <p className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              {s.subject}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {s.topics.map((t, j) => (
                                <span key={j} className="px-2 py-0.5 bg-white border border-green-200 text-green-700 text-xs font-medium rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lời động viên */}
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-5 shadow-sm text-white flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-full flex-shrink-0">
                      <Award className="h-6 w-6 text-white" />
                    </div>
                    <p className="font-medium text-lg">{analysis.encouragement}</p>
                  </div>

                </div>
              ) : (
                <div className="card h-full min-h-[400px] flex flex-col justify-center items-center text-center">
                  <div className="bg-gray-50 h-24 w-24 rounded-full flex items-center justify-center mb-6">
                    <Brain className="h-10 w-10 text-gray-300" />
                  </div>
                  {allAttempts.length === 0 ? (
                    <>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Chào bạn!</h3>
                      <p className="text-gray-500 max-w-md">Bạn chưa làm bài tập nào cả, hãy thử làm một bài kiểm tra để hệ thống phân tích điểm yếu của bạn và đưa ra các phần luyện tập tương ứng nhé.</p>
                    </>
                  ) : wrongAnswers.length === 0 ? (
                    <>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Xuất sắc!</h3>
                      <p className="text-gray-500 max-w-md">Bạn chưa có câu trả lời sai nào. Hãy tiếp tục làm thêm bài kiểm tra để AI có thêm dữ liệu phân tích nhé.</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Sẵn sàng phân tích học tập</h3>
                      <p className="text-gray-500 max-w-md mb-6">Nhấn nút bên cạnh để AI phân tích và đưa ra báo cáo học tập cho bạn.</p>
                      <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="btn btn-primary"
                      >
                        {analyzing ? 'Hệ thống đang xử lý...' : 'Tiến hành phân tích'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== TAB: LUYỆN TẬP ========== */}
      {activeTab === 'practice' && (
        <div className="space-y-6">
          {activePractice && !practiceResult ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Practice header */}
              <div className="card sticky top-4 z-10 shadow-sm border-primary-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{activePractice.topic}</h2>
                    <p className="text-primary-600 font-medium mt-1">
                      Môn học: {activePractice.subject_name} • Tổng cộng {activePractice.questions.length} câu hỏi rèn luyện
                    </p>
                  </div>
                  <div className="bg-slate-100 px-4 py-2 rounded-lg font-mono font-semibold text-slate-700">
                    Tiến độ: {Object.keys(practiceAnswers).length}/{activePractice.questions.length}
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-gray-100 h-2 rounded-full mt-5 overflow-hidden">
                  <div 
                    className="bg-primary-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${(Object.keys(practiceAnswers).length / activePractice.questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-8">
                {activePractice.questions.map((q, qIdx) => (
                  <div key={q.id} className="card shadow-sm border-gray-200">
                    <div className="flex items-start gap-3 mb-6">
                      <div className="bg-primary-100 text-primary-700 px-3 py-1 rounded-md font-bold shrink-0">
                        {qIdx + 1}
                      </div>
                      <p className="font-semibold text-gray-800 text-lg leading-relaxed pt-0.5">
                        {q.content}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {q.answers.map((a, aIdx) => {
                        const isSelected = practiceAnswers[q.id] === a.id
                        return (
                          <button
                            key={a.id}
                            onClick={() => setPracticeAnswers(prev => ({ ...prev, [q.id]: a.id }))}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all group ${
                              isSelected
                                ? 'border-primary-500 bg-primary-50 shadow-sm'
                                : 'border-gray-100 hover:border-primary-300 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                              isSelected 
                                ? 'bg-primary-500 text-white shadow-sm' 
                                : 'bg-gray-100 text-gray-500 group-hover:bg-primary-100 group-hover:text-primary-600'
                            }`}>
                              {String.fromCharCode(65 + aIdx)}
                            </span>
                            <span className={`text-base font-medium ${isSelected ? 'text-primary-900' : 'text-gray-700'}`}>
                              {a.content}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="card flex justify-between items-center bg-gray-50 border-gray-200">
                <p className="text-gray-500 font-medium">
                  {Object.keys(practiceAnswers).length === activePractice.questions.length 
                    ? "Tất cả các câu đã được chọn" 
                    : `Còn thiếu ${activePractice.questions.length - Object.keys(practiceAnswers).length} câu chưa chọn`}
                </p>
                <button
                  onClick={handleSubmitPractice}
                  disabled={
                    submittingPractice ||
                    Object.keys(practiceAnswers).length < activePractice.questions.length
                  }
                  className="btn btn-primary px-8 py-3 text-lg disabled:opacity-50"
                >
                  {submittingPractice ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Hệ thống đang đánh giá
                    </span>
                  ) : (
                    'Nộp bài'
                  )}
                </button>
              </div>
            </div>
          ) : practiceResult ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Result Summary */}
              <div className={`card text-center border-t-8 ${
                practiceResult.passed ? 'border-t-green-500' : 'border-t-amber-500'
              }`}>
                {practiceResult.passed ? (
                  <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  </div>
                ) : (
                  <div className="h-20 w-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Target className="h-10 w-10 text-amber-600" />
                  </div>
                )}
                
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Kết quả đánh giá</h2>
                <div className="flex items-end justify-center gap-2 mb-6">
                  <span className={`text-6xl font-black tracking-tight ${practiceResult.passed ? 'text-green-600' : 'text-amber-600'}`}>
                    {practiceResult.score}
                  </span>
                  <span className="text-2xl font-bold text-gray-400 mb-1">/ {practiceResult.total}</span>
                  <span className="text-lg font-semibold text-gray-500 mb-1 ml-2">điểm</span>
                </div>
                
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-8 max-w-2xl mx-auto">
                  <p className="text-slate-800 text-lg font-medium leading-relaxed">{practiceResult.feedback}</p>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button
                    onClick={() => {
                      setActivePractice(null)
                      setPracticeResult(null)
                      setPracticeAnswers({})
                      setActiveTab('analysis')
                    }}
                    className="btn border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 px-6 py-3 font-semibold"
                  >
                    Xem báo cáo chung
                  </button>
                  {!practiceResult.passed && (
                    <button
                      onClick={handleRetryPractice}
                      disabled={generatingPractice}
                      className="btn btn-primary px-8 py-3 font-semibold text-base"
                    >
                      {generatingPractice ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Chuẩn bị câu hỏi mới...
                        </span>
                      ) : (
                        'Phát sinh đề tương tự để rèn luyện lại'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Detailed Review */}
              {activePractice && (
                <div className="card !p-0 overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                    <h3 className="text-lg font-bold text-gray-800">Giải thích chi tiết từng câu</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {activePractice.questions.map((q, qIdx) => {
                      const studentAns = practiceAnswers[q.id]
                      const correctAns = q.answers.find(a => a.is_correct)
                      const isCorrect = studentAns === correctAns?.id
                      const studentSelected = q.answers.find(a => a.id === studentAns)

                      return (
                        <div key={q.id} className="p-6">
                          <div className="flex gap-4">
                            <div className="shrink-0 mt-1">
                              {isCorrect ? (
                                <div className="bg-green-100 text-green-700 rounded-full p-1.5">
                                  <CheckCircle className="h-5 w-5" />
                                </div>
                              ) : (
                                <div className="bg-red-100 text-red-700 rounded-full p-1.5">
                                  <XCircle className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 w-full overflow-hidden">
                              <h4 className="text-base font-bold text-gray-900 mb-3 leading-snug">
                                Câu {qIdx + 1}: {q.content}
                              </h4>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <div className={`p-3 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                  <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Lựa chọn của bạn</p>
                                  <p className="font-medium">{studentSelected?.content || 'Chưa trả lời'}</p>
                                </div>
                                {!isCorrect && (
                                  <div className="p-3 rounded-lg border bg-green-50 border-green-200">
                                    <p className="text-xs text-green-800 font-semibold uppercase tracking-wider mb-1">Đáp án chính xác</p>
                                    <p className="text-green-900 font-medium">{correctAns?.content}</p>
                                  </div>
                                )}
                              </div>
                              
                              {(q as any).explanation && (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 relative">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-400 rounded-l-lg" />
                                  <p className="font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
                                    <Lightbulb className="h-4 w-4" />
                                    Giải thích học thuật
                                  </p>
                                  <p className="text-blue-900 text-sm">{((q as any).explanation)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card h-[500px] flex flex-col justify-center items-center text-center">
              <div className="bg-slate-50 h-24 w-24 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                <Target className="h-10 w-10 text-slate-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Chưa khởi tạo khung luyện tập</h2>
              <p className="text-gray-500 max-w-md mb-8">
                Hệ thống chưa tạo bài tập nào cho bạn. Hãy chuyển sang phần Phân tích để yêu cầu AI cấu trúc đề thi tùy biến dựa trên sai sót của bạn.
              </p>
              
              {sessions.filter(s => s.status === 'pending').length > 0 && (
                <div className="w-full max-w-xl text-left border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800">Các phiên luyện tập dạng chờ:</p>
                  </div>
                  <div className="divide-y divide-gray-100 bg-white">
                    {sessions.filter(s => s.status === 'pending').map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActivePractice(s)
                          setPracticeAnswers({})
                          setPracticeResult(null)
                        }}
                        className="flex items-center justify-between w-full p-4 hover:bg-primary-50 transition-colors group"
                      >
                        <div>
                          <p className="font-bold text-gray-900 group-hover:text-primary-700 transition-colors">{s.topic}</p>
                          <p className="text-sm font-medium text-gray-500 mt-0.5">{s.subject_name} • {s.questions.length} câu hỏi</p>
                        </div>
                        <div className="bg-white border border-gray-200 group-hover:border-primary-300 rounded-full p-2 shadow-sm text-gray-400 group-hover:text-primary-600 transition-all">
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== TAB: LỊCH SỬ ========== */}
      {activeTab === 'history' && (
        <div className="max-w-4xl mx-auto">
          {sessions.length === 0 ? (
            <div className="card min-h-[400px] flex flex-col items-center justify-center text-center">
              <div className="bg-slate-50 h-24 w-24 rounded-full flex items-center justify-center mb-5 border border-slate-100">
                <BookOpen className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Cơ sở dữ liệu trống</h3>
              <p className="text-gray-500 mt-2">Toàn bộ hồ sơ luyện tập AI của học viên sẽ lưu ở khu vực này.</p>
            </div>
          ) : (
            <div className="card !p-0 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                <h3 className="font-bold text-gray-800">Biên bản luyện tập gần đây</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {sessions.map(s => (
                  <div key={s.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-4">
                      {s.status === 'completed' ? (
                        s.score >= 8 ? (
                          <div className="bg-green-100 text-green-600 rounded-full p-2 mt-1">
                            <CheckCircle className="h-5 w-5" />
                          </div>
                        ) : (
                          <div className="bg-amber-100 text-amber-600 rounded-full p-2 mt-1">
                            <XCircle className="h-5 w-5" />
                          </div>
                        )
                      ) : (
                        <div className="bg-blue-100 text-blue-600 rounded-full p-2 mt-1">
                          <Target className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900 text-base">{s.topic}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{s.subject_name}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs font-medium text-gray-500">
                            {s.created_at?.toDate?.()?.toLocaleDateString('vi-VN') || new Date().toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      {s.status === 'completed' ? (
                        <div className="flex flex-col items-end">
                          <div className="flex items-baseline gap-1">
                            <span className={`text-2xl font-black ${s.score >= 8 ? 'text-green-600' : 'text-amber-600'}`}>
                              {s.score}
                            </span>
                            <span className="text-sm font-bold text-gray-400">/10</span>
                          </div>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-1">Điểm đánh giá</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActivePractice(s)
                            setPracticeAnswers({})
                            setPracticeResult(null)
                            setActiveTab('practice')
                          }}
                          className="btn btn-secondary py-1.5 px-4 text-sm"
                        >
                          Tiếp tục
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
