import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import RepoView from './views/RepoView.jsx'
import CommitsView from './views/CommitsView.jsx'
import SettingsView from './views/SettingsView.jsx'

const Placeholder = ({ title }) => (
  <div className="view">
    <div className="topbar"><h1>{title}</h1></div>
  </div>
)

const VIEWS = {
  repo: RepoView,
  commits: CommitsView,
  branches: () => <Placeholder title="Buscar ramas" />,
  settings: SettingsView
}

export default function App() {
  const [active, setActive] = useState('repo')
  return (
    <div className="app">
      <Sidebar active={active} onChange={setActive} />
      <main className="content">
        {/* Views stay mounted so an open repo or a finished search survives switching tabs. */}
        {Object.entries(VIEWS).map(([key, View]) => (
          <div key={key} className="view-slot" hidden={key !== active}><View /></div>
        ))}
      </main>
    </div>
  )
}
