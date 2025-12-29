import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import Loader from '../../components/Loader'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { fetchProfile } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Đợi một chút để Supabase xử lý OAuth callback
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Kiểm tra xem có user không
        const currentUser = useAuthStore.getState().user
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

