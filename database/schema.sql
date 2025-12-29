-- Database Schema cho hệ thống thi trắc nghiệm PTDTNT ATK Sơn Dương
-- LƯU Ý: Nếu bảng đã tồn tại, sử dụng migration_fix_rls.sql thay vì chạy lại script này

-- Bảng users (mở rộng auth.users của Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  student_code TEXT, -- Mã học sinh (nếu là học sinh)
  teacher_code TEXT, -- Mã giáo viên (nếu là giáo viên)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng subjects (Môn học)
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng exams (Bài kiểm tra)
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  total_questions INTEGER NOT NULL DEFAULT 0,
  passing_score INTEGER DEFAULT 50, -- Điểm đạt (%)
  shuffle_questions BOOLEAN DEFAULT true,
  shuffle_answers BOOLEAN DEFAULT true,
  allow_review BOOLEAN DEFAULT false, -- Cho phép xem lại sau khi nộp
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TẠM THỜI TẮT RLS CHO EXAMS ĐỂ TRÁNH RECURSION
-- ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;

-- Bảng classes (Lớp học)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- Tên lớp (ví dụ: "10A1", "11B2")
  code TEXT UNIQUE NOT NULL, -- Mã lớp (ví dụ: "10A1-2024")
  total_students INTEGER DEFAULT 0, -- Tổng số học sinh
  homeroom_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Giáo viên chủ nhiệm
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng class_students (Học sinh trong lớp)
CREATE TABLE IF NOT EXISTS public.class_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(class_id, student_id) -- Mỗi học sinh chỉ thuộc 1 lớp
);

-- Bảng exam_assignments (Phân công bài thi cho học sinh/lớp)
CREATE TABLE IF NOT EXISTS public.exam_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE, -- NULL nếu giao cho học sinh riêng lẻ
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, student_id, class_id)
);

-- Bảng questions (Câu hỏi)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false_multi', 'short_answer')),
  image_url TEXT, -- URL hình ảnh cho câu hỏi (nếu có)
  correct_answer TEXT, -- Đáp án đúng cho câu hỏi trả lời ngắn (short_answer), format: "1234" hoặc "12.34" hoặc "-12.34"
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  points INTEGER DEFAULT 1,
  order_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng answers (Đáp án)
CREATE TABLE IF NOT EXISTS public.answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  order_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng exam_attempts (Lần làm bài)
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  time_spent_seconds INTEGER,
  score INTEGER, -- Điểm số
  percentage INTEGER, -- Phần trăm
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'timeout', 'violation')),
  violations_count INTEGER DEFAULT 0, -- Số lần vi phạm
  violations_data JSONB DEFAULT '[]'::jsonb, -- Chi tiết vi phạm
  ai_analysis JSONB, -- Phân tích từ Gemini AI
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng exam_responses (Câu trả lời của học sinh)
CREATE TABLE IF NOT EXISTS public.exam_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_id UUID REFERENCES public.answers(id), -- Cho multiple_choice và true_false_multi
  text_answer TEXT, -- Cho short_answer (lưu đáp án số)
  is_correct BOOLEAN,
  points_earned INTEGER DEFAULT 0,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng ai_question_generations (Lịch sử sinh câu hỏi bằng AI)
