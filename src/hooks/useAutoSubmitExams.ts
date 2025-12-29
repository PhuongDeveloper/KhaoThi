import { useEffect } from 'react'
import { examApi } from '../lib/api/exams'

// Hook để tự động nộp bài khi hết giờ
export function useAutoSubmitExams(interval: number = 60000) {
  useEffect(() => {
    // Gọi ngay lập tức
    examApi.autoSubmitExpiredAttempts().catch(() => {})

    // Gọi định kỳ
    const timer = setInterval(() => {
      examApi.autoSubmitExpiredAttempts().catch(() => {})
    }, interval)

    return () => clearInterval(timer)
  }, [interval])
}

