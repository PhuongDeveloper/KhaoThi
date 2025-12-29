import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import { FileText, CheckCircle, Users, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function TeacherDashboard() {
  const { profile } = useAuthStore()
  const [stats, setStats] = useState({
    totalExams: 0,
    publishedExams: 0,
    totalAttempts: 0,
  })
  const [recentExams, setRecentExams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const exams = await examApi.getExams()
      const attempts = await examApi.getAttempts()

      const myExams = exams.filter((e: any) => e.teacher_id === profile?.id)
      const myAttempts = attempts.filter((a: any) => {
        return myExams.some((e: any) => e.id === a.exam_id)
      })

      setStats({
        totalExams: myExams.length,
        publishedExams: myExams.filter((e: any) => e.status === 'published').length,
        totalAttempts: myAttempts.length,
      })

      setRecentExams(myExams.slice(0, 5))
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Chào mừng, {profile?.full_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Quản lý bài thi và theo dõi kết quả</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Tổng bài thi</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.totalExams}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <FileText className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Đã xuất bản</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.publishedExams}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Lần làm bài</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.totalAttempts}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <Users className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Bài thi gần đây</h2>
            <Link 
              to="/teacher/exams" 
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center"
            >
              Xem tất cả
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
        </div>
        <div className="p-6">
          {recentExams.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Chưa có bài thi nào</p>
          ) : (
            <div className="space-y-3">
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex justify-between items-center p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/teacher/exams/${exam.id}/results`}
                      className="font-semibold text-gray-900 hover:text-primary-600 block truncate"
                    >
                      {exam.title}
                    </Link>
                    <p className="text-sm text-gray-600 mt-1">
                      {(exam.subject as any)?.name || 'Chưa có môn'} • {exam.total_questions} câu hỏi
                    </p>
                  </div>
                  <span
                    className={`ml-4 px-2.5 py-1 text-xs font-medium rounded ${
                      exam.status === 'published'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    {exam.status === 'published' ? 'Đã xuất bản' : 'Nháp'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
