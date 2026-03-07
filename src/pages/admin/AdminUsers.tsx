import { useEffect, useState } from 'react'
import { userApi } from '../../lib/api/users'
import { getClasses } from '../../lib/api/classes'
import { db } from '../../lib/firebase'
import { doc, deleteDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Edit, Trash2, Users, UserPlus } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'student' as 'admin' | 'teacher' | 'student',
    student_code: '',
    teacher_code: '',
    class_id: '',
  })
  const { confirm, cancel, confirmState } = useConfirm()

  useEffect(() => {
    fetchUsers()
    fetchClasses()
  }, [])

  const fetchUsers = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      const data = await userApi.getAll()
      setUsers(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách người dùng')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const data = await getClasses()
      setClasses(data)
    } catch {
      // ignore
    }
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setFormData({
      full_name: '',
      email: '',
      password: '',
      role: 'student',
      student_code: '',
      teacher_code: '',
      class_id: '',
    })
    setShowModal(true)
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setFormData({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'student',
      student_code: user.student_code || '',
      teacher_code: user.teacher_code || '',
      class_id: user.class_id || '',
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingUser) {
        // Cập nhật user hiện có
        await userApi.update(editingUser.id, {
          full_name: formData.full_name,
          role: formData.role,
          student_code: formData.student_code || null,
          teacher_code: formData.teacher_code || null,
        } as any)
        toast.success('Cập nhật người dùng thành công')
      } else {
        // Tạo user mới thực sự
        if (!formData.password || formData.password.length < 6) {
          toast.error('Mật khẩu phải có ít nhất 6 ký tự')
          return
        }
        await userApi.createUser({
          full_name: formData.full_name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          student_code: formData.student_code || undefined,
          teacher_code: formData.teacher_code || undefined,
          class_id: formData.role === 'student' ? (formData.class_id || null) : null,
        })
        toast.success(`Tạo tài khoản "${formData.full_name}" thành công!`)
      }
      setShowModal(false)
      setEditingUser(null)
      fetchUsers()
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use'
        ? 'Email này đã được sử dụng'
        : error.message || 'Lỗi khi xử lý người dùng'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Xác nhận xóa người dùng',
      message: 'Bạn có chắc chắn muốn xóa người dùng này? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'danger',
    })

    if (!confirmed) return

    try {
      await deleteDoc(doc(db, 'profiles', id))
      toast.success('Xóa người dùng thành công')
      fetchUsers()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi xóa người dùng')
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Quản trị viên'
      case 'teacher': return 'Giáo viên'
      case 'student': return 'Học sinh'
      default: return role
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700'
      case 'teacher': return 'bg-blue-100 text-blue-700'
      case 'student': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const filteredUsers = filter ? users.filter((u) => u.role === filter) : users

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
        title="Quản lý Người dùng"
        description="Quản lý tất cả người dùng trong hệ thống"
        onRefresh={() => fetchUsers(true)}
        refreshing={refreshing}
        action={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
              title="Lọc theo vai trò"
            >
              <option value="">Tất cả</option>
              <option value="admin">Quản trị viên</option>
              <option value="teacher">Giáo viên</option>
              <option value="student">Học sinh</option>
            </select>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Tạo người dùng
            </button>
          </div>
        }
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Không có người dùng nào"
            description={filter ? `Không tìm thấy người dùng với vai trò "${getRoleLabel(filter)}"` : 'Chưa có người dùng nào trong hệ thống'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Vai trò</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Mã số</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Ngày tạo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{user.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs font-medium rounded-full ${getRoleBadgeClass(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {user.student_code || user.teacher_code || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
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

      {/* Modal tạo/sửa người dùng */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Chỉnh sửa người dùng' : 'Tạo tài khoản người dùng'}
              </h2>
              {!editingUser && (
                <p className="text-sm text-gray-500 mt-1">Tạo tài khoản mới trong hệ thống Firebase</p>
              )}
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Họ tên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Nguyễn Văn A"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                  disabled={!!editingUser}
                  placeholder="example@email.com"
                />
                {editingUser && <p className="text-xs text-gray-400 mt-1">Email không thể thay đổi sau khi tạo</p>}
              </div>

              {/* Mật khẩu – chỉ khi tạo mới */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Mật khẩu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    minLength={6}
                    placeholder="Tối thiểu 6 ký tự"
                  />
                </div>
              )}

              {/* Vai trò */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Vai trò <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any, class_id: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="student">Học sinh</option>
                  <option value="teacher">Giáo viên</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              {/* Mã học sinh + Lớp – chỉ khi là học sinh */}
              {formData.role === 'student' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã học sinh</label>
                    <input
                      type="text"
                      value={formData.student_code}
                      onChange={(e) => setFormData({ ...formData, student_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="VD: HS001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Lớp học</label>
                    <select
                      value={formData.class_id}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Không chọn lớp —</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Mã giáo viên – chỉ khi là giáo viên */}
              {formData.role === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã giáo viên</label>
                  <input
                    type="text"
                    value={formData.teacher_code}
                    onChange={(e) => setFormData({ ...formData, teacher_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VD: GV001"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingUser(null) }}
                  disabled={submitting}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {editingUser ? 'Đang cập nhật...' : 'Đang tạo...'}
                    </>
                  ) : (
                    editingUser ? 'Cập nhật' : 'Tạo tài khoản'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
