-- Migration script để thêm tính năng lớp học
-- Chạy script này sau khi đã có schema.sql cơ bản

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

-- Thêm class_id vào profiles (nếu chưa có)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'class_id'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Thêm class_id vào exam_assignments (nếu chưa có)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exam_assignments' 
    AND column_name = 'class_id'
  ) THEN
    ALTER TABLE public.exam_assignments 
    ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;
    
    -- Xóa unique constraint cũ và tạo lại với class_id
    ALTER TABLE public.exam_assignments 
    DROP CONSTRAINT IF EXISTS exam_assignments_exam_id_student_id_key;
    
    ALTER TABLE public.exam_assignments 
    ADD CONSTRAINT exam_assignments_unique UNIQUE(exam_id, student_id, class_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classes_homeroom_teacher ON public.classes(homeroom_teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class ON public.class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_class ON public.profiles(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_class ON public.exam_assignments(class_id);

-- Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Everyone can view classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view own class" ON public.classes;
DROP POLICY IF EXISTS "Everyone can view class students" ON public.class_students;
DROP POLICY IF EXISTS "Admins can manage class students" ON public.class_students;
DROP POLICY IF EXISTS "Teachers can manage class students" ON public.class_students;
DROP POLICY IF EXISTS "Students can view own class membership" ON public.class_students;
DROP POLICY IF EXISTS "Students can join class once" ON public.class_students;

-- Classes policies
CREATE POLICY "Everyone can view classes" ON public.classes
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage classes" ON public.classes
  FOR ALL USING (public.is_user_role('admin'));

CREATE POLICY "Teachers can view classes" ON public.classes
  FOR SELECT USING (
    public.is_user_role('teacher') OR
    homeroom_teacher_id = auth.uid()
  );

CREATE POLICY "Students can view own class" ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.class_students
      WHERE class_id = classes.id AND student_id = auth.uid()
    )
  );

-- Class students policies
CREATE POLICY "Everyone can view class students" ON public.class_students
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage class students" ON public.class_students
  FOR ALL USING (public.is_user_role('admin'));

CREATE POLICY "Teachers can manage class students" ON public.class_students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE classes.id = class_students.class_id 
      AND (classes.homeroom_teacher_id = auth.uid() OR public.is_user_role('teacher'))
    )
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

-- Function để tự động cập nhật total_students khi thêm/xóa học sinh
CREATE OR REPLACE FUNCTION public.update_class_total_students()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.classes
    SET total_students = (
      SELECT COUNT(*) FROM public.class_students
      WHERE class_id = NEW.class_id
    )
    WHERE id = NEW.class_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.classes
    SET total_students = (
      SELECT COUNT(*) FROM public.class_students
      WHERE class_id = OLD.class_id
    )
    WHERE id = OLD.class_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger để tự động cập nhật total_students
DROP TRIGGER IF EXISTS trigger_update_class_total_students ON public.class_students;
CREATE TRIGGER trigger_update_class_total_students
  AFTER INSERT OR DELETE ON public.class_students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_class_total_students();

