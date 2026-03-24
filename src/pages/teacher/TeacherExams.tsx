import { useEffect, useState } from 'react'
import { examApi } from '../../lib/api/exams'
import { getClasses } from '../../lib/api/classes'
import { useAutoSubmitExams } from '../../hooks/useAutoSubmitExams'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { Plus, Edit, Eye, Trash2, Send, Play, Monitor, Share2, Download, Copy, X } from 'lucide-react'
import type { Class } from '../../lib/api/classes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function TeacherExams() {
  const { profile } = useAuthStore()
  const [exams, setExams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedExam, setSelectedExam] = useState<any>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [assigning, setAssigning] = useState(false)
  const [assignForm, setAssignForm] = useState({
    classId: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    showAnswers: false,
  })

  // Modal chia sẻ đề thi
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareExamId, setShareExamId] = useState('')
  const [copied, setCopied] = useState(false)

  // Modal nhận đề thi
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveExamId, setReceiveExamId] = useState('')
  const [receiving, setReceiving] = useState(false)

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
      // Ignore errors
    }
  }

  const fetchExams = async () => {
    try {
      // Chỉ lấy đề thi của giáo viên hiện tại
      const data = await examApi.getExams({ teacherId: profile?.id })
      setExams(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách bài thi')
    } finally {
      setLoading(false)
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

    let defaultStartDate = ''
    let defaultStartTime = ''
    let defaultEndDate = ''
    let defaultEndTime = ''

    if (exam.start_time) {
      const start = new Date(exam.start_time)
      defaultStartDate = start.toISOString().split('T')[0]
      defaultStartTime = start.toTimeString().slice(0, 5)
    } else {
      const now = new Date()
      const defaultStart = new Date(now.getTime() + 5 * 60 * 1000)
      defaultStartDate = defaultStart.toISOString().split('T')[0]
      defaultStartTime = defaultStart.toTimeString().slice(0, 5)
    }

    if (exam.end_time) {
      const end = new Date(exam.end_time)
      defaultEndDate = end.toISOString().split('T')[0]
      defaultEndTime = end.toTimeString().slice(0, 5)
    }

    setAssignForm({
      classId: '',
      startDate: defaultStartDate,
      startTime: defaultStartTime,
      endDate: defaultEndDate,
      endTime: defaultEndTime,
      showAnswers: false,
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
    const startStr = startDateTime.toISOString()

    let endStr = ''
    if (assignForm.endDate && assignForm.endTime) {
      const endDateTime = new Date(`${assignForm.endDate}T${assignForm.endTime}:00`)
      endStr = endDateTime.toISOString()
    } else if (assignForm.endDate || assignForm.endTime) {
      toast.error('Vui lòng điền đủ cả ngày và giờ kết thúc hoặc để trống cả hai')
      return
    }

    if (endStr && new Date(endStr) <= startDateTime) {
      toast.error('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu')
      return
    }

    setAssigning(true)
    try {
      await examApi.assignExamToClass(
        selectedExam.id,
        assignForm.classId,
        startStr,
        endStr,
        assignForm.showAnswers
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

  // Chia sẻ đề thi
  const handleShareExam = (exam: any) => {
    setShareExamId(exam.id)
    setCopied(false)
    setShowShareModal(true)
  }

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(shareExamId)
      setCopied(true)
      toast.success('Đã sao chép mã đề thi')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback cho trường hợp clipboard API không hoạt động
      const textarea = document.createElement('textarea')
      textarea.value = shareExamId
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      toast.success('Đã sao chép mã đề thi')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Nhận đề thi
  const handleReceiveExam = async () => {
    if (!receiveExamId.trim()) {
      toast.error('Vui lòng nhập mã đề thi')
      return
    }
    if (!profile?.id) {
      toast.error('Không xác định được tài khoản')
      return
    }

    setReceiving(true)
    try {
      await examApi.cloneExamForTeacher(receiveExamId.trim(), profile.id)
      toast.success('Nhận đề thi thành công! Đề thi đã được thêm vào danh sách của bạn.')
      setShowReceiveModal(false)
      setReceiveExamId('')
      fetchExams()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nhận đề thi. Vui lòng kiểm tra lại mã.')
    } finally {
      setReceiving(false)
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý Bài thi</h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setReceiveExamId(''); setShowReceiveModal(true) }}
            className="btn btn-secondary flex items-center"
          >
            <Download className="h-5 w-5 mr-2" />
            Nhận đề thi
          </button>
          <Link to="/teacher/exams/create" className="btn btn-primary flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Tạo bài thi mới
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tiêu đề
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Môn học
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số câu hỏi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {exam.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(exam.subject as any)?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {exam.total_questions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {exam.duration_minutes} phút
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${exam.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : exam.status === 'closed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {exam.status === 'published'
                        ? 'Đã xuất bản'
                        : exam.status === 'closed'
                          ? 'Đã đóng'
                          : 'Nháp'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleShareExam(exam)}
                      className="text-amber-600 hover:text-amber-900"
                      title="Chia sẻ đề thi"
                    >
                      <Share2 className="h-5 w-5 inline" />
                    </button>
                    <Link
                      to={`/teacher/exams/${exam.id}/preview`}
                      className="text-purple-600 hover:text-purple-900"
                      title="Xem trước"
                    >
                      <Play className="h-5 w-5 inline" />
                    </Link>
                    <Link
                      to={`/teacher/exams/${exam.id}/monitoring`}
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
                      to={`/teacher/exams/${exam.id}/results`}
                      className="text-primary-600 hover:text-primary-900"
                      title="Xem kết quả"
                    >
                      <Eye className="h-5 w-5 inline" />
                    </Link>
                    <Link
                      to={`/teacher/exams/${exam.id}/edit`}
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

              {/* Thời gian kết thúc (Cho phép nhập tay) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thời gian kết thúc (Mở bài thi vô hạn nếu để trống)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={assignForm.endDate || ''}
                    onChange={(e) => setAssignForm({ ...assignForm, endDate: e.target.value })}
                    className="input"
                  />
                  <input
                    type="time"
                    value={assignForm.endTime || ''}
                    onChange={(e) => setAssignForm({ ...assignForm, endTime: e.target.value })}
                    className="input"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Nếu có thời gian, sau lúc này bài thi tự động đóng và nộp
                </p>
              </div>

              {/* Cho phép xem đáp án ngay */}
              <div className="flex items-start bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="flex items-center h-5">
                  <input
                    id="showAnswers"
                    type="checkbox"
                    checked={assignForm.showAnswers}
                    onChange={(e) => setAssignForm({ ...assignForm, showAnswers: e.target.checked })}
                    className="w-4 h-4 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="showAnswers" className="font-medium text-gray-900 cursor-pointer">
                    Cho phép xem đáp án ngay sau khi nộp
                  </label>
                  <p className="text-gray-500 mt-0.5">
                    Học sinh có thể xem ngay kết quả đúng/sai mà không cần đợi đề thi kết thúc hoặc lớp nộp hết.
                  </p>
                </div>
              </div>
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

      {/* Modal chia sẻ đề thi */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Chia sẻ đề thi</h2>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Gửi mã bên dưới cho giáo viên khác để họ nhận bản sao đề thi này.
            </p>

            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 font-mono text-sm text-gray-800 select-all break-all">
                {shareExamId}
              </div>
              <button
                onClick={handleCopyId}
                className={`flex items-center px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                  copied
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                <Copy className="h-4 w-4 mr-1.5" />
                {copied ? 'Đã copy!' : 'Copy'}
              </button>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                💡 Giáo viên nhận mã này sẽ có một <strong>bản sao hoàn toàn độc lập</strong> của đề thi, 
                bao gồm tất cả câu hỏi và đáp án. Họ có toàn quyền chỉnh sửa và giao bài.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal nhận đề thi */}
      {showReceiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Nhận đề thi</h2>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Nhập mã đề thi được chia sẻ bởi giáo viên khác để nhận bản sao.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mã đề thi
                </label>
                <input
                  type="text"
                  value={receiveExamId}
                  onChange={(e) => setReceiveExamId(e.target.value)}
                  className="input w-full font-mono"
                  placeholder="Dán mã đề thi vào đây..."
                  disabled={receiving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleReceiveExam()
                  }}
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  📋 Bạn sẽ nhận được một <strong>bản sao độc lập</strong> của đề thi gốc. 
                  Mọi chỉnh sửa trên bản sao sẽ không ảnh hưởng đến đề thi gốc.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowReceiveModal(false)}
                className="btn btn-secondary"
                disabled={receiving}
              >
                Hủy
              </button>
              <button
                onClick={handleReceiveExam}
                className="btn btn-primary flex items-center"
                disabled={receiving || !receiveExamId.trim()}
              >
                {receiving ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Đang nhận...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Nhận đề thi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
