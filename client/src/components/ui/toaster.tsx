import { useToast } from "@/hooks/use-toast"
import { useEffect, useRef, useCallback } from "react"
import { playChime, playError } from "@/lib/sfx"

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const lastPlayedRef = useRef<string | null>(null)

  const activeToast = toasts.length > 0 ? toasts[0] : null

  const handleDismiss = useCallback(() => {
    if (activeToast) dismiss(activeToast.id)
  }, [activeToast, dismiss])

  useEffect(() => {
    if (!activeToast) {
      lastPlayedRef.current = null
      return
    }
    if (lastPlayedRef.current !== activeToast.id) {
      lastPlayedRef.current = activeToast.id
      if (activeToast.variant === "destructive") {
        playError()
      } else {
        playChime()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(activeToast.id)
    }
    window.addEventListener("keydown", handleKeyDown)

    const timer = setTimeout(() => {
      dismiss(activeToast.id)
    }, 2500)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      clearTimeout(timer)
    }
  }, [activeToast, dismiss])

  if (!activeToast) return null

  const isDestructive = activeToast.variant === "destructive"

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      data-testid="popup-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss()
      }}
    >
      <div
        className="absolute inset-0 bg-black/60 -z-10"
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-sm mx-4 rounded-md border-2 p-5 shadow-lg ${
          isDestructive
            ? "border-red-500/60 bg-[#1a1a0a]"
            : "border-[#c8a964]/60 bg-[#1a2e1a]"
        }`}
        data-testid="popup-notification"
      >
        {activeToast.title && (
          <h3
            className={`font-['Press_Start_2P'] text-xs mb-2 ${
              isDestructive ? "text-red-400" : "text-[#c8a964]"
            }`}
            data-testid="popup-title"
          >
            {activeToast.title as string}
          </h3>
        )}
        {activeToast.description && (
          <p className="text-sm text-white/80" data-testid="popup-description">
            {activeToast.description as string}
          </p>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className={`mt-4 w-full py-3 px-4 text-xs font-['Press_Start_2P'] rounded border cursor-pointer select-none touch-manipulation ${
            isDestructive
              ? "border-red-500/40 text-red-400"
              : "border-[#c8a964]/40 text-[#c8a964]"
          }`}
          data-testid="popup-dismiss"
        >
          OK
        </button>
      </div>
    </div>
  )
}
