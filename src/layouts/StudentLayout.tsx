import { Routes, Route, Navigate } from 'react-router-dom'
import StudentDashboard from '../pages/student/StudentDashboard'
import StudentClassSelect from '../pages/student/StudentClassSelect'
import StudentExams from '../pages/student/StudentExams'
import StudentExamTake from '../pages/student/StudentExamTake'
import StudentExamResult from '../pages/student/StudentExamResult'
import StudentExamReview from '../pages/student/StudentExamReview'
import StudentHistory from '../pages/student/StudentHistory'
import StudentGrades from '../pages/student/StudentGrades'
import Layout from '../components/Layout'

export default function StudentLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<StudentDashboard />} />
        <Route path="/select-class" element={<StudentClassSelect />} />
        <Route path="/exams" element={<StudentExams />} />
        <Route path="/exams/:id/take" element={<StudentExamTake />} />
        <Route path="/exams/:id/result" element={<StudentExamResult />} />
        <Route path="/exams/:id/review" element={<StudentExamReview />} />
        <Route path="/history" element={<StudentHistory />} />
        <Route path="/grades" element={<StudentGrades />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>
    </Layout>
  )
}

