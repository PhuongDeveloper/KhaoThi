import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import Loader from '../../components/Loader'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { signIn, signInWithGoogle, loading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result: any = await signIn(email, password)
      
      // Đợi một chút để đảm bảo state được cập nhật hoàn toàn
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Lấy profile từ result hoặc từ store (đã được cập nhật)
      const currentProfile = result?.profile || useAuthStore.getState().profile
      
      if (currentProfile) {
        toast.success('Đăng nhập thành công')
        
        // Redirect ngay lập tức
        const role = currentProfile.role
        if (role === 'admin') {
          navigate('/admin', { replace: true })
        } else if (role === 'teacher') {
          navigate('/teacher', { replace: true })
        } else {
          navigate('/student', { replace: true })
        }
      } else {
        toast.error('Không thể lấy thông tin người dùng. Vui lòng thử lại.')
      }
    } catch (error: any) {
      toast.error(error.message || 'Đăng nhập thất bại')
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center mb-6">
              <img 
                src="/images/logo.png" 
                alt="Logo" 
                className="h-24 w-24 object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold text-blue-600 mb-2">Đăng nhập</h1>
            <p className="text-gray-600 text-base">
              Hệ thống thi trắc nghiệm PTDTNT ATK Sơn Dương
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
                placeholder="your@email.com"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[48px] mt-6 shadow-md hover:shadow-lg"
            >
              {loading ? (
                <div className="w-6 h-6">
                  <Loader />
                </div>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-transparent text-gray-500">Hoặc</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  await signInWithGoogle()
                } catch (error: any) {
                  toast.error(error.message || 'Đăng nhập với Google thất bại')
                }
              }}
              className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-blue-200 rounded-lg bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all active:bg-blue-100 font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="font-medium">Đăng nhập với Google</span>
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                Đăng ký
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Info with background image */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/back.png)' }}
        />
        <div className="relative z-10 flex flex-col justify-center items-center p-12 w-full">
          <div className="max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8">
            <h2 className="text-4xl font-bold mb-4 text-blue-600">Chào mừng đến với</h2>
            <h3 className="text-3xl font-bold mb-6 text-blue-700">Hệ thống Thi trắc nghiệm</h3>
            <p className="text-xl mb-8 text-gray-700 font-medium">
              PTDTNT ATK Sơn Dương
            </p>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="ml-3 text-gray-700 text-lg">Thi trắc nghiệm trực tuyến</p>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="ml-3 text-gray-700 text-lg">Chấm điểm tự động</p>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="ml-3 text-gray-700 text-lg">Báo cáo kết quả chi tiết</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 py-4 z-20">
        <div className="text-center">
          <p className="text-sm text-gray-600">
            © 2025 Hệ thống Thi trắc nghiệm PTDTNT ATK Sơn Dương. Phát triển bởi{' '}
            <a 
              href="https://www.facebook.com/phuongdeveloper/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              PhuongDev
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
