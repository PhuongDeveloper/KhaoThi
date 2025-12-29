import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: ('admin' | 'teacher' | 'student')[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, fetchProfile } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    console.log('[ProtectedRoute] useEffect triggered, user:', user?.id, 'profile:', profile?.id)
    const checkAuth = async () => {
      const startTime = Date.now()
      try {
        // Nếu có user nhưng chưa có profile, thử fetch lại
        if (user && !profile) {
          console.log('[ProtectedRoute] User exists but no profile, fetching...')
          const fetchStartTime = Date.now()
          const fetchedProfile = await fetchProfile()
          const fetchDuration = Date.now() - fetchStartTime
          console.log(`[ProtectedRoute] Profile fetch completed in ${fetchDuration}ms, result:`, !!fetchedProfile)
          
          // Nếu vẫn không có profile sau khi fetch, có thể là lỗi
          if (!fetchedProfile) {
            console.warn('[ProtectedRoute] Profile not found after fetch, redirecting to login')
            setIsLoading(false)
            return
          }
        }
        
        // Nếu không có user, không cần check gì nữa
        if (!user) {
          console.log('[ProtectedRoute] No user, setting loading false')
          setIsLoading(false)
          return
        }
        
        const totalDuration = Date.now() - startTime
        console.log(`[ProtectedRoute] Auth check completed in ${totalDuration}ms`)
      } catch (error) {
        console.error('[ProtectedRoute] Error fetching profile:', error)
        // Không redirect ngay, để user thấy lỗi
      } finally {
        setIsLoading(false)
        console.log('[ProtectedRoute] Setting isLoading=false')
      }
    }
    
    // Timeout ngắn hơn để tránh loading vô hạn
    const timeout = setTimeout(() => {
      console.warn('[ProtectedRoute] Timeout reached, forcing isLoading=false')
      setIsLoading(false)
    }, 3000)
    
    checkAuth()
    
    return () => {
      console.log('[ProtectedRoute] Cleanup: clearing timeout')
      clearTimeout(timeout)
    }
  }, [user, profile, fetchProfile])

  console.log('[ProtectedRoute] Render - isLoading:', isLoading, 'user:', !!user, 'profile:', !!profile, 'role:', profile?.role)
  
  if (isLoading) {
    console.log('[ProtectedRoute] Rendering loader')
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user || !profile) {
    console.log('[ProtectedRoute] No user or profile, redirecting to login')
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(profile.role)) {
    console.log('[ProtectedRoute] Role not allowed, redirecting to login. Role:', profile.role, 'Allowed:', allowedRoles)
    return <Navigate to="/login" replace />
  }

  console.log('[ProtectedRoute] Rendering children')
  return <>{children}</>
}

