/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string // [DEPRECATED] Không còn sử dụng — đã chuyển sang DeepSeek với cấu hình cứng
  readonly VITE_UPLOAD_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
