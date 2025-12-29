# Hệ thống Thi Trắc nghiệm Trực tuyến - PTDTNT ATK Sơn Dương

Hệ thống thi trắc nghiệm trực tuyến được xây dựng cho trường PTDTNT ATK Sơn Dương, hỗ trợ kiểm tra - đánh giá học sinh với các tính năng chống gian lận và tích hợp AI.

## 🚀 Tính năng chính

### Đối với Quản trị viên
- Quản lý người dùng (học sinh, giáo viên)
- Quản lý môn học
- Xem tổng quan toàn bộ hệ thống

### Đối với Giáo viên
- Tạo và quản lý bài thi trắc nghiệm
- Sinh câu hỏi tự động bằng AI (Google Gemini)
- Phân công bài thi cho học sinh
- Xem kết quả và phân tích từ AI
- Thống kê chi tiết

### Đối với Học sinh
- Xem danh sách bài thi được giao
- Làm bài thi với đồng hồ đếm ngược
- Xem kết quả và lịch sử làm bài

### Tính năng chống gian lận
- Bắt buộc fullscreen khi làm bài
- Phát hiện thoát tab, chuyển cửa sổ
- Chặn chuột phải, copy, paste
- Ghi nhận và cảnh báo vi phạm
- Xáo trộn câu hỏi và đáp án
- Tự động nộp bài khi vi phạm quá nhiều

### Tích hợp AI (Google Gemini)
- Sinh câu hỏi trắc nghiệm từ văn bản
- Gợi ý mức độ khó (dễ/trung bình/khó)
- Phân tích kết quả thi để phát hiện bất thường
- Tóm tắt báo cáo bằng ngôn ngữ tự nhiên

## 🛠️ Công nghệ sử dụng

- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS
- **Backend**: Supabase (Auth, Database, Storage)
- **AI**: Google Gemini API
- **State Management**: Zustand
- **Routing**: React Router DOM
- **UI Components**: Lucide React Icons

## 📋 Yêu cầu hệ thống

- Node.js >= 18.0.0
- npm hoặc yarn
- Tài khoản Supabase
- Google Gemini API Key

## 🔧 Cài đặt

### 1. Clone repository

```bash
git clone <repository-url>
cd KhaoThi
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình môi trường

Tạo file `.env` trong thư mục gốc:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_UPLOAD_API_KEY=your_upload_api_key
```

### 4. Thiết lập Supabase

