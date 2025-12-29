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

  // Intercept và fix redirect về localhost issue
  useEffect(() => {
    const fixLocalhostRedirect = () => {
      const currentOrigin = window.location.origin
      const currentHref = window.location.href
      
      console.log('[App] URL changed to:', currentHref)
      console.log('[App] Origin:', currentOrigin)
      
      // Nếu detect redirect về localhost, fix ngay lập tức
      if (currentOrigin.includes('localhost:3000') || currentOrigin.includes('localhost')) {
        console.error('[App] WARNING: Redirected to localhost! Fixing...')
        
        // Lấy production URL từ environment hoặc hardcode
        const productionUrl = 'https://www.hethongthi.online'
        
        // Giữ lại pathname, search, và hash
        const pathname = window.location.pathname
        const search = window.location.search
        const hash = window.location.hash
        
        // Tạo URL mới với production domain
        const newUrl = `${productionUrl}${pathname}${search}${hash}`
        
        console.log('[App] Redirecting to:', newUrl)
        
        // Redirect ngay lập tức
        window.location.replace(newUrl)
        return
      }
    }
    
    // Kiểm tra ngay khi component mount
    fixLocalhostRedirect()
    
    // Listen cho popstate events (back/forward navigation)
    window.addEventListener('popstate', fixLocalhostRedirect)
    
    // Listen cho hashchange (OAuth callback thường dùng hash)
    window.addEventListener('hashchange', fixLocalhostRedirect)
    
    // Listen cho location change (nếu có)
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args)
      setTimeout(fixLocalhostRedirect, 0)
    }
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args)
      setTimeout(fixLocalhostRedirect, 0)
    }
    
    return () => {
      window.removeEventListener('popstate', fixLocalhostRedirect)
      window.removeEventListener('hashchange', fixLocalhostRedirect)
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
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

