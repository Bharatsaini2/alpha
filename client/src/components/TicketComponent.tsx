import { useEffect, useState, memo } from "react"

export const LastUpdatedTicker = memo(function LastUpdatedTicker({
  lastUpdated,
  format,
}: {
  lastUpdated: Date
  format: (sec: number) => string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const seconds = Math.floor((now - lastUpdated.getTime()) / 1000)
  return <span className="text-white font-medium">{format(seconds)}</span>
})
