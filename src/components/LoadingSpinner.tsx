import Loader from './Loader'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={sizeClasses[size]}>
        <Loader />
      </div>
    </div>
  )
}

