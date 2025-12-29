import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Violation {
  type: string
  description: string
  timestamp: string
}

interface UseAntiCheatOptions {
  onViolation?: (violation: Violation) => void
  maxViolations?: number
  onMaxViolations?: () => void
  requireFullscreen?: boolean
  attemptId?: string // Để lưu violations vào database
}

export function useAntiCheat(options: UseAntiCheatOptions = {}) {
  const {
    onViolation,
    maxViolations = 5,
    onMaxViolations,
    requireFullscreen = true,
    attemptId,
  } = options

  const [violations, setViolations] = useState<Violation[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFocused, setIsFocused] = useState(true)
  const [currentViolation, setCurrentViolation] = useState<Violation | null>(null)
  const violationCountRef = useRef(0)

  const addViolation = useCallback(async (type: string, description: string) => {
    const violation: Violation = {
      type,
      description,
      timestamp: new Date().toISOString(),
    }

    setViolations((prev) => [...prev, violation])
    setCurrentViolation(violation)
    violationCountRef.current += 1

    // Lưu violation vào database nếu có attemptId
    if (attemptId) {
      try {
        const { data: attempt } = await supabase
          .from('exam_attempts')
          .select('violations_data, violations_count')
          .eq('id', attemptId)
          .single()

        if (attempt) {
          const existingViolations = (attempt.violations_data as any[]) || []
          const updatedViolations = [...existingViolations, violation]
          
          await supabase
            .from('exam_attempts')
            .update({
              violations_data: updatedViolations,
              violations_count: updatedViolations.length,
            })
            .eq('id', attemptId)
        }
      } catch (error) {
        console.error('Error saving violation:', error)
      }
    }

    if (onViolation) {
      onViolation(violation)
    }

    // Ẩn thông báo sau 5 giây
    setTimeout(() => {
      setCurrentViolation(null)
    }, 5000)

    if (violationCountRef.current >= maxViolations && onMaxViolations) {
      onMaxViolations()
    }
  }, [attemptId, onViolation, maxViolations, onMaxViolations])

  // Fullscreen detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      )

      setIsFullscreen(isCurrentlyFullscreen)

      if (requireFullscreen && !isCurrentlyFullscreen) {
        addViolation('fullscreen_exit', 'Thoát chế độ toàn màn hình')
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [requireFullscreen])

  // Focus detection
  useEffect(() => {
    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => {
      setIsFocused(false)
      addViolation('window_blur', 'Mất focus khỏi cửa sổ')
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // Visibility detection (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        addViolation('tab_switch', 'Chuyển sang tab khác')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Reload detection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      addViolation('page_reload', 'Cố gắng reload trang')
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Right click prevention
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      addViolation('right_click', 'Chuột phải bị chặn')
    }

    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  // Copy prevention
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      addViolation('copy', 'Cố gắng copy nội dung')
    }

    document.addEventListener('copy', handleCopy)

    return () => {
      document.removeEventListener('copy', handleCopy)
    }
  }, [])

  // Paste prevention
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault()
      addViolation('paste', 'Cố gắng paste nội dung')
    }

    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [])

  // Text selection prevention
  useEffect(() => {
    const handleSelectStart = (e: Event) => {
      e.preventDefault()
    }

    document.addEventListener('selectstart', handleSelectStart)

    return () => {
      document.removeEventListener('selectstart', handleSelectStart)
    }
  }, [])

  // Keyboard shortcuts prevention
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault()
        addViolation('devtools', 'Cố gắng mở Developer Tools')
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Request fullscreen
  const requestFullscreen = async () => {
    try {
      const element = document.documentElement
      if (element.requestFullscreen) {
        await element.requestFullscreen()
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen()
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen()
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen()
      }
    } catch (error) {
      console.error('Error requesting fullscreen:', error)
    }
  }

  return {
    violations,
    isFullscreen,
    isFocused,
    violationCount: violationCountRef.current,
    currentViolation,
    requestFullscreen,
    addViolation, // Export để có thể thêm violation từ bên ngoài
  }
}

