import { db } from '../firebase'
import type { Database } from '../supabase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore'

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
}

