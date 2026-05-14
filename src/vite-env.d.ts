/// <reference types="vite/client" />

interface ImportMetaEnv {
<<<<<<< HEAD
  readonly VITE_GEMINI_API_KEY: string
=======
  readonly VITE_GEMINI_API_KEY: string // [DEPRECATED] Không còn sử dụng — đã chuyển sang DeepSeek với cấu hình cứng
>>>>>>> 2ebbff9 (update)
  readonly VITE_UPLOAD_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

