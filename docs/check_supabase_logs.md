# Hướng dẫn kiểm tra Logs trong Supabase

## Cách 1: Xem Postgres Logs (Chi tiết nhất)

1. Đăng nhập vào [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào menu **Logs** ở sidebar bên trái
4. Chọn **Postgres Logs**
5. Tìm các dòng có chứa:
   - `ERROR`
   - `infinite recursion`
   - `500`
   - Tên bảng: `exams`, `questions`, `profiles`

## Cách 2: Xem API Logs

1. Vào **Logs** > **API Logs**
2. Tìm các request có status `500`
3. Click vào request để xem chi tiết error message

## Cách 3: Xem Database Logs trong SQL Editor

Chạy query sau trong SQL Editor để xem logs gần đây:

```sql
-- Xem các lỗi gần đây
SELECT 
  log_time,
  error_severity,
  message,
  detail,
  hint
FROM pg_stat_statements 
WHERE query LIKE '%exams%' OR query LIKE '%recursion%'
ORDER BY log_time DESC
LIMIT 20;
```

## Cách 4: Test trực tiếp trong SQL Editor

Chạy query này để test xem có lỗi recursion không:

```sql
-- Test query exams với joins (giống như code đang làm)
SELECT 
  e.*,
  s.name as subject_name,
  p.full_name as teacher_name
FROM public.exams e
LEFT JOIN public.subjects s ON e.subject_id = s.id
LEFT JOIN public.profiles p ON e.teacher_id = p.id
LIMIT 1;
```

Nếu query này báo lỗi "infinite recursion", thì đó chính là vấn đề.

## Cách 5: Kiểm tra Policies hiện tại

Chạy query này để xem tất cả policies:

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('exams', 'questions', 'profiles')
ORDER BY tablename, policyname;
```

## Thông tin cần lấy

Khi kiểm tra logs, hãy copy các thông tin sau:

1. **Error message đầy đủ** (nếu có)
2. **Stack trace** (nếu có)
3. **Tên policy gây lỗi** (nếu có)
4. **Query đang chạy khi lỗi** (nếu có)
5. **Timestamp** của lỗi

Sau đó gửi cho tôi để tôi có thể sửa chính xác hơn.

