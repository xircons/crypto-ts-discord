import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import Schedule from './pages/Schedule.tsx'
import RegisterPlayer from './pages/RegisterPlayer.tsx'
import RegisterTeam from './pages/RegisterTeam.tsx'
import Admin from './pages/Admin.tsx'
import Bracket from './pages/Bracket.tsx'
import Login from './pages/Login.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/schedule', element: <Schedule /> },
  { path: '/register/player', element: <RegisterPlayer /> },
  { path: '/register/team', element: <RegisterTeam /> }
  ,{ path: '/admin', element: <Admin /> }
  ,{ path: '/bracket', element: <Bracket /> }
  ,{ path: '/login', element: <Login /> }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
