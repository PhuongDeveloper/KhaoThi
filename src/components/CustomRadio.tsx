import { Check } from 'lucide-react'

interface CustomRadioProps {
  id: string
  name: string
  value: string
  checked: boolean
  onChange: () => void
  label: string
  className?: string
}

export default function CustomRadio({
  id,
  name,
  value,
  checked,
  onChange,
  label,
  className = '',
}: CustomRadioProps) {
  return (
    <label
      htmlFor={id}
      className={`
        flex items-center p-4 border-2 rounded-lg cursor-pointer 
        transition-all duration-300 relative overflow-hidden
        ${checked
          ? 'border-primary-600 bg-primary-50 shadow-md scale-[1.02]'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
        }
        ${className}
        group
      `}
    >
      {/* Background animation */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 
          opacity-0 transition-opacity duration-300
          ${checked ? 'opacity-5' : 'group-hover:opacity-3'}
        `}
      />

      {/* Radio button */}
      <div className="relative flex-shrink-0 mr-4">
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
            w-5 h-5 rounded-full border-2 flex items-center justify-center
            transition-all duration-300
            ${checked
              ? 'border-primary-600 bg-primary-600 scale-110'
              : 'border-gray-300 bg-white group-hover:border-primary-400'
            }
          `}
        >
          {checked && (
            <Check className="h-3 w-3 text-white animate-in fade-in zoom-in duration-200" />
          )}
          {/* Ripple effect */}
          {checked && (
            <div className="absolute inset-0 rounded-full bg-primary-400 animate-ping opacity-75" />
          )}
        </div>
      </div>

      {/* Label */}
      <span
        className={`
          text-gray-900 flex-1 transition-colors duration-300
          ${checked ? 'font-medium text-primary-900' : ''}
        `}
      >
        {label}
      </span>

      {/* Checkmark animation */}
      {checked && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
            <Check className="h-4 w-4 text-white" />
          </div>
        </div>
      )}
    </label>
  )
}

