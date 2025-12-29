import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
  user: User | null
  session: Session | null
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
    console.log('[AuthStore] initialize() called')
    const startTime = Date.now()
    set({ loading: true })
    try {
      console.log('[AuthStore] Getting session...')
      const sessionStartTime = Date.now()
      
      // Thêm timeout cho getSession
      const sessionPromise = supabase.auth.getSession()
      const sessionTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session fetch timeout')), 2000)
      )
      
      const { data: { session }, error } = await Promise.race([
        sessionPromise,
        sessionTimeoutPromise
      ]) as { data: { session: any }, error: any }
      
      const sessionDuration = Date.now() - sessionStartTime
      console.log(`[AuthStore] Session retrieved in ${sessionDuration}ms, has session:`, !!session)
      
      if (error) {
        console.error('[AuthStore] Error getting session:', error)
        // Vẫn set initialized để không block app
        set({ session: null, user: null, profile: null, loading: false, initialized: true })
        return
      }
      
      set({ session, user: session?.user ?? null })
      console.log('[AuthStore] Session set, user:', session?.user?.id)

      if (session?.user) {
        try {
          console.log('[AuthStore] Fetching profile...')
          const profileStartTime = Date.now()
          // Fetch profile với timeout ngắn hơn (3s thay vì 5s)
          const profilePromise = get().fetchProfile()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
          )
          
          await Promise.race([profilePromise, timeoutPromise])
          const profileDuration = Date.now() - profileStartTime
          console.log(`[AuthStore] Profile fetched in ${profileDuration}ms`)
        } catch (profileError) {
          console.error('[AuthStore] Error fetching profile during init:', profileError)
          // Nếu có profile từ localStorage, giữ lại
          const cachedProfile = get().profile
          if (cachedProfile) {
            console.log('[AuthStore] Using cached profile due to fetch error')
          }
          // Nếu không, để null và ProtectedRoute sẽ xử lý
        }
      } else {
        console.log('[AuthStore] No session, clearing profile')
        // Không có session, clear profile
        set({ profile: null })
      }
    } catch (error) {
      console.error('[AuthStore] Error initializing auth:', error)
      // Vẫn set initialized để không block app
    } finally {
      const totalDuration = Date.now() - startTime
      console.log(`[AuthStore] Initialization completed in ${totalDuration}ms`)
      // Luôn set initialized = true để app không bị stuck
      set({ loading: false, initialized: true })
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      set({ session: data.session, user: data.user })
      
      // Fetch profile ngay lập tức và lấy kết quả trực tiếp
      let profileData: Profile | null = null
      if (data.user) {
        profileData = await get().fetchProfile()
      }
      
      // Trả về profile để redirect ngay, không lag
      return { profile: profileData }
    } catch (error: any) {
      throw new Error(error.message || 'Đăng nhập thất bại')
    } finally {
      set({ loading: false })
    }
  },

  signInWithGoogle: async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (error: any) {
      throw new Error(error.message || 'Đăng nhập với Google thất bại')
    }
  },

  signUp: async (email: string, password: string, fullName: string) => {
    set({ loading: true })
    try {
      // Mặc định role là student khi đăng ký
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'student', // Luôn là student
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) throw error

      set({ session: data.session, user: data.user })
      if (data.user) {
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
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
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
    console.log('[AuthStore] fetchProfile() called, user:', user?.id)
    
    if (!user) {
      console.log('[AuthStore] No user, returning null')
      set({ profile: null })
      return null
    }

    // Lấy profile hiện tại từ state (có thể từ localStorage)
    const currentProfile = get().profile
    console.log('[AuthStore] Current profile from state:', currentProfile?.id)

    try {
      console.log('[AuthStore] Querying profiles table...')
      const queryStartTime = Date.now()
      
      // Thêm timeout cho profile query để tránh hang
      const queryPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile query timeout after 3s')), 3000)
      )
      
      const { data, error } = await Promise.race([
        queryPromise,
        timeoutPromise
      ]) as { data: any, error: any }
      
      const queryDuration = Date.now() - queryStartTime
      console.log(`[AuthStore] Profile query completed in ${queryDuration}ms, has data:`, !!data, 'error:', error?.message)

      if (error) {
        console.error('[AuthStore] Profile query error:', error.code, error.message)
        // Nếu timeout, dùng cached profile
        if (error.message?.includes('timeout')) {
          console.warn('[AuthStore] Profile query timeout, using cached profile if available')
          if (currentProfile) {
            console.log('[AuthStore] Returning cached profile due to timeout')
            return currentProfile
          }
          console.log('[AuthStore] No cached profile, returning null')
          return null
        }
        // Nếu lỗi RLS hoặc không tìm thấy, thử tạo mới
        if (error.code === 'PGRST116' || error.message?.includes('permission')) {
          console.warn('[AuthStore] Profile not found or permission denied, attempting to create...')
          try {
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                role: user.user_metadata?.role || 'student',
              })
              .select()
              .single()

            if (createError) {
              console.error('Error creating profile:', createError)
              // Giữ profile cũ từ localStorage nếu có
              if (currentProfile) {
                console.warn('Using cached profile due to create error')
                return currentProfile
              }
              return null
            }

            set({ profile: newProfile })
            return newProfile
          } catch (createErr) {
            console.error('Error in profile creation:', createErr)
            // Giữ profile cũ từ localStorage nếu có
            if (currentProfile) {
              console.warn('Using cached profile due to creation error')
              return currentProfile
            }
            return null
          }
        } else {
          throw error
        }
      }

      // Nếu không có profile, tạo mới
      if (!data) {
        try {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email: user.email,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              role: user.user_metadata?.role || 'student',
            })
            .select()
            .single()

          if (createError) {
            console.error('Error creating profile:', createError)
            // Giữ profile cũ từ localStorage nếu có
            if (currentProfile) {
              console.warn('Using cached profile due to create error')
              return currentProfile
            }
            return null
          }

          set({ profile: newProfile })
          return newProfile
        } catch (createErr) {
          console.error('Error in profile creation:', createErr)
          // Giữ profile cũ từ localStorage nếu có
          if (currentProfile) {
            console.warn('Using cached profile due to creation error')
            return currentProfile
          }
          return null
        }
      } else {
        // Có data, update profile
        set({ profile: data })
        return data
      }
    } catch (error) {
      console.error('[AuthStore] Error fetching profile:', error)
      // Giữ profile cũ từ localStorage nếu có để không bị redirect về login
      if (currentProfile) {
        console.warn('[AuthStore] Using cached profile due to fetch error')
        return currentProfile
      }
      console.log('[AuthStore] No cached profile, returning null')
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

// Lắng nghe thay đổi auth state
supabase.auth.onAuthStateChange(async (_event, session) => {
  useAuthStore.setState({ session, user: session?.user ?? null })
  if (session?.user) {
    // Đợi fetchProfile hoàn thành để đảm bảo profile được set
    await useAuthStore.getState().fetchProfile()
  } else {
    useAuthStore.setState({ profile: null })
  }
})

