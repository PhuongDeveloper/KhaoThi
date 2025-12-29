import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Users, Eye } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

export default function TeacherExamResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  
  const [exam, setExam] = useState<any>(null)
  const [attempts, setAttempts] = useState<any[]>([])
  const [questionStats, setQuestionStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      fetchData()
    }
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

      // Tính thống kê tỉ lệ đúng theo từng câu hỏi (async)
      if (attemptsData.length > 0 && questionsData.length > 0) {
        calculateQuestionStats(questionsData, attemptsData).then(stats => {
          setQuestionStats(stats)
        }).catch(err => {
          console.error('Error calculating question stats:', err)
        })
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
      let correctCount = 0
      let totalCount = 0
      
      for (const attempt of attempts) {
        if (attempt.status === 'submitted' || attempt.status === 'timeout') {
          const { data: responses } = await supabase
            .from('exam_responses')
            .select('*')
            .eq('attempt_id', attempt.id)
            .eq('question_id', question.id)
          
          if (responses && responses.length > 0) {
            totalCount++
            const isCorrect = responses.some((r: any) => r.is_correct)
            if (isCorrect) {
              correctCount++
            }
          }
        }
      }
      
      const accuracyRate = totalCount > 0 ? (correctCount / totalCount) * 100 : 0
      
      stats.push({
        questionNumber: questions.indexOf(question) + 1,
        questionId: question.id,
        questionType: question.question_type,
        correctCount,
        totalCount,
        accuracyRate: Math.round(accuracyRate * 10) / 10,
      })
    }
    
    return stats
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const avgScore =
    attempts.length > 0
      ? attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length
      : 0

  const submittedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'timeout')
  const correctRate = submittedAttempts.length > 0
    ? submittedAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / submittedAttempts.length
    : 0

  // Dữ liệu cho biểu đồ phân bố điểm
  const scoreDistribution = [
    { range: '0-20', count: submittedAttempts.filter(a => (a.percentage || 0) >= 0 && (a.percentage || 0) < 20).length },
    { range: '20-40', count: submittedAttempts.filter(a => (a.percentage || 0) >= 20 && (a.percentage || 0) < 40).length },
    { range: '40-60', count: submittedAttempts.filter(a => (a.percentage || 0) >= 40 && (a.percentage || 0) < 60).length },
    { range: '60-80', count: submittedAttempts.filter(a => (a.percentage || 0) >= 60 && (a.percentage || 0) < 80).length },
    { range: '80-100', count: submittedAttempts.filter(a => (a.percentage || 0) >= 80).length },
  ]

  // Dữ liệu cho biểu đồ tỉ lệ đúng theo loại câu hỏi
  const questionTypeStats = [
    {
      type: 'Trắc nghiệm',
      correct: questionStats.filter(s => s.questionType === 'multiple_choice').reduce((sum, s) => sum + s.correctCount, 0),
      total: questionStats.filter(s => s.questionType === 'multiple_choice').reduce((sum, s) => sum + s.totalCount, 0),
    },
    {
      type: 'Đúng/Sai',
      correct: questionStats.filter(s => s.questionType === 'true_false_multi').reduce((sum, s) => sum + s.correctCount, 0),
      total: questionStats.filter(s => s.questionType === 'true_false_multi').reduce((sum, s) => sum + s.totalCount, 0),
    },
    {
      type: 'Trả lời ngắn',
      correct: questionStats.filter(s => s.questionType === 'short_answer').reduce((sum, s) => sum + s.correctCount, 0),
      total: questionStats.filter(s => s.questionType === 'short_answer').reduce((sum, s) => sum + s.totalCount, 0),
    },
  ].map(item => ({
    ...item,
    accuracyRate: item.total > 0 ? Math.round((item.correct / item.total) * 100 * 10) / 10 : 0,
  }))

  // Dữ liệu cho biểu đồ Pie
  const passFailData = [
    { name: 'Đạt', value: submittedAttempts.filter(a => (a.percentage || 0) >= (exam?.passing_score || 50)).length, color: '#10b981' },
    { name: 'Không đạt', value: submittedAttempts.filter(a => (a.percentage || 0) < (exam?.passing_score || 50)).length, color: '#ef4444' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Kết quả bài thi: ${exam?.title || ''}`}
        description={`${(exam?.subject as any)?.name || ''} • ${exam?.total_questions || 0} câu hỏi • ${exam?.duration_minutes || 0} phút`}
      />

      {/* Thống kê tổng quan */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-600 mb-2">Tổng số lần làm bài</p>
          <p className="text-3xl font-semibold text-gray-900">{submittedAttempts.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-600 mb-2">Điểm trung bình</p>
          <p className="text-3xl font-semibold text-gray-900">{avgScore.toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-600 mb-2">Tỉ lệ trả lời đúng</p>
          <p className="text-3xl font-semibold text-green-600">{correctRate.toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-600 mb-2">Tỷ lệ đạt</p>
          <p className="text-3xl font-semibold text-gray-900">
            {submittedAttempts.filter((a) => (a.percentage || 0) >= (exam?.passing_score || 50)).length}/
            {submittedAttempts.length || 1}
          </p>
        </div>
      </div>

      {/* Biểu đồ phân tích */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phân bố điểm */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Phân bố điểm</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Số học sinh" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tỉ lệ đạt/Không đạt */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tỉ lệ đạt/Không đạt</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={passFailData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {passFailData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Tỉ lệ đúng theo loại câu hỏi */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tỉ lệ đúng theo loại câu hỏi</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={questionTypeStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="accuracyRate" fill="#10b981" name="Tỉ lệ đúng (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tỉ lệ đúng theo từng câu hỏi */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tỉ lệ đúng theo từng câu hỏi</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={questionStats.slice(0, 20)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="questionNumber" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="accuracyRate" stroke="#3b82f6" name="Tỉ lệ đúng (%)" />
            </LineChart>
          </ResponsiveContainer>
          {questionStats.length > 20 && (
            <p className="text-sm text-gray-500 mt-2">Chỉ hiển thị 20 câu đầu</p>
          )}
        </div>
      </div>

      {/* Danh sách học sinh */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Danh sách học sinh tham gia</h2>
        </div>
        {submittedAttempts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có học sinh nào làm bài"
            description="Chưa có học sinh nào hoàn thành bài thi này"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Học sinh
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Điểm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Tỉ lệ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Thời gian
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Vi phạm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {submittedAttempts
                  .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
                  .map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {(attempt.student as any)?.full_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {attempt.score || 0}/{exam?.total_score || 10}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`font-semibold ${
                        (attempt.percentage || 0) >= (exam?.passing_score || 50)
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        {attempt.percentage || 0}%
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {attempt.time_spent_seconds
                        ? `${Math.floor(attempt.time_spent_seconds / 60)}:${String(
                            attempt.time_spent_seconds % 60
                          ).padStart(2, '0')}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {attempt.violations_count || 0}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          attempt.status === 'submitted'
                            ? 'bg-gray-100 text-gray-700'
                            : attempt.status === 'violation'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}
                      >
                        {attempt.status === 'submitted'
                          ? 'Đã nộp'
                          : attempt.status === 'violation'
                          ? 'Vi phạm'
                          : 'Timeout'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => navigate(`${basePath}/exams/${id}/results/${attempt.id}`)}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Xem chi tiết bài làm"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
