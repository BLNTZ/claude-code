// Local date, not UTC — 24h rolling wave across timezones. Sustained Twitter
// buzz instead of a single UTC-midnight spike, gentler on soul-gen load.
// Teaser window: April 1-7, 2026 only. Command stays live forever after.
//
// Kept free of React/ink imports so the eagerly-loaded /buddy command metadata
// can gate on it without pulling the renderer into startup.
export function isBuddyTeaserWindow(): boolean {
  if ("external" === 'ant') return true
  const d = new Date()
  return d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() <= 7
}

export function isBuddyLive(): boolean {
  if ("external" === 'ant') return true
  const d = new Date()
  return (
    d.getFullYear() > 2026 || (d.getFullYear() === 2026 && d.getMonth() >= 3)
  )
}
