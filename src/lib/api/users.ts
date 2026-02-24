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
    let q = query(profilesCol, orderBy('created_at', 'desc'))

    if (filters?.role) {
      q = query(profilesCol, where('role', '==', filters.role), orderBy('created_at', 'desc'))
    }

    const snapshot = await getDocs(q)
    if (snapshot.empty) return []

    const profiles: Profile[] = []
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      profiles.push({
        id: docSnap.id,
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
      } as Profile)
    })

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

