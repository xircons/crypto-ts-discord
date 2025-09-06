import { useState } from 'react'

export default function RegisterPlayer() {
  const [form, setForm] = useState({ name: '', ign: '', discord_id: '', riot_id: '', eligibility_doc: '' })
  const [msg, setMsg] = useState('')
  const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  return (
    <div style={{ padding: 16 }}>
      <h1>Register Player</h1>
      <form onSubmit={async (e) => {
        e.preventDefault()
        setMsg('')
        const res = await fetch(`${api}/register/player`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        setMsg(res.ok ? 'Submitted!' : 'Failed')
      }}>
        {['name','ign','discord_id','riot_id','eligibility_doc'].map(k => (
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


