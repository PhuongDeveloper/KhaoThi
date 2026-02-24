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
    const checkAuth = async () => {
      try {
        if (user && !profile) {
          console.log('[ProtectedRoute] User có nhưng chưa có profile, đang fetch...')
          const fetchedProfile = await fetchProfile()
          if (!fetchedProfile) {
            console.warn('[ProtectedRoute] Không thể fetch profile')
            setIsLoading(false)
            return
          }
          console.log('[ProtectedRoute] Đã fetch profile thành công:', fetchedProfile)
        }
        
        if (!user) {
          console.log('[ProtectedRoute] Chưa có user')
          setIsLoading(false)
          return
        }
      } catch (error: any) {
        console.error('[ProtectedRoute] Lỗi khi check auth:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    const timeout = setTimeout(() => {
      console.warn('[ProtectedRoute] Timeout khi check auth')
      setIsLoading(false)
    }, 5000)
    
    checkAuth()
    
    return () => {
      clearTimeout(timeout)
    }
  }, [user, profile, fetchProfile])
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