1. Tạo project mới trên [Supabase](https://supabase.com)
2. Vào SQL Editor và chạy file `database/schema.sql` để tạo database schema và RLS policies
   - **Nếu bảng đã tồn tại và gặp lỗi**: Chạy `database/setup_complete.sql` để setup lại toàn bộ policies và functions
   - **Nếu muốn reset hoàn toàn**: Chạy `database/reset_schema.sql` trước (sẽ xóa tất cả dữ liệu)
3. Lấy `Project URL` và `anon public key` từ Settings > API

**Lưu ý**: Nếu gặp lỗi 500 khi query exams/exam_attempts, chạy `database/setup_complete.sql` để đảm bảo tất cả functions và policies được tạo đúng.

### 5. Lấy Google Gemini API Key

1. Truy cập [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Tạo API key mới
3. Copy API key vào file `.env`

### 6. Lấy API Key Upload Ảnh

1. Truy cập [upanhnhanh.com](https://upanhnhanh.com) để đăng ký và lấy API key
2. Copy API key vào file `.env` với key `VITE_UPLOAD_API_KEY`

## 🚀 Chạy ứng dụng

### Development

```bash
npm run dev
```

Ứng dụng sẽ chạy tại `http://localhost:5173`

### Build cho production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## 📦 Deploy

### Deploy Frontend lên Vercel

**Cách 1: Deploy qua GitHub (Khuyến nghị)**

1. Đẩy code lên GitHub repository
2. Đăng nhập [Vercel](https://vercel.com) và kết nối với GitHub
3. Click "New Project" và chọn repository của bạn
4. Vercel sẽ tự động detect framework (Vite)
5. Thêm các biến môi trường trong Settings > Environment Variables:
   - `VITE_SUPABASE_URL` - URL của Supabase project
   - `VITE_SUPABASE_ANON_KEY` - Anon key của Supabase
   - `VITE_GEMINI_API_KEY` - Google Gemini API key
   - `VITE_UPLOAD_API_KEY` - API key cho upload ảnh (nếu có)
6. Click "Deploy"

**Cách 2: Deploy qua Vercel CLI**

```bash
# Cài đặt Vercel CLI
npm i -g vercel

# Đăng nhập
vercel login

# Deploy
vercel

# Deploy production
vercel --prod
```

**Lưu ý khi deploy:**
- Vercel sẽ tự động detect Vite và cấu hình build
- File `vercel.json` đã được tạo để đảm bảo routing đúng cho SPA
- Tất cả các biến môi trường phải có prefix `VITE_` để Vite có thể expose chúng
- Sau khi deploy, cần cập nhật Supabase Auth redirect URLs để thêm domain của Vercel

**Cấu hình Supabase sau khi deploy:**

1. Vào Supabase Dashboard > Authentication > URL Configuration
2. Thêm domain Vercel vào "Redirect URLs":
   - `https://your-project.vercel.app/auth/callback`
   - `https://your-project.vercel.app/*`
3. Thêm domain vào "Site URL" nếu cần

### Backend (Supabase)

Backend đã được host trên Supabase, không cần deploy thêm. Chỉ cần đảm bảo:
- Database schema đã được chạy (`database/schema.sql`)
- RLS policies đã được thiết lập đúng
- Storage buckets đã được tạo (nếu cần)

## 📁 Cấu trúc thư mục

```
KhaoThi/
├── database/
│   └── schema.sql          # Database schema và RLS policies
├── src/
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   ├── layouts/            # Layout components
│   ├── lib/                # Utilities và API clients
│   │   ├── api/            # API functions
│   │   └── supabase.ts     # Supabase client
│   ├── pages/              # Page components
│   │   ├── admin/          # Admin pages
│   │   ├── auth/            # Authentication pages
│   │   ├── student/        # Student pages
│   │   └── teacher/        # Teacher pages
│   ├── store/              # Zustand stores
│   ├── App.tsx             # Main App component
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles
├── .env.example            # Example environment variables
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 🔐 Phân quyền

Hệ thống có 3 vai trò chính:

- **Admin**: Toàn quyền quản lý hệ thống
- **Teacher**: Tạo và quản lý bài thi, xem kết quả
- **Student**: Làm bài thi, xem kết quả của mình

Phân quyền được thực hiện thông qua:
- Row Level Security (RLS) policies trong Supabase
- Protected routes trong frontend
- Role-based access control

## 🛡️ Bảo mật

- API keys được lưu trong biến môi trường
- RLS policies đảm bảo học sinh chỉ xem dữ liệu của mình
- Giáo viên chỉ quản lý bài thi do mình tạo
- Tất cả requests đều qua Supabase với authentication

## 📝 Sử dụng

### Tạo bài thi (Giáo viên)

1. Đăng nhập với tài khoản giáo viên
2. Vào "Bài thi" > "Tạo bài thi mới"
3. Điền thông tin bài thi
4. Sử dụng AI để sinh câu hỏi hoặc thêm thủ công
5. Lưu và xuất bản bài thi

### Làm bài thi (Học sinh)

1. Đăng nhập với tài khoản học sinh
2. Vào "Bài thi" > Chọn bài thi
3. Click "Làm bài"
4. Hệ thống sẽ yêu cầu fullscreen
5. Làm bài và nộp khi hoàn thành

### Xem kết quả (Giáo viên)

1. Vào "Bài thi" > Chọn bài thi
2. Click "Xem kết quả"
3. Xem danh sách học sinh đã làm
4. Click icon phân tích để xem phân tích từ AI

## ⚠️ Lưu ý

- Hệ thống chống gian lận có thể ảnh hưởng đến trải nghiệm người dùng
- Cần có kết nối internet ổn định
- Gemini API có giới hạn số lần gọi mỗi ngày (100 lần/giáo viên)
- Nên test kỹ trước khi sử dụng trong môi trường thực tế

## 📄 License

Dự án này được phát triển cho trường PTDTNT ATK Sơn Dương.

## 👥 Liên hệ

Nếu có vấn đề hoặc câu hỏi, vui lòng liên hệ quản trị viên hệ thống.

