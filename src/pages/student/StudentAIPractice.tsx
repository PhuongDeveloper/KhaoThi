import { useEffect, useState, useCallback } from 'react'
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
  Sparkles,
  RefreshCw,
  ChevronRight,
  Award,
  AlertTriangle,
  Lightbulb,
  Play,
  ArrowRight,
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

  // Data
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([])
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [allAttempts, setAllAttempts] = useState<any[]>([])

  // Practice mode
  const [activePractice, setActivePractice] = useState<PracticeSession | null>(null)
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({})
  const [practiceResult, setPracticeResult] = useState<{
    score: number; total: number; feedback: string; passed: boolean
  } | null>(null)
  const [generatingPractice, setGeneratingPractice] = useState(false)
  const [submittingPractice, setSubmittingPractice] = useState(false)

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

  // AI Phân tích
  const handleAnalyze = async () => {
    if (!profile?.id) return
    setAnalyzing(true)
    try {
      const result = await analyzeStudentLearning(profile.id, wrongAnswers, allAttempts)
      setAnalysis(result)
      toast.success('AI đã phân tích xong!')
    } catch (error: any) {
      console.error('[AI] Lỗi phân tích:', error)
      toast.error('Lỗi khi phân tích: ' + (error.message || 'Thử lại sau'))
    } finally {
      setAnalyzing(false)
    }
  }

  // Tạo bài luyện tập
  const handleGeneratePractice = async (subjectFilter?: string) => {
    if (!profile?.id) return
    setGeneratingPractice(true)
    try {
      const session = await generatePracticeFromWrongAnswers(profile.id, wrongAnswers, subjectFilter)
      if (session) {
        setActivePractice(session)
        setPracticeAnswers({})
        setPracticeResult(null)
        setActiveTab('practice')
        toast.success(`Đã tạo bài luyện tập: ${session.topic}`)
      } else {
        toast.error('Không có câu sai nào để tạo bài luyện tập')
      }
    } catch (error: any) {
      toast.error('Lỗi tạo bài luyện tập: ' + (error.message || 'Thử lại sau'))
    } finally {
      setGeneratingPractice(false)
    }
  }

  // Nộp bài luyện tập
  const handleSubmitPractice = async () => {
    if (!activePractice?.id) return
    setSubmittingPractice(true)
    try {
      const result = await submitPracticeSession(activePractice.id, practiceAnswers)
      setPracticeResult(result)
      // Refresh sessions
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

  // Radar chart data
  const getRadarData = () => {
    const subjectMap: Record<string, { correct: number; total: number }> = {}
    const completedAttempts = allAttempts.filter(
      (a: any) => a.status === 'submitted' || a.status === 'timeout'
    )
    for (const attempt of completedAttempts) {
      const subName = attempt.exam?.subject?.name || attempt.exam?.subjectName || 'Khác'
      if (!subjectMap[subName]) subjectMap[subName] = { correct: 0, total: 0 }
      const score = parseFloat(attempt.score) || 0
      const totalScore = attempt.exam?.total_score || 10
      subjectMap[subName].correct += score
      subjectMap[subName].total += totalScore
    }
    return Object.entries(subjectMap).map(([name, data]) => ({
      subject: name,
      score: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      fullMark: 100,
    }))
  }

  // Lấy subjects có câu sai
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">AI Trợ lý Học tập</h1>
            <p className="text-sm text-gray-500">Phân tích cá nhân hóa & luyện tập thông minh</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {[
          { id: 'analysis' as TabType, label: 'Phân tích AI', icon: Sparkles },
          { id: 'practice' as TabType, label: 'Luyện tập', icon: Target },
          { id: 'history' as TabType, label: 'Lịch sử luyện tập', icon: BookOpen },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== TAB: PHÂN TÍCH AI ========== */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Radar Chart + Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Radar Chart */}
            {radarData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-violet-500" />
                  Biểu đồ năng lực theo môn
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar
                      name="Điểm số"
                      dataKey="score"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tóm tắt nhanh */}
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  Thống kê nhanh
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-violet-50 rounded-lg p-3">
                    <p className="text-sm text-violet-600">Tổng bài thi</p>
                    <p className="text-2xl font-bold text-violet-700">{allAttempts.length}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-sm text-red-600">Câu sai</p>
                    <p className="text-2xl font-bold text-red-700">{wrongAnswers.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-sm text-green-600">Đã luyện tập</p>
                    <p className="text-2xl font-bold text-green-700">
                      {sessions.filter(s => s.status === 'completed').length}
                    </p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-sm text-amber-600">Chờ luyện tập</p>
                    <p className="text-2xl font-bold text-amber-700">
                      {sessions.filter(s => s.status === 'pending').length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Nút phân tích */}
              <button
                onClick={handleAnalyze}
                disabled={analyzing || wrongAnswers.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-200"
              >
                {analyzing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    AI đang phân tích...
                  </>
                ) : (
                  <>
                    <Brain className="h-5 w-5" />
                    {analysis ? 'Phân tích lại' : 'AI Phân tích học tập'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Kết quả phân tích AI */}
          {analysis && (
            <div className="space-y-4">
              {/* Tóm tắt */}
              <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Tổng quan học tập</h3>
                    <p className="text-gray-700">{analysis.overallSummary}</p>
                  </div>
                </div>
              </div>

              {/* Điểm mạnh */}
              {analysis.strengths.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Điểm mạnh
                  </h3>
                  <div className="space-y-3">
                    {analysis.strengths.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-green-800">{s.subject}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
                            {s.topics.map((t, j) => (
                              <span key={j} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="text-sm text-green-700">{s.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Điểm yếu */}
              {analysis.weaknesses.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Điểm yếu cần cải thiện
                  </h3>
                  <div className="space-y-3">
                    {analysis.weaknesses.map((w, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                        w.priority === 'high' ? 'bg-red-50' : w.priority === 'medium' ? 'bg-amber-50' : 'bg-gray-50'
                      }`}>
                        <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                          w.priority === 'high' ? 'text-red-500' : w.priority === 'medium' ? 'text-amber-500' : 'text-gray-500'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${
                              w.priority === 'high' ? 'text-red-800' : w.priority === 'medium' ? 'text-amber-800' : 'text-gray-800'
                            }`}>{w.subject}</p>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              w.priority === 'high' ? 'bg-red-100 text-red-700' : w.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {w.priority === 'high' ? 'Ưu tiên cao' : w.priority === 'medium' ? 'Trung bình' : 'Chú ý'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
                            {w.topics.map((t, j) => (
                              <span key={j} className="px-2 py-0.5 bg-white/70 text-gray-700 text-xs rounded-full border">
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="text-sm text-gray-700">{w.detail}</p>
                        </div>
                        <button
                          onClick={() => handleGeneratePractice(w.subject)}
                          disabled={generatingPractice}
                          className="flex-shrink-0 p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          title="Luyện tập chủ đề này"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Khuyến nghị + kế hoạch */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    Lời khuyên từ AI
                  </h3>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <ChevronRight className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-blue-500" />
                    Kế hoạch ôn tập
                  </h3>
                  <ol className="space-y-2">
                    {analysis.studyPlan.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-medium flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Lời động viên */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <Award className="h-6 w-6 text-emerald-500" />
                  <p className="text-emerald-800 font-medium">{analysis.encouragement}</p>
                </div>
              </div>
            </div>
          )}

          {/* Nếu chưa phân tích, hiện danh sách môn yếu */}
          {!analysis && weakSubjects.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Các môn cần luyện tập</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {weakSubjects.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleGeneratePractice(s.id)}
                    disabled={generatingPractice}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-violet-300 hover:bg-violet-50 transition-all text-left"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{s.name}</p>
                      <p className="text-sm text-red-500">{s.count} câu sai</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {wrongAnswers.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Chưa có dữ liệu bài thi nào.</p>
              <p className="text-sm text-gray-500 mt-1">Hãy làm bài thi để AI có thể phân tích giúp em!</p>
            </div>
          )}
        </div>
      )}

      {/* ========== TAB: LUYỆN TẬP ========== */}
      {activeTab === 'practice' && (
        <div className="space-y-6">
          {activePractice && !practiceResult ? (
            <>
              {/* Practice header */}
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl p-6 text-white">
                <h2 className="text-xl font-bold mb-1">🎯 {activePractice.topic}</h2>
                <p className="text-violet-100">
                  Môn: {activePractice.subject_name} · {activePractice.questions.length} câu hỏi
                </p>
              </div>

              {/* Questions */}
              <div className="space-y-4">
                {activePractice.questions.map((q, qIdx) => (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-6">
                    <p className="font-medium text-gray-900 mb-4">
                      <span className="text-violet-600">Câu {qIdx + 1}.</span> {q.content}
                    </p>
                    <div className="space-y-2">
                      {q.answers.map((a, aIdx) => {
                        const isSelected = practiceAnswers[q.id] === a.id
                        return (
                          <button
                            key={a.id}
                            onClick={() => setPracticeAnswers(prev => ({ ...prev, [q.id]: a.id }))}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'border-violet-500 bg-violet-50 text-violet-900'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                              isSelected ? 'bg-violet-500 text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {String.fromCharCode(65 + aIdx)}
                            </span>
                            <span className="text-sm">{a.content}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit */}
              <div className="flex justify-center">
                <button
                  onClick={handleSubmitPractice}
                  disabled={
                    submittingPractice ||
                    Object.keys(practiceAnswers).length < activePractice.questions.length
                  }
                  className="px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {submittingPractice ? 'Đang chấm...' : `Nộp bài (${Object.keys(practiceAnswers).length}/${activePractice.questions.length})`}
                </button>
              </div>
            </>
          ) : practiceResult ? (
            /* Result */
            <div className="space-y-6">
              <div className={`rounded-xl p-8 text-center ${
                practiceResult.passed
                  ? 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200'
                  : 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200'
              }`}>
                {practiceResult.passed ? (
                  <Award className="h-16 w-16 text-green-500 mx-auto mb-4" />
                ) : (
                  <BookOpen className="h-16 w-16 text-amber-500 mx-auto mb-4" />
                )}
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  {practiceResult.score}/{practiceResult.total} điểm
                </h2>
                <p className="text-lg text-gray-700 mb-4">{practiceResult.feedback}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setActivePractice(null)
                      setPracticeResult(null)
                      setPracticeAnswers({})
                    }}
                    className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Quay lại
                  </button>
                  {!practiceResult.passed && (
                    <button
                      onClick={() => {
                        setPracticeResult(null)
                        setPracticeAnswers({})
                      }}
                      className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                    >
                      Làm lại
                    </button>
                  )}
                </div>
              </div>

              {/* Show correct answers */}
              {activePractice && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Đáp án chi tiết:</h3>
                  {activePractice.questions.map((q, qIdx) => {
                    const studentAns = practiceAnswers[q.id]
                    const correctAns = q.answers.find(a => a.is_correct)
                    const isCorrect = studentAns === correctAns?.id

                    return (
                      <div key={q.id} className={`p-4 rounded-lg border ${
                        isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                      }`}>
                        <div className="flex items-start gap-2">
                          {isCorrect ? (
                            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">Câu {qIdx + 1}: {q.content}</p>
                            {!isCorrect && (
                              <p className="text-sm text-green-700 mt-1">
                                Đáp án đúng: {correctAns?.content}
                              </p>
                            )}
                            {(q as any).explanation && (
                              <p className="text-sm text-gray-600 mt-1 italic">
                                💡 {(q as any).explanation}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* No active practice */
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <Target className="h-12 w-12 text-violet-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-2">Chưa có bài luyện tập đang hoạt động</p>
              <p className="text-sm text-gray-500 mb-4">
                Chuyển sang tab "Phân tích AI" để AI tạo bài luyện tập từ các câu em làm sai
              </p>
              {sessions.filter(s => s.status === 'pending').length > 0 && (
                <div className="space-y-2 mt-6">
                  <p className="text-sm font-medium text-gray-700">Bài luyện tập chờ làm:</p>
                  {sessions.filter(s => s.status === 'pending').map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActivePractice(s)
                        setPracticeAnswers({})
                        setPracticeResult(null)
                      }}
                      className="flex items-center justify-between w-full max-w-md mx-auto p-3 border border-violet-200 rounded-lg hover:bg-violet-50 transition-all"
                    >
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{s.topic}</p>
                        <p className="text-xs text-gray-500">{s.subject_name} · {s.questions.length} câu</p>
                      </div>
                      <Play className="h-4 w-4 text-violet-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== TAB: LỊCH SỬ ========== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Chưa có lịch sử luyện tập nào</p>
            </div>
          ) : (
            sessions.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {s.status === 'completed' ? (
                      <div className={`p-2 rounded-lg ${s.score >= 8 ? 'bg-green-100' : 'bg-amber-100'}`}>
                        {s.score >= 8 ? (
                          <Award className="h-5 w-5 text-green-600" />
                        ) : (
                          <BookOpen className="h-5 w-5 text-amber-600" />
                        )}
                      </div>
                    ) : (
                      <div className="p-2 bg-violet-100 rounded-lg">
                        <Target className="h-5 w-5 text-violet-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{s.topic}</p>
                      <p className="text-sm text-gray-500">{s.subject_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {s.status === 'completed' ? (
                      <>
                        <p className={`text-lg font-bold ${s.score >= 8 ? 'text-green-600' : 'text-amber-600'}`}>
                          {s.score}/10
                        </p>
                        <p className="text-xs text-gray-500">
                          {s.score >= 8 ? '✅ Đã hiểu bài' : '📚 Cần ôn thêm'}
                        </p>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setActivePractice(s)
                          setPracticeAnswers({})
                          setPracticeResult(null)
                          setActiveTab('practice')
                        }}
                        className="px-3 py-1.5 text-sm bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200"
                      >
                        Làm bài
                      </button>
                    )}
                  </div>
                </div>
                {s.ai_feedback && (
                  <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {s.ai_feedback}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
