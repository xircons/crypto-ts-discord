import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

type Match = { id: number; team_a: string; team_b: string; round: string; time: string; status?: string }

export default function Schedule() {
  const [matches, setMatches] = useState<Match[]>([])

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/matches/upcoming`)
      .then(r => r.json()).then(setMatches).catch(() => {})
    const socket: Socket = io(import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000')
    socket.on('match_created', (m: Match) => setMatches(prev => [...prev, m]))
    socket.on('match_confirmed', ({ id }: { id: number }) => setMatches(prev => prev.filter(x => x.id !== id)))
    return () => { socket.close() }
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h1>Upcoming Matches</h1>
      <ul>
        {matches.map(m => (
          <li key={m.id}>{m.team_a} vs {m.team_b} ({m.round}) at {new Date(m.time).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  )
}


