import { useRef, useState } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface CustomFileInputProps {
  value?: string // URL của ảnh hiện tại
  onChange: (file: File) => Promise<void>
  onRemove?: () => void
  accept?: string
  label?: string
}

export default function CustomFileInput({
  value,
  onChange,
  onRemove,
  accept = 'image/*',
  label = 'Hình ảnh (nếu có)',
}: CustomFileInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(value || null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Tạo preview ngay lập tức
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setIsUploading(true)
    try {
      await onChange(file)
    } catch (error) {
      setPreview(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = () => {
    setPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onRemove?.()
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>

      {preview ? (
        <div className="relative group">
          <div className="relative overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50 p-2 transition-all duration-300 hover:border-primary-400 hover:shadow-lg">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-48 object-contain rounded-md transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-300 rounded-lg" />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-600 hover:scale-110 transform shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-8 
            transition-all duration-300 cursor-pointer
            ${isUploading 
              ? 'border-primary-500 bg-primary-50' 
              : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50'
            }
            group
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />
          
          <div className="flex flex-col items-center justify-center space-y-3">
            {isUploading ? (
              <>
                <div className="relative">
                  <Upload className="h-12 w-12 text-primary-600 animate-bounce" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  </div>
                </div>
                <p className="text-sm font-medium text-primary-600">Đang upload...</p>
              </>
            ) : (
              <>
                <div className="p-4 bg-white rounded-full shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-110">
                  <ImageIcon className="h-8 w-8 text-gray-400 group-hover:text-primary-600 transition-colors duration-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors duration-300">
                    Click để chọn ảnh
                  </p>
                  <p className="text-xs text-gray-500 mt-1">hoặc kéo thả ảnh vào đây</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

