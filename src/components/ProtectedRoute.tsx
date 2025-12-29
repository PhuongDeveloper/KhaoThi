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
          const fetchedProfile = await fetchProfile()
          if (!fetchedProfile) {
            setIsLoading(false)
            return
          }
        }
        
        if (!user) {
          setIsLoading(false)
          return
        }
      } catch (error) {
        // Ignore errors
      } finally {
        setIsLoading(false)
      }
    }
    
    const timeout = setTimeout(() => {
      setIsLoading(false)
    }, 3000)
    
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

