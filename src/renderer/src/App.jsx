import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'

const Placeholder = ({ title }) => (
  <div className="view">
    <div className="topbar"><h1>{title}</h1></div>
  </div>
)

const VIEWS = {
  repo: () => <Placeholder title="Repo local" />,
  commits: () => <Placeholder title="Mis commits" />,
  branches: () => <Placeholder title="Buscar ramas" />,
  settings: () => <Placeholder title="Ajustes" />
}

export default function App() {
  const [active, setActive] = useState('repo')
  const View = VIEWS[active]
  return (
    <div className="app">
      <Sidebar active={active} onChange={setActive} />
      <main className="content"><View /></main>
    </div>
  )
}
