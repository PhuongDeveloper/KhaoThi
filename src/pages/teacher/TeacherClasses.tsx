import { useState, useEffect } from 'react'
import { getMyHomeroomClasses, getClassStudents, addStudentToClass, removeStudentFromClass, type Class, type ClassStudent } from '../../lib/api/classes'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function TeacherClasses() {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, student_code, class_id')
        .eq('role', 'student')
        .order('full_name')
      
      if (error) throw error
      setAllStudents(data || [])
    } catch (error: any) {
      toast.error('Lỗi khi tải danh sách học sinh: ' + error.message)
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
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedClass?.id === classItem.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">{classItem.name}</div>
                  <div className="text-sm text-gray-500">
                    {classItem.total_students} học sinh
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Danh sách học sinh trong lớp */}
        <div className="lg:col-span-2">
          {selectedClass && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedClass.name}</h2>
                  <p className="text-sm text-gray-500">Mã lớp: {selectedClass.code}</p>
                </div>
                <button
                  onClick={() => {
                    fetchAllStudents()
                    setShowAddModal(true)
                  }}
                  className="btn btn-primary"
                >
                  Thêm học sinh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Họ tên</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Mã học sinh</th>
                      <th className="text-right p-3">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center p-8 text-gray-500">
                          Chưa có học sinh nào trong lớp
                        </td>
                      </tr>
                    ) : (
                      students.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{item.student?.full_name}</td>
                          <td className="p-3 text-sm text-gray-600">
                            {item.student?.email || '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-600">
                            {item.student?.student_code || '-'}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => handleRemoveStudent(item.student_id)}
                              className="btn btn-sm btn-danger ml-auto"
                            >
                              Xóa
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

      {/* Modal thêm học sinh */}
      {showAddModal && selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Thêm học sinh vào lớp {selectedClass.name}
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {allStudents
                .filter((student) => !students.some((s) => s.student_id === student.id))
                .map((student) => (
                  <div
                    key={student.id}
                    className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-medium">{student.full_name}</div>
                      <div className="text-sm text-gray-500">
                        {student.email} {student.student_code && `• ${student.student_code}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddStudent(student.id)}
                      className="btn btn-sm btn-primary"
                    >
                      Thêm
                    </button>
                  </div>
                ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-outline"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

