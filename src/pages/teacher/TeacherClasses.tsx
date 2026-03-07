import { useState, useEffect } from 'react'
import { getMyHomeroomClasses, getClassStudents, addStudentToClass, removeStudentFromClass, type Class, type ClassStudent } from '../../lib/api/classes'
import { userApi } from '../../lib/api/users'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import { UserPlus, FileSpreadsheet, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function TeacherClasses() {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [commonPassword, setCommonPassword] = useState('123456')
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '123456',
    student_code: '',
  })

  useEffect(() => {
    fetchClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      fetchClassStudents(selectedClass.id)
    }
  }, [selectedClass])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const data = await getMyHomeroomClasses()
      setClasses(data)
      if (data.length > 0 && !selectedClass) {
        setSelectedClass(data[0])
      }
    } catch (error: any) {
      toast.error('Lỗi khi tải danh sách lớp: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchClassStudents = async (classId: string) => {
    try {
      const data = await getClassStudents(classId)
      setStudents(data)
    } catch (error: any) {
      toast.error('Lỗi khi tải danh sách học sinh: ' + error.message)
    }
  }

  const fetchAllStudents = async () => {
    try {
      const studentsData = await userApi.getAll({ role: 'student' })
      setAllStudents(studentsData.map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        student_code: s.student_code,
        class_id: s.class_id,
      })))
    } catch (error: any) {
      toast.error('Lỗi khi tải danh sách học sinh: ' + (error.message || 'Unknown error'))
    }
  }

  const handleAddStudent = async (studentId: string) => {
    if (!selectedClass) return
    try {
      await addStudentToClass(selectedClass.id, studentId)
      toast.success('Thêm học sinh vào lớp thành công')
      setShowAddModal(false)
      fetchClassStudents(selectedClass.id)
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
    }
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedClass) return
    if (!confirm('Bạn có chắc chắn muốn xóa học sinh này khỏi lớp?')) return
    try {
      await removeStudentFromClass(selectedClass.id, studentId)
      toast.success('Xóa học sinh khỏi lớp thành công')
      fetchClassStudents(selectedClass.id)
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
    }
  }

  // Tạo học sinh thủ công
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClass) return
    if (!createForm.password || createForm.password.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    setCreating(true)
    try {
      await userApi.createUser({
        full_name: createForm.full_name,
        email: createForm.email,
        password: createForm.password,
        role: 'student',
        student_code: createForm.student_code || undefined,
        class_id: selectedClass.id,
      })
      toast.success(`Đã tạo tài khoản cho "${createForm.full_name}" và thêm vào lớp ${selectedClass.name}`)
      setShowCreateModal(false)
      setCreateForm({ full_name: '', email: '', password: '123456', student_code: '' })
      fetchClassStudents(selectedClass.id)
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use'
        ? 'Email này đã được sử dụng'
        : error.message || 'Lỗi khi tạo tài khoản'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  // Parse Excel file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      // Bỏ qua dòng đầu (header), lấy từ dòng 2 trở đi
      const students: any[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || !row[0]) continue
        const fullName = String(row[0] || '').trim()
        if (!fullName) continue
        // Tạo email từ tên (bỏ dấu, xóa khoảng trắng)
        const normalized = fullName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/\s+/g, '.')
          .replace(/[^a-z0-9.]/g, '')
        const email = row[1] ? String(row[1]).trim() : `${normalized}@ptdtnt.edu.vn`
        students.push({
          full_name: fullName,
          base_email: email,
          student_code: row[2] ? String(row[2]).trim() : '',
        })
      }
      setImportPreview(students)
    } catch (err: any) {
      toast.error('Không thể đọc file Excel: ' + err.message)
    }
  }

  const handleImportStudents = async () => {
    if (!selectedClass || importPreview.length === 0) return
    setImporting(true)
    try {
      const results = await userApi.bulkCreateStudents(importPreview, commonPassword)
      // Thêm từng học sinh vào lớp
      for (const student of results) {
        try {
          await addStudentToClass(selectedClass.id, student.id)
        } catch { /* ignore nếu đã trong lớp */ }
      }
      toast.success(`Đã tạo và thêm ${results.length} học sinh vào lớp ${selectedClass.name}`)
      setShowImportModal(false)
      setImportPreview([])
      fetchClassStudents(selectedClass.id)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi import học sinh')
    } finally {
      setImporting(false)
    }
  }

  const handleExportStudents = () => {
    if (!selectedClass || students.length === 0) return
    const ws = XLSX.utils.json_to_sheet(students.map((item, index) => ({
      'STT': index + 1,
      'Họ và Tên': item.student?.full_name || '',
      'Email': item.student?.email || '',
      'Mã học sinh': item.student?.student_code || '',
      'Ngày tham gia': new Date(item.joined_at).toLocaleDateString('vi-VN')
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách học sinh")
    XLSX.writeFile(wb, `Danh_sach_lop_${selectedClass.name}.xlsx`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bạn chưa được phân công làm giáo viên chủ nhiệm lớp nào.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Quản lý lớp học</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Danh sách lớp */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Danh sách lớp</h2>
            <div className="space-y-2">
              {classes.map((classItem) => (
                <button
                  key={classItem.id}
                  onClick={() => setSelectedClass(classItem)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedClass?.id === classItem.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="font-medium">{classItem.name}</div>
                  <div className="text-sm text-gray-500">{classItem.total_students} học sinh</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Danh sách học sinh trong lớp */}
        <div className="lg:col-span-2">
          {selectedClass && (
            <div className="card">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{selectedClass.name}</h2>
                  <p className="text-sm text-gray-500">{students.length} học sinh</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <UserPlus className="h-4 w-4" />
                    Tạo tài khoản học sinh
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Import từ Excel
                  </button>
                  <button
                    onClick={() => { fetchAllStudents(); setShowAddModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Thêm học sinh có sẵn
                  </button>
                  <button
                    onClick={handleExportStudents}
                    disabled={students.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 transition-colors font-medium disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Xuất Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Họ tên</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Email</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-600">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center p-8 text-gray-500">
                          Chưa có học sinh nào trong lớp
                        </td>
                      </tr>
                    ) : (
                      students.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-sm font-medium text-gray-900">{item.student?.full_name}</td>
                          <td className="p-3 text-sm text-gray-600">{item.student?.email || '-'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleRemoveStudent(item.student_id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Xóa khỏi lớp
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal thêm học sinh có sẵn */}
      {showAddModal && selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">Thêm học sinh vào lớp {selectedClass.name}</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {allStudents
                  .filter((student) => !students.some((s) => s.student_id === student.id))
                  .map((student) => (
                    <div key={student.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <div className="font-medium text-sm">{student.full_name}</div>
                        <div className="text-xs text-gray-500">{student.email} {student.student_code && `• ${student.student_code}`}</div>
                      </div>
                      <button onClick={() => handleAddStudent(student.id)} className="btn btn-sm btn-primary">Thêm</button>
                    </div>
                  ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setShowAddModal(false)} className="btn btn-outline">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal tạo tài khoản học sinh thủ công */}
      {showCreateModal && selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">Tạo tài khoản học sinh</h2>
                <p className="text-sm text-gray-500 mt-0.5">Tự động thêm vào lớp <strong>{selectedClass.name}</strong></p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateStudent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Họ và tên <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  minLength={6}
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã học sinh</label>
                <input
                  type="text"
                  value={createForm.student_code}
                  onChange={(e) => setCreateForm({ ...createForm, student_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="VD: HS001 (tùy chọn)"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} disabled={creating} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">Hủy</button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {creating ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang tạo...</> : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal import từ Excel */}
      {showImportModal && selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">Import học sinh từ Excel</h2>
                <p className="text-sm text-gray-500 mt-0.5">Lớp: <strong>{selectedClass.name}</strong></p>
              </div>
              <button onClick={() => { setShowImportModal(false); setImportPreview([]) }} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-medium mb-1">Định dạng file Excel:</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>Cột A: Họ và tên (bắt buộc)</li>
                  <li>Cột B: Email (tùy chọn – tự tạo nếu để trống)</li>
                  <li>Cột C: Mã học sinh (tùy chọn)</li>
                  <li>Hàng 1 là tiêu đề, dữ liệu từ hàng 2</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu chung cho tất cả học sinh</label>
                <input
                  type="text"
                  value={commonPassword}
                  onChange={(e) => setCommonPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mật khẩu mặc định"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Chọn file Excel (.xlsx, .xls)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {importPreview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Xem trước: {importPreview.length} học sinh</p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 text-xs font-medium text-gray-600">Họ tên</th>
                          <th className="text-left p-2 text-xs font-medium text-gray-600">Email</th>
                          <th className="text-left p-2 text-xs font-medium text-gray-600">Mã HS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importPreview.slice(0, 10).map((s, i) => (
                          <tr key={i}>
                            <td className="p-2">{s.full_name}</td>
                            <td className="p-2 text-gray-500">{s.base_email}</td>
                            <td className="p-2 text-gray-500">{s.student_code || '-'}</td>
                          </tr>
                        ))}
                        {importPreview.length > 10 && (
                          <tr><td colSpan={3} className="p-2 text-center text-gray-400 text-xs">... và {importPreview.length - 10} học sinh khác</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowImportModal(false); setImportPreview([]) }} disabled={importing} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">Hủy</button>
                <button
                  onClick={handleImportStudents}
                  disabled={importing || importPreview.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang import...</> : `Import ${importPreview.length} học sinh`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
