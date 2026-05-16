// ============================================================
// question-bank.ts — Ngân hàng câu hỏi cho giáo viên
// ============================================================
// Firebase collections:
//   - question_banks: { owner_id, subject_id, subject_name, question_count, created_at, updated_at }
//   - bank_questions:  { bank_id, content, question_type, answers[], correct_answer, difficulty, points, created_at }
//   - bank_shares:     { bank_id, owner_id, share_code, created_at }
// ============================================================

import { db } from '../firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'

// ============================================================
// INTERFACES
// ============================================================

export interface QuestionBank {
  id: string
  owner_id: string
  subject_id: string
  subject_name: string
  question_count: number
  created_at: any
  updated_at: any
}

export interface BankQuestion {
  id: string
  bank_id: string
  content: string
  question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
  answers?: Array<{ content: string; is_correct: boolean }>
  correct_answer?: string
  difficulty: 'easy' | 'medium' | 'hard'
  points: number
  image_url?: string
  created_at: any
}

export interface BankQuestionInput {
  content: string
  question_type: 'multiple_choice' | 'true_false_multi' | 'short_answer'
  answers?: Array<{ content: string; is_correct: boolean }>
  correct_answer?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  points?: number
  image_url?: string
}

export interface BankShare {
  id: string
  bank_id: string
  owner_id: string
  share_code: string
  subject_name: string
  created_at: any
}

// ============================================================
// NGÂN HÀNG - CRUD
// ============================================================

/** Lấy tất cả ngân hàng của user */
export async function getMyBanks(userId: string): Promise<QuestionBank[]> {
  const snap = await getDocs(
    query(collection(db, 'question_banks'), where('owner_id', '==', userId))
  )
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as QuestionBank))
    .sort((a, b) => {
      const tA = a.updated_at?.toDate?.() || new Date(a.updated_at)
      const tB = b.updated_at?.toDate?.() || new Date(b.updated_at)
      return tB.getTime() - tA.getTime()
    })
}

/** Lấy ngân hàng theo ID */
export async function getBankById(bankId: string): Promise<QuestionBank> {
  const snap = await getDoc(doc(db, 'question_banks', bankId))
  if (!snap.exists()) throw new Error('Ngân hàng không tồn tại')
  return { id: snap.id, ...snap.data() } as QuestionBank
}

/** Tạo ngân hàng mới (hoặc lấy existing nếu đã có cho môn đó) */
export async function getOrCreateBank(
  userId: string,
  subjectId: string,
  subjectName: string
): Promise<QuestionBank> {
  // Kiểm tra đã có bank cho môn này chưa
  const existing = await getDocs(
    query(
      collection(db, 'question_banks'),
      where('owner_id', '==', userId),
      where('subject_id', '==', subjectId)
    )
  )

  if (!existing.empty) {
    const d = existing.docs[0]
    return { id: d.id, ...d.data() } as QuestionBank
  }

  // Tạo mới
  const now = Timestamp.fromDate(new Date())
  const ref = await addDoc(collection(db, 'question_banks'), {
    owner_id: userId,
    subject_id: subjectId,
    subject_name: subjectName,
    question_count: 0,
    created_at: now,
    updated_at: now,
  })

  return {
    id: ref.id,
    owner_id: userId,
    subject_id: subjectId,
    subject_name: subjectName,
    question_count: 0,
    created_at: now,
    updated_at: now,
  }
}

/** Xóa ngân hàng + toàn bộ câu hỏi bên trong */
export async function deleteBank(bankId: string): Promise<void> {
  // Xóa tất cả câu hỏi
  const questionsSnap = await getDocs(
    query(collection(db, 'bank_questions'), where('bank_id', '==', bankId))
  )
  const batch = writeBatch(db)
  questionsSnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'question_banks', bankId))
  await batch.commit()
}

// ============================================================
// CÂU HỎI TRONG NGÂN HÀNG
// ============================================================

/** Lấy tất cả câu hỏi của ngân hàng */
export async function getBankQuestions(bankId: string): Promise<BankQuestion[]> {
  const snap = await getDocs(
    query(collection(db, 'bank_questions'), where('bank_id', '==', bankId))
  )
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as BankQuestion))
    .sort((a, b) => {
      const tA = a.created_at?.toDate?.() || new Date(a.created_at)
      const tB = b.created_at?.toDate?.() || new Date(b.created_at)
      return tA.getTime() - tB.getTime()
    })
}

