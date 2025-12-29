import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { useAuthStore } from '../../store/authStore'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, RefreshCw, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cache, CACHE_KEYS } from '../../lib/cache'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'

export default function StudentHistory() {
  const { profile } = useAuthStore()
  const [attempts, setAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) {
      fetchHistory()
    }

    // Setup realtime subscription và auto-refresh
    if (profile?.id) {
      const channel = supabase
        .channel(`student-history-attempts-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exam_attempts',
            filter: `student_id=eq.${profile.id}`,
          },
          () => {
            console.log('[StudentHistory] Attempt changed, refreshing...')
            cache.invalidate(CACHE_KEYS.attempts(profile.id))
            fetchHistory()
          }
        )
        .subscribe()

      // Auto-refresh mỗi 30 giây
      const refreshInterval = setInterval(() => {
        console.log('[StudentHistory] Auto-refreshing...')
        fetchHistory()
      }, 30000)

      return () => {
        console.log('[StudentHistory] Cleaning up subscriptions')
        supabase.removeChannel(channel)
        clearInterval(refreshInterval)
      }
    }
  }, [profile?.id]) // Chỉ chạy khi profile.id thay đổi

  const fetchHistory = async () => {
    try {
      // Sử dụng cache
      const data = await examApi.getAttempts(undefined, true)
      setAttempts(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải lịch sử')
      setAttempts([]) // Hiển thị empty thay vì loading mãi
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    cache.invalidate(CACHE_KEYS.attempts(profile?.id || ''))
    fetchHistory()
  }

  if (loading && attempts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Lịch sử làm bài"
        description="Xem lại tất cả các bài thi đã làm"
        onRefresh={handleRefresh}
        refreshing={loading}
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {attempts.length === 0 ? (
          <EmptyState
            icon={History}
            title="Chưa có lịch sử làm bài"
            description="Bạn chưa hoàn thành bài thi nào"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Bài thi
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Điểm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Thời gian
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
                {attempts.map((attempt) => {
                  const exam = attempt.exam
                  const isPassed = (attempt.percentage || 0) >= (exam?.passing_score || 50)
                  return (
                    <tr key={attempt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {exam?.title || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {attempt.score || 0}/{exam?.total_score || 10} ({attempt.percentage || 0}%)
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {attempt.time_spent_seconds
                          ? `${Math.floor(attempt.time_spent_seconds / 60)}:${String(
                              attempt.time_spent_seconds % 60
                            ).padStart(2, '0')}`
                          : '-'}
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
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          {attempt.status === 'submitted' && (
                            <>
                              <Link
                                to={`/student/exams/${exam?.id}/result`}
                                className="text-gray-600 hover:text-gray-900"
                              >
                                Kết quả
                              </Link>
                              <Link
                                to={`/student/exams/${exam?.id}/review`}
                                className="text-gray-600 hover:text-gray-900"
                              >
                                Xem lại đề
                              </Link>
                            </>
                          )}
                        </div>
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
