import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { examApi } from '../../lib/api/exams'
import { subjectApi } from '../../lib/api/subjects'
import { analyzeFileAndExtractQuestions, autoCalculateAnswers } from '../../lib/api/gemini'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { Save, Upload, FileText, ChevronDown, ChevronUp, Loader2, Image, Sparkles } from 'lucide-react'
import CustomFileInput from '../../components/CustomFileInput'

export default function TeacherExamCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuthStore()

  // Detect context: admin or teacher
  const isAdmin = location.pathname.startsWith('/admin')
  const basePath = isAdmin ? '/admin' : '/teacher'
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [fileAnalyzing, setFileAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [showManualQuestions, setShowManualQuestions] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState<Record<number, boolean>>({})
  const [calculatingAnswers, setCalculatingAnswers] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '' as string | null,
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
    start_time: '',
    end_time: '',
  })
  const [manualQuestions, setManualQuestions] = useState<any[]>([])

  useEffect(() => {
    fetchSubjects()
  }, [])

  const fetchSubjects = async () => {
    try {
      const data = await subjectApi.getAll()
      setSubjects(data)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải danh sách môn học')
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!file) {
      toast.error('Vui lòng chọn file')
      return
    }

    setFileAnalyzing(true)
    setAnalyzeProgress(0)

    // Progress bar giả vờ
    const progressInterval = setInterval(() => {
      setAnalyzeProgress((prev) => {
        if (prev >= 99) {
          clearInterval(progressInterval)
          return 99
        }
        return prev + Math.random() * 15
      })
    }, 200)

    try {
      // Tạo exam tạm để có examId
      const examData = {
        ...formData,
        subject_id: formData.subject_id || subjects[0]?.id,
        teacher_id: profile?.id || '',
        status: 'draft' as 'draft' | 'published' | 'closed',
        total_questions: 0,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
      }
      const tempExam = await examApi.createExam(examData)

      // Gửi file trực tiếp cho AI để phân tích
      const questions = await analyzeFileAndExtractQuestions(
        file,
        tempExam.id,
        profile?.id || ''
      )

      // Hoàn thành progress
      clearInterval(progressInterval)
      setAnalyzeProgress(100)

      // Tự động merge vào manualQuestions
      setManualQuestions([...manualQuestions, ...questions])
      toast.success(`Đã phân tích và trích xuất ${questions.length} câu hỏi từ file`)

      // Scroll đến phần câu hỏi
      setTimeout(() => {
        document.getElementById('questions-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    } catch (error: any) {
      clearInterval(progressInterval)
      toast.error(error.message || 'Lỗi khi phân tích file')
    } finally {
      setFileAnalyzing(false)
      setTimeout(() => setAnalyzeProgress(0), 500)
    }
  }

  const handleTextAnalyze = async (text: string) => {
    if (!text.trim()) {
      toast.error('Vui lòng nhập nội dung')
      return
    }

    setFileAnalyzing(true)
    setAnalyzeProgress(0)

    // Progress bar giả vờ
    const progressInterval = setInterval(() => {
      setAnalyzeProgress((prev) => {
        if (prev >= 99) {
          clearInterval(progressInterval)
          return 99
        }
        return prev + Math.random() * 15
      })
    }, 200)

    try {
      // Tạo exam tạm để có examId
      const examData = {
        ...formData,
        subject_id: formData.subject_id || subjects[0]?.id,
        teacher_id: profile?.id || '',
        status: 'draft' as 'draft' | 'published' | 'closed',
        total_questions: 0,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
      }
      const tempExam = await examApi.createExam(examData)

      // Tạo file tạm từ text để gửi cho AI
      const blob = new Blob([text], { type: 'text/plain' })
      const textFile = new File([blob], 'text-input.txt', { type: 'text/plain' })

      // Gửi file cho AI để phân tích
      const questions = await analyzeFileAndExtractQuestions(
        textFile,
        tempExam.id,
        profile?.id || ''
      )

      // Hoàn thành progress
      clearInterval(progressInterval)
      setAnalyzeProgress(100)

      // Tự động merge vào manualQuestions
      setManualQuestions([...manualQuestions, ...questions])
      toast.success(`Đã phân tích và trích xuất ${questions.length} câu hỏi`)

      // Scroll đến phần câu hỏi
      setTimeout(() => {
        document.getElementById('questions-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    } catch (error: any) {
      clearInterval(progressInterval)
      toast.error(error.message || 'Lỗi khi phân tích nội dung')
    } finally {
      setFileAnalyzing(false)
      setTimeout(() => setAnalyzeProgress(0), 500)
    }
  }

  const handleAddManualQuestion = (type: 'multiple_choice' | 'true_false_multi' | 'short_answer' = 'multiple_choice') => {
    const baseQuestion: any = {
      content: '',
      question_type: type,
      difficulty: 'medium' as const,
      points: 1,
    }

    if (type === 'multiple_choice') {
      baseQuestion.answers = [
        { content: '', is_correct: false },
        { content: '', is_correct: false },
        { content: '', is_correct: false },
        { content: '', is_correct: false },
      ]
    } else if (type === 'true_false_multi') {
      baseQuestion.image_url = '' // URL hình ảnh (nếu có)
      baseQuestion.answers = [
        { content: '', is_correct: false }, // ý a
        { content: '', is_correct: false }, // ý b
        { content: '', is_correct: false }, // ý c
        { content: '', is_correct: false }, // ý d
      ]
    } else if (type === 'short_answer') {
      baseQuestion.correct_answer = '' // Đáp án số đúng
    }

    setManualQuestions([...manualQuestions, baseQuestion])
  }

  const handleAutoCalculateAnswers = async () => {
    if (manualQuestions.length === 0) {
      toast.error('Chưa có câu hỏi nào để tính toán')
      return
    }

    setCalculatingAnswers(true)
    try {
      // Gọi AI để tính toán đáp án (không cần tạo exam)
      const calculatedAnswers = await autoCalculateAnswers(
        manualQuestions,
        profile?.id || ''
      )

      // Cập nhật đáp án vào manualQuestions
      // answer.index là index trong mảng questions gửi cho AI (theo từng loại)
      // Cần map lại với originalIdx trong manualQuestions
      const updatedQuestions = [...manualQuestions]

      // Tạo map để theo dõi index theo từng loại câu hỏi (không sử dụng nhưng giữ lại để tương lai có thể cần)
      // const typeIndexMap: Record<string, number> = {
      //   multiple_choice: 0,
      //   true_false_multi: 0,
      //   short_answer: 0,
      // }

      calculatedAnswers.forEach((answer) => {
        // Tìm câu hỏi tương ứng trong manualQuestions
        let foundIndex = -1
        let currentTypeIndex = 0

        for (let i = 0; i < updatedQuestions.length; i++) {
          if (updatedQuestions[i].question_type === answer.question_type) {
            if (currentTypeIndex === answer.index) {
              foundIndex = i
              break
            }
            currentTypeIndex++
          }
        }

        if (foundIndex === -1) return
        const question = updatedQuestions[foundIndex]

        if (answer.question_type === 'multiple_choice' && answer.correct_answer_index !== undefined) {
          // Cập nhật đáp án đúng cho trắc nghiệm
          if (question.answers) {
            question.answers.forEach((a: any, idx: number) => {
              a.is_correct = idx === answer.correct_answer_index
            })
          }
        } else if (answer.question_type === 'true_false_multi' && answer.correct_answers) {
          // Cập nhật đáp án đúng cho đúng/sai
          if (question.answers) {
            question.answers.forEach((a: any, idx: number) => {
              a.is_correct = answer.correct_answers?.includes(idx) || false
            })
          }
        } else if (answer.question_type === 'short_answer' && answer.correct_answer) {
          // Cập nhật đáp án cho trả lời ngắn
          question.correct_answer = answer.correct_answer
        }
      })

      setManualQuestions(updatedQuestions)
      toast.success(`Đã tự động tính toán đáp án cho ${calculatedAnswers.length} câu hỏi`)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tính toán đáp án')
    } finally {
      setCalculatingAnswers(false)
    }
  }

  const handleSave = async () => {
    if (!formData.title || !formData.subject_id) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    // Kiểm tra tổng điểm 3 phần phải bằng thang điểm
    const totalPartsScore = formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score
    if (totalPartsScore !== formData.total_score) {
      toast.error(`Tổng điểm 3 phần (${totalPartsScore}) phải bằng thang điểm (${formData.total_score})`)
      return
    }

    const allQuestions = [...manualQuestions]
    if (allQuestions.length === 0) {
      toast.error('Vui lòng thêm ít nhất một câu hỏi')
      return
    }

    setLoading(true)
    try {
      // Chuyển chuỗi rỗng thành null cho timestamp
      const examData = {
        ...formData,
        teacher_id: profile?.id || '',
        status: 'draft' as 'draft' | 'published' | 'closed',
        total_questions: allQuestions.length,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
      }

      const exam = await examApi.createExam(examData)

      await examApi.createQuestionsWithAnswers(exam.id, allQuestions)

      toast.success('Tạo bài thi thành công')
      navigate(`${basePath}/exams`)
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tạo bài thi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Tạo bài thi mới</h1>

      <div className="space-y-6">
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Thông tin bài thi</h2>
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

              <div className={`p-3 rounded-lg ${(formData.multiple_choice_score + formData.true_false_multi_score + formData.short_answer_score) === formData.total_score
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
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian bắt đầu</label>
                <input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian kết thúc</label>
                <input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="input text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { key: 'shuffle_questions' as const, label: 'Xáo trộn câu hỏi' },
                { key: 'shuffle_answers' as const, label: 'Xáo trộn đáp án' },
                { key: 'allow_review' as const, label: 'Cho xem lại đáp án' },
              ].map(({ key, label }) => (
                <label key={key} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData[key] ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <input type="checkbox" className="sr-only" checked={formData[key]}
                    onChange={e => setFormData({ ...formData, [key]: e.target.checked })} />
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${formData[key] ? 'bg-primary-600 border-primary-600' : 'border-gray-400'
                    }`}>
                    {formData[key] && <span className="text-white text-xs">✓</span>}
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Nhập câu hỏi từ file</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload file (PDF, DOC, DOCX, Excel, TXT)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      handleFileUpload(file)
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                  disabled={fileAnalyzing}
                />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer flex flex-col items-center ${fileAnalyzing ? 'opacity-50' : ''}`}
                >
                  {fileAnalyzing ? (
                    <>
                      <Loader2 className="h-12 w-12 text-primary-600 mb-4 animate-spin" />
                      <p className="text-sm text-gray-600 mb-2">Đang phân tích file...</p>
                      <div className="w-full max-w-xs mt-2">
                        <div className="bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(analyzeProgress, 99)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 text-center">
                          {Math.round(Math.min(analyzeProgress, 99))}%
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-sm text-gray-600 mb-2">
                        Click để chọn file hoặc kéo thả file vào đây
                      </p>
                      <p className="text-xs text-gray-500">
                        Hỗ trợ: PDF, DOC, DOCX, Excel, TXT
                      </p>
                    </>
                  )}
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ✅ Hỗ trợ đọc trực tiếp: PDF, DOCX, Excel, TXT. Hoặc bạn có thể dán nội dung vào ô bên dưới
              </p>
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hoặc dán nội dung từ file vào đây
              </label>
              <textarea
                id="text-input"
                className="input"
                rows={8}
                placeholder="Dán nội dung câu hỏi từ file vào đây (PDF, DOC, DOCX, Excel đã được convert sang text)..."
              />
              <button
                onClick={() => {
                  const textarea = document.getElementById('text-input') as HTMLTextAreaElement
                  if (textarea?.value) {
                    handleTextAnalyze(textarea.value)
                  } else {
                    toast.error('Vui lòng nhập nội dung')
                  }
                }}
                disabled={fileAnalyzing}
                className="btn btn-primary flex items-center mt-2"
              >
                {fileAnalyzing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Đang phân tích...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 mr-2" />
                    Phân tích và trích xuất câu hỏi
                  </>
                )}
              </button>
              {fileAnalyzing && (
                <div className="mt-2">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(analyzeProgress, 99)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    {Math.round(Math.min(analyzeProgress, 99))}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phần hiển thị câu hỏi - chia thành 3 phần */}
        <div id="questions-section" className="space-y-6">
          {/* Nút tự tính toán kết quả */}
          {manualQuestions.length > 0 && (
            <div className="card bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    Tự tính toán kết quả
                  </h3>
                  <p className="text-sm text-gray-600">
                    AI sẽ phân tích và tự động điền đáp án đúng cho tất cả các câu hỏi
                  </p>
                  <p className="text-xs text-orange-600 mt-1 font-medium">
                    ⚠️ Lưu ý: Kết quả nhận được có thể không chính xác 100%, vui lòng kiểm tra lại
                  </p>
                </div>
                <button
                  onClick={handleAutoCalculateAnswers}
                  disabled={calculatingAnswers}
                  className="btn btn-primary flex items-center ml-4"
                >
                  {calculatingAnswers ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Đang tính toán...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2" />
                      Tự tính toán kết quả
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Phần 1: Trắc nghiệm 4 phương án */}
          {manualQuestions.filter(q => q.question_type === 'multiple_choice').length > 0 && (
            <div className="card">
              <h2 className="text-xl font-bold mb-4">
                Trắc nghiệm 4 phương án ({manualQuestions.filter(q => q.question_type === 'multiple_choice').length} câu)
              </h2>
              <div className="space-y-4">
                {manualQuestions
                  .map((q, originalIdx) => ({ q, originalIdx }))
                  .filter(({ q }) => q.question_type === 'multiple_choice')
                  .map(({ q, originalIdx }) => (
                    <div key={originalIdx} className="p-4 border rounded-lg">
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-500 bg-blue-50 px-2 py-1 rounded">
                          Câu {originalIdx + 1}
                        </span>
                        <button
                          onClick={() => {
                            const newQs = [...manualQuestions]
                            newQs.splice(originalIdx, 1)
                            setManualQuestions(newQs)
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Xóa
                        </button>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <input
                        type="text"
                        value={q.content}
                        onChange={(e) => {
                          const newQs = [...manualQuestions]
                          newQs[originalIdx].content = e.target.value
                          setManualQuestions(newQs)
                        }}
                        className="input mb-2"
                        placeholder="Nội dung câu hỏi"
                      />

                      {/* Upload hình ảnh - Collapsible */}
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() => setShowImageUpload({ ...showImageUpload, [originalIdx]: !showImageUpload[originalIdx] })}
                          className="flex items-center text-sm text-gray-600 hover:text-gray-800 mb-2"
                        >
                          <Image className="h-4 w-4 mr-1" />
                          {q.image_url ? 'Hình ảnh đã tải' : 'Thêm hình ảnh'}
                          {showImageUpload[originalIdx] ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </button>
                        {showImageUpload[originalIdx] && (
                          <CustomFileInput
                            value={q.image_url}
                            onChange={async (file) => {
                              try {
                                const apiKey = import.meta.env.VITE_UPLOAD_API_KEY
                                if (!apiKey) {
                                  toast.error('Chưa cấu hình API key upload ảnh')
                                  return
                                }

                                const apiUrl = 'https://upanhnhanh.com/api/v1/upload'
                                const formData = new FormData()
                                formData.append('images[]', file)

                                const response = await fetch(apiUrl, {
                                  method: 'POST',
                                  headers: {
                                    'X-API-Key': apiKey
                                  },
                                  body: formData
                                })

                                const data = await response.json()

                                if (data.success && data.urls && data.urls.length > 0) {
                                  const imageUrl = data.urls[0]
                                  const newQs = [...manualQuestions]
                                  newQs[originalIdx].image_url = imageUrl
                                  setManualQuestions(newQs)
                                  toast.success('Upload hình ảnh thành công')
                                } else {
                                  throw new Error(data.errors?.[0] || 'Upload thất bại')
                                }
                              } catch (error: any) {
                                toast.error('Lỗi khi upload hình ảnh: ' + (error.message || 'Unknown error'))
                                throw error
                              }
                            }}
                            onRemove={() => {
                              const newQs = [...manualQuestions]
                              newQs[originalIdx].image_url = ''
                              setManualQuestions(newQs)
                            }}
                          />
                        )}
                      </div>

                      {/* Đáp án */}
                      <div className="space-y-2 mt-3">
                        {q.answers?.map((a: any, aidx: number) => (
                          <div key={aidx} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={a.content}
                              onChange={(e) => {
                                const newQs = [...manualQuestions]
                                newQs[originalIdx].answers[aidx].content = e.target.value
                                setManualQuestions(newQs)
                              }}
                              className="input flex-1"
                              placeholder={`Đáp án ${String.fromCharCode(65 + aidx)}`}
                            />
                            <label className="flex items-center whitespace-nowrap">
                              <input
                                type="radio"
                                name={`correct-${originalIdx}`}
                                checked={a.is_correct}
                                onChange={() => {
                                  const newQs = [...manualQuestions]
                                  newQs[originalIdx].answers.forEach((ans: any) => (ans.is_correct = false))
                                  newQs[originalIdx].answers[aidx].is_correct = true
                                  setManualQuestions(newQs)
                                }}
                                className="mr-1"
                              />
                              Đúng
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Phần 2: Đúng/Sai 4 ý */}
          {manualQuestions.filter(q => q.question_type === 'true_false_multi').length > 0 && (
            <div className="card">
              <h2 className="text-xl font-bold mb-4">
                Đúng/Sai 4 ý ({manualQuestions.filter(q => q.question_type === 'true_false_multi').length} câu)
              </h2>
              <div className="space-y-4">
                {manualQuestions
                  .map((q, originalIdx) => ({ q, originalIdx }))
                  .filter(({ q }) => q.question_type === 'true_false_multi')
                  .map(({ q, originalIdx }) => (
                    <div key={originalIdx} className="p-4 border rounded-lg">
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-500 bg-green-50 px-2 py-1 rounded">
                          Câu {originalIdx + 1}
                        </span>
                        <button
                          onClick={() => {
                            const newQs = [...manualQuestions]
                            newQs.splice(originalIdx, 1)
                            setManualQuestions(newQs)
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Xóa
                        </button>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <input
                        type="text"
                        value={q.content}
                        onChange={(e) => {
                          const newQs = [...manualQuestions]
                          newQs[originalIdx].content = e.target.value
                          setManualQuestions(newQs)
                        }}
                        className="input mb-2"
                        placeholder="Nội dung câu hỏi"
                      />

                      {/* Upload hình ảnh - Collapsible */}
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() => setShowImageUpload({ ...showImageUpload, [originalIdx]: !showImageUpload[originalIdx] })}
                          className="flex items-center text-sm text-gray-600 hover:text-gray-800 mb-2"
                        >
                          <Image className="h-4 w-4 mr-1" />
                          {q.image_url ? 'Hình ảnh đã tải' : 'Thêm hình ảnh'}
                          {showImageUpload[originalIdx] ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </button>
                        {showImageUpload[originalIdx] && (
                          <CustomFileInput
                            value={q.image_url}
                            onChange={async (file) => {
                              try {
                                const apiKey = import.meta.env.VITE_UPLOAD_API_KEY
                                if (!apiKey) {
                                  toast.error('Chưa cấu hình API key upload ảnh')
                                  return
                                }

                                const apiUrl = 'https://upanhnhanh.com/api/v1/upload'
                                const formData = new FormData()
                                formData.append('images[]', file)

                                const response = await fetch(apiUrl, {
                                  method: 'POST',
                                  headers: {
                                    'X-API-Key': apiKey
                                  },
                                  body: formData
                                })

                                const data = await response.json()

                                if (data.success && data.urls && data.urls.length > 0) {
                                  const imageUrl = data.urls[0]
                                  const newQs = [...manualQuestions]
                                  newQs[originalIdx].image_url = imageUrl
                                  setManualQuestions(newQs)
                                  toast.success('Upload hình ảnh thành công')
                                } else {
                                  throw new Error(data.errors?.[0] || 'Upload thất bại')
                                }
                              } catch (error: any) {
                                toast.error('Lỗi khi upload hình ảnh: ' + (error.message || 'Unknown error'))
                                throw error
                              }
                            }}
                            onRemove={() => {
                              const newQs = [...manualQuestions]
                              newQs[originalIdx].image_url = ''
                              setManualQuestions(newQs)
                            }}
                          />
                        )}
                      </div>

                      {/* Đáp án */}
                      <div className="space-y-2 mt-3">
                        {q.answers?.map((a: any, aidx: number) => (
                          <div key={aidx} className="flex items-center space-x-2">
                            <span className="font-medium w-8">{String.fromCharCode(97 + aidx)}.</span>
                            <input
                              type="text"
                              value={a.content}
                              onChange={(e) => {
                                const newQs = [...manualQuestions]
                                newQs[originalIdx].answers[aidx].content = e.target.value
                                setManualQuestions(newQs)
                              }}
                              className="input flex-1"
                              placeholder={`Ý ${String.fromCharCode(97 + aidx)}`}
                            />
                            <label className="flex items-center whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={a.is_correct}
                                onChange={(e) => {
                                  const newQs = [...manualQuestions]
                                  newQs[originalIdx].answers[aidx].is_correct = e.target.checked
                                  setManualQuestions(newQs)
                                }}
                                className="mr-1"
                              />
                              Đúng
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Phần 3: Trả lời ngắn */}
          {manualQuestions.filter(q => q.question_type === 'short_answer').length > 0 && (
            <div className="card">
              <h2 className="text-xl font-bold mb-4">
                Trả lời ngắn ({manualQuestions.filter(q => q.question_type === 'short_answer').length} câu)
              </h2>
              <div className="space-y-4">
                {manualQuestions
                  .map((q, originalIdx) => ({ q, originalIdx }))
                  .filter(({ q }) => q.question_type === 'short_answer')
                  .map(({ q, originalIdx }) => (
                    <div key={originalIdx} className="p-4 border rounded-lg">
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-500 bg-purple-50 px-2 py-1 rounded">
                          Câu {originalIdx + 1}
                        </span>
                        <button
                          onClick={() => {
                            const newQs = [...manualQuestions]
                            newQs.splice(originalIdx, 1)
                            setManualQuestions(newQs)
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Xóa
                        </button>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <input
                        type="text"
                        value={q.content}
                        onChange={(e) => {
                          const newQs = [...manualQuestions]
                          newQs[originalIdx].content = e.target.value
                          setManualQuestions(newQs)
                        }}
                        className="input mb-2"
                        placeholder="Nội dung câu hỏi"
                      />

                      {/* Upload hình ảnh - Collapsible */}
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() => setShowImageUpload({ ...showImageUpload, [originalIdx]: !showImageUpload[originalIdx] })}
                          className="flex items-center text-sm text-gray-600 hover:text-gray-800 mb-2"
                        >
                          <Image className="h-4 w-4 mr-1" />
                          {q.image_url ? 'Hình ảnh đã tải' : 'Thêm hình ảnh'}
                          {showImageUpload[originalIdx] ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </button>
                        {showImageUpload[originalIdx] && (
                          <CustomFileInput
                            value={q.image_url}
                            onChange={async (file) => {
                              try {
                                const apiKey = import.meta.env.VITE_UPLOAD_API_KEY
                                if (!apiKey) {
                                  toast.error('Chưa cấu hình API key upload ảnh')
                                  return
                                }

                                const apiUrl = 'https://upanhnhanh.com/api/v1/upload'
                                const formData = new FormData()
                                formData.append('images[]', file)

                                const response = await fetch(apiUrl, {
                                  method: 'POST',
                                  headers: {
                                    'X-API-Key': apiKey
                                  },
                                  body: formData
                                })

                                const data = await response.json()

                                if (data.success && data.urls && data.urls.length > 0) {
                                  const imageUrl = data.urls[0]
                                  const newQs = [...manualQuestions]
                                  newQs[originalIdx].image_url = imageUrl
                                  setManualQuestions(newQs)
                                  toast.success('Upload hình ảnh thành công')
                                } else {
                                  throw new Error(data.errors?.[0] || 'Upload thất bại')
                                }
                              } catch (error: any) {
                                toast.error('Lỗi khi upload hình ảnh: ' + (error.message || 'Unknown error'))
                                throw error
                              }
                            }}
                            onRemove={() => {
                              const newQs = [...manualQuestions]
                              newQs[originalIdx].image_url = ''
                              setManualQuestions(newQs)
                            }}
                          />
                        )}
                      </div>

                      {/* Đáp án */}
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Đáp án đúng (số cụ thể, ví dụ: 1234, 12.34, -12.34)
                        </label>
                        <input
                          type="text"
                          value={q.correct_answer || ''}
                          onChange={(e) => {
                            const newQs = [...manualQuestions]
                            newQs[originalIdx].correct_answer = e.target.value
                            setManualQuestions(newQs)
                          }}
                          className="input"
                          placeholder="Nhập đáp án số (ví dụ: 1234 hoặc 12.34)"
                          pattern="[-.0-9]*"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Phần thêm câu hỏi thủ công - Collapsible */}
        <div className="card">
          <button
            onClick={() => setShowManualQuestions(!showManualQuestions)}
            className="flex justify-between items-center w-full mb-4"
          >
            <h2 className="text-xl font-bold">Thêm câu hỏi thủ công</h2>
            {showManualQuestions ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>

          {showManualQuestions && (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleAddManualQuestion('multiple_choice')}
                  className="btn btn-secondary text-sm"
                >
                  + Trắc nghiệm 4 phương án
                </button>
                <button
                  onClick={() => handleAddManualQuestion('true_false_multi')}
                  className="btn btn-secondary text-sm"
                >
                  + Đúng/Sai (4 ý)
                </button>
                <button
                  onClick={() => handleAddManualQuestion('short_answer')}
                  className="btn btn-secondary text-sm"
                >
                  + Trả lời ngắn
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Câu hỏi mới sẽ được thêm vào phần tương ứng ở trên
              </p>
            </>
          )}
        </div>


        <div className="flex justify-end space-x-3">
          <button
            onClick={() => navigate('/teacher/exams')}
            className="btn btn-secondary"
          >
            Hủy
          </button>
          <button onClick={handleSave} disabled={loading} className="btn btn-primary flex items-center">
            <Save className="h-5 w-5 mr-2" />
            {loading ? 'Đang lưu...' : 'Lưu bài thi'}
          </button>
        </div>
      </div>
    </div>
  )
}

