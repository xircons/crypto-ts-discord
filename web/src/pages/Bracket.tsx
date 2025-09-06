import { useEffect, useState } from 'react'

type Bracket = Record<string, { id:number; team_a:string; team_b:string; round:string; time:string; status:string; result?:string }[]>

export default function Bracket() {
  const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  const [data, setData] = useState<Bracket>({})
  useEffect(() => { fetch(`${api}/bracket`).then(r=>r.json()).then(setData).catch(()=>{}) }, [])
  const rounds = Object.keys(data)
  return (
    <div style={{ padding: 16 }}>
      <h1>Bracket</h1>
      {rounds.length === 0 && <div>No data</div>}
      <div style={{ display: 'flex', gap: 24 }}>
        {rounds.map(r => (
          <div key={r}>
            <h3>{r}</h3>
            <ul>
              {data[r].map(m => (
                <li key={m.id}>{m.team_a} vs {m.team_b} @ {new Date(m.time).toLocaleString()} [{m.status}{m.result ? `: ${m.result}` : ''}]</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}