CREATE TABLE IF NOT EXISTS public.ai_question_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.profiles(id),
  input_text TEXT NOT NULL,
  generated_questions JSONB,
  difficulty_level TEXT,
  api_calls_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON public.exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON public.exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_classes_homeroom_teacher ON public.classes(homeroom_teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class ON public.class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_class ON public.profiles(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_exam ON public.exam_assignments(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_student ON public.exam_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_class ON public.exam_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON public.answers(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON public.exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON public.exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_responses_attempt ON public.exam_responses(attempt_id);

-- RLS Policies

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
-- TẮT RLS CHO EXAMS ĐỂ TRÁNH RECURSION
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_question_generations ENABLE ROW LEVEL SECURITY;
-- TẮT RLS CHO CLASSES ĐỂ TRÁNH RECURSION
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Everyone can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins and teachers can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can view all exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can view own exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view assigned exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can manage own exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can view assignments for their exams" ON public.exam_assignments;
DROP POLICY IF EXISTS "Students can view own assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Teachers can manage assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Teachers can view questions for their exams" ON public.questions;
DROP POLICY IF EXISTS "Teachers can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Teachers can view answers for their exams" ON public.answers;
DROP POLICY IF EXISTS "Teachers can manage answers" ON public.answers;
DROP POLICY IF EXISTS "Admins can view all attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can view own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Teachers can view attempts for their exams" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can create own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own in-progress attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can view own responses" ON public.exam_responses;
DROP POLICY IF EXISTS "Teachers can view responses for their exams" ON public.exam_responses;
DROP POLICY IF EXISTS "Students can manage own responses" ON public.exam_responses;
DROP POLICY IF EXISTS "Teachers can view own AI generations" ON public.ai_question_generations;
DROP POLICY IF EXISTS "Teachers can create AI generations" ON public.ai_question_generations;

-- Function to check user role (bypass RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_user_role(check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = check_role
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check if user is admin or teacher
CREATE OR REPLACE FUNCTION public.is_admin_or_teacher()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'teacher')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.is_user_role('admin')
  );

CREATE POLICY "Teachers can view student profiles" ON public.profiles
  FOR SELECT USING (
    public.is_user_role('teacher')
    AND role = 'student'
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id); -- Không cho user tự đổi role

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Subjects policies
CREATE POLICY "Everyone can view subjects" ON public.subjects
  FOR SELECT USING (true);

CREATE POLICY "Admins and teachers can manage subjects" ON public.subjects
  FOR ALL USING (
    public.is_admin_or_teacher()
  );

-- Exams policies
-- RLS ĐÃ BỊ TẮT CHO EXAMS - KHÔNG TẠO POLICIES NỮA
-- Drop policies cũ nếu tồn tại (không cần vì đã tắt RLS)
-- DROP POLICY IF EXISTS "Admins can view all exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can view own exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view assigned exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can insert own exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can insert exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can update own exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can update exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can delete own exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can delete exams" ON public.exams;

-- Policy cho admin - QUERY TRỰC TIẾP, KHÔNG DÙNG FUNCTION để tránh recursion
-- CREATE POLICY "Admins can view all exams" ON public.exams
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- CREATE POLICY "Teachers can view own exams" ON public.exams
--   FOR SELECT USING (teacher_id = auth.uid());

-- CREATE POLICY "Students can view assigned exams" ON public.exams
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM public.exam_assignments 
--       WHERE exam_id = exams.id AND student_id = auth.uid()
--     ) AND status = 'published'
--   );

-- CREATE POLICY "Teachers can insert own exams" ON public.exams
--   FOR INSERT WITH CHECK (teacher_id = auth.uid());

-- CREATE POLICY "Admins can insert exams" ON public.exams
--   FOR INSERT WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- CREATE POLICY "Teachers can update own exams" ON public.exams
--   FOR UPDATE USING (teacher_id = auth.uid());

-- CREATE POLICY "Admins can update exams" ON public.exams
--   FOR UPDATE USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- CREATE POLICY "Teachers can delete own exams" ON public.exams
--   FOR DELETE USING (teacher_id = auth.uid());

-- CREATE POLICY "Admins can delete exams" ON public.exams
--   FOR DELETE USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- Exam assignments policies
DROP POLICY IF EXISTS "Teachers can view assignments for their exams" ON public.exam_assignments;
DROP POLICY IF EXISTS "Students can view own assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Teachers can manage assignments" ON public.exam_assignments;

CREATE POLICY "Teachers can view assignments for their exams" ON public.exam_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exams 
      WHERE exams.id = exam_assignments.exam_id AND exams.teacher_id = auth.uid()
    ) OR
    public.is_user_role('admin')
  );

CREATE POLICY "Students can view own assignments" ON public.exam_assignments
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Teachers can manage assignments" ON public.exam_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams 
      WHERE exams.id = exam_assignments.exam_id AND exams.teacher_id = auth.uid()
    ) OR
    public.is_user_role('admin')
  );

-- Questions policies
DROP POLICY IF EXISTS "Teachers can view questions for their exams" ON public.questions;
DROP POLICY IF EXISTS "Teachers can manage questions" ON public.questions;

CREATE POLICY "Teachers can view questions for their exams" ON public.questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exams 
      WHERE exams.id = questions.exam_id AND exams.teacher_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = questions.exam_id AND exams.status = 'published')
  );

CREATE POLICY "Teachers can manage questions" ON public.questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams 
      WHERE exams.id = questions.exam_id AND exams.teacher_id = auth.uid()
    ) OR
    public.is_user_role('admin')
  );

-- Answers policies
DROP POLICY IF EXISTS "Teachers can view answers for their exams" ON public.answers;
DROP POLICY IF EXISTS "Teachers can manage answers" ON public.answers;

CREATE POLICY "Teachers can view answers for their exams" ON public.answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.questions 
      JOIN public.exams ON exams.id = questions.exam_id
      WHERE questions.id = answers.question_id AND exams.teacher_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.questions 
      JOIN public.exams ON exams.id = questions.exam_id
      WHERE questions.id = answers.question_id AND exams.status = 'published'
    )
  );

CREATE POLICY "Teachers can manage answers" ON public.answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.questions 
      JOIN public.exams ON exams.id = questions.exam_id
      WHERE questions.id = answers.question_id AND exams.teacher_id = auth.uid()
    ) OR
    public.is_user_role('admin')
  );

