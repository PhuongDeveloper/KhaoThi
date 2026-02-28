import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Users, Eye, Download, Trophy, TrendingUp } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

export default function TeacherExamResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'

  const [exam, setExam] = useState<any>(null)
  const [attempts, setAttempts] = useState<any[]>([])
  const [questionStats, setQuestionStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchData()
  }, [id])

  const fetchData = async () => {
    try {
      const [examData, attemptsData, questionsData] = await Promise.all([
        examApi.getExamById(id!),
        examApi.getAttempts(id!),
        examApi.getQuestions(id!),
      ])
      setExam(examData)
      setAttempts(attemptsData)
      if (attemptsData.length > 0 && questionsData.length > 0) {
        calculateQuestionStats(questionsData, attemptsData).then(setQuestionStats).catch(() => { })
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  const calculateQuestionStats = async (questions: any[], attempts: any[]) => {
    const stats: any[] = []
    for (const question of questions) {
      let correctCount = 0, totalCount = 0
      for (const attempt of attempts) {
        if (attempt.status === 'submitted' || attempt.status === 'timeout') {
          const snap = await getDocs(query(collection(db, 'exam_responses'),
            where('attempt_id', '==', attempt.id), where('question_id', '==', question.id)))
          if (!snap.empty) {
            totalCount++
            if (snap.docs.some(d => d.data().is_correct)) correctCount++
          }
        }
      }
      stats.push({
        questionNumber: questions.indexOf(question) + 1,
        questionId: question.id,
        questionType: question.question_type,
        correctCount,
        totalCount,
        accuracyRate: totalCount > 0 ? Math.round((correctCount / totalCount) * 100 * 10) / 10 : 0,
      })
    }
    return stats
  }

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = submittedAttempts
        .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
        .map((a, idx) => ({
          'Hạng': idx + 1,
          'Họ tên': (a.student as any)?.full_name || '-',
          'Điểm': `${a.score || 0}/${exam?.total_score || 10}`,
          'Tỉ lệ (%)': a.percentage || 0,
          'Thời gian làm': a.time_spent_seconds ? `${Math.floor(a.time_spent_seconds / 60)}:${String(a.time_spent_seconds % 60).padStart(2, '0')}` : '-',
          'Vi phạm': a.violations_count || 0,
          'Trạng thái': a.status === 'submitted' ? 'Đã nộp' : a.status === 'violation' ? 'Vi phạm' : 'Timeout',
        }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Kết quả')
      XLSX.writeFile(wb, `ketqua_${exam?.title || 'baithi'}.xlsx`)
      toast.success('Xuất Excel thành công')
    } catch {
      toast.error('Lỗi khi xuất Excel')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>
  }

  const submittedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'timeout')
  const avgScore = submittedAttempts.length > 0
    ? submittedAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / submittedAttempts.length : 0
  const passCount = submittedAttempts.filter(a => (a.percentage || 0) >= (exam?.passing_score || 50)).length

  const scoreDistribution = [
    { range: '0–20%', count: submittedAttempts.filter(a => (a.percentage || 0) < 20).length },
    { range: '20–40%', count: submittedAttempts.filter(a => (a.percentage || 0) >= 20 && (a.percentage || 0) < 40).length },
    { range: '40–60%', count: submittedAttempts.filter(a => (a.percentage || 0) >= 40 && (a.percentage || 0) < 60).length },
    { range: '60–80%', count: submittedAttempts.filter(a => (a.percentage || 0) >= 60 && (a.percentage || 0) < 80).length },
    { range: '80–100%', count: submittedAttempts.filter(a => (a.percentage || 0) >= 80).length },
  ]

  const questionTypeStats = ['multiple_choice', 'true_false_multi', 'short_answer'].map(type => {
    const qs = questionStats.filter(s => s.questionType === type)
    const correct = qs.reduce((s, q) => s + q.correctCount, 0)
    const total = qs.reduce((s, q) => s + q.totalCount, 0)
    return {
      type: type === 'multiple_choice' ? 'Trắc nghiệm' : type === 'true_false_multi' ? 'Đúng/Sai' : 'Ngắn',
      accuracyRate: total > 0 ? Math.round((correct / total) * 100 * 10) / 10 : 0,
    }
  })

  const passFailData = [
    { name: 'Đạt', value: passCount, color: '#10b981' },
    { name: 'Không đạt', value: submittedAttempts.length - passCount, color: '#ef4444' },
  ]

  const rankedAttempts = [...submittedAttempts].sort((a, b) => (b.percentage || 0) - (a.percentage || 0))

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Kết quả: ${exam?.title || ''}`}
        description={`${(exam?.subject as any)?.name || ''} • ${exam?.total_questions || 0} câu • ${exam?.duration_minutes || 0} phút`}
        action={
          <button onClick={handleExportExcel} className="btn btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Học sinh nộp bài', value: submittedAttempts.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Điểm trung bình', value: `${avgScore.toFixed(1)}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
          { label: 'Tỷ lệ đạt', value: `${submittedAttempts.length ? Math.round(passCount / submittedAttempts.length * 100) : 0}%`, icon: Trophy, color: 'text-green-600 bg-green-50' },
          { label: 'Điểm cao nhất', value: `${rankedAttempts[0]?.percentage || 0}%`, icon: Trophy, color: 'text-yellow-600 bg-yellow-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
              </div>
              <div className={`p-3 rounded-xl ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Phân bố điểm</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Số học sinh" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tỉ lệ đạt/Không đạt</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={passFailData} cx="50%" cy="50%" labelLine={false}
                label={({ name, value, percent }: any) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={90} dataKey="value">
                {passFailData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tỉ lệ đúng theo loại câu hỏi</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={questionTypeStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" tick={{ fontSize: 13 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: any) => [`${v}%`]} />
              <Bar dataKey="accuracyRate" fill="#10b981" radius={[4, 4, 0, 0]} name="Tỉ lệ đúng (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Heatmap câu hỏi</h3>
          <p className="text-xs text-gray-400 mb-4">Màu đỏ = câu khó, màu xanh = câu dễ</p>
          {questionStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Chưa có dữ liệu</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {questionStats.map(qs => {
                const rate = qs.accuracyRate
                const bg = rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-yellow-400' : rate >= 20 ? 'bg-orange-500' : 'bg-red-500'
                return (
                  <div
                    key={qs.questionId}
                    title={`Câu ${qs.questionNumber}: ${rate}% đúng`}
                    className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center text-white text-xs font-bold cursor-default`}
                  >
                    {qs.questionNumber}
                  </div>
                )
              })}
            </div>
          )}
          {questionStats.length > 0 && (
            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" />≥70%</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" />40-70%</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500" />20-40%</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500" />&lt;20%</div>
            </div>
          )}
        </div>
      </div>

      {/* Tỉ lệ đúng từng câu */}
      {questionStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tỉ lệ đúng theo từng câu hỏi</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={questionStats.slice(0, 30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="questionNumber" tick={{ fontSize: 12 }} label={{ value: 'Câu', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: any) => [`${v}%`]} />
              <Line type="monotone" dataKey="accuracyRate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Tỉ lệ đúng (%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Student ranking table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Xếp hạng học sinh</h2>
          <span className="text-sm text-gray-500">{submittedAttempts.length} học sinh</span>
        </div>
        {submittedAttempts.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có học sinh nào làm bài" description="Chưa có học sinh nào hoàn thành bài thi này" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Hạng', 'Học sinh', 'Điểm', 'Tỉ lệ', 'Thời gian', 'Vi phạm', 'Trạng thái', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rankedAttempts.map((attempt, idx) => {
                  const rank = idx + 1
                  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`
                  const isPassing = (attempt.percentage || 0) >= (exam?.passing_score || 50)
                  return (
                    <tr key={attempt.id} className={`hover:bg-gray-50 transition-colors ${rank <= 3 ? 'bg-yellow-50/30' : ''}`}>
                      <td className="px-4 py-3 text-sm font-bold text-gray-700">{rankIcon}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{(attempt.student as any)?.full_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{attempt.score || 0}/{exam?.total_score || 10}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-semibold ${isPassing ? 'text-green-600' : 'text-red-600'}`}>{attempt.percentage || 0}%</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {attempt.time_spent_seconds ? `${Math.floor(attempt.time_spent_seconds / 60)}:${String(attempt.time_spent_seconds % 60).padStart(2, '0')}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{attempt.violations_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${attempt.status === 'submitted' ? 'bg-gray-100 text-gray-700' : attempt.status === 'violation' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                          {attempt.status === 'submitted' ? 'Đã nộp' : attempt.status === 'violation' ? 'Vi phạm' : 'Timeout'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => navigate(`${basePath}/exams/${id}/results/${attempt.id}`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> Chi tiết
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
