import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string
          role: 'admin' | 'teacher' | 'student'
          student_code: string | null
          teacher_code: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      subjects: {
        Row: {
          id: string
          name: string
          code: string
          description: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['subjects']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>
      }
      exams: {
        Row: {
          id: string
          title: string
          description: string | null
          subject_id: string
          teacher_id: string
          duration_minutes: number
          total_questions: number
          passing_score: number
          shuffle_questions: boolean
          shuffle_answers: boolean
          allow_review: boolean
          start_time: string | null
          end_time: string | null
          status: 'draft' | 'published' | 'closed'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['exams']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['exams']['Insert']>
      }
      exam_assignments: {
        Row: {
          id: string
          exam_id: string
          student_id: string
          assigned_at: string
        }
        Insert: Omit<Database['public']['Tables']['exam_assignments']['Row'], 'id' | 'assigned_at'>
        Update: Partial<Database['public']['Tables']['exam_assignments']['Insert']>
      }
      questions: {
        Row: {
          id: string
          exam_id: string
          content: string
          question_type: 'multiple_choice' | 'true_false'
          difficulty: 'easy' | 'medium' | 'hard'
          points: number
          order_index: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['questions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['questions']['Insert']>
      }
      answers: {
        Row: {
          id: string
          question_id: string
          content: string
          is_correct: boolean
          order_index: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['answers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['answers']['Insert']>
      }
      exam_attempts: {
        Row: {
          id: string
          exam_id: string
          student_id: string
          started_at: string
          submitted_at: string | null
          time_spent_seconds: number | null
          score: number | null
          percentage: number | null
          status: 'in_progress' | 'submitted' | 'timeout' | 'violation'
          violations_count: number
          violations_data: any
          ai_analysis: any
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['exam_attempts']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['exam_attempts']['Insert']>
      }
      exam_responses: {
        Row: {
          id: string
          attempt_id: string
          question_id: string
          answer_id: string | null
          is_correct: boolean | null
          points_earned: number
          answered_at: string
        }
        Insert: Omit<Database['public']['Tables']['exam_responses']['Row'], 'id' | 'answered_at'>
        Update: Partial<Database['public']['Tables']['exam_responses']['Insert']>
      }
    }
  }
}

