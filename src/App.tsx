import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/auth/LoginPage'

import AdminLayout from './layouts/AdminLayout'
import TeacherLayout from './layouts/TeacherLayout'
import StudentLayout from './layouts/StudentLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Loader from './components/Loader'

function App() {
  const { initialize, initialized, loading } = useAuthStore()

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
        <Route path="/register" element={<Navigate to="/login" replace />} />

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
