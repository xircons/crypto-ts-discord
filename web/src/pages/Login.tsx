import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch(`${api}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) {
      const data = await res.json()
      localStorage.setItem('admin_token', data.token)
      nav('/admin')
    } else {
      setMsg('Login failed')
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Admin Login</h1>
      <form onSubmit={submit}>
        <div>
          <label>Username: </label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div>
          <label>Password: </label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button type="submit">Login</button>
      </form>
      <div>{msg}</div>
    </div>
  )
}


