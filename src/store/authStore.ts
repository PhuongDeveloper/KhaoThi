import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type UserCredential,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { auth, googleProvider, db } from '@/lib/firebase'

interface Profile {
  id: string
  email: string | null
  full_name: string
  role: 'admin' | 'teacher' | 'student'
  student_code: string | null
  teacher_code: string | null
  class_id: string | null
}

interface AuthState {
  user: FirebaseUser | null
  // Firebase không có Session như Supabase, giữ kiểu cho tương thích nhưng không dùng
  session: any | null
  profile: Profile | null
  loading: boolean
  initialized: boolean
  signIn: (email: string, password: string) => Promise<{ profile: Profile | null } | void>
  signInWithGoogle: () => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<Profile | null>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      loading: false,
      initialized: false,

      initialize: async () => {
        set({ loading: true })
        try {
          // Firebase giữ session trong client, chỉ cần đọc currentUser
          const user = auth.currentUser
          set({ user, session: null })

          if (user) {
            try {
              const profilePromise = get().fetchProfile()
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
              )
              await Promise.race([profilePromise, timeoutPromise])
            } catch {
              // Ignore profile fetch errors during init
            }
          } else {
            set({ profile: null })
          }
        } catch {
          // Ignore initialization errors
        } finally {
          set({ loading: false, initialized: true })
        }
      },

      signIn: async (email: string, password: string) => {
        set({ loading: true })
        try {
          const cred: UserCredential = await signInWithEmailAndPassword(auth, email, password)
          const user = cred.user

          set({ session: null, user })

          // Fetch profile ngay lập tức và lấy kết quả trực tiếp
          let profileData: Profile | null = null
          if (user) {
            profileData = await get().fetchProfile()
          }

          return { profile: profileData }
        } catch (error: any) {
          throw new Error(error.message || 'Đăng nhập thất bại')
        } finally {
          set({ loading: false })
        }
      },

      signInWithGoogle: async () => {
        try {
          const cred = await signInWithPopup(auth, googleProvider)
          const user = cred.user
          set({ user, session: null })
          if (user) {
            await get().fetchProfile()
          }
        } catch (error: any) {
          throw new Error(error.message || 'Đăng nhập với Google thất bại')
        }
      },

      signUp: async (email: string, password: string, fullName: string) => {
        set({ loading: true })
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password)
          const user = cred.user

          // Cập nhật displayName
          await updateProfile(user, { displayName: fullName })

          set({ session: null, user })
          if (user) {
            await get().fetchProfile()
          }
        } catch (error: any) {
          throw new Error(error.message || 'Đăng ký thất bại')
        } finally {
          set({ loading: false })
        }
      },

      signOut: async () => {
        set({ loading: true })
        try {
          await firebaseSignOut(auth)

          // Clear tất cả state
          set({ user: null, session: null, profile: null, initialized: false })

          // Clear cache
          if (typeof window !== 'undefined') {
            const { cache } = await import('../lib/cache')
            cache.clear()
          }
        } catch (error: any) {
          throw new Error(error.message || 'Đăng xuất thất bại')
        } finally {
          set({ loading: false })
        }
      },

      fetchProfile: async (): Promise<Profile | null> => {
        const { user } = get()

        if (!user) {
          set({ profile: null })
          return null
        }

        const currentProfile = get().profile

        try {
          const profilesCol = collection(db, 'profiles')
          const profileRef = doc(profilesCol, user.uid)
          const snapshot = await getDoc(profileRef)

          if (!snapshot.exists()) {
            // Kiểm tra xem đã có admin nào trong hệ thống chưa
            const adminsSnap = await getDocs(
              query(profilesCol, where('role', '==', 'admin'))
            )
            const isFirstAdmin = adminsSnap.empty

            const newProfile: Profile = {
              id: user.uid,
              email: user.email,
              full_name:
                user.displayName ||
                user.email?.split('@')[0] ||
                'User',
              // Nếu chưa có admin nào, user đầu tiên sẽ là admin
              role: isFirstAdmin ? 'admin' : 'student',
              student_code: null,
              teacher_code: null,
              class_id: null,
            }

            await setDoc(profileRef, newProfile)
            set({ profile: newProfile })
            return newProfile
          } else {
            const data = snapshot.data() as Profile
            set({ profile: data })
            return data
          }
        } catch {
          if (currentProfile) return currentProfile
          return null
        }
      },
    }),
    {
      name: 'auth-storage', // Tên key trong localStorage
      partialize: (state) => ({
        // Chỉ lưu những thông tin cần thiết, không lưu loading và initialized
        user: state.user,
        session: state.session,
        profile: state.profile,
      }),
    }
  )
)

// Lắng nghe thay đổi auth state từ Firebase
onAuthStateChanged(auth, async (user) => {
  useAuthStore.setState({ session: null, user: user ?? null })
  if (user) {
    await useAuthStore.getState().fetchProfile()
  } else {
    useAuthStore.setState({ profile: null })
  }
})

