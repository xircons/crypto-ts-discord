import { useState } from 'react'

export default function RegisterTeam() {
  const [form, setForm] = useState({ name: '', logo: '', captain_discord_id: '', players: '' })
  const [msg, setMsg] = useState('')
  const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  return (
    <div style={{ padding: 16 }}>
      <h1>Register Team</h1>
      <form onSubmit={async (e) => {
        e.preventDefault()
        setMsg('')
        const payload = { ...form, players: form.players.split(',').map(s => s.trim()).filter(Boolean) }
        const res = await fetch(`${api}/register/team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        setMsg(res.ok ? 'Submitted!' : 'Failed')
      }}>
        {['name','logo','captain_discord_id','players'].map(k => (
          <div key={k} style={{ marginBottom: 8 }}>
            <label>{k}: </label>
            <input value={(form as any)[k]} onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))} />
          </div>
        ))}
        <button type="submit">Submit</button>
      </form>
      <div>{msg}</div>
    </div>
  )
}


