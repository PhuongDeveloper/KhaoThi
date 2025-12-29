import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { subjectApi } from '../../lib/api/subjects'
import { useAuthStore } from '../../store/authStore'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BookOpen, TrendingUp, BarChart3, RefreshCw, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function StudentGrades() {
  const { profile } = useAuthStore()
  const [subjects, setSubjects] = useState<any[]>([])
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedSubject) {
      fetchAttemptsForSubject(selectedSubject)
    }
  }, [selectedSubject])

  const fetchData = async () => {
    try {
      const [subjectsData, attemptsData] = await Promise.all([
        subjectApi.getAll(),
        examApi.getAttempts(undefined, true)
      ])
      
      setSubjects(subjectsData)
      setAttempts(attemptsData || [])
      
      if (subjectsData.length > 0 && !selectedSubject) {
        setSelectedSubject(subjectsData[0].id)
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  const fetchAttemptsForSubject = async (subjectId: string) => {
    try {
      const allAttempts = await examApi.getAttempts(undefined, true)
      const subjectAttempts = allAttempts.filter((attempt: any) => {
        const exam = attempt.exam
        return exam && exam.subject_id === subjectId && (attempt.status === 'submitted' || attempt.status === 'timeout')
      })
      setAttempts(subjectAttempts)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    }
  }

  const getSubjectAttempts = (subjectId: string) => {
    return attempts.filter((attempt: any) => {
      const exam = attempt.exam
      return exam && exam.subject_id === subjectId && (attempt.status === 'submitted' || attempt.status === 'timeout')
    })
  }

  const getSubjectStats = (subjectId: string) => {
    const subjectAttempts = getSubjectAttempts(subjectId)
    if (subjectAttempts.length === 0) {
      return {
        average: 0,
        highest: 0,
        lowest: 0,
        passed: 0,
        total: 0
      }
    }

    const percentages = subjectAttempts.map((a: any) => a.percentage || 0)
    const exam = subjectAttempts[0]?.exam
    const passingScore = exam?.passing_score || 50

    return {
      average: percentages.reduce((a, b) => a + b, 0) / percentages.length,
      highest: Math.max(...percentages),
      lowest: Math.min(...percentages),
      passed: percentages.filter(p => p >= passingScore).length,
      total: subjectAttempts.length
    }
  }

  const getChartData = () => {
    if (!selectedSubject) return []
    
    const subjectAttempts = getSubjectAttempts(selectedSubject)
    return subjectAttempts
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((attempt: any, idx: number) => ({
        name: `Lần ${idx + 1}`,
        date: new Date(attempt.created_at).toLocaleDateString('vi-VN'),
        score: parseFloat(attempt.score) || 0,
        percentage: attempt.percentage || 0,
        totalScore: attempt.exam?.total_score || 10
      }))
  }

  const getPieData = () => {
    if (!selectedSubject) return []
    
    const subjectAttempts = getSubjectAttempts(selectedSubject)
    const exam = subjectAttempts[0]?.exam
    const passingScore = exam?.passing_score || 50
    
    const passed = subjectAttempts.filter((a: any) => (a.percentage || 0) >= passingScore).length
    const failed = subjectAttempts.length - passed

    return [
      { name: 'Đạt', value: passed, color: '#6b7280' },
      { name: 'Chưa đạt', value: failed, color: '#d1d5db' }
    ]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const selectedSubjectData = subjects.find(s => s.id === selectedSubject)
  const stats = selectedSubject ? getSubjectStats(selectedSubject) : null
  const chartData = getChartData()
  const pieData = getPieData()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bảng điểm</h1>
          <p className="text-sm text-gray-500 mt-1">Xem điểm số và phân tích theo từng môn</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      {/* Subject Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Chọn môn học</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {subjects.map((subject) => {
            const subjectStats = getSubjectStats(subject.id)
            const isSelected = selectedSubject === subject.id
            
            return (
              <button
                key={subject.id}
                onClick={() => setSelectedSubject(subject.id)}
                className={`p-3 rounded-lg border transition-all text-left ${
                  isSelected
                    ? 'border-gray-400 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <BookOpen className={`h-4 w-4 ${isSelected ? 'text-gray-700' : 'text-gray-500'}`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                    {subject.name}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {subjectStats.total} bài thi
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats Cards - Đơn giản */}
      {selectedSubject && stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Điểm trung bình</p>
                <TrendingUp className="h-5 w-5 text-gray-500" />
              </div>
              <p className="text-3xl font-semibold text-gray-900">{stats.average.toFixed(1)}%</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Điểm cao nhất</p>
                <BarChart3 className="h-5 w-5 text-gray-500" />
              </div>
              <p className="text-3xl font-semibold text-gray-900">{stats.highest}%</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Điểm thấp nhất</p>
                <TrendingUp className="h-5 w-5 text-gray-500 rotate-180" />
              </div>
              <p className="text-3xl font-semibold text-gray-900">{stats.lowest}%</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Tỷ lệ đạt</p>
                <CheckCircle className="h-5 w-5 text-gray-500" />
              </div>
              <p className="text-3xl font-semibold text-gray-900">
                {stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.passed}/{stats.total} bài
              </p>
            </div>
          </div>

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Line Chart */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  Điểm theo thời gian
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis domain={[0, 100]} stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px'
                      }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="percentage" 
                      stroke="#4b5563" 
                      strokeWidth={2}
                      name="Điểm (%)"
                      dot={{ fill: '#4b5563', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  Điểm số các lần thi
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px'
                      }} 
                    />
                    <Bar dataKey="score" fill="#6b7280" name="Điểm số" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Pie Chart */}
          {pieData.length > 0 && pieData.some(d => d.value > 0) && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Tỷ lệ đạt/chưa đạt
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => percent > 0 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grades Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">
                Chi tiết điểm - {selectedSubjectData?.name}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Bài thi
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Điểm số
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Tỷ lệ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Ngày làm
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
                  {getSubjectAttempts(selectedSubject).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        Chưa có bài thi nào
                      </td>
                    </tr>
                  ) : (
                    getSubjectAttempts(selectedSubject).map((attempt: any) => {
                      const exam = attempt.exam
                      const isPassed = (attempt.percentage || 0) >= (exam?.passing_score || 50)
                      
                      return (
                        <tr key={attempt.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {exam?.title || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {attempt.score?.toFixed(2) || 0}/{exam?.total_score || 10}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {attempt.percentage || 0}%
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {new Date(attempt.created_at).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isPassed ? (
                              <span className="inline-flex items-center text-sm text-gray-700">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Đạt
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-sm text-gray-500">
                                <XCircle className="h-4 w-4 mr-1" />
                                Chưa đạt
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                            <Link
                              to={`/student/exams/${exam?.id}/review`}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Xem lại
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!selectedSubject && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Vui lòng chọn một môn học để xem điểm</p>
        </div>
      )}
    </div>
  )
}
