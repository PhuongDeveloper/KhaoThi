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
    set({ loading: true })
    try {
      const sessionPromise = supabase.auth.getSession()
      const sessionTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session fetch timeout')), 2000)
      )
      
      const { data: { session }, error } = await Promise.race([
        sessionPromise,
        sessionTimeoutPromise
      ]) as { data: { session: any }, error: any }
      
      if (error) {
        set({ session: null, user: null, profile: null, loading: false, initialized: true })
        return
      }
      
      set({ session, user: session?.user ?? null })

      if (session?.user) {
        try {
          const profilePromise = get().fetchProfile()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
          )
          await Promise.race([profilePromise, timeoutPromise])
        } catch (profileError) {
          // Ignore profile fetch errors during init
        }
      } else {
        set({ profile: null })
      }
    } catch (error) {
      // Ignore initialization errors
    } finally {
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
      const currentOrigin = window.location.origin
      const redirectUrl = `${currentOrigin}/auth/callback`
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
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
    
    if (!user) {
      set({ profile: null })
      return null
    }

    const currentProfile = get().profile

    try {
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

      if (error) {
        if (error.message?.includes('timeout')) {
          if (currentProfile) return currentProfile
          return null
        }
        if (error.code === 'PGRST116' || error.message?.includes('permission')) {
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
              if (currentProfile) return currentProfile
              return null
            }

            set({ profile: newProfile })
            return newProfile
          } catch (createErr) {
            if (currentProfile) return currentProfile
            return null
          }
        } else {
          throw error
        }
      }

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
            if (currentProfile) return currentProfile
            return null
          }

          set({ profile: newProfile })
          return newProfile
        } catch (createErr) {
          if (currentProfile) return currentProfile
          return null
        }
      } else {
        set({ profile: data })
        return data
      }
    } catch (error) {
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

