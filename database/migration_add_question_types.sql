-- Migration: Thêm 3 loại câu hỏi theo đề thi tốt nghiệp THPT Quốc Gia 2025
-- 1. multiple_choice: Trắc nghiệm 4 phương án lựa chọn
-- 2. true_false_multi: Trắc nghiệm đúng/sai (1 ngữ liệu + 4 ý a, b, c, d)
-- 3. short_answer: Trắc nghiệm trả lời ngắn (1 số cụ thể, 4 ô nhập)

-- Cập nhật bảng questions
ALTER TABLE public.questions 
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check 
  CHECK (question_type IN ('multiple_choice', 'true_false_multi', 'short_answer'));

-- Thêm cột image_url cho hình ảnh câu hỏi
ALTER TABLE public.questions 
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Thêm cột correct_answer cho đáp án số (short_answer)
ALTER TABLE public.questions 
  ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- Cập nhật bảng exam_responses để lưu text_answer cho short_answer
ALTER TABLE public.exam_responses 
  ADD COLUMN IF NOT EXISTS text_answer TEXT;

-- Comment
COMMENT ON COLUMN public.questions.image_url IS 'URL hình ảnh cho câu hỏi (nếu có)';
COMMENT ON COLUMN public.questions.correct_answer IS 'Đáp án đúng cho câu hỏi trả lời ngắn (short_answer), format: "1234" hoặc "12.34" hoặc "-12.34"';
COMMENT ON COLUMN public.exam_responses.text_answer IS 'Đáp án dạng text cho câu hỏi trả lời ngắn (short_answer)';

