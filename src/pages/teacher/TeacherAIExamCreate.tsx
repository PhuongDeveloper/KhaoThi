import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { subjectApi } from '../../lib/api/subjects'
import { examApi } from '../../lib/api/exams'
import { aiEditQuestion } from '../../lib/api/gemini'
import { getMyBanks, getBankQuestions, getRandomQuestions, getOrCreateBank, addQuestionsToBank, generateShareCode, importBankByShareCode, removeQuestionFromBank, type QuestionBank, type BankQuestion } from '../../lib/api/question-bank'
import toast from 'react-hot-toast'
import { Sparkles, Database, RefreshCw, Send, Loader2, Copy, Download, Trash2, Eye, EyeOff, X, ChevronDown, ChevronUp, Wand2 } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function TeacherAIExamCreate() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<any[]>([])
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [showBankQuestions, setShowBankQuestions] = useState(false)
  const [mcCount, setMcCount] = useState(0)
  const [tfCount, setTfCount] = useState(0)
  const [saCount, setSaCount] = useState(0)
  const [generatedQuestions, setGeneratedQuestions] = useState<BankQuestion[]>([])
  const [generating, setGenerating] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingAI, setEditingAI] = useState(false)
  const [aiPreview, setAiPreview] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [assignClassId, setAssignClassId] = useState('')
  const [assignStart, setAssignStart] = useState('')
  const [assignEnd, setAssignEnd] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [savingToBank, setSavingToBank] = useState(false)
  const [showSaveToBankModal, setShowSaveToBankModal] = useState(false)
  const [saveBankSubjectId, setSaveBankSubjectId] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const [subs, myBanks] = await Promise.all([subjectApi.getAll(), getMyBanks(profile.id)])
      setSubjects(subs)
      setBanks(myBanks)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const handleSelectBank = async (bankId: string) => {
    setSelectedBankId(bankId)
    if (!bankId) { setBankQuestions([]); return }
    try {
      const qs = await getBankQuestions(bankId)
      setBankQuestions(qs)
    } catch (e: any) { toast.error(e.message) }
  }

  const handleGenerate = async () => {
    if (!selectedBankId) { toast.error('Chọn ngân hàng trước'); return }
    setGenerating(true)
    try {
      const [mc, tf, sa] = await Promise.all([
        mcCount > 0 ? getRandomQuestions(selectedBankId, 'multiple_choice', mcCount) : [],
        tfCount > 0 ? getRandomQuestions(selectedBankId, 'true_false_multi', tfCount) : [],
        saCount > 0 ? getRandomQuestions(selectedBankId, 'short_answer', saCount) : [],
      ])
      const all = [...mc, ...tf, ...sa]
      if (all.length === 0) { toast.error('Không đủ câu hỏi trong ngân hàng'); return }
      setGeneratedQuestions(all)
      toast.success(`Đã tạo đề với ${all.length} câu hỏi`)
    } catch (e: any) { toast.error(e.message) }
    finally { setGenerating(false) }
  }

  const handleRemoveQuestion = (idx: number) => {
    setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAIEdit = async (idx: number) => {
    if (!profile?.id) return
    setEditingIdx(idx)
    setEditingAI(true)
    setAiPreview(null)
    try {
      const q = generatedQuestions[idx]
      const result = await aiEditQuestion({ content: q.content, question_type: q.question_type, answers: q.answers, correct_answer: q.correct_answer }, profile.id)
      setAiPreview(result)
    } catch (e: any) { toast.error(e.message) }
    finally { setEditingAI(false) }
  }

  const handleApplyAIEdit = () => {
    if (editingIdx === null || !aiPreview) return
    const updated = [...generatedQuestions]
    updated[editingIdx] = { ...updated[editingIdx], content: aiPreview.content, answers: aiPreview.answers || updated[editingIdx].answers, correct_answer: aiPreview.correct_answer || updated[editingIdx].correct_answer }
    setGeneratedQuestions(updated)
    setEditingIdx(null)
    setAiPreview(null)
    toast.success('Đã áp dụng câu hỏi mới')
  }

  const handleShare = async () => {
    if (!selectedBankId || !profile?.id) return
    try {
      const code = await generateShareCode(selectedBankId, profile.id)
      setShareCode(code)
      setShowShareModal(true)
    } catch (e: any) { toast.error(e.message) }
  }

  const handleImport = async () => {
    if (!profile?.id || !importCode.trim()) return
    setImporting(true)
    try {
      const bank = await importBankByShareCode(profile.id, importCode)
      toast.success(`Đã nhận ngân hàng "${bank.subject_name}" với ${bank.question_count} câu hỏi`)
      setShowImportModal(false)
      setImportCode('')
      fetchData()
    } catch (e: any) { toast.error(e.message) }
    finally { setImporting(false) }
  }

  const handleAssign = async () => {
    if (!profile?.id || generatedQuestions.length === 0) return
    setAssigning(true)
    try {
      const bank = banks.find(b => b.id === selectedBankId)
      const examData = { title: `Đề thi AI - ${bank?.subject_name || 'Tổng hợp'}`, description: 'Đề thi tạo từ ngân hàng câu hỏi', subject_id: bank?.subject_id || '', teacher_id: profile.id, status: 'draft' as const, total_questions: generatedQuestions.length, duration_minutes: 60, total_score: 10, passing_score: 50, shuffle_questions: true, shuffle_answers: true, allow_review: false, start_time: assignStart || null, end_time: assignEnd || null, multiple_choice_score: 0, true_false_multi_score: 0, short_answer_score: 0 }
      const exam = await examApi.createExam(examData)
      await examApi.createQuestionsWithAnswers(exam.id, generatedQuestions.map(q => ({ content: q.content, question_type: q.question_type, answers: q.answers || [], correct_answer: q.correct_answer, difficulty: q.difficulty || 'medium', points: q.points || 1 })))
      if (assignClassId) {
        await examApi.assignExamToClass(exam.id, assignClassId, assignStart, assignEnd)
        toast.success('Đã tạo đề và giao bài thành công')
      } else { toast.success('Đã tạo đề thi thành công') }
      setShowAssignModal(false)
      navigate('/teacher/exams')
    } catch (e: any) { toast.error(e.message) }
    finally { setAssigning(false) }
  }

  const handleSaveToBank = async () => {
    if (!profile?.id || !saveBankSubjectId || generatedQuestions.length === 0) return
    setSavingToBank(true)
    try {
      const sub = subjects.find(s => s.id === saveBankSubjectId)
      const bank = await getOrCreateBank(profile.id, saveBankSubjectId, sub?.name || '')
      await addQuestionsToBank(bank.id, generatedQuestions.map(q => ({ content: q.content, question_type: q.question_type, answers: q.answers, correct_answer: q.correct_answer, difficulty: q.difficulty, points: q.points })))
      toast.success(`Đã lưu ${generatedQuestions.length} câu vào ngân hàng`)
      setShowSaveToBankModal(false)
      fetchData()
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingToBank(false) }
  }

  const handleDeleteBankQuestion = async (bankId: string, questionId: string) => {
    try {
      await removeQuestionFromBank(bankId, questionId)
      setBankQuestions(prev => prev.filter(q => q.id !== questionId))
      toast.success('Đã xóa câu hỏi')
    } catch (e: any) { toast.error(e.message) }
  }

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { getClasses } = await import('../../lib/api/classes')
        const cls = await getClasses()
        setClasses(cls)
      } catch {}
    }
    fetchClasses()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>

  const selectedBank = banks.find(b => b.id === selectedBankId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary-600" />Tạo Đề Với AI</h1>
          <p className="text-gray-500 mt-1">Tạo đề thi từ ngân hàng câu hỏi của bạn</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary flex items-center gap-2"><Download className="h-4 w-4" />Nhận ngân hàng</button>
          <button onClick={fetchData} className="btn btn-secondary flex items-center gap-2"><RefreshCw className="h-4 w-4" />Làm mới</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Config */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Database className="h-5 w-5 text-primary-600" />Ngân hàng câu hỏi</h3>
            {banks.length === 0 ? (
              <p className="text-gray-500 text-sm">Chưa có ngân hàng nào. Hãy tạo bài thi và lưu câu hỏi vào ngân hàng.</p>
            ) : (
              <div className="space-y-2">
                {banks.map(b => (
                  <button key={b.id} onClick={() => handleSelectBank(b.id)} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${selectedBankId === b.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="font-semibold text-gray-800">{b.subject_name}</p>
                    <p className="text-xs text-gray-500">{b.question_count} câu hỏi</p>
                  </button>
                ))}
              </div>
            )}
            {selectedBankId && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => setShowBankQuestions(!showBankQuestions)} className="btn btn-secondary text-sm flex-1 flex items-center justify-center gap-1">
                  {showBankQuestions ? <><EyeOff className="h-3 w-3" />Ẩn kho</> : <><Eye className="h-3 w-3" />Xem kho</>}
                </button>
                <button onClick={handleShare} className="btn btn-secondary text-sm flex-1 flex items-center justify-center gap-1"><Copy className="h-3 w-3" />Chia sẻ</button>
              </div>
            )}
          </div>

          {selectedBankId && (
            <div className="card">
              <h3 className="font-bold text-gray-800 mb-4">Cấu hình đề thi</h3>
              <div className="space-y-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Trắc nghiệm 4 phương án</label><input type="number" min={0} value={mcCount} onChange={e => setMcCount(parseInt(e.target.value)||0)} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Đúng/Sai 4 ý</label><input type="number" min={0} value={tfCount} onChange={e => setTfCount(parseInt(e.target.value)||0)} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Trả lời ngắn</label><input type="number" min={0} value={saCount} onChange={e => setSaCount(parseInt(e.target.value)||0)} className="input" /></div>
              </div>
              <button onClick={handleGenerate} disabled={generating || (mcCount+tfCount+saCount === 0)} className="w-full btn btn-primary mt-4 flex items-center justify-center gap-2">
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" />Đang tạo...</> : <><Sparkles className="h-4 w-4" />Tạo đề ngẫu nhiên</>}
              </button>
            </div>
          )}
        </div>

        {/* Right: Preview + Bank view */}
        <div className="lg:col-span-8 space-y-4">
          {showBankQuestions && bankQuestions.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <div className="bg-gray-50 border-b px-5 py-3 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Kho: {selectedBank?.subject_name} ({bankQuestions.length} câu)</h3>
                <button onClick={() => setShowBankQuestions(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y">
                {bankQuestions.map((q, i) => (
                  <div key={q.id} className="p-4 flex gap-3 hover:bg-gray-50">
                    <span className="text-xs font-bold text-gray-400 mt-1">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 line-clamp-2">{q.content}</p>
                      <span className="text-xs text-gray-400">{q.question_type}</span>
                    </div>
                    <button onClick={() => handleDeleteBankQuestion(selectedBankId, q.id)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generatedQuestions.length > 0 ? (
            <div className="space-y-4">
              <div className="card bg-primary-50 border-primary-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="font-bold text-gray-800">Đề thi: {generatedQuestions.length} câu hỏi</h3>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setSaveBankSubjectId(selectedBank?.subject_id || ''); setShowSaveToBankModal(true) }} className="btn btn-secondary text-sm flex items-center gap-1"><Database className="h-3 w-3" />Nhập vào kho</button>
                    <button onClick={() => setShowAssignModal(true)} className="btn btn-primary text-sm flex items-center gap-1"><Send className="h-3 w-3" />Giao bài</button>
                  </div>
                </div>
              </div>

              {generatedQuestions.map((q, idx) => (
                <div key={idx} className="card border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary-100 text-primary-700 px-2.5 py-1 rounded-md text-sm font-bold">{idx+1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${q.question_type==='multiple_choice'?'bg-blue-100 text-blue-700':q.question_type==='true_false_multi'?'bg-green-100 text-green-700':'bg-purple-100 text-purple-700'}`}>{q.question_type==='multiple_choice'?'Trắc nghiệm':q.question_type==='true_false_multi'?'Đúng/Sai':'Trả lời ngắn'}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleAIEdit(idx)} disabled={editingAI && editingIdx===idx} className="text-amber-600 hover:text-amber-800 p-1" title="Chỉnh sửa bằng AI"><Wand2 className="h-4 w-4" /></button>
                      <button onClick={() => handleRemoveQuestion(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="text-gray-800 font-medium mb-3">{q.content}</p>
                  {q.answers && q.answers.length > 0 && (
                    <div className="space-y-1.5">
                      {q.answers.map((a: any, ai: number) => (
                        <div key={ai} className={`flex items-center gap-2 text-sm p-2 rounded-lg ${a.is_correct ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-600'}`}>
                          <span className="font-bold text-xs w-5">{String.fromCharCode(65+ai)}.</span>
                          <span>{a.content}</span>
                          {a.is_correct && <span className="text-green-600 text-xs ml-auto">Đúng</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.question_type === 'short_answer' && q.correct_answer && (
                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded-lg mt-2">Đáp án: {q.correct_answer}</p>
                  )}

                  {/* AI Edit Preview */}
                  {editingIdx === idx && (editingAI || aiPreview) && (
                    <div className="mt-4 border-t pt-4">
                      {editingAI ? (
                        <div className="flex items-center gap-2 text-amber-600"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">AI đang tạo câu hỏi mới...</span></div>
                      ) : aiPreview && (
                        <div className="space-y-3">
                          <h4 className="font-bold text-amber-800 text-sm flex items-center gap-1"><Wand2 className="h-4 w-4" />Câu hỏi mới (AI tạo):</h4>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-gray-800 font-medium mb-2">{aiPreview.content}</p>
                            {aiPreview.answers && aiPreview.answers.map((a: any, ai: number) => (
                              <div key={ai} className={`text-sm p-1.5 ${a.is_correct ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                                {String.fromCharCode(65+ai)}. {a.content} {a.is_correct && '(Đúng)'}
                              </div>
                            ))}
                            {aiPreview.correct_answer && <p className="text-sm text-green-700 mt-1">Đáp án: {aiPreview.correct_answer}</p>}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleApplyAIEdit} className="btn btn-primary text-sm">Áp dụng</button>
                            <button onClick={() => { setEditingIdx(null); setAiPreview(null) }} className="btn btn-secondary text-sm">Giữ nguyên</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card min-h-[400px] flex flex-col items-center justify-center text-center">
              <div className="bg-gray-50 h-20 w-20 rounded-full flex items-center justify-center mb-4"><Sparkles className="h-8 w-8 text-gray-300" /></div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Chưa có đề thi nào</h3>
              <p className="text-gray-500 text-sm max-w-md">Chọn ngân hàng câu hỏi, cấu hình số lượng câu hỏi và bấm "Tạo đề ngẫu nhiên" để bắt đầu.</p>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-3">Chia sẻ ngân hàng</h3>
            <p className="text-sm text-gray-600 mb-3">Gửi mã này cho giáo viên khác:</p>
            <div className="bg-gray-100 p-3 rounded-lg font-mono text-sm break-all mb-4">{shareCode}</div>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(shareCode); toast.success('Đã copy') }} className="btn btn-primary flex-1">Copy</button>
              <button onClick={() => setShowShareModal(false)} className="btn btn-secondary flex-1">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-3">Nhận ngân hàng</h3>
            <input value={importCode} onChange={e => setImportCode(e.target.value)} className="input mb-4" placeholder="Nhập mã chia sẻ..." />
            <div className="flex gap-2">
              <button onClick={handleImport} disabled={importing || !importCode.trim()} className="btn btn-primary flex-1">{importing ? 'Đang nhập...' : 'Nhận kho'}</button>
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary flex-1">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-lg mb-4">Giao bài cho học sinh</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Chọn lớp</label>
                <select value={assignClassId} onChange={e => setAssignClassId(e.target.value)} className="input">
                  <option value="">Không giao cho lớp (chỉ tạo đề)</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Bắt đầu</label><input type="datetime-local" value={assignStart} onChange={e => setAssignStart(e.target.value)} className="input" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Kết thúc</label><input type="datetime-local" value={assignEnd} onChange={e => setAssignEnd(e.target.value)} className="input" /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAssign} disabled={assigning} className="btn btn-primary flex-1">{assigning ? 'Đang xử lý...' : 'Xác nhận'}</button>
              <button onClick={() => setShowAssignModal(false)} className="btn btn-secondary flex-1">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* Save to Bank Modal */}
      {showSaveToBankModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-3">Nhập câu hỏi vào kho</h3>
            <select value={saveBankSubjectId} onChange={e => setSaveBankSubjectId(e.target.value)} className="input mb-4">
              <option value="">Chọn môn</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={handleSaveToBank} disabled={savingToBank || !saveBankSubjectId} className="btn btn-primary flex-1">{savingToBank ? 'Đang lưu...' : `Lưu ${generatedQuestions.length} câu`}</button>
              <button onClick={() => setShowSaveToBankModal(false)} className="btn btn-secondary flex-1">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
