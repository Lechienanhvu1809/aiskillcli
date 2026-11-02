import { useState, useEffect } from 'react'
import './index.css'

declare global {
  interface Window {
    ipcRenderer: any
  }
}

interface Skill {
  id: string
  name: string
  desc: string
  icon: string
  active: boolean
}

function App() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [projectPath, setProjectPath] = useState<string>('')
  const [projectName, setProjectName] = useState<string>('Select Project...')

  const loadSkills = async (path: string) => {
    if (!window.ipcRenderer) return
    const loadedSkills = await window.ipcRenderer.invoke('get-skills', path)
    setSkills(loadedSkills)
  }

  useEffect(() => {
    loadSkills(projectPath)
  }, [projectPath])

  const handleSelectProject = async () => {
    if (!window.ipcRenderer) return
    const path = await window.ipcRenderer.invoke('select-project')
    if (path) {
      setProjectPath(path)
      const name = path.split('\\').pop() || path.split('/').pop()
      setProjectName(name)
    }
  }

  const toggleSkill = async (id: string, currentActive: boolean) => {
    if (!projectPath) {
      alert("Please select a project first!")
      return
    }
    const newActive = !currentActive
    // Optimistic UI update
    setSkills(skills.map(s => 
      s.id === id ? { ...s, active: newActive } : s
    ))
    
    // Request backend to apply/remove symlink
    if (window.ipcRenderer) {
      try {
        await window.ipcRenderer.invoke('toggle-skill', projectPath, id, newActive)
      } catch (err) {
        alert("Failed to toggle skill: " + err)
        // Revert on error
        setSkills(skills.map(s => 
          s.id === id ? { ...s, active: currentActive } : s
        ))
      }
    }
  }

  return (
    <>
      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="brand">
          <div className="brand-icon">✨</div>
          AI Skill Manager
        </div>
        
        <nav className="nav-menu">
          <div className="nav-item">🏠 Home</div>
          <div className="nav-item active">📚 Skills Library</div>
          <div className="nav-item">📁 Projects</div>
          <div className="nav-item" style={{ marginTop: 'auto' }}>⚙️ Settings</div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content glass-panel">
        <header className="header">
          <h1 className="header-title" onClick={handleSelectProject} style={{cursor: 'pointer'}} title={projectPath}>
            Skills Library - <span className="project-name">{projectName}</span>
            <span style={{fontSize: '0.9rem', marginLeft: '10px', color: 'var(--text-muted)'}}>✏️ (Click to change)</span>
          </h1>
          <div className="search-bar">
            <span>🔎</span>
            <input type="text" placeholder="Search skills..." />
          </div>
        </header>

        <div className="skills-grid">
          {skills.length === 0 && <div style={{padding: '2rem', color: 'var(--text-secondary)'}}>No skills found in global registry. Use ai-skills add/fetch first!</div>}
          {skills.map(skill => (
            <div key={skill.id} className={`skill-card ${skill.active ? 'active' : ''}`}>
              <div className="card-header">
                <div className="card-icon">{skill.icon}</div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={skill.active} 
                    onChange={() => toggleSkill(skill.id, skill.active)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              
              <h3 className="card-title">{skill.name}</h3>
              <p className="card-desc">{skill.desc}</p>
              
              <div className="card-footer">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Toggle</span>
                <span style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 500,
                  color: skill.active ? 'var(--accent-green)' : 'var(--text-muted)' 
                }}>
                  Status: {skill.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}

export default App
