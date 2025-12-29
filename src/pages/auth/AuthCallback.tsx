import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import Loader from '../../components/Loader'

export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const { fetchProfile } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log thông tin URL hiện tại
        console.log('[AuthCallback] Current URL:', window.location.href)
        console.log('[AuthCallback] Current origin:', window.location.origin)
        console.log('[AuthCallback] Location pathname:', location.pathname)
        console.log('[AuthCallback] Location search:', location.search)
        console.log('[AuthCallback] Location hash:', location.hash)
        
        // Kiểm tra xem có access_token trong hash không
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const errorParam = hashParams.get('error')
        
        console.log('[AuthCallback] Access token in hash:', !!accessToken)
        console.log('[AuthCallback] Error in hash:', errorParam)
        
        if (errorParam) {
          console.error('[AuthCallback] OAuth error:', errorParam)
          setError(`Lỗi đăng nhập: ${errorParam}`)
          setTimeout(() => navigate('/login', { replace: true }), 2000)
          return
        }
        
        // Đợi một chút để Supabase xử lý OAuth callback
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Kiểm tra xem có user không
        const currentUser = useAuthStore.getState().user
        console.log('[AuthCallback] Current user:', currentUser?.id)
        
        if (!currentUser) {
          setError('Không tìm thấy thông tin người dùng')
          setTimeout(() => navigate('/login', { replace: true }), 2000)
          return
        }
        
        // Fetch profile nếu chưa có
        let currentProfile = useAuthStore.getState().profile
        if (!currentProfile) {
          currentProfile = await fetchProfile()
        }

        // Đợi thêm một chút để đảm bảo profile được set
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Lấy lại profile từ store
        currentProfile = useAuthStore.getState().profile
        
        if (currentProfile) {
          const role = currentProfile.role
          if (role === 'admin') {
            navigate('/admin', { replace: true })
          } else if (role === 'teacher') {
            navigate('/teacher', { replace: true })
          } else {
            navigate('/student', { replace: true })
          }
        } else {
          setError('Không thể lấy thông tin profile')
          setTimeout(() => navigate('/login', { replace: true }), 2000)
        }
      } catch (err: any) {
        console.error('Error handling OAuth callback:', err)
        setError(err.message || 'Có lỗi xảy ra')
        setTimeout(() => navigate('/login', { replace: true }), 2000)
      }
    }

    handleCallback()
  }, [navigate, fetchProfile])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader />
        <p className="mt-4 text-gray-600">
          {error || 'Đang xử lý đăng nhập...'}
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-600">
            Sẽ chuyển về trang đăng nhập...
          </p>
        )}
      </div>
    </div>
  )
}

