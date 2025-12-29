# Hướng dẫn chạy Migration

## Migration: Thêm các trường điểm cho từng phần

File migration: `migration_add_score_fields.sql`

## Cách chạy migration trong Supabase

### Bước 1: Mở Supabase SQL Editor
1. Đăng nhập vào [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào menu **SQL Editor** ở sidebar bên trái
4. Click **New query**

### Bước 2: Copy và chạy migration
1. Mở file `database/migration_add_score_fields.sql`
2. Copy toàn bộ nội dung
3. Paste vào SQL Editor trong Supabase
4. Click **Run** hoặc nhấn `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)

### Bước 3: Kiểm tra kết quả
Chạy query sau để kiểm tra xem các cột đã được thêm chưa:

```sql
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'exams'
  AND column_name IN ('total_score', 'multiple_choice_score', 'true_false_multi_score', 'short_answer_score')
ORDER BY column_name;
```

Nếu thấy 4 cột trong kết quả, migration đã thành công!

## Nếu gặp lỗi

### Lỗi: "column already exists"
- Có thể một số cột đã tồn tại, migration sẽ bỏ qua nhờ `IF NOT EXISTS`
- Tiếp tục chạy phần còn lại

### Lỗi: "cannot alter type of column"
- Nếu bảng `exam_responses` hoặc `exam_attempts` đã có dữ liệu, có thể cần xử lý khác
- Chạy từng lệnh ALTER TABLE một cách riêng biệt

### Lỗi: "schema cache"
- Sau khi chạy migration, đợi vài giây để Supabase cập nhật schema cache
- Refresh lại trang ứng dụng
- Nếu vẫn lỗi, thử restart Supabase project (Settings > General > Restart project)

## Kiểm tra sau migration

Chạy query này để xem cấu trúc bảng `exams`:

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'exams'
ORDER BY ordinal_position;
```

