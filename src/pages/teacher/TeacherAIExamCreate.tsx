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
    if (!selectedBankId) { toast.error('Chon ngan hang truoc'); return }
    setGenerating(true)
    try {
      const [mc, tf, sa] = await Promise.all([
        mcCount > 0 ? getRandomQuestions(selectedBankId, 'multiple_choice', mcCount) : [],
        tfCount > 0 ? getRandomQuestions(selectedBankId, 'true_false_multi', tfCount) : [],
        saCount > 0 ? getRandomQuestions(selectedBankId, 'short_answer', saCount) : [],
      ])
      const all = [...mc, ...tf, ...sa]
      if (all.length === 0) { toast.error('Khong du cau hoi trong ngan hang'); return }
      setGeneratedQuestions(all)
      toast.success(Da tao de voi  cau hoi)
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
    toast.success('Da ap dung cau hoi moi')
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
      toast.success(Da nhap ngan hang   voi  cau hoi)
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
      const examData = { title: De thi AI - , description: 'De thi tao tu ngan hang cau hoi', subject_id: bank?.subject_id || '', teacher_id: profile.id, status: 'draft' as const, total_questions: generatedQuestions.length, duration_minutes: 60, total_score: 10, passing_score: 50, shuffle_questions: true, shuffle_answers: true, allow_review: false, start_time: assignStart || null, end_time: assignEnd || null, multiple_choice_score: 0, true_false_multi_score: 0, short_answer_score: 0 }
      const exam = await examApi.createExam(examData)
      await examApi.createQuestionsWithAnswers(exam.id, generatedQuestions.map(q => ({ content: q.content, question_type: q.question_type, answers: q.answers || [], correct_answer: q.correct_answer, difficulty: q.difficulty || 'medium', points: q.points || 1 })))
      if (assignClassId) {
        await examApi.assignExamToClass(exam.id, assignClassId, assignStart, assignEnd)
        toast.success('Da tao de va giao bai thanh cong')
      } else { toast.success('Da tao de thi thanh cong') }
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
      toast.success(Da luu  cau vao ngan hang)
      setShowSaveToBankModal(false)
      fetchData()
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingToBank(false) }
  }

  const handleDeleteBankQuestion = async (bankId: string, questionId: string) => {
    try {
      await removeQuestionFromBank(bankId, questionId)
      setBankQuestions(prev => prev.filter(q => q.id !== questionId))
      toast.success('Da xoa cau hoi')
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

  if (loading) return <div className=flex items-center justify-center h-64><LoadingSpinner size=lg /></div>

  const selectedBank = banks.find(b => b.id === selectedBankId)

  return (
    <div className=space-y-6 max-w-7xl mx-auto>
      <div className=flex flex-col md:flex-row md:items-center justify-between gap-4>
        <div>
          <h1 className=text-2xl font-bold text-gray-900 flex items-center gap-2><Sparkles className=h-6 w-6 text-primary-600 />Tao De Voi AI</h1>
          <p className=text-gray-500 mt-1>Tao de thi tu ngan hang cau hoi cua ban</p>
        </div>
        <div className=flex gap-2>
          <button onClick={() => setShowImportModal(true)} className=btn btn-secondary flex items-center gap-2><Download className=h-4 w-4 />Nhan ngan hang</button>
          <button onClick={fetchData} className=btn btn-secondary flex items-center gap-2><RefreshCw className=h-4 w-4 />Lam moi</button>
        </div>
      </div>

      <div className=grid grid-cols-1 lg:grid-cols-12 gap-6>
        {/* Left: Config */}
        <div className=lg:col-span-4 space-y-4>
          <div className=card>
            <h3 className=font-bold text-gray-800 mb-4 flex items-center gap-2><Database className=h-5 w-5 text-primary-600 />Ngan hang cau hoi</h3>
            {banks.length === 0 ? (
              <p className=text-gray-500 text-sm>Chua co ngan hang nao. Hay tao bai thi va luu cau hoi vao ngan hang.</p>
            ) : (
              <div className=space-y-2>
                {banks.map(b => (
                  <button key={b.id} onClick={() => handleSelectBank(b.id)} className={w-full text-left p-3 rounded-xl border-2 transition-all }>
                    <p className=font-semibold text-gray-800>{b.subject_name}</p>
                    <p className=text-xs text-gray-500>{b.question_count} cau hoi</p>
                  </button>
                ))}
              </div>
            )}
            {selectedBankId && (
              <div className=mt-4 flex gap-2>
                <button onClick={() => setShowBankQuestions(!showBankQuestions)} className=btn btn-secondary text-sm flex-1 flex items-center justify-center gap-1>
                  {showBankQuestions ? <><EyeOff className=h-3 w-3 />An kho</> : <><Eye className=h-3 w-3 />Xem kho</>}
                </button>
                <button onClick={handleShare} className=btn btn-secondary text-sm flex-1 flex items-center justify-center gap-1><Copy className=h-3 w-3 />Chia se</button>
              </div>
            )}
          </div>

          {selectedBankId && (
            <div className=card>
              <h3 className=font-bold text-gray-800 mb-4>Cau hinh de thi</h3>
              <div className=space-y-3>
                <div><label className=block text-sm font-medium text-gray-700 mb-1>Trac nghiem 4 phuong an</label><input type=number min={0} value={mcCount} onChange={e => setMcCount(parseInt(e.target.value)||0)} className=input /></div>
                <div><label className=block text-sm font-medium text-gray-700 mb-1>Dung/Sai 4 y</label><input type=number min={0} value={tfCount} onChange={e => setTfCount(parseInt(e.target.value)||0)} className=input /></div>
                <div><label className=block text-sm font-medium text-gray-700 mb-1>Tra loi ngan</label><input type=number min={0} value={saCount} onChange={e => setSaCount(parseInt(e.target.value)||0)} className=input /></div>
              </div>
              <button onClick={handleGenerate} disabled={generating || (mcCount+tfCount+saCount === 0)} className=w-full btn btn-primary mt-4 flex items-center justify-center gap-2>
                {generating ? <><Loader2 className=h-4 w-4 animate-spin />Dang tao...</> : <><Sparkles className=h-4 w-4 />Tao de ngau nhien</>}
              </button>
            </div>
          )}
        </div>

        {/* Right: Preview + Bank view */}
        <div className=lg:col-span-8 space-y-4>
          {showBankQuestions && bankQuestions.length > 0 && (
            <div className=card !p-0 overflow-hidden>
              <div className=bg-gray-50 border-b px-5 py-3 flex justify-between items-center>
                <h3 className=font-bold text-gray-800>Kho: {selectedBank?.subject_name} ({bankQuestions.length} cau)</h3>
                <button onClick={() => setShowBankQuestions(false)} className=text-gray-400 hover:text-gray-600><X className=h-4 w-4 /></button>
              </div>
              <div className=max-h-96 overflow-y-auto divide-y>
                {bankQuestions.map((q, i) => (
                  <div key={q.id} className=p-4 flex gap-3 hover:bg-gray-50>
                    <span className=text-xs font-bold text-gray-400 mt-1>{i+1}</span>
                    <div className=flex-1 min-w-0>
                      <p className=text-sm text-gray-800 line-clamp-2>{q.content}</p>
                      <span className=text-xs text-gray-400>{q.question_type}</span>
                    </div>
                    <button onClick={() => handleDeleteBankQuestion(selectedBankId, q.id)} className=text-red-400 hover:text-red-600 flex-shrink-0><Trash2 className=h-4 w-4 /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generatedQuestions.length > 0 ? (
            <div className=space-y-4>
              <div className=card bg-primary-50 border-primary-200>
                <div className=flex flex-col sm:flex-row sm:items-center justify-between gap-3>
                  <h3 className=font-bold text-gray-800>De thi: {generatedQuestions.length} cau hoi</h3>
                  <div className=flex gap-2 flex-wrap>
                    <button onClick={() => { setSaveBankSubjectId(selectedBank?.subject_id || ''); setShowSaveToBankModal(true) }} className=btn btn-secondary text-sm flex items-center gap-1><Database className=h-3 w-3 />Nhap vao kho</button>
                    <button onClick={() => setShowAssignModal(true)} className=btn btn-primary text-sm flex items-center gap-1><Send className=h-3 w-3 />Giao bai</button>
                  </div>
                </div>
              </div>

              {generatedQuestions.map((q, idx) => (
                <div key={idx} className=card border-gray-200>
                  <div className=flex items-start justify-between mb-3>
                    <div className=flex items-center gap-2>
                      <span className=bg-primary-100 text-primary-700 px-2.5 py-1 rounded-md text-sm font-bold>{idx+1}</span>
                      <span className={	ext-xs px-2 py-0.5 rounded font-medium }>{q.question_type==='multiple_choice'?'Trac nghiem':q.question_type==='true_false_multi'?'Dung/Sai':'Tra loi ngan'}</span>
                    </div>
                    <div className=flex gap-1>
                      <button onClick={() => handleAIEdit(idx)} disabled={editingAI && editingIdx===idx} className=text-amber-600 hover:text-amber-800 p-1 title=Chinh sua bang AI><Wand2 className=h-4 w-4 /></button>
                      <button onClick={() => handleRemoveQuestion(idx)} className=text-red-400 hover:text-red-600 p-1><Trash2 className=h-4 w-4 /></button>
                    </div>
                  </div>
                  <p className=text-gray-800 font-medium mb-3>{q.content}</p>
                  {q.answers && q.answers.length > 0 && (
                    <div className=space-y-1.5>
                      {q.answers.map((a: any, ai: number) => (
                        <div key={ai} className={lex items-center gap-2 text-sm p-2 rounded-lg }>
                          <span className=font-bold text-xs w-5>{String.fromCharCode(65+ai)}.</span>
                          <span>{a.content}</span>
                          {a.is_correct && <span className=text-green-600 text-xs ml-auto>Dung</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.question_type === 'short_answer' && q.correct_answer && (
                    <p className=text-sm text-green-700 bg-green-50 p-2 rounded-lg mt-2>Dap an: {q.correct_answer}</p>
                  )}

                  {/* AI Edit Preview */}
                  {editingIdx === idx && (editingAI || aiPreview) && (
                    <div className=mt-4 border-t pt-4>
                      {editingAI ? (
                        <div className=flex items-center gap-2 text-amber-600><Loader2 className=h-4 w-4 animate-spin /><span className=text-sm>AI dang tao cau hoi moi...</span></div>
                      ) : aiPreview && (
                        <div className=space-y-3>
                          <h4 className=font-bold text-amber-800 text-sm flex items-center gap-1><Wand2 className=h-4 w-4 />Cau hoi moi (AI tao):</h4>
                          <div className=bg-amber-50 border border-amber-200 rounded-xl p-4>
                            <p className=text-gray-800 font-medium mb-2>{aiPreview.content}</p>
                            {aiPreview.answers && aiPreview.answers.map((a: any, ai: number) => (
                              <div key={ai} className={	ext-sm p-1.5 }>
                                {String.fromCharCode(65+ai)}. {a.content} {a.is_correct && '(Dung)'}
                              </div>
                            ))}
                            {aiPreview.correct_answer && <p className=text-sm text-green-700 mt-1>Dap an: {aiPreview.correct_answer}</p>}
                          </div>
                          <div className=flex gap-2>
                            <button onClick={handleApplyAIEdit} className=btn btn-primary text-sm>Ap dung</button>
                            <button onClick={() => { setEditingIdx(null); setAiPreview(null) }} className=btn btn-secondary text-sm>Giu nguyen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className=card min-h-[400px] flex flex-col items-center justify-center text-center>
              <div className=bg-gray-50 h-20 w-20 rounded-full flex items-center justify-center mb-4><Sparkles className=h-8 w-8 text-gray-300 /></div>
              <h3 className=text-lg font-bold text-gray-800 mb-2>Chua co de thi nao</h3>
              <p className=text-gray-500 text-sm max-w-md>Chon ngan hang cau hoi, cau hinh so luong cau hoi va bam Tao de ngau nhien de bat dau.</p>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className=fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4>
          <div className=bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6>
            <h3 className=font-bold text-lg mb-3>Chia se ngan hang</h3>
            <p className=text-sm text-gray-600 mb-3>Gui ma nay cho giao vien khac:</p>
            <div className=bg-gray-100 p-3 rounded-lg font-mono text-sm break-all mb-4>{shareCode}</div>
            <div className=flex gap-2>
              <button onClick={() => { navigator.clipboard.writeText(shareCode); toast.success('Da copy') }} className=btn btn-primary flex-1>Copy</button>
              <button onClick={() => setShowShareModal(false)} className=btn btn-secondary flex-1>Dong</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className=fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4>
          <div className=bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6>
            <h3 className=font-bold text-lg mb-3>Nhan ngan hang</h3>
            <input value={importCode} onChange={e => setImportCode(e.target.value)} className=input mb-4 placeholder=Nhap ma chia se... />
            <div className=flex gap-2>
              <button onClick={handleImport} disabled={importing || !importCode.trim()} className=btn btn-primary flex-1>{importing ? 'Dang nhap...' : 'Nhan kho'}</button>
              <button onClick={() => setShowImportModal(false)} className=btn btn-secondary flex-1>Huy</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className=fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4>
          <div className=bg-white rounded-2xl shadow-2xl max-w-md w-full p-6>
            <h3 className=font-bold text-lg mb-4>Giao bai cho hoc sinh</h3>
            <div className=space-y-3>
              <div><label className=block text-sm font-medium text-gray-700 mb-1>Chon lop</label>
                <select value={assignClassId} onChange={e => setAssignClassId(e.target.value)} className=input>
                  <option value=>Khong giao cho lop (chi tao de)</option>
 {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 </select>
 </div>
 <div><label className=block text-sm font-medium text-gray-700 mb-1>Bat dau</label><input type=datetime-local value={assignStart} onChange={e => setAssignStart(e.target.value)} className=input /></div>
 <div><label className=block text-sm font-medium text-gray-700 mb-1>Ket thuc</label><input type=datetime-local value={assignEnd} onChange={e => setAssignEnd(e.target.value)} className=input /></div>
 </div>
 <div className=flex gap-2 mt-5>
 <button onClick={handleAssign} disabled={assigning} className=btn btn-primary flex-1>{assigning ? 'Dang xu ly...' : 'Xac nhan'}</button>
 <button onClick={() => setShowAssignModal(false)} className=btn btn-secondary flex-1>Huy</button>
 </div>
 </div>
 </div>
 )}

 {/* Save to Bank Modal */}
 {showSaveToBankModal && (
 <div className=fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4>
 <div className=bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6>
 <h3 className=font-bold text-lg mb-3>Nhap cau hoi vao kho</h3>
 <select value={saveBankSubjectId} onChange={e => setSaveBankSubjectId(e.target.value)} className=input mb-4>
 <option value=>Chon mon</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className=flex gap-2>
              <button onClick={handleSaveToBank} disabled={savingToBank || !saveBankSubjectId} className=btn btn-primary flex-1>{savingToBank ? 'Dang luu...' : Luu  cau}</button>
              <button onClick={() => setShowSaveToBankModal(false)} className=btn btn-secondary flex-1>Huy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
