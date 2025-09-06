import { useEffect, useState } from 'react'

export default function Admin() {
  const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  const [pending, setPending] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [gen, setGen] = useState({ round: 'Round 1', start_time: new Date().toISOString(), interval_minutes: 60 })

  async function load() {
    const token = localStorage.getItem('admin_token')
    const auth = token ? { 'Authorization': `Bearer ${token}` } : {}
    const [p, t] = await Promise.all([
      fetch(`${api}/players/pending`, { headers: auth }).then(r=>r.json()),
      fetch(`${api}/teams`).then(r=>r.json())
    ])
    setPending(p)
    setTeams(t)
  }
  useEffect(() => { load() }, [])

  async function approve(id: number) {
    const token = localStorage.getItem('admin_token')
    await fetch(`${api}/players/approve`, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ id }) })
    load()
  }
  async function reject(id: number) {
    const token = localStorage.getItem('admin_token')
    await fetch(`${api}/players/reject`, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ id }) })
    load()
  }

  async function generate() {
    const team_names = teams.map(t => t.name)
    const token = localStorage.getItem('admin_token')
    const res = await fetch(`${api}/matches/generate`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ team_names, ...gen }) })
    if (res.ok) alert('Generated matches')
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Admin</h1>
      <h2>Pending Players</h2>
      <ul>
        {pending.map(p => (
          <li key={p.id}>{p.name} ({p.ign})
            <button onClick={() => approve(p.id)} style={{ marginLeft: 8 }}>Approve</button>
            <button onClick={() => reject(p.id)} style={{ marginLeft: 8 }}>Reject</button>
          </li>
        ))}
      </ul>

      <h2>Teams</h2>
      <ul>
        {teams.map(t => (
          <li key={t.id}>{t.name} (Captain: {t.captain_discord_id})</li>
        ))}
      </ul>

      <h2>Generate Matches</h2>
      <div>
        <label>Round: </label>
        <input value={gen.round} onChange={e => setGen(prev => ({ ...prev, round: e.target.value }))} />
      </div>
      <div>
        <label>Start time (ISO): </label>
        <input value={gen.start_time} onChange={e => setGen(prev => ({ ...prev, start_time: e.target.value }))} />
      </div>
      <div>
        <label>Interval minutes: </label>
        <input type="number" value={gen.interval_minutes} onChange={e => setGen(prev => ({ ...prev, interval_minutes: Number(e.target.value) }))} />
      </div>
      <button onClick={generate}>Generate</button>
    </div>
  )
}


