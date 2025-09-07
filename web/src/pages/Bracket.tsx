import { useMemo } from 'react'

export default function Bracket() {
  const tournament = import.meta.env.VITE_CHALLONGE_TOURNAMENT_ID || ''
  const embedUrl = useMemo(() => {
    if (!tournament) return ''
    // Challonge module embed: https://challonge.com/{tournament}/module
    // If tournament includes organization prefix, Challonge uses hyphenated path like org-tournament/module
    return `https://challonge.com/${tournament}/module`
  }, [tournament])

  if (!tournament) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Bracket</h1>
        <p>Challonge tournament not configured. Set VITE_CHALLONGE_TOURNAMENT_ID in your web .env.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 0, height: '100vh' }}>
      <iframe
        title="Challonge Bracket"
        src={embedUrl}
        style={{ width: '100%', height: '100%', border: 0 }}
        allowTransparency={true as any}
        scrolling="auto"
      />
    </div>
  )
}