/** Thêm nhiều câu hỏi vào ngân hàng (batch) */
export async function addQuestionsToBank(
  bankId: string,
  questions: BankQuestionInput[]
): Promise<void> {
  const now = Timestamp.fromDate(new Date())

  for (const q of questions) {
    await addDoc(collection(db, 'bank_questions'), {
      bank_id: bankId,
      content: q.content,
      question_type: q.question_type || 'multiple_choice',
      answers: q.answers || [],
      correct_answer: q.correct_answer || null,
      difficulty: q.difficulty || 'medium',
      points: q.points || 1,
      image_url: q.image_url || null,
      created_at: now,
    })
  }

  // Cập nhật question_count
  const countSnap = await getDocs(
    query(collection(db, 'bank_questions'), where('bank_id', '==', bankId))
  )
  await updateDoc(doc(db, 'question_banks', bankId), {
    question_count: countSnap.size,
    updated_at: now,
  })
}

/** Xóa 1 câu hỏi khỏi ngân hàng */
export async function removeQuestionFromBank(
  bankId: string,
  questionId: string
): Promise<void> {
  await deleteDoc(doc(db, 'bank_questions', questionId))

  // Cập nhật question_count
  const countSnap = await getDocs(
    query(collection(db, 'bank_questions'), where('bank_id', '==', bankId))
  )
  await updateDoc(doc(db, 'question_banks', bankId), {
    question_count: countSnap.size,
    updated_at: Timestamp.fromDate(new Date()),
  })
}

// ============================================================
// RANDOM SELECT CHO TẠO ĐỀ
// ============================================================

/** Lấy ngẫu nhiên N câu hỏi theo loại từ ngân hàng */
export async function getRandomQuestions(
  bankId: string,
  questionType: string,
  count: number
): Promise<BankQuestion[]> {
  const all = await getBankQuestions(bankId)
  const filtered = all.filter(q => q.question_type === questionType)

  // Shuffle (Fisher-Yates)
  const shuffled = [...filtered]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, count)
}

// ============================================================
// CHIA SẺ NGÂN HÀNG
// ============================================================

/** Tạo share code cho ngân hàng */
export async function generateShareCode(bankId: string, ownerId: string): Promise<string> {
  // Kiểm tra đã có share code chưa
  const existing = await getDocs(
    query(collection(db, 'bank_shares'), where('bank_id', '==', bankId))
  )

  if (!existing.empty) {
    return existing.docs[0].data().share_code
  }

  const bank = await getBankById(bankId)

  // Tạo share code unique
  const shareCode = `BANK_${bankId.substring(0, 8).toUpperCase()}_${Date.now().toString(36).toUpperCase()}`

  await addDoc(collection(db, 'bank_shares'), {
    bank_id: bankId,
    owner_id: ownerId,
    share_code: shareCode,
    subject_name: bank.subject_name,
    created_at: Timestamp.fromDate(new Date()),
  })

  return shareCode
}

/** Nhận ngân hàng bằng share code (clone toàn bộ câu hỏi vào tài khoản mới) */
export async function importBankByShareCode(
  userId: string,
  shareCode: string
): Promise<QuestionBank> {
  // Tìm share record
  const shareSnap = await getDocs(
    query(collection(db, 'bank_shares'), where('share_code', '==', shareCode.trim()))
  )

  if (shareSnap.empty) {
    throw new Error('Mã chia sẻ không hợp lệ hoặc đã hết hạn')
  }

  const shareData = shareSnap.docs[0].data() as BankShare

  if (shareData.owner_id === userId) {
    throw new Error('Bạn không thể nhập ngân hàng của chính mình')
  }

  // Lấy thông tin bank gốc
  const originalBank = await getBankById(shareData.bank_id)

  // Tạo bank clone mới cho user
  const now = Timestamp.fromDate(new Date())
  const newBankRef = await addDoc(collection(db, 'question_banks'), {
    owner_id: userId,
    subject_id: originalBank.subject_id,
    subject_name: originalBank.subject_name,
    question_count: 0,
    created_at: now,
    updated_at: now,
  })

  // Clone toàn bộ câu hỏi
  const questions = await getBankQuestions(shareData.bank_id)
  for (const q of questions) {
    await addDoc(collection(db, 'bank_questions'), {
      bank_id: newBankRef.id,
      content: q.content,
      question_type: q.question_type,
      answers: q.answers || [],
      correct_answer: q.correct_answer || null,
      difficulty: q.difficulty || 'medium',
      points: q.points || 1,
      image_url: q.image_url || null,
      created_at: now,
    })
  }

  // Cập nhật question_count
  await updateDoc(newBankRef, {
    question_count: questions.length,
    updated_at: now,
  })

  return {
    id: newBankRef.id,
    owner_id: userId,
    subject_id: originalBank.subject_id,
    subject_name: originalBank.subject_name,
    question_count: questions.length,
    created_at: now,
    updated_at: now,
  }
}
