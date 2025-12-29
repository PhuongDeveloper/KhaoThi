import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, BookOpen, FileText, BarChart3 } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    users: 0,
    subjects: 0,
    exams: 0,
    attempts: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const usersResult = await supabase.from('profiles').select('id', { count: 'exact', head: true })
      const subjectsResult = await supabase.from('subjects').select('id', { count: 'exact', head: true })
      
      let examsResult = { count: 0 }
      let attemptsResult = { count: 0 }
      
      try {
        const exams = await supabase.from('exams').select('id', { count: 'exact', head: true })
        if (!exams.error) {
          examsResult = exams
        }
      } catch (e) {
        console.warn('Error fetching exams count:', e)
      }
      
      try {
        const attempts = await supabase.from('exam_attempts').select('id', { count: 'exact', head: true })
        if (!attempts.error) {
          attemptsResult = attempts
        }
      } catch (e) {
        console.warn('Error fetching attempts count:', e)
      }

      setStats({
        users: usersResult.count || 0,
        subjects: subjectsResult.count || 0,
        exams: examsResult.count || 0,
        attempts: attemptsResult.count || 0,
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats({
        users: 0,
        subjects: 0,
        exams: 0,
        attempts: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard Quản trị</h1>
        <p className="text-sm text-gray-500 mt-1">Tổng quan hệ thống</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Người dùng</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.users}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <Users className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Môn học</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.subjects}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <BookOpen className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Bài thi</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.exams}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <FileText className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Lần làm bài</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.attempts}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
