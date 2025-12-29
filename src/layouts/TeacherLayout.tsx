import { Routes, Route, Navigate } from 'react-router-dom'
import TeacherDashboard from '../pages/teacher/TeacherDashboard'
import TeacherClasses from '../pages/teacher/TeacherClasses'
import TeacherExams from '../pages/teacher/TeacherExams'
import TeacherExamCreate from '../pages/teacher/TeacherExamCreate'
import TeacherExamEdit from '../pages/teacher/TeacherExamEdit'
import TeacherExamResults from '../pages/teacher/TeacherExamResults'
import ExamPreview from '../pages/teacher/ExamPreview'
import StudentExamDetail from '../pages/teacher/StudentExamDetail'
import ExamMonitoring from '../pages/teacher/ExamMonitoring'
import Layout from '../components/Layout'

export default function TeacherLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TeacherDashboard />} />
        <Route path="/classes" element={<TeacherClasses />} />
        <Route path="/exams" element={<TeacherExams />} />
        <Route path="/exams/create" element={<TeacherExamCreate />} />
        <Route path="/exams/:id/edit" element={<TeacherExamEdit />} />
        <Route path="/exams/:id/results" element={<TeacherExamResults />} />
        <Route path="/exams/:id/results/:attemptId" element={<StudentExamDetail />} />
        <Route path="/exams/:id/monitoring" element={<ExamMonitoring />} />
        <Route path="/exams/:id/preview" element={<ExamPreview />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </Layout>
  )
}

