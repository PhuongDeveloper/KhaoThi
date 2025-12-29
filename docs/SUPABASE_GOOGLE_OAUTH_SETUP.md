# Hướng dẫn cấu hình Google OAuth trong Supabase

Hướng dẫn này sẽ giúp bạn thiết lập đăng nhập với Google trong Supabase cho hệ thống thi trắc nghiệm.

## Bước 1: Tạo OAuth Client trong Google Cloud Console

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo một dự án mới hoặc chọn dự án hiện có
3. Điều hướng đến **APIs & Services** > **Credentials**
4. Nhấp vào **Create Credentials** > **OAuth client ID**
5. Nếu chưa có, bạn sẽ được yêu cầu cấu hình **OAuth consent screen**:
   - Chọn **External** (hoặc Internal nếu dùng Google Workspace)
   - Điền thông tin ứng dụng:
     - **App name**: PTDTNT ATK Sơn Dương - Hệ thống Thi trắc nghiệm
     - **User support email**: Email của bạn
     - **Developer contact information**: Email của bạn
   - Thêm **Scopes**: Chọn `.../auth/userinfo.email` và `.../auth/userinfo.profile`
   - Thêm **Test users** (nếu cần)
   - Nhấn **Save and Continue** cho đến khi hoàn tất

6. Tạo **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Name**: Supabase OAuth Client
   - **Authorized JavaScript origins**: 
     ```
     https://<your-project-ref>.supabase.co
     ```
     (Thay `<your-project-ref>` bằng Project Reference của bạn trong Supabase)
   - **Authorized redirect URIs**:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - Nhấn **Create**

7. **Lưu lại**:
   - **Client ID**: Sẽ dùng trong Supabase
   - **Client Secret**: Sẽ dùng trong Supabase

## Bước 2: Cấu hình Google OAuth trong Supabase

1. Đăng nhập vào [Supabase Dashboard](https://app.supabase.com/)
2. Chọn dự án của bạn
3. Điều hướng đến **Authentication** > **Providers**
4. Tìm và bật **Google** provider
5. Điền thông tin:
   - **Client ID (for OAuth)**: Dán Client ID từ Google Cloud Console
   - **Client Secret (for OAuth)**: Dán Client Secret từ Google Cloud Console
6. Nhấn **Save**

## Bước 3: Cấu hình Redirect URLs

### 3.1. Cấu hình trong Supabase

1. Trong Supabase Dashboard, điều hướng đến **Authentication** > **URL Configuration**
2. Thêm **Redirect URLs**:
   - Development: `http://localhost:5173/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
   - (Thay `your-domain.com` bằng domain thực tế của bạn)

### 3.2. Cấu hình trong Google Cloud Console (Để hiển thị domain của bạn)

**Quan trọng**: Để Google hiển thị domain của bạn thay vì `supabase.co`, bạn cần:

1. Vào **Google Cloud Console** > **APIs & Services** > **Credentials**
2. Chọn OAuth 2.0 Client ID của bạn
3. Trong phần **Authorized redirect URIs**, thêm:
   ```
   https://your-domain.com/auth/callback
   ```
   (Thay `your-domain.com` bằng domain thực tế của bạn)

4. **Lưu ý**: Bạn vẫn cần giữ redirect URI của Supabase:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

5. Trong code, cập nhật `redirectTo` trong `signInWithGoogle` để dùng domain của bạn:
   ```typescript
   redirectTo: `${window.location.origin}/auth/callback`
   ```
   (Code đã được cấu hình tự động dựa trên domain hiện tại)

**Lưu ý**: 
- Nếu bạn chưa có domain riêng, bạn có thể sử dụng domain của Vercel/Netlify (ví dụ: `your-app.vercel.app`)
- Google sẽ hiển thị domain từ redirect URI, vì vậy nếu bạn dùng domain của mình, nó sẽ hiển thị domain đó

## Bước 4: Cấu hình Database Trigger (Tự động tạo profile)

Đảm bảo trigger `handle_new_user` đã được tạo trong database để tự động tạo profile khi user đăng nhập lần đầu với Google.

Kiểm tra trong Supabase SQL Editor:

```sql
-- Kiểm tra function đã tồn tại
SELECT * FROM pg_proc WHERE proname = 'handle_new_user';

-- Nếu chưa có, chạy script này:
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tạo trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Bước 5: Kiểm tra và Test

1. Chạy ứng dụng: `npm run dev`
2. Truy cập trang đăng nhập
3. Nhấn nút **"Đăng nhập với Google"**
4. Chọn tài khoản Google
5. Cho phép quyền truy cập
6. Kiểm tra xem có redirect về trang dashboard đúng không

## Xử lý lỗi thường gặp

### Lỗi: "redirect_uri_mismatch"
- **Nguyên nhân**: Redirect URI trong Google Cloud Console không khớp với Supabase
- **Giải pháp**: Đảm bảo redirect URI trong Google Cloud Console là:
  ```
  https://<your-project-ref>.supabase.co/auth/v1/callback
  ```

### Lỗi: "Invalid client"
- **Nguyên nhân**: Client ID hoặc Client Secret sai
- **Giải pháp**: Kiểm tra lại thông tin trong Supabase Dashboard

### Lỗi: Profile không được tạo tự động
- **Nguyên nhân**: Trigger `handle_new_user` chưa được tạo hoặc có lỗi
- **Giải pháp**: Chạy lại script SQL ở Bước 4

### User đăng nhập nhưng không có profile
- **Giải pháp**: Chạy script này để tạo profile cho user hiện có:
```sql
-- Tạo profile cho các user chưa có
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  COALESCE(raw_user_meta_data->>'role', 'student')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
```

## Lưu ý bảo mật

1. **Không commit Client Secret** vào Git
2. **Sử dụng biến môi trường** nếu cần (Supabase tự quản lý)
3. **Kiểm tra OAuth consent screen** đã được phê duyệt (nếu dùng production)
4. **Giới hạn redirect URLs** chỉ cho domain của bạn

## Tài liệu tham khảo

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Google Provider Setup](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Hỗ trợ

Nếu gặp vấn đề, kiểm tra:
1. Console logs trong browser
2. Supabase Dashboard > Logs
3. Google Cloud Console > APIs & Services > OAuth consent screen

