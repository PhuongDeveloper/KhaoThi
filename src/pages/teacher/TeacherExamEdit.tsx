import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { subjectApi } from '../../lib/api/subjects'
import { getClasses } from '../../lib/api/classes'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'

export default function TeacherExamEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subjects, setSubjects] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject_id: '',
    duration_minutes: 60,
    total_score: 10, // Thang điểm tổng
    multiple_choice_score: 0, // Điểm cho phần trắc nghiệm 4 phương án
    true_false_multi_score: 0, // Điểm cho phần đúng/sai 4 ý
    short_answer_score: 0, // Điểm cho phần trả lời ngắn
    passing_score: 50, // Điểm đạt (%) - giữ lại để tương thích
    shuffle_questions: true,
    shuffle_answers: true,
    allow_review: false,
    status: 'draft' as 'draft' | 'published' | 'closed',
  })

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  const fetchData = async () => {
    try {
      const [examData, subjectsData, classesData] = await Promise.all([
        examApi.getExamById(id!),
        subjectApi.getAll(),
        getClasses(),
      ])

      setSubjects(subjectsData)
      setClasses(classesData)
      setFormData({
        title: examData.title,
        description: examData.description || '',
        subject_id: examData.subject_id,
        duration_minutes: examData.duration_minutes,
        total_score: (examData as any).total_score || 10,
        multiple_choice_score: (examData as any).multiple_choice_score || 0,
        true_false_multi_score: (examData as any).true_false_multi_score || 0,
        short_answer_score: (examData as any).short_answer_score || 0,
        passing_score: examData.passing_score || 50,
        shuffle_questions: examData.shuffle_questions,
        shuffle_answers: examData.shuffle_answers,
        allow_review: examData.allow_review,
        status: examData.status,
      })
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    // Kiểm tra tổng điểm 3 phần phải bằng thang điểm
    const totalPartsScore = formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score
    if (totalPartsScore !== formData.total_score) {
      toast.error(`Tổng điểm 3 phần (${totalPartsScore}) phải bằng thang điểm (${formData.total_score})`)
      setSaving(false)
      return
    }

    setSaving(true)
    try {
      await examApi.updateExam(id!, formData)
      
      // Nếu đang publish và có chọn lớp, giao bài cho lớp
      if (formData.status === 'published' && selectedClassId) {
        const now = new Date()
        const startTime = new Date(now.getTime() + 5 * 60 * 1000) // 5 phút từ bây giờ
        const endTime = new Date(startTime.getTime() + formData.duration_minutes * 60 * 1000)
        await examApi.assignExamToClass(id!, selectedClassId, startTime.toISOString(), endTime.toISOString())
        toast.success('Cập nhật và giao bài thi cho lớp thành công')
      } else {
        toast.success('Cập nhật bài thi thành công')
      }
      
      navigate(`${basePath}/exams`)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi cập nhật bài thi')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignToClass = async () => {
    if (!selectedClassId) {
      toast.error('Vui lòng chọn lớp')
      return
    }
    try {
      const now = new Date()
      const startTime = new Date(now.getTime() + 5 * 60 * 1000) // 5 phút từ bây giờ
      const endTime = new Date(startTime.getTime() + formData.duration_minutes * 60 * 1000)
      await examApi.assignExamToClass(id!, selectedClassId, startTime.toISOString(), endTime.toISOString())
      toast.success('Giao bài thi cho lớp thành công')
      setSelectedClassId('')
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi giao bài thi')
    }
  }

  if (loading) {
    return <div className="text-center py-12">Đang tải...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Chỉnh sửa bài thi</h1>

      <div className="card">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tiêu đề *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Môn học *
              </label>
              <select
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                className="input"
                required
              >
                <option value="">Chọn môn học</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thời gian (phút) *
              </label>
              <input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })
                }
                className="input"
                required
                min={1}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thang điểm *
              </label>
              <input
                type="number"
                value={formData.total_score}
                onChange={(e) => {
                  const newTotal = parseInt(e.target.value) || 0
                  setFormData({ ...formData, total_score: newTotal })
                }}
                className="input"
                min={1}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Tổng điểm của bài thi (ví dụ: 10 điểm)
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Điểm phần trắc nghiệm 4 phương án
                </label>
                <input
                  type="number"
                  value={formData.multiple_choice_score}
                  onChange={(e) => {
                    const newScore = parseInt(e.target.value) || 0
                    setFormData({ ...formData, multiple_choice_score: newScore })
                  }}
                  className="input"
                  min={0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Điểm cho phần trắc nghiệm 4 phương án
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Điểm phần đúng/sai 4 ý
                </label>
                <input
                  type="number"
                  value={formData.true_false_multi_score}
                  onChange={(e) => {
                    const newScore = parseInt(e.target.value) || 0
                    setFormData({ ...formData, true_false_multi_score: newScore })
                  }}
                  className="input"
                  min={0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Điểm cho phần đúng/sai 4 ý
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Điểm phần trả lời ngắn
                </label>
                <input
                  type="number"
                  value={formData.short_answer_score}
                  onChange={(e) => {
                    const newScore = parseInt(e.target.value) || 0
                    setFormData({ ...formData, short_answer_score: newScore })
                  }}
                  className="input"
                  min={0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Điểm cho phần trả lời ngắn
                </p>
              </div>
            </div>
            
            <div className={`p-3 rounded-lg ${
              (formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score) === formData.total_score
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              <p className="text-sm font-medium">
                Tổng điểm 3 phần: {formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score} / {formData.total_score}
                {(formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score) !== formData.total_score && (
                  <span className="ml-2">⚠️ Tổng điểm 3 phần phải bằng thang điểm!</span>
                )}
              </p>
            </div>
            
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Điểm đạt (%)
              </label>
              <input
                type="number"
                value={formData.passing_score}
                onChange={(e) =>
                  setFormData({ ...formData, passing_score: parseInt(e.target.value) })
                }
                className="input"
                min={0}
                max={100}
              />
                <p className="text-xs text-gray-500 mt-1">
                  Phần trăm điểm đạt để qua bài thi (ví dụ: 50%)
                </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as any })
                }
                className="input"
              >
                <option value="draft">Nháp</option>
                <option value="published">Đã xuất bản</option>
                <option value="closed">Đã đóng</option>
              </select>
              </div>
            </div>
          </div>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.shuffle_questions}
                onChange={(e) =>
                  setFormData({ ...formData, shuffle_questions: e.target.checked })
                }
                className="mr-2"
              />
              Xáo trộn câu hỏi
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.shuffle_answers}
                onChange={(e) =>
                  setFormData({ ...formData, shuffle_answers: e.target.checked })
                }
                className="mr-2"
              />
              Xáo trộn đáp án
            </label>
          </div>
        </div>
      </div>

      {/* Phần giao bài cho lớp */}
      {formData.status === 'published' && (
        <div className="card mt-6">
          <h2 className="text-xl font-bold mb-4">Giao bài thi cho lớp</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chọn lớp cần giao bài
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="input flex-1"
                >
                  <option value="">Chọn lớp</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.total_students} học sinh)
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssignToClass}
                  disabled={!selectedClassId}
                  className="btn btn-primary"
                >
                  Giao bài
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Khi chọn lớp và nhấn "Giao bài", tất cả học sinh trong lớp sẽ nhận được bài thi này.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3 mt-6">
        <button onClick={() => navigate('/teacher/exams')} className="btn btn-secondary">
          Hủy
        </button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center">
          <Save className="h-5 w-5 mr-2" />
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  )
}