-- Exam attempts policies
DROP POLICY IF EXISTS "Admins can view all attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can view own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Teachers can view attempts for their exams" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can create own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own in-progress attempts" ON public.exam_attempts;

CREATE POLICY "Admins can view all attempts" ON public.exam_attempts
  FOR SELECT USING (
    public.is_user_role('admin')
  );

CREATE POLICY "Students can view own attempts" ON public.exam_attempts
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Teachers can view attempts for their exams" ON public.exam_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exams 
      WHERE exams.id = exam_attempts.exam_id AND exams.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Students can create own attempts" ON public.exam_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own in-progress attempts" ON public.exam_attempts
  FOR UPDATE USING (student_id = auth.uid() AND status = 'in_progress');

-- Exam responses policies
DROP POLICY IF EXISTS "Students can view own responses" ON public.exam_responses;
DROP POLICY IF EXISTS "Teachers can view responses for their exams" ON public.exam_responses;
DROP POLICY IF EXISTS "Students can manage own responses" ON public.exam_responses;

CREATE POLICY "Students can view own responses" ON public.exam_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts 
      WHERE exam_attempts.id = exam_responses.attempt_id AND exam_attempts.student_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can view responses for their exams" ON public.exam_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts 
      JOIN public.exams ON exams.id = exam_attempts.exam_id
      WHERE exam_attempts.id = exam_responses.attempt_id AND exams.teacher_id = auth.uid()
    ) OR
    public.is_user_role('admin')
  );

CREATE POLICY "Students can manage own responses" ON public.exam_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts 
      WHERE exam_attempts.id = exam_responses.attempt_id 
      AND exam_attempts.student_id = auth.uid()
      AND exam_attempts.status = 'in_progress'
    )
  );

-- AI question generations policies
DROP POLICY IF EXISTS "Teachers can view own AI generations" ON public.ai_question_generations;
DROP POLICY IF EXISTS "Teachers can create AI generations" ON public.ai_question_generations;

CREATE POLICY "Teachers can view own AI generations" ON public.ai_question_generations
  FOR SELECT USING (
    teacher_id = auth.uid() OR
    public.is_user_role('admin')
  );

CREATE POLICY "Teachers can create AI generations" ON public.ai_question_generations
  FOR INSERT WITH CHECK (
    teacher_id = auth.uid() OR
    public.is_user_role('admin')
  );

-- Classes policies
-- TẮT RLS CHO CLASSES ĐỂ TRÁNH RECURSION (tương tự như exams)
-- Vì classes được query với joins nhiều và gây recursion
DROP POLICY IF EXISTS "Everyone can view classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view own class" ON public.classes;

-- Tắt RLS cho classes
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;

-- Giữ lại policies cũ nhưng không dùng (để tham khảo)
-- CREATE POLICY "Everyone can view classes" ON public.classes
--   FOR SELECT USING (true);
-- 
-- CREATE POLICY "Admins can manage classes" ON public.classes
--   FOR ALL USING (public.is_user_role('admin'));
-- 
-- CREATE POLICY "Teachers can view classes" ON public.classes
--   FOR SELECT USING (
--     public.is_user_role('teacher') OR
--     homeroom_teacher_id = auth.uid()
--   );
-- 
-- CREATE POLICY "Students can view own class" ON public.classes
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM public.class_students
--       WHERE class_id = classes.id AND student_id = auth.uid()
--     )
--   );

-- Class students policies
DROP POLICY IF EXISTS "Everyone can view class students" ON public.class_students;
DROP POLICY IF EXISTS "Admins can manage class students" ON public.class_students;
DROP POLICY IF EXISTS "Teachers can manage class students" ON public.class_students;
DROP POLICY IF EXISTS "Students can view own class membership" ON public.class_students;
DROP POLICY IF EXISTS "Students can join class once" ON public.class_students;

CREATE POLICY "Everyone can view class students" ON public.class_students
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage class students" ON public.class_students
  FOR ALL USING (public.is_user_role('admin'));

CREATE POLICY "Teachers can manage class students" ON public.class_students
  FOR ALL USING (
    -- Không query classes để tránh recursion, chỉ check role
    public.is_user_role('teacher')
  );

CREATE POLICY "Students can view own class membership" ON public.class_students
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can join class once" ON public.class_students
  FOR INSERT WITH CHECK (
    student_id = auth.uid() AND
    NOT EXISTS (
      SELECT 1 FROM public.class_students
      WHERE student_id = auth.uid()
    )
  );

-- Functions
-- Drop existing triggers and functions first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_exams_updated_at ON public.exams;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    'student' -- Luôn mặc định là student khi đăng ký, không cho user tự chọn
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger để tự động tạo profile khi user đăng ký
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function để cập nhật updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

