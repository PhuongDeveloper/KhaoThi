import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import Loader from '../../components/Loader'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { signIn, loading, profile } = useAuthStore()

  // Nếu đã đăng nhập rồi (ví dụ quay lại /login bằng tay), redirect ngay
  if (profile) {
    const role = profile.role
    if (role === 'admin') {
      return <Navigate to="/admin" replace />
    } else if (role === 'teacher') {
      return <Navigate to="/teacher" replace />
    } else {
      return <Navigate to="/student" replace />
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await signIn(email, password)
      const userProfile = result?.profile || useAuthStore.getState().profile
      if (userProfile) {
        toast.success('Đăng nhập thành công! Đang chuyển trang...', { id: 'login-success', duration: 3000 })
        const role = userProfile.role
        const targetPath = role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher' : '/student'
        // Tự động reload sau 2s để đảm bảo Firebase khởi tạo hoàn tất
        setTimeout(() => {
          window.location.href = targetPath
        }, 2000)
      }
    } catch (error: any) {
      toast.error(error.message || 'Đăng nhập thất bại')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Running Banner Header */}
      <div className="bg-blue-600 text-white overflow-hidden py-2.5 shadow-md z-30">
        <div className="animate-marquee text-sm md:text-base">
          <span className="mx-6 font-semibold tracking-wide">Chào mừng đến với Hệ thống Thi trắc nghiệm PTDTNT ATK Sơn Dương</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Giao diện chuyên nghiệp</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Thi trắc nghiệm trực tuyến</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Chấm điểm tự động</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Báo cáo kết quả chi tiết</span>
          <span className="mx-6"></span>
          {/* Lặp lại để chuỗi chạy không bị đứt đoạn */}
          <span className="mx-6 font-semibold tracking-wide">Chào mừng đến với Hệ thống Thi trắc nghiệm PTDTNT ATK Sơn Dương</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Giao diện chuyên nghiệp</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Thi trắc nghiệm trực tuyến</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Chấm điểm tự động</span>
          <span className="mx-6 opacity-75">•</span>
          <span className="mx-6 font-semibold tracking-wide">Báo cáo kết quả chi tiết</span>
          <span className="mx-6"></span>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* Left side - Form */}
        <div className="w-full lg:w-2/5 flex flex-col justify-between bg-white z-10 relative">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-md">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center mb-6">
                  <img
                    src="/images/logo.png"
                    alt="Logo"
                    className="h-24 w-24 object-contain drop-shadow-sm"
                  />
                </div>
                <h1 className="text-4xl font-bold text-blue-600 mb-2 tracking-tight">Đăng nhập</h1>
                <p className="text-gray-600 text-base font-medium">
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50/50"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50/50"
                    required
                    placeholder="••••••••"
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[52px] mt-6 shadow-md hover:shadow-xl hover:-translate-y-0.5"
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
            </div>
          </div>

          <footer className="w-full bg-white border-t border-gray-100 py-5">
            <div className="text-center">
              <p className="text-sm text-gray-500 font-medium">
                © {new Date().getFullYear()} Hệ thống Thi trắc nghiệm PTDTNT ATK Sơn Dương
              </p>
            </div>
          </footer>
        </div>

        {/* Right side - Pure background image without overlay cards */}
        <div className="hidden lg:block lg:w-3/5 relative bg-cover bg-center bg-no-repeat z-0" style={{ backgroundImage: 'url(/images/back.png)' }}>
          {/* Lớp phủ gradient nhẹ ở rìa trái để tạo sự chuyển tiếp mềm mại giữa 2 khối (tuỳ chọn) */}
          <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent opacity-50 pointer-events-none"></div>
        </div>
      </div>
    </div>
  )
}
