-- Script để tắt RLS cho bảng exams
-- CHỈ DÙNG KHI CẦN THIẾT - KHÔNG KHUYẾN NGHỊ CHO PRODUCTION

-- Tắt RLS cho exams
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;

-- Kiểm tra
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'exams';

-- Nếu muốn bật lại RLS sau này:
-- ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

