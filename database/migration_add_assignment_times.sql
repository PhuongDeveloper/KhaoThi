-- Migration: Thêm start_time và end_time vào exam_assignments để hỗ trợ giao bài nhiều lần
-- Mỗi assignment có thể có thời gian riêng

DO $$ 
BEGIN
  -- Thêm start_time vào exam_assignments nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exam_assignments' 
    AND column_name = 'start_time'
  ) THEN
    ALTER TABLE public.exam_assignments 
    ADD COLUMN start_time TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Thêm end_time vào exam_assignments nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exam_assignments' 
    AND column_name = 'end_time'
  ) THEN
    ALTER TABLE public.exam_assignments 
    ADD COLUMN end_time TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

