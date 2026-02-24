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
  Timestamp,
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
            try {
              profileData = await get().fetchProfile()
              if (!profileData) {
                console.warn('[AuthStore] fetchProfile trả về null sau khi đăng nhập')
              }
            } catch (profileError: any) {
              console.error('[AuthStore] Lỗi khi fetch profile sau đăng nhập:', profileError)
              throw new Error(`Đăng nhập thành công nhưng không thể tải profile: ${profileError.message}`)
            }
          }

          return { profile: profileData }
        } catch (error: any) {
          console.error('[AuthStore] Lỗi đăng nhập:', error)
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
            try {
              await get().fetchProfile()
            } catch (profileError: any) {
              console.error('[AuthStore] Lỗi khi fetch profile sau Google login:', profileError)
              throw new Error(`Đăng nhập Google thành công nhưng không thể tải profile: ${profileError.message}`)
            }
          }
        } catch (error: any) {
          console.error('[AuthStore] Lỗi đăng nhập Google:', error)
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
            try {
              await get().fetchProfile()
            } catch (profileError: any) {
              console.error('[AuthStore] Lỗi khi fetch profile sau đăng ký:', profileError)
              throw new Error(`Đăng ký thành công nhưng không thể tải profile: ${profileError.message}`)
            }
          }
        } catch (error: any) {
          console.error('[AuthStore] Lỗi đăng ký:', error)
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
            console.log('[AuthStore] Profile không tồn tại, đang tạo mới...')
            
            // Kiểm tra xem đã có admin nào trong hệ thống chưa
            let isFirstAdmin = true
            try {
              const adminsSnap = await getDocs(
                query(profilesCol, where('role', '==', 'admin'))
              )
              isFirstAdmin = adminsSnap.empty
              console.log('[AuthStore] Đã có admin:', !isFirstAdmin)
            } catch (adminCheckError) {
              console.error('[AuthStore] Lỗi khi kiểm tra admin:', adminCheckError)
              // Nếu lỗi khi check admin, mặc định là admin (an toàn hơn)
              isFirstAdmin = true
            }

            const now = Timestamp.fromDate(new Date())
            const newProfileData = {
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
              created_at: now,
              updated_at: now,
            }

            console.log('[AuthStore] Đang tạo profile với role:', newProfileData.role)
            
            // Tạo profile trong Firestore
            await setDoc(profileRef, newProfileData)
            
            console.log('[AuthStore] Đã tạo profile thành công trong Firestore')

            const newProfile: Profile = {
              id: newProfileData.id,
              email: newProfileData.email,
              full_name: newProfileData.full_name,
              role: newProfileData.role as 'admin' | 'teacher' | 'student',
              student_code: newProfileData.student_code,
              teacher_code: newProfileData.teacher_code,
              class_id: newProfileData.class_id,
            }

            set({ profile: newProfile })
            return newProfile
          } else {
            const data = snapshot.data()
            const profile: Profile = {
              id: data.id || user.uid,
              email: data.email || user.email,
              full_name: data.full_name || user.displayName || 'User',
              role: (data.role as 'admin' | 'teacher' | 'student') || 'student',
              student_code: data.student_code || null,
              teacher_code: data.teacher_code || null,
              class_id: data.class_id || null,
            }
            set({ profile })
            return profile
          }
        } catch (error: any) {
          console.error('[AuthStore] Lỗi khi fetch/create profile:', error)
          // Nếu có lỗi nhưng đã có profile trong state, trả về profile đó
          if (currentProfile) {
            console.log('[AuthStore] Sử dụng profile từ cache')
            return currentProfile
          }
          // Nếu không có profile và có lỗi, throw error để UI biết
          throw new Error(`Không thể tạo/tải profile: ${error.message || 'Unknown error'}`)
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

