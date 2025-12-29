import { useState, useCallback } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export function useConfirm() {
  const [confirmState, setConfirmState] = useState<ConfirmOptions & { isOpen: boolean; onConfirm: (() => void) | null }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        ...options,
        isOpen: true,
        onConfirm: () => {
          setConfirmState((prev) => ({ ...prev, isOpen: false, onConfirm: null }))
          resolve(true)
        },
      })
    })
  }, [])

  const cancel = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false, onConfirm: null }))
  }, [])

  return {
    confirm,
    cancel,
    confirmState,
  }
}

