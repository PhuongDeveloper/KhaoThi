import { Routes, Route, Navigate } from 'react-router-dom'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminSubjects from '../pages/admin/AdminSubjects'
import AdminUsers from '../pages/admin/AdminUsers'
import AdminExams from '../pages/admin/AdminExams'
import AdminClasses from '../pages/admin/AdminClasses'
import TeacherExamCreate from '../pages/teacher/TeacherExamCreate'
import TeacherExamEdit from '../pages/teacher/TeacherExamEdit'
import TeacherExamResults from '../pages/teacher/TeacherExamResults'
import ExamPreview from '../pages/teacher/ExamPreview'
import StudentExamDetail from '../pages/teacher/StudentExamDetail'
import ExamMonitoring from '../pages/teacher/ExamMonitoring'
import Layout from '../components/Layout'

export default function AdminLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/subjects" element={<AdminSubjects />} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/classes" element={<AdminClasses />} />
        <Route path="/exams" element={<AdminExams />} />
        <Route path="/exams/create" element={<TeacherExamCreate />} />
        <Route path="/exams/:id/edit" element={<TeacherExamEdit />} />
        <Route path="/exams/:id/results" element={<TeacherExamResults />} />
        <Route path="/exams/:id/results/:attemptId" element={<StudentExamDetail />} />
        <Route path="/exams/:id/monitoring" element={<ExamMonitoring />} />
        <Route path="/exams/:id/preview" element={<ExamPreview />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Layout>
  )
}

