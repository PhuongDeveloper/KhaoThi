import { Check, X } from 'lucide-react'

interface CustomTrueFalseRadioProps {
  id: string
  name: string
  value: 'true' | 'false'
  checked: boolean
  onChange: () => void
  label: 'Đúng' | 'Sai'
}

export default function CustomTrueFalseRadio({
  id,
  name,
  value,
  checked,
  onChange,
  label,
}: CustomTrueFalseRadioProps) {
  const isTrue = value === 'true'
  
  return (
    <label
      htmlFor={id}
      className={`
        flex items-center cursor-pointer group relative
        transition-all duration-300
      `}
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div
        className={`
          w-6 h-6 rounded-full border-2 flex items-center justify-center
          transition-all duration-300 mr-2
          ${checked
            ? isTrue
              ? 'border-green-600 bg-green-600 scale-110 shadow-md'
              : 'border-red-600 bg-red-600 scale-110 shadow-md'
            : isTrue
            ? 'border-gray-300 bg-white group-hover:border-green-400 group-hover:bg-green-50'
            : 'border-gray-300 bg-white group-hover:border-red-400 group-hover:bg-red-50'
          }
        `}
      >
        {checked && (
          <div className="animate-in fade-in zoom-in duration-200">
            {isTrue ? (
              <Check className="h-4 w-4 text-white" />
            ) : (
              <X className="h-4 w-4 text-white" />
            )}
          </div>
        )}
        {/* Ripple effect */}
        {checked && (
          <div
            className={`
              absolute inset-0 rounded-full animate-ping opacity-75
              ${isTrue ? 'bg-green-400' : 'bg-red-400'}
            `}
          />
        )}
      </div>
      <span
        className={`
          font-medium transition-colors duration-300 select-none
          ${checked
            ? isTrue
              ? 'text-green-700'
              : 'text-red-700'
            : 'text-gray-600 group-hover:text-gray-900'
          }
        `}
      >
        {label}
      </span>
    </label>
  )
}

