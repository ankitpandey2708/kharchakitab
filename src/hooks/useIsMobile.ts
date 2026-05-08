import { useState, useEffect } from "react"

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(pointer: coarse)").matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}
