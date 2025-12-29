import { useState, useEffect } from 'react'
import { getClasses, joinClass, getMyClass, type Class } from '../../lib/api/classes'
import { useAuthStore } from '../../store/authStore'
import { cache, CACHE_KEYS } from '../../lib/cache'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

export default function StudentClassSelect() {
  const { profile, fetchProfile } = useAuthStore()
  const [classes, setClasses] = useState<Class[]>([])
  const [myClass, setMyClass] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (profile?.class_id) {
      navigate('/student/dashboard', { replace: true })
      return
    }
    
    checkMyClass()
  }, [profile?.id])

  const checkMyClass = async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 3s')), 3000)
      )
      
      const myClassPromise = getMyClass(true)
      const myClassData = await Promise.race([myClassPromise, timeoutPromise]) as any
      
      if (myClassData) {
        setMyClass(myClassData)
        navigate('/student/dashboard', { replace: true })
      } else {
        const classesPromise = getClasses(true)
        const classesData = await Promise.race([classesPromise, timeoutPromise]) as Class[]
        setClasses(classesData || [])
      }
    } catch (error: any) {
      if (error.message?.includes('Timeout')) {
        try {
          const classesData = await getClasses(true)
          setClasses(classesData || [])
        } catch (e) {
          // Ignore errors
        }
      } else {
        toast.error('Lỗi khi tải dữ liệu: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleJoinClass = async (classId: string) => {
    try {
      setJoining(classId)
      await joinClass(classId)
      toast.success('Tham gia lớp học thành công!')
      
      // Invalidate cache để fetch lại data mới
      cache.invalidate(CACHE_KEYS.myClass(profile?.id || ''))
      cache.invalidate(CACHE_KEYS.assignedExams(profile?.id || ''))
      
      // Refresh profile để có class_id mới
      await fetchProfile()
      navigate('/student/dashboard', { replace: true })
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra')
    } finally {
      setJoining(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (myClass) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Chọn lớp học của bạn</h1>
          <p className="text-gray-600">
            Vui lòng chọn lớp học bạn đang theo học. Bạn chỉ có thể chọn một lần.
          </p>
        </div>

        {classes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Chưa có lớp học nào trong hệ thống.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((classItem) => (
              <div
                key={classItem.id}
                className="border rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-bold mb-1">{classItem.name}</h3>
                  <p className="text-sm text-gray-500">Mã lớp: {classItem.code}</p>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="text-sm">
                    <span className="text-gray-600">Số học sinh: </span>
                    <span className="font-medium">{classItem.total_students}</span>
                  </div>
                  {classItem.homeroom_teacher && (
                    <div className="text-sm">
                      <span className="text-gray-600">GVCN: </span>
                      <span className="font-medium">{classItem.homeroom_teacher.full_name}</span>
                    </div>
                  )}
                  {classItem.description && (
                    <div className="text-sm text-gray-600">{classItem.description}</div>
                  )}
                </div>
                <button
                  onClick={() => handleJoinClass(classItem.id)}
                  disabled={joining === classItem.id}
                  className="btn btn-primary w-full"
                >
                  {joining === classItem.id ? 'Đang tham gia...' : 'Chọn lớp này'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

