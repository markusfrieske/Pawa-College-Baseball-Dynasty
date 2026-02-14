import { useToast } from "@/hooks/use-toast"
import { useEffect, useRef } from "react"
import { playChime, playError } from "@/lib/sfx"

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const lastPlayedRef = useRef<string | null>(null)

  const activeToast = toasts.length > 0 ? toasts[0] : null

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
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeToast, dismiss])

  if (!activeToast) return null

  const isDestructive = activeToast.variant === "destructive"

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      data-testid="popup-overlay"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => dismiss(activeToast.id)}
      />
      <div
        className={`relative z-10 w-full max-w-sm mx-4 rounded-md border-2 p-5 shadow-lg ${
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
          onClick={() => dismiss(activeToast.id)}
          className={`mt-4 w-full py-2 px-4 text-xs font-['Press_Start_2P'] rounded border ${
            isDestructive
              ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
              : "border-[#c8a964]/40 text-[#c8a964] hover:bg-[#c8a964]/10"
          }`}
          data-testid="popup-dismiss"
        >
          OK
        </button>
      </div>
    </div>
  )
}
