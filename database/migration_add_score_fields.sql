-- Migration: Thêm các trường điểm cho từng phần và thang điểm
-- Thay thế passing_score (điểm đạt %) bằng total_score (thang điểm)
-- Thêm các trường điểm cho từng phần: multiple_choice_score, true_false_multi_score, short_answer_score
-- 
-- HƯỚNG DẪN: Chạy file này trong Supabase SQL Editor
-- 1. Mở Supabase Dashboard > SQL Editor
-- 2. Copy toàn bộ nội dung file này
-- 3. Paste vào SQL Editor và click Run

-- Thêm các cột mới vào bảng exams
DO $$ 
BEGIN
  -- Thêm total_score nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exams' 
    AND column_name = 'total_score'
  ) THEN
    ALTER TABLE public.exams ADD COLUMN total_score INTEGER DEFAULT 10;
  END IF;

  -- Thêm multiple_choice_score nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exams' 
    AND column_name = 'multiple_choice_score'
  ) THEN
    ALTER TABLE public.exams ADD COLUMN multiple_choice_score INTEGER DEFAULT 0;
  END IF;

  -- Thêm true_false_multi_score nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exams' 
    AND column_name = 'true_false_multi_score'
  ) THEN
    ALTER TABLE public.exams ADD COLUMN true_false_multi_score INTEGER DEFAULT 0;
  END IF;

  -- Thêm short_answer_score nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exams' 
    AND column_name = 'short_answer_score'
  ) THEN
    ALTER TABLE public.exams ADD COLUMN short_answer_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- Đổi points_earned từ INTEGER sang NUMERIC để hỗ trợ số thập phân
-- (Ví dụ: phần 4 đáp án có 25 câu và được giao 5 điểm => mỗi câu = 5/25 = 0.2 điểm)
DO $$ 
BEGIN
  -- Kiểm tra xem cột có phải là INTEGER không
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exam_responses' 
    AND column_name = 'points_earned'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.exam_responses 
    ALTER COLUMN points_earned TYPE NUMERIC(10, 2) USING points_earned::NUMERIC(10, 2);
  END IF;
END $$;

-- Đổi score từ INTEGER sang NUMERIC để hỗ trợ số thập phân
DO $$ 
BEGIN
  -- Kiểm tra xem cột có phải là INTEGER không
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exam_attempts' 
    AND column_name = 'score'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.exam_attempts 
    ALTER COLUMN score TYPE NUMERIC(10, 2) USING score::NUMERIC(10, 2);
  END IF;
END $$;

-- Cập nhật giá trị mặc định cho các exam đã tồn tại (nếu cần)
UPDATE public.exams 
SET total_score = 10 
WHERE total_score IS NULL;

-- Giữ lại passing_score để tương thích ngược (có thể dùng để tính điểm đạt)
-- Không cần thay đổi gì với passing_score

-- Xác nhận migration đã hoàn thành
SELECT 'Migration completed successfully! New columns added to exams table.' as status;

