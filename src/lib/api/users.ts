import { db, firebaseConfig } from '../firebase'
import type { Database } from '../supabase'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore'

// Hàm sleep để tránh QUIC Protocol Error do spam requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Profile = Database['public']['Tables']['profiles']['Row']

export const userApi = {
  async getAll(filters?: { role?: string }) {
    const profilesCol = collection(db, 'profiles')

    // Nếu lọc theo role, chỉ dùng where để tránh cần composite index,
    // sau đó sort theo created_at trên client
    let snapshot
    if (filters?.role) {
      const q = query(profilesCol, where('role', '==', filters.role))
      snapshot = await getDocs(q)
    } else {
      const q = query(profilesCol, orderBy('created_at', 'desc'))
      snapshot = await getDocs(q)
    }

    if (snapshot.empty) return []

    const profiles: Profile[] = []
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as any
      profiles.push({
        id: docSnap.id,
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
      } as Profile)
    })

    // Nếu có filter role, sort theo created_at trên client (mới nhất trước)
    if (filters?.role) {
      profiles.sort((a, b) => {
        const at = new Date(a.created_at).getTime()
        const bt = new Date(b.created_at).getTime()
        return bt - at
      })
    }

    return profiles
  },

  async getById(id: string) {
    const profileDoc = await getDoc(doc(db, 'profiles', id))
    if (!profileDoc.exists()) {
      throw new Error('Profile not found')
    }

    const data = profileDoc.data()
    return {
      id: profileDoc.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
      updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
    } as Profile
  },

  async update(id: string, profile: Database['public']['Tables']['profiles']['Update']) {
    const profileRef = doc(db, 'profiles', id)
    await updateDoc(profileRef, profile as any)
    return this.getById(id)
  },

  async bulkCreateStudents(students: { full_name: string, base_email: string }[], commonPassword: string) {
    const results: any[] = []

    // Tạo Secondary App để không làm logout admin hiện tại
    const secondaryAppName = `SecondaryApp_${Date.now()}`
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      for (const student of students) {
        let currentEmail = student.base_email
        let counter = 1
        let userCredential = null

        while (!userCredential) {
          try {
            userCredential = await createUserWithEmailAndPassword(secondaryAuth, currentEmail, commonPassword)
          } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') {
              // Tìm email mới bằng cách thêm số vào sau tên
              const emailParts = student.base_email.split('@')
              currentEmail = `${emailParts[0]}${counter}@${emailParts[1]}`
              counter++
            } else {
              throw error // Lỗi khác thì ném ra
            }
          }
        }

        const user = userCredential.user
        const now = Timestamp.fromDate(new Date())

        const profileData = {
          id: user.uid,
          email: currentEmail,
          full_name: student.full_name,
          role: 'student',
          student_code: null,
          teacher_code: null,
          class_id: null,
          created_at: now,
          updated_at: now,
        }

        await setDoc(doc(db, 'profiles', user.uid), profileData)

        results.push({
          id: user.uid,
          full_name: student.full_name,
          email: currentEmail,
          password: commonPassword
        })

        // NGHỈ 600ms ĐỂ TRÁNH LỖI MẠNG (QUIC_PROTOCOL_ERROR / Spamming)
        await delay(600)
      }
    } finally {
      // Xóa app sau khi hoàn thành
      await deleteApp(secondaryApp)
    }

    return results
  },

  async createUser(data: {
    full_name: string
    email: string
    password: string
    role: 'admin' | 'teacher' | 'student'
    student_code?: string
    teacher_code?: string
    class_id?: string | null
  }) {
    // Dùng Secondary App để không logout admin hiện tại
    const secondaryAppName = `SecondaryApp_${Date.now()}`
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password)
      const user = userCredential.user
      const now = Timestamp.fromDate(new Date())

      const profileData: any = {
        id: user.uid,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        student_code: data.student_code || null,
        teacher_code: data.teacher_code || null,
        class_id: data.class_id || null,
        created_at: now,
        updated_at: now,
      }

      await setDoc(doc(db, 'profiles', user.uid), profileData)

      // Nếu có class_id và là student, thêm vào class_students
      if (data.role === 'student' && data.class_id) {
        const { addStudentToClass } = await import('./classes')
        await addStudentToClass(data.class_id, user.uid)
      }

      return {
        id: user.uid,
        ...profileData,
        created_at: now.toDate().toISOString(),
        updated_at: now.toDate().toISOString(),
      }
    } finally {
      await deleteApp(secondaryApp)
    }
  },
}

