import { useEffect, useState } from 'react'
import { subjectApi } from '../../lib/api/subjects'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, BookOpen } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'

export default function AdminSubjects() {
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<any>(null)
  const [formData, setFormData] = useState({ name: '', code: '', description: '' })
  const { confirm, cancel, confirmState } = useConfirm()

  useEffect(() => {
    fetchSubjects()
  }, [])

  const fetchSubjects = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      const data = await subjectApi.getAll()
      setSubjects(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách môn học')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingSubject) {
        await subjectApi.update(editingSubject.id, formData)
        toast.success('Cập nhật môn học thành công')
      } else {
        await subjectApi.create(formData)
        toast.success('Tạo môn học thành công')
      }
      setShowModal(false)
      setEditingSubject(null)
      setFormData({ name: '', code: '', description: '' })
      fetchSubjects()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi lưu môn học')
    }
  }

  const handleEdit = (subject: any) => {
    setEditingSubject(subject)
    setFormData({
      name: subject.name,
      code: subject.code,
      description: subject.description || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Xác nhận xóa môn học',
      message: 'Bạn có chắc chắn muốn xóa môn học này? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'danger',
    })

    if (!confirmed) return

    try {
      await subjectApi.delete(id)
      toast.success('Xóa môn học thành công')
      fetchSubjects()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi xóa môn học')
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
        title="Quản lý Môn học"
        description="Quản lý các môn học trong hệ thống"
        onRefresh={() => fetchSubjects(true)}
        refreshing={refreshing}
        action={
          <button
            onClick={() => {
              setEditingSubject(null)
              setFormData({ name: '', code: '', description: '' })
              setShowModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Thêm môn học
          </button>
        }
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {subjects.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Chưa có môn học nào"
            description="Hãy thêm môn học đầu tiên để bắt đầu"
            action={
              <button
                onClick={() => {
                  setEditingSubject(null)
                  setFormData({ name: '', code: '', description: '' })
                  setShowModal(true)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Thêm môn học
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Mã môn
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Tên môn học
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Mô tả
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {subjects.map((subject) => (
                  <tr key={subject.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {subject.code}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {subject.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {subject.description || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(subject)}
                          className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(subject.id)}
                          className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
        onConfirm={() => confirmState.onConfirm?.()}
        onCancel={cancel}
      />

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingSubject ? 'Chỉnh sửa môn học' : 'Thêm môn học mới'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mã môn học
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="input"
                  required
                  disabled={!!editingSubject}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên môn học
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mô tả
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSubject ? 'Cập nhật' : 'Tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

