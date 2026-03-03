import { useState, useEffect } from 'react'
import { getClasses, createClass, updateClass, deleteClass, type Class, type CreateClassData } from '../../lib/api/classes'
import { userApi } from '../../lib/api/users'
import toast from 'react-hot-toast'
import { Users } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'
import * as XLSX from 'xlsx'
import { addStudentToClass } from '../../lib/api/classes'
import { extractStudentNamesFromText } from '../../lib/api/gemini'

function removeVietnameseTones(str: string) {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // ̀ ́ ̃ ̉ ̣  huyền, sắc, ngã, hỏi, nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
  str = str.replace(/ + /g, " ");
  str = str.trim();
  return str;
}

function generateBaseEmail(fullName: string) {
  const cleanName = removeVietnameseTones(fullName).toLowerCase();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length === 0) return 'student@gmail.com';
  const lastName = parts.pop();
  const initials = parts.map(p => p[0]).join('');
  return `${lastName}${initials}@gmail.com`;
}

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

  const [useAI, setUseAI] = useState(false)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [commonPassword, setCommonPassword] = useState('')
  const [bulkResults, setBulkResults] = useState<any[]>([])
  const [showResultModal, setShowResultModal] = useState(false)
  const [isCreatingBulk, setIsCreatingBulk] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const classesData = await getClasses()
      setClasses(classesData)

      const teachersData = await userApi.getAll({ role: 'teacher' })
      setTeachers(teachersData.map((t: any) => ({
        id: t.id,
        full_name: t.full_name,
        email: t.email,
      })))
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
        setShowModal(false)
        setEditingClass(null)
        setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
        fetchData()
      } else {
        setIsCreatingBulk(true)
        const newClass = await createClass(formData)
        toast.success('Tạo lớp học thành công')

        if (useAI && excelFile && commonPassword) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];

            // Trích xuất raw text CSV
            const csvData = XLSX.utils.sheet_to_csv(ws);

            if (!csvData) {
              toast.error('File Excel không có dữ liệu để phân tích.', { id: 'bulk-create' });
              setIsCreatingBulk(false);
              return;
            }

            toast.loading('AI đang phân tích danh sách lớp học...', { id: 'bulk-create' });
            let extractedNames: string[] = [];
            try {
              extractedNames = await extractStudentNamesFromText(csvData, 'admin');
            } catch (aiErr: any) {
              toast.error('Lỗi khi phân tích bằng AI: ' + aiErr.message, { id: 'bulk-create' });
              setIsCreatingBulk(false);
              return;
            }

            const studentsToCreate: { full_name: string, base_email: string }[] = [];
            for (const fullName of extractedNames) {
              if (fullName.trim()) {
                studentsToCreate.push({
                  full_name: fullName.trim(),
                  base_email: generateBaseEmail(fullName.trim())
                });
              }
            }

            if (studentsToCreate.length > 0) {
              toast.loading(`Đang tạo ${studentsToCreate.length} tài khoản học sinh...`, { id: 'bulk-create' });
              try {
                const createdAccounts = await userApi.bulkCreateStudents(studentsToCreate, commonPassword);
                for (const acc of createdAccounts) {
                  await addStudentToClass(newClass.id, acc.id);
                }
                toast.success(`Đã tạo thành công ${createdAccounts.length} tài khoản`, { id: 'bulk-create' });
                setBulkResults(createdAccounts);
                setShowResultModal(true);
              } catch (error: any) {
                toast.error('Lỗi tạo tài khoản: ' + error.message, { id: 'bulk-create' });
              }
            } else {
              toast.error('AI không tìm thấy tên học sinh nào trong file Excel hoặc định dạng rỗng!', { id: 'bulk-create' });
            }
            setIsCreatingBulk(false);
          };
          reader.readAsArrayBuffer(excelFile);

          setShowModal(false)
          setUseAI(false)
          setExcelFile(null)
          setCommonPassword('')
          setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
          fetchData()
        } else {
          setIsCreatingBulk(false)
          setShowModal(false)
          setEditingClass(null)
          setFormData({ name: '', code: '', homeroom_teacher_id: null, description: '' })
          fetchData()
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
      setIsCreatingBulk(false)
    }
  }

  const handleExportResults = () => {
    const ws = XLSX.utils.json_to_sheet(bulkResults.map(r => ({
      'Họ và Tên': r.full_name,
      'Email': r.email,
      'Mật khẩu': r.password
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tài khoản");
    XLSX.writeFile(wb, `Danh_sach_tai_khoan_lop.xlsx`);
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[50] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                {editingClass ? 'Sửa thông tin lớp học' : 'Tạo lớp học mới'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {editingClass ? 'Cập nhật lại các thông tin của lớp' : 'Khởi tạo lớp học mới và danh sách học viên'}
              </p>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form id="class-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tên lớp <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full bg-gray-50/50 focus:bg-white transition-colors"
                    required
                    placeholder="Ví dụ: 10A1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mã lớp <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="input w-full bg-gray-50/50 focus:bg-white transition-colors"
                    required
                    placeholder="Ví dụ: 10A1-2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Giáo viên chủ nhiệm</label>
                  <select
                    value={formData.homeroom_teacher_id || ''}
                    onChange={(e) => setFormData({ ...formData, homeroom_teacher_id: e.target.value || null })}
                    className="input w-full bg-gray-50/50 focus:bg-white transition-colors"
                  >
                    <option value="">-- Chọn giáo viên --</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name} {teacher.email ? `(${teacher.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mô tả thêm</label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input w-full bg-gray-50/50 focus:bg-white transition-colors resize-none"
                    rows={2}
                    placeholder="Sĩ số, phân ban, hoặc ghi chú khác..."
                  />
                </div>

                {!editingClass && (
                  <div className={`overflow-hidden rounded-xl border-2 transition-all duration-300 ${useAI ? 'border-primary-500 bg-primary-50/30' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                    }`}>
                    <label className="flex items-center gap-3 cursor-pointer p-4 font-medium text-gray-800 focus-within:bg-gray-100/50 transition-colors">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                        checked={useAI}
                        onChange={(e) => setUseAI(e.target.checked)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-bold">Tạo danh sách lớp nhanh với AI (Khuyên dùng)</div>
                        <div className="text-xs text-gray-500 mt-0.5 font-normal">Chỉ cần File Excel bất kỳ (không cần đúng Header) - AI tự bóc tách Họ tên!</div>
                      </div>
                    </label>

                    <div className={`transition-all duration-300 pl-11 pr-4 pb-4 space-y-4 ${useAI ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0 hidden'
                      }`}>
                      <div className="pt-2">
                        <label className="block text-sm font-semibold mb-1.5 text-gray-700">Tệp danh sách (*.xlsx, *.xls)</label>
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 transition-all cursor-pointer border border-gray-200 rounded-lg bg-white"
                          required={useAI}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 text-gray-700">Mật khẩu chung cho tất cả tài khoản</label>
                        <input
                          type="text"
                          placeholder="Ít nhất 6 ký tự. Ví dụ: 123456"
                          value={commonPassword}
                          onChange={(e) => setCommonPassword(e.target.value)}
                          className="input w-full bg-white transition-colors"
                          required={useAI}
                          minLength={6}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false)
                  setEditingClass(null)
                  setUseAI(false)
                  setExcelFile(null)
                }}
                className="btn btn-outline bg-white hover:bg-gray-100 focus:ring-2 focus:ring-gray-200"
                disabled={isCreatingBulk}
              >
                Đóng
              </button>
              <button form="class-form" type="submit" className="btn btn-primary" disabled={isCreatingBulk}>
                {isCreatingBulk ? 'Hệ thống đang xử lý...' : (editingClass ? 'Lưu cập nhật' : 'Xác nhận Khởi tạo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal kết quả tạo tài khoản hàng loạt */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-green-600">
              Tạo danh sách tài khoản thành công!
            </h2>
            <p className="mb-4 text-gray-600">Đã tạo <strong>{bulkResults.length}</strong> tài khoản cho học sinh. Các tài khoản này đã được tự động thêm vào lớp.</p>

            <div className="overflow-y-auto border border-gray-200 rounded mb-4" style={{ maxHeight: '50vh' }}>
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-3 border-b border-gray-200 font-semibold text-gray-700">Họ và Tên</th>
                    <th className="p-3 border-b border-gray-200 font-semibold text-gray-700">Email đăng nhập</th>
                    <th className="p-3 border-b border-gray-200 font-semibold text-gray-700">Mật khẩu</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium text-gray-800">{r.full_name}</td>
                      <td className="p-3 text-blue-600 font-mono text-xs">{r.email}</td>
                      <td className="p-3 font-mono text-gray-500 text-xs">{r.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end items-center mt-auto pt-4 border-t border-gray-100 gap-3">
              <button onClick={() => setShowResultModal(false)} className="btn btn-outline text-gray-600 border-gray-300 hover:bg-gray-50">
                Đóng
              </button>
              <button onClick={handleExportResults} className="btn bg-green-600 hover:bg-green-700 text-white shadow font-semibold">
                Xuất file Excel danh sách tài khoản
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

