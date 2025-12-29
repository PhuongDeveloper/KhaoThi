-- Fix RLS policy for exam_attempts to allow updating from in_progress to submitted/violation
-- This allows students to submit their exams

DROP POLICY IF EXISTS "Students can update own in-progress attempts" ON public.exam_attempts;

-- Allow students to update their own attempts when status is in_progress
-- This includes updating to submitted or violation status
CREATE POLICY "Students can update own in-progress attempts" ON public.exam_attempts
  FOR UPDATE 
  USING (
    student_id = auth.uid() 
    AND status = 'in_progress'
  )
  WITH CHECK (
    student_id = auth.uid()
    AND (status = 'in_progress' OR status = 'submitted' OR status = 'violation' OR status = 'timeout')
  );

