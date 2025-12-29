import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  FileText, 
  LogOut,
  ClipboardList,
  BarChart3,
  School,
  Menu,
  X
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Đăng xuất thành công')
      navigate('/login')
    } catch (error: any) {
      toast.error(error.message || 'Đăng xuất thất bại')
    }
  }

  const isAdmin = profile?.role === 'admin'
  const isTeacher = profile?.role === 'teacher'

  const adminNavItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/subjects', label: 'Môn học', icon: BookOpen },
    { path: '/admin/users', label: 'Người dùng', icon: Users },
    { path: '/admin/classes', label: 'Lớp học', icon: School },
    { path: '/admin/exams', label: 'Bài thi', icon: FileText },
  ]

  const teacherNavItems = [
    { path: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/teacher/classes', label: 'Lớp học', icon: School },
    { path: '/teacher/exams', label: 'Bài thi', icon: FileText },
  ]

  const studentNavItems = [
    { path: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/student/exams', label: 'Bài thi', icon: ClipboardList },
    { path: '/student/history', label: 'Lịch sử', icon: BarChart3 },
    { path: '/student/grades', label: 'Bảng điểm', icon: BarChart3 },
  ]

  const navItems = isAdmin ? adminNavItems : isTeacher ? teacherNavItems : studentNavItems

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3">
              <Link to={isAdmin ? '/admin' : isTeacher ? '/teacher' : '/student'} className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <img 
                    src="/images/logo.png" 
                    alt="Logo" 
                    className="h-10 w-10 object-contain"
                  />
                </div>
                <span className="hidden sm:block text-lg font-semibold text-gray-900">
                  PTDTNT ATK Sơn Dương
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex md:items-center md:space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path || 
                  (item.path !== '/admin' && item.path !== '/teacher' && item.path !== '/student' && 
                   location.pathname.startsWith(item.path))
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {/* User Info & Actions */}
            <div className="flex items-center space-x-3">
              {/* User Info - Desktop */}
              <div className="hidden md:flex md:items-center md:space-x-3">
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary-700">
                      {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[120px]" title={profile?.full_name}>
                      {profile?.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {profile?.role === 'admin' && 'Quản trị viên'}
                      {profile?.role === 'teacher' && 'Giáo viên'}
                      {profile?.role === 'student' && 'Học sinh'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="ml-2">Đăng xuất</span>
                </button>
              </div>

              {/* User Info - Mobile (chỉ icon) */}
              <div className="md:hidden flex items-center space-x-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary-700">
                    {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  title="Đăng xuất"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path || 
                  (item.path !== '/admin' && item.path !== '/teacher' && item.path !== '/student' && 
                   location.pathname.startsWith(item.path))
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-lg text-base font-medium ${
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              © 2025 Hệ thống Thi trắc nghiệm PTDTNT ATK Sơn Dương
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Phát triển bởi{' '}
              <a 
                href="https://www.facebook.com/phuongdeveloper/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 hover:underline"
              >
                PhuongDev
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
