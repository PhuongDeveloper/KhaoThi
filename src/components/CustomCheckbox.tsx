import { Check } from 'lucide-react'

interface CustomCheckboxProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  className?: string
}

export default function CustomCheckbox({
  id,
  checked,
  onChange,
  label,
  className = '',
}: CustomCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={`
        flex items-center cursor-pointer group
        transition-all duration-300
        ${className}
      `}
    >
      <div className="relative flex-shrink-0 mr-3">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`
            w-5 h-5 rounded border-2 flex items-center justify-center
            transition-all duration-300
            ${checked
              ? 'border-primary-600 bg-primary-600 scale-110 shadow-md'
              : 'border-gray-300 bg-white group-hover:border-primary-400 group-hover:bg-gray-50'
            }
          `}
        >
          {checked && (
            <Check className="h-3.5 w-3.5 text-white animate-in fade-in zoom-in duration-200" />
          )}
        </div>
        {/* Ripple effect on check */}
        {checked && (
          <div className="absolute inset-0 rounded border-2 border-primary-400 animate-ping opacity-50" />
        )}
      </div>
      <span
        className={`
          text-sm transition-colors duration-300 select-none
          ${checked ? 'font-medium text-primary-700' : 'text-gray-700 group-hover:text-gray-900'}
        `}
      >
        {label}
      </span>
    </label>
  )
}

