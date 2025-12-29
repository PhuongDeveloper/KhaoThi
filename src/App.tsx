import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import AuthCallback from './pages/auth/AuthCallback'
import AdminLayout from './layouts/AdminLayout'
import TeacherLayout from './layouts/TeacherLayout'
import StudentLayout from './layouts/StudentLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Loader from './components/Loader'

function App() {
  const { initialize, initialized, loading } = useAuthStore()

  // Intercept và log mọi thay đổi URL để debug redirect issue
  useEffect(() => {
    const logUrlChange = () => {
      console.log('[App] URL changed to:', window.location.href)
      console.log('[App] Origin:', window.location.origin)
      
      // Nếu detect redirect về localhost, log warning
      if (window.location.origin.includes('localhost:3000')) {
        console.error('[App] WARNING: Redirected to localhost:3000!')
        console.error('[App] Current origin should be:', window.location.origin)
        console.error('[App] Full URL:', window.location.href)
      }
    }
    
    // Log ngay khi component mount
    logUrlChange()
    
    // Listen cho popstate events (back/forward navigation)
    window.addEventListener('popstate', logUrlChange)
    
    // Listen cho hashchange (OAuth callback thường dùng hash)
    window.addEventListener('hashchange', logUrlChange)
    
    return () => {
      window.removeEventListener('popstate', logUrlChange)
      window.removeEventListener('hashchange', logUrlChange)
    }
  }, [])

  useEffect(() => {
    console.log('[App] Starting initialization...')
    const startTime = Date.now()
    
    initialize()
      .then(() => {
        const duration = Date.now() - startTime
        console.log(`[App] Initialization completed in ${duration}ms`)
      })
      .catch((error) => {
        const duration = Date.now() - startTime
        console.error(`[App] Failed to initialize app after ${duration}ms:`, error)
        // Force set initialized to true after 3 seconds to prevent infinite loading
        setTimeout(() => {
          console.warn('[App] Force setting initialized=true due to timeout')
          useAuthStore.setState({ initialized: true, loading: false })
        }, 3000)
      })
  }, [initialize])

  // Timeout fallback để tránh loading vô hạn
  useEffect(() => {
    console.log('[App] Setting timeout fallback, initialized:', initialized, 'loading:', loading)
    const timeout = setTimeout(() => {
      if (!initialized) {
        console.warn('[App] App initialization timeout after 5s, forcing initialized state')
        useAuthStore.setState({ initialized: true, loading: false })
      }
    }, 5000)
    
    return () => {
      console.log('[App] Clearing timeout fallback')
      clearTimeout(timeout)
    }
  }, [initialized, loading])

  if (!initialized || loading) {
    console.log('[App] Rendering loader - initialized:', initialized, 'loading:', loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    )
  }

  console.log('[App] Rendering main app - initialized:', initialized, 'loading:', loading)

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/teacher/*"
          element={
            <ProtectedRoute allowedRoles={['admin', 'teacher']}>
              <TeacherLayout />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/student/*"
          element={
            <ProtectedRoute allowedRoles={['admin', 'teacher', 'student']}>
              <StudentLayout />
            </ProtectedRoute>
          }
        />
        
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

