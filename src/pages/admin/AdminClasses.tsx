import { useState, useEffect } from 'react'
import { getClasses, createClass, updateClass, deleteClass, type Class, type CreateClassData } from '../../lib/api/classes'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Users } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'

export default function AdminClasses() {
  const [classes, setClasses] = useState<Class[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [formData, setFormData] = useState<CreateClassData>({
    name: '',
    code: '',
    homeroom_teacher_id: null,
    description: '',
  })
  const { confirm, cancel, confirmState } = useConfirm()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      
      const classesData = await getClasses()
      setClasses(classesData)
      
      const { data: teachersData, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'teacher')
        .order('full_name')
      
      if (error) throw error
      setTeachers(teachersData || [])
    } catch (error: any) {
      toast.error('Lỗi khi tải dữ liệu: ' + error.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingClass) {
        await updateClass(editingClass.id, formData)
        toast.success('Cập nhật lớp học thành công')
      } else {
        await createClass(formData)
        toast.success('Tạo lớp học thành công')
      }
      setShowModal(false)
      setEditingClass(null)
      setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
    }
  }

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem)
    setFormData({
      name: classItem.name,
      code: classItem.code,
      homeroom_teacher_id: classItem.homeroom_teacher_id,
      description: classItem.description || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Xác nhận xóa lớp học',
      message: 'Bạn có chắc chắn muốn xóa lớp học này? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'danger',
    })

    if (!confirmed) return

    try {
      await deleteClass(id)
      toast.success('Xóa lớp học thành công')
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
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
        title="Quản lý lớp học"
        description="Quản lý tất cả các lớp học trong hệ thống"
        onRefresh={() => fetchData(true)}
        refreshing={refreshing}
        action={
        <button
          onClick={() => {
            setEditingClass(null)
            setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
            setShowModal(true)
          }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
        >
          Thêm lớp học
        </button>
        }
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {classes.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có lớp học nào"
            description="Hãy thêm lớp học đầu tiên để bắt đầu"
            action={
              <button
                onClick={() => {
                  setEditingClass(null)
                  setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
                  setShowModal(true)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Thêm lớp học
              </button>
            }
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Tên lớp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Mã lớp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Số học sinh</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Giáo viên chủ nhiệm</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Mô tả</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody>
                {classes.map((classItem) => (
                  <tr key={classItem.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-sm text-gray-900">{classItem.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{classItem.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{classItem.total_students}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {classItem.homeroom_teacher?.full_name || 'Chưa có'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {classItem.description || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(classItem)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                          title="Chỉnh sửa"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDelete(classItem.id)}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                          title="Xóa"
                        >
                          Xóa
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

      {/* Modal thêm/sửa lớp */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingClass ? 'Sửa lớp học' : 'Thêm lớp học mới'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên lớp *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  required
                  placeholder="Ví dụ: 10A1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mã lớp *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="input w-full"
                  required
                  placeholder="Ví dụ: 10A1-2024"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Giáo viên chủ nhiệm</label>
                <select
                  value={formData.homeroom_teacher_id || ''}
                  onChange={(e) => setFormData({ ...formData, homeroom_teacher_id: e.target.value || null })}
                  className="input w-full"
                >
                  <option value="">Chọn giáo viên</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name} {teacher.email ? `(${teacher.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mô tả</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Mô tả về lớp học..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingClass(null)
                  }}
                  className="btn btn-outline"
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClass ? 'Cập nhật' : 'Tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

