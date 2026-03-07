import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { subjectApi } from '../../lib/api/subjects'
import { getClasses } from '../../lib/api/classes'
import toast from 'react-hot-toast'
import { Save, Users, FileText, Settings, Clock, CheckCircle, AlertTriangle, Send } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function TeacherExamEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [subjects, setSubjects] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [examStats, setExamStats] = useState({ totalQuestions: 0, mcCount: 0, tfCount: 0, saCount: 0 })
  const [formData, setFormData] = useState({
    title: '',
    subject_id: '',
    duration_minutes: 60,
    total_score: 10,
    multiple_choice_score: 0,
    true_false_multi_score: 0,
    short_answer_score: 0,
    passing_score: 50,
    shuffle_questions: true,
    shuffle_answers: true,
    allow_review: false,
    status: 'draft' as 'draft' | 'published' | 'closed',
    start_time: '',
    end_time: '',
  })

  useEffect(() => {
    if (id) fetchData()
  }, [id])

  const fetchData = async () => {
    try {
      const [examData, subjectsData, classesData, questionsData] = await Promise.all([
        examApi.getExamById(id!),
        subjectApi.getAll(),
        getClasses(),
        examApi.getQuestions(id!),
      ])
      setSubjects(subjectsData)
      setClasses(classesData)
      setFormData({
        title: examData.title,
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
        start_time: examData.start_time ? examData.start_time.slice(0, 16) : '',
        end_time: examData.end_time ? examData.end_time.slice(0, 16) : '',
      })
      if (questionsData) {
        const mc = questionsData.filter((q: any) => q.question_type === 'multiple_choice').length
        const tf = questionsData.filter((q: any) => q.question_type === 'true_false_multi').length
        const sa = questionsData.filter((q: any) => q.question_type === 'short_answer').length
        setExamStats({ totalQuestions: questionsData.length, mcCount: mc, tfCount: tf, saCount: sa })
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  const scoreParts = formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score
  const isScoreValid = scoreParts === formData.total_score

  const handleSave = async () => {
    if (formData.title.trim() === '') { toast.error('Vui lòng nhập tiêu đề bài thi'); return }
    if (!isScoreValid) { toast.error(`Tổng điểm 3 phần (${scoreParts}) phải bằng thang điểm (${formData.total_score})`); return }
    setSaving(true)
    try {
      await examApi.updateExam(id!, {
        ...formData,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
      })
      if (formData.status === 'published' && selectedClassId) {
        const startStr = formData.start_time ? new Date(formData.start_time).toISOString() : new Date(Date.now() + 5 * 60000).toISOString();
        const endStr = formData.end_time ? new Date(formData.end_time).toISOString() : '';
        await examApi.assignExamToClass(id!, selectedClassId, startStr, endStr)
        toast.success('Cập nhật và giao bài thi thành công')
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
    if (!selectedClassId) { toast.error('Vui lòng chọn lớp'); return }
    setAssigning(true)
    try {
      const startStr = formData.start_time ? new Date(formData.start_time).toISOString() : new Date(Date.now() + 5 * 60000).toISOString();
      const endStr = formData.end_time ? new Date(formData.end_time).toISOString() : '';
      await examApi.assignExamToClass(id!, selectedClassId, startStr, endStr)
      toast.success('Giao bài thi cho lớp thành công')
      setSelectedClassId('')
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi giao bài thi')
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary-600" />
            Chỉnh sửa bài thi
          </h1>
          {examStats.totalQuestions > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-500">Đề thi gồm:</span>
              {examStats.mcCount > 0 && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{examStats.mcCount} trắc nghiệm</span>}
              {examStats.tfCount > 0 && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">{examStats.tfCount} đúng/sai</span>}
              {examStats.saCount > 0 && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">{examStats.saCount} trả lời ngắn</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${basePath}/exams`)} className="btn btn-secondary">Hủy</button>
          <button onClick={handleSave} disabled={saving || !isScoreValid}
            className="btn btn-primary flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>

      {/* Main form grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Core info */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <FileText className="h-4 w-4 text-primary-600" />
              <h2 className="font-semibold text-gray-900">Thông tin đề thi</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="input"
                  placeholder="Nhập tiêu đề bài thi..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Môn học *</label>
                  <select
                    value={formData.subject_id}
                    onChange={e => setFormData({ ...formData, subject_id: e.target.value })}
                    className="input" required
                  >
                    <option value="">Chọn môn học</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="h-3.5 w-3.5 inline mr-1" />Thời gian (phút) *
                  </label>
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                    className="input" required min={1}
                  />
                </div>
              </div>

              {/* Trạng thái */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                <div className="flex items-center gap-3">
                  {(['draft', 'published', 'closed'] as const).map(status => (
                    <label key={status} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${formData.status === status
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <input type="radio" name="status" value={status}
                        checked={formData.status === status}
                        onChange={() => setFormData({ ...formData, status })}
                        className="sr-only" />
                      <span className="text-sm font-medium">
                        {status === 'draft' ? '📝 Nháp' : status === 'published' ? '✅ Xuất bản' : '🔒 Đóng'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Scoring */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <h2 className="font-semibold text-gray-900">Thang điểm</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thang điểm tổng</label>
                <input
                  type="number"
                  value={formData.total_score}
                  onChange={e => setFormData({ ...formData, total_score: parseInt(e.target.value) || 0 })}
                  className="input" min={1}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'multiple_choice_score' as const, label: 'Trắc nghiệm', badge: examStats.mcCount > 0 ? `${examStats.mcCount} câu` : '' },
                  { key: 'true_false_multi_score' as const, label: 'Đúng/Sai', badge: examStats.tfCount > 0 ? `${examStats.tfCount} câu` : '' },
                  { key: 'short_answer_score' as const, label: 'Trả lời ngắn', badge: examStats.saCount > 0 ? `${examStats.saCount} câu` : '' },
                ].map(({ key, label, badge }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {label} {badge && <span className="text-gray-400">({badge})</span>}
                    </label>
                    <input
                      type="number"
                      value={formData[key]}
                      onChange={e => setFormData({ ...formData, [key]: parseInt(e.target.value) || 0 })}
                      className="input" min={0}
                    />
                  </div>
                ))}
              </div>
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${isScoreValid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {isScoreValid ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                Tổng điểm 3 phần: {scoreParts} / {formData.total_score}
                {!isScoreValid && ' — Tổng phải bằng thang điểm'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Settings */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <Settings className="h-4 w-4 text-gray-600" />
              <h2 className="font-semibold text-gray-900">Cài đặt</h2>
            </div>
            <div className="space-y-4">
              {/* Thời gian */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian bắt đầu</label>
                  <input
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian kết thúc</label>
                  <input
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                    className="input text-sm"
                  />
                </div>
              </div>

              {/* Toggle options */}
              <div className="space-y-3">
                {[
                  { key: 'shuffle_questions' as const, label: 'Xáo trộn câu hỏi', desc: 'Thứ tự câu hỏi khác nhau giữa các học sinh' },
                  { key: 'shuffle_answers' as const, label: 'Xáo trộn đáp án', desc: 'Thứ tự đáp án khác nhau giữa các học sinh' },
                  { key: 'allow_review' as const, label: 'Cho phép xem lại', desc: 'Học sinh xem lại đáp án sau khi nộp bài' },
                ].map(({ key, label, desc }) => (
                  <label key={key} className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${formData[key] ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${formData[key] ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}>
                      {formData[key] && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={formData[key]}
                      onChange={e => setFormData({ ...formData, [key]: e.target.checked })} />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Giao bài cho lớp */}
          {formData.status === 'published' && (
            <div className="bg-gradient-to-br from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-primary-600" />
                <h2 className="font-semibold text-primary-900">Giao bài thi cho lớp</h2>
              </div>
              <div className="space-y-3">
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="input border-primary-300 focus:border-primary-500"
                >
                  <option value="">Chọn lớp cần giao bài</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.total_students} học sinh)</option>
                  ))}
                </select>
                <button
                  onClick={handleAssignToClass}
                  disabled={!selectedClassId || assigning}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary-600 hover:bg-primary-700 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-5 w-5" />
                  {assigning ? 'Đang giao bài...' : 'Giao bài ngay'}
                </button>
                <p className="text-xs text-primary-700 bg-primary-100 border border-primary-200 rounded-lg px-3 py-2">
                  ℹ️ Thời gian lớp vào làm bài sẽ lấy theo phần Cài Đặt thời gian. Nếu bỏ trống, thời gian kết thúc sẽ không giới hạn.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex justify-end gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <button onClick={() => navigate(`${basePath}/exams`)} className="btn btn-secondary">Hủy</button>
        <button onClick={handleSave} disabled={saving || !isScoreValid}
          className="btn btn-primary flex items-center gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  )
}
