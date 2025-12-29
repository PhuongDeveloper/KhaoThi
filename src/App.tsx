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
      
      // Nếu detect redirect về localhost, fix ngay lập tức
      if (currentOrigin.includes('localhost:3000') || currentOrigin.includes('localhost')) {
        const productionUrl = 'https://www.hethongthi.online'
        const pathname = window.location.pathname
        const search = window.location.search
        const hash = window.location.hash
        const newUrl = `${productionUrl}${pathname}${search}${hash}`
        window.location.replace(newUrl)
        return
      }
    }
    
    fixLocalhostRedirect()
    window.addEventListener('popstate', fixLocalhostRedirect)
    window.addEventListener('hashchange', fixLocalhostRedirect)
    
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
    initialize().catch(() => {
      setTimeout(() => {
        useAuthStore.setState({ initialized: true, loading: false })
      }, 3000)
    })
  }, [initialize])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!initialized) {
        useAuthStore.setState({ initialized: true, loading: false })
      }
    }, 5000)
    
    return () => clearTimeout(timeout)
  }, [initialized, loading])

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    )
  }

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

