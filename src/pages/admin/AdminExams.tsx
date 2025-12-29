import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { getClasses } from '../../lib/api/classes'
import { useAutoSubmitExams } from '../../hooks/useAutoSubmitExams'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { Plus, Edit, Eye, Trash2, Send, FileText, Play, Monitor } from 'lucide-react'
import type { Class } from '../../lib/api/classes'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'

export default function AdminExams() {
  const [exams, setExams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedExam, setSelectedExam] = useState<any>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [assigning, setAssigning] = useState(false)
  const [assignForm, setAssignForm] = useState({
    classId: '',
    startDate: '',
    startTime: '',
  })

  // Tự động nộp bài khi hết giờ (kiểm tra mỗi phút)
  useAutoSubmitExams(60000)

  useEffect(() => {
    fetchExams()
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      const data = await getClasses()
      setClasses(data)
    } catch (error: any) {
      console.error('Error fetching classes:', error)
    }
  }

  const fetchExams = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      const data = await examApi.getExams()
      setExams(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách bài thi')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài thi này?')) return

    try {
      await examApi.deleteExam(id)
      toast.success('Xóa bài thi thành công')
      fetchExams()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi xóa bài thi')
    }
  }

  const handleOpenAssignModal = (exam: any) => {
    setSelectedExam(exam)
    setShowAssignModal(true)
    // Set default values - thời gian bắt đầu mặc định là 5 phút sau
    const now = new Date()
    const defaultStart = new Date(now.getTime() + 5 * 60 * 1000) // 5 phút sau
    
    setAssignForm({
      classId: '',
      startDate: defaultStart.toISOString().split('T')[0],
      startTime: defaultStart.toTimeString().slice(0, 5),
    })
  }

  const handleAssignExam = async () => {
    if (!assignForm.classId) {
      toast.error('Vui lòng chọn lớp')
      return
    }
    if (!assignForm.startDate || !assignForm.startTime) {
      toast.error('Vui lòng chọn thời gian bắt đầu')
      return
    }

    const startDateTime = new Date(`${assignForm.startDate}T${assignForm.startTime}:00`)
    // Tự động tính thời gian kết thúc = thời gian bắt đầu + duration_minutes
    const endDateTime = new Date(startDateTime.getTime() + (selectedExam.duration_minutes || 60) * 60 * 1000)

    setAssigning(true)
    try {
      await examApi.assignExamToClass(
        selectedExam.id,
        assignForm.classId,
        startDateTime.toISOString(),
        endDateTime.toISOString()
      )
      toast.success('Giao bài thi thành công')
      setShowAssignModal(false)
      fetchExams()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi giao bài thi')
    } finally {
      setAssigning(false)
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Nháp'
      case 'published':
        return 'Đã xuất bản'
      case 'closed':
        return 'Đã đóng'
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'published':
        return 'bg-green-100 text-green-800'
      case 'closed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    <div>
      <PageHeader
        title="Quản lý Bài thi"
        description="Xem và quản lý tất cả bài thi trong hệ thống"
        onRefresh={() => fetchExams(true)}
        refreshing={refreshing}
        action={
          <Link to="/admin/exams/create" className="btn btn-primary flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Tạo bài thi mới
          </Link>
        }
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {exams.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Chưa có bài thi nào"
            description="Hệ thống chưa có bài thi nào được tạo"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Tiêu đề
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Môn học
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Giáo viên
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Số câu hỏi
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Thời gian
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
                {exams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {exam.title}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {(exam.subject as any)?.name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {(exam.teacher as any)?.full_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {exam.total_questions}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {exam.duration_minutes} phút
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs font-medium rounded-full ${getStatusColor(
                          exam.status
                        )}`}
                      >
                        {getStatusLabel(exam.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Link
                        to={`/admin/exams/${exam.id}/preview`}
                        className="text-purple-600 hover:text-purple-900"
                        title="Xem trước"
                      >
                        <Play className="h-5 w-5 inline" />
                      </Link>
                      <Link
                        to={`/admin/exams/${exam.id}/monitoring`}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Giám sát realtime"
                      >
                        <Monitor className="h-5 w-5 inline" />
                      </Link>
                      <button
                        onClick={() => handleOpenAssignModal(exam)}
                        className="text-green-600 hover:text-green-900"
                        title="Giao bài"
                      >
                        <Send className="h-5 w-5 inline" />
                      </button>
                      <Link
                        to={`/admin/exams/${exam.id}/results`}
                        className="text-primary-600 hover:text-primary-900"
                        title="Xem kết quả"
                      >
                        <Eye className="h-5 w-5 inline" />
                      </Link>
                      <Link
                        to={`/admin/exams/${exam.id}/edit`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Chỉnh sửa"
                      >
                        <Edit className="h-5 w-5 inline" />
                      </Link>
                      <button
                        onClick={() => handleDelete(exam.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Xóa"
                      >
                        <Trash2 className="h-5 w-5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal giao bài */}
      {showAssignModal && selectedExam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Giao bài thi</h2>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{selectedExam.title}</strong>
            </p>

            <div className="space-y-4">
              {/* Chọn lớp */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chọn lớp
                </label>
                <select
                  value={assignForm.classId}
                  onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">-- Chọn lớp --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.total_students} học sinh)
                    </option>
                  ))}
                </select>
              </div>

              {/* Thời gian bắt đầu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thời gian bắt đầu
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={assignForm.startDate}
                    onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                    className="input"
                    required
                  />
                  <input
                    type="time"
                    value={assignForm.startTime}
                    onChange={(e) => setAssignForm({ ...assignForm, startTime: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Học sinh có thể truy cập vào trang làm bài thi trước 5 phút
                </p>
              </div>

              {/* Thông tin thời gian kết thúc (tự động tính) */}
              {assignForm.startDate && assignForm.startTime && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Thời gian kết thúc (tự động tính):
                  </p>
                  <p className="text-sm text-gray-600">
                    {(() => {
                      const startDateTime = new Date(`${assignForm.startDate}T${assignForm.startTime}:00`)
                      const endDateTime = new Date(startDateTime.getTime() + (selectedExam.duration_minutes || 60) * 60 * 1000)
                      return endDateTime.toLocaleString('vi-VN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    })()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Sau thời gian này, bài thi sẽ tự động đóng và nộp bài cho học sinh chưa nộp
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAssignModal(false)}
                className="btn btn-secondary"
                disabled={assigning}
              >
                Hủy
              </button>
              <button
                onClick={handleAssignExam}
                className="btn btn-primary"
                disabled={assigning}
              >
                {assigning ? 'Đang giao...' : 'Giao bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

