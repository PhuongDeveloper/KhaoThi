import { db } from '../firebase'
import type { Database } from '../supabase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'

type Subject = Database['public']['Tables']['subjects']['Row']

export const subjectApi = {
  async getAll() {
    const subjectsCol = collection(db, 'subjects')
    const q = query(subjectsCol, orderBy('name', 'asc'))
    const snapshot = await getDocs(q)

    if (snapshot.empty) return []

    const subjects: Subject[] = []
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      subjects.push({
        id: docSnap.id,
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
      } as Subject)
    })

    return subjects
  },

  async getById(id: string) {
    const subjectDoc = await getDoc(doc(db, 'subjects', id))
    if (!subjectDoc.exists()) {
      throw new Error('Subject not found')
    }

    const data = subjectDoc.data()
    return {
      id: subjectDoc.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
      updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
    } as Subject
  },

  async create(subject: Database['public']['Tables']['subjects']['Insert']) {
    const now = new Date().toISOString()
    const newSubject = {
      ...subject,
      created_at: Timestamp.fromDate(new Date(now)),
      updated_at: Timestamp.fromDate(new Date(now)),
    }

    const docRef = await addDoc(collection(db, 'subjects'), newSubject)
    return this.getById(docRef.id)
  },

  async update(id: string, subject: Database['public']['Tables']['subjects']['Update']) {
    const subjectRef = doc(db, 'subjects', id)
    await updateDoc(subjectRef, {
      ...subject,
      updated_at: Timestamp.fromDate(new Date()),
    } as any)
    return this.getById(id)
  },

  async delete(id: string) {
    await deleteDoc(doc(db, 'subjects', id))
  },
}

