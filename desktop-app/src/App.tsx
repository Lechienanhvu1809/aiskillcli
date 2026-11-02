import { useState, useEffect, useMemo } from 'react'
import './index.css'

declare global {
  interface Window {
    ipcRenderer?: {
      invoke(channel: string, ...args: any[]): Promise<any>
      on(channel: string, listener: (...args: any[]) => void): any
      off(channel: string, listener: (...args: any[]) => void): any
      send(channel: string, ...args: any[]): void
    }
  }
}

interface Skill {
  id: string
  name: string
  desc: string
  tags?: string[]
  icon: string
  active: boolean
}

interface SystemInfo {
  skillsDir: string
  skillCount: number
  version: string
  suggestions?: string[]
}

type TabType = 'home' | 'skills' | 'projects' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('skills')
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  
  // Project State
  const [projectPath, setProjectPath] = useState<string>(() => {
    return localStorage.getItem('ai_skills_project_path') || 'd:\\Coding'
  })
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [customPathInput, setCustomPathInput] = useState('')

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Skill Detail Modal
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null)
  const [skillContent, setSkillContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)

  // System & Notification
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => {
      setToast(null)
    }, 3500)
  }

  // --- API Client Layer (Universal: Electron IPC + Browser HTTP Fallback) ---
  const isElectron = typeof window !== 'undefined' && Boolean(window.ipcRenderer)

  const api = useMemo(() => ({
    getSkills: async (projPath: string): Promise<Skill[]> => {
      if (isElectron && window.ipcRenderer) {
        return await window.ipcRenderer.invoke('get-skills', projPath)
      }
      const res = await fetch(`/api/skills?projectPath=${encodeURIComponent(projPath || '')}`)
      return await res.json()
    },

    toggleSkill: async (projPath: string, skillId: string, activate: boolean) => {
      if (isElectron && window.ipcRenderer) {
        return await window.ipcRenderer.invoke('toggle-skill', projPath, skillId, activate)
      }
      const res = await fetch('/api/toggle-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projPath, skillId, activate })
      })
      return await res.json()
    },

    getSkillContent: async (skillId: string): Promise<{ rawContent: string } | null> => {
      if (isElectron && window.ipcRenderer) {
        return await window.ipcRenderer.invoke('get-skill-content', skillId)
      }
      const res = await fetch(`/api/skill-content?id=${encodeURIComponent(skillId)}`)
      if (!res.ok) return null
      return await res.json()
    },

    getSystemInfo: async (): Promise<SystemInfo> => {
      if (isElectron && window.ipcRenderer) {
        return await window.ipcRenderer.invoke('get-system-info')
      }
      const res = await fetch('/api/system-info')
      return await res.json()
    },

    selectProjectNative: async (): Promise<string | null> => {
      if (isElectron && window.ipcRenderer) {
        return await window.ipcRenderer.invoke('select-project')
      }
      return null
    }
  }), [isElectron])

  // --- Load Data ---
  const loadSkills = async (path: string) => {
    setLoading(true)
    try {
      const data = await api.getSkills(path)
      setSkills(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load skills:', err)
      showToast('⚠️ Không thể tải danh sách skills')
    } finally {
      setLoading(false)
    }
  }

  const loadSystemInfo = async () => {
    try {
      const info = await api.getSystemInfo()
      setSystemInfo(info)
    } catch (err) {
      console.warn('System info error:', err)
    }
  }

  useEffect(() => {
    loadSkills(projectPath)
    loadSystemInfo()
  }, [projectPath, api])

  // Save selected project to localStorage
  useEffect(() => {
    if (projectPath) {
      localStorage.setItem('ai_skills_project_path', projectPath)
    }
  }, [projectPath])

  // Project Name computation
  const projectName = useMemo(() => {
    if (!projectPath) return 'Chưa chọn dự án'
    const parts = projectPath.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] || projectPath
  }, [projectPath])

  // Available Tags
  const allTags = useMemo(() => {
    const set = new Set<string>()
    skills.forEach(s => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach(t => set.add(t))
      }
    })
    return Array.from(set)
  }, [skills])

  // Filtered skills
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      // Filter by Search
      const query = searchQuery.trim().toLowerCase()
      const matchSearch = !query || 
        skill.name.toLowerCase().includes(query) || 
        skill.desc.toLowerCase().includes(query) ||
        (skill.tags && skill.tags.some(t => t.toLowerCase().includes(query)))

      // Filter by Tag
      const matchTag = selectedTag === 'all' || (skill.tags && skill.tags.includes(selectedTag))

      // Filter by Status
      const matchStatus = 
        filterStatus === 'all' ||
        (filterStatus === 'active' && skill.active) ||
        (filterStatus === 'inactive' && !skill.active)

      return matchSearch && matchTag && matchStatus
    })
  }, [skills, searchQuery, selectedTag, filterStatus])

  // Active skills count
  const activeCount = useMemo(() => skills.filter(s => s.active).length, [skills])

  // --- Handlers ---
  const handleOpenProjectPicker = async () => {
    if (isElectron) {
      const selected = await api.selectProjectNative()
      if (selected) {
        setProjectPath(selected)
        showToast(`📁 Đã chuyển sang dự án: ${selected}`)
        return
      }
    }
    // In Browser or fallback: open modal
    setCustomPathInput(projectPath)
    setIsProjectModalOpen(true)
  }

  const handleApplyCustomPath = (p: string) => {
    if (!p.trim()) return
    setProjectPath(p.trim())
    setIsProjectModalOpen(false)
    showToast(`📁 Đã chuyển sang dự án: ${p.trim()}`)
  }

  const handleToggleSkill = async (skill: Skill) => {
    if (!projectPath) {
      setIsProjectModalOpen(true)
      showToast('⚠️ Vui lòng chọn thư mục dự án trước!')
      return
    }

    const nextState = !skill.active
    // Optimistic UI update
    setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, active: nextState } : s))

    try {
      await api.toggleSkill(projectPath, skill.id, nextState)
      showToast(nextState 
        ? `✓ Đã kích hoạt kỹ năng "${skill.name}" trong dự án!`
        : `✕ Đã gỡ kỹ năng "${skill.name}" khỏi dự án.`
      )
    } catch (err: any) {
      // Revert on error
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, active: skill.active } : s))
      showToast(`⚠️ Thao tác thất bại: ${err?.message || err}`)
    }
  }

  const handleViewDetail = async (skill: Skill) => {
    setDetailSkill(skill)
    setLoadingContent(true)
    setSkillContent('')
    try {
      const res = await api.getSkillContent(skill.id)
      setSkillContent(res?.rawContent || '# Không tìm thấy nội dung file.')
    } catch {
      setSkillContent('# Lỗi khi đọc file kỹ năng.')
    } finally {
      setLoadingContent(false)
    }
  }

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className="toast-banner">
          <span>🔔</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="brand">
          <div className="brand-icon">✨</div>
          <div className="brand-text">
            AI Skill Manager
            <span className="brand-version">v1.3.0 {isElectron ? '• App' : '• Web'}</span>
          </div>
        </div>

        <nav className="nav-menu">
          <div 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <div className="nav-item-content">
              <span>🏠</span> Home
            </div>
            <span className="nav-badge">{skills.length}</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            <div className="nav-item-content">
              <span>📚</span> Skills Library
            </div>
            <span className="nav-badge">{filteredSkills.length}</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            <div className="nav-item-content">
              <span>📁</span> Projects
            </div>
            <span className="nav-badge">{activeCount} active</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={{ marginTop: 'auto' }}
          >
            <div className="nav-item-content">
              <span>⚙️</span> Settings
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button 
            className="btn-icon" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.6rem' }}
            onClick={() => {
              loadSkills(projectPath)
              showToast('🔄 Đã làm mới danh sách kỹ năng!')
            }}
          >
            🔄 Refresh Registry
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content glass-panel">
        {/* Top Header */}
        <header className="header">
          <div className="header-left">
            <h1 className="header-title">
              {activeTab === 'home' && 'Tổng quan hệ thống'}
              {activeTab === 'skills' && 'Kho Kỹ Năng'}
              {activeTab === 'projects' && 'Quản lý Dự án'}
              {activeTab === 'settings' && 'Cài đặt hệ thống'}
            </h1>

            <button 
              className="project-pill-btn"
              onClick={handleOpenProjectPicker}
              title={`Đường dẫn: ${projectPath}`}
            >
              <span>📂</span>
              <span>Dự án: <strong className="project-name-highlight">{projectName}</strong></span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>✏️ Thay đổi</span>
            </button>
          </div>

          <div className="header-actions">
            {activeTab === 'skills' && (
              <div className="search-box">
                <span>🔎</span>
                <input 
                  type="text" 
                  placeholder="Tìm kiếm skill, tag, nội dung..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="search-clear-btn" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Sub-toolbar when in Skills Library */}
        {activeTab === 'skills' && (
          <div className="toolbar">
            <div className="tag-chips-container">
              <span 
                className={`tag-chip ${selectedTag === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedTag('all')}
              >
                🏷️ Tất cả ({skills.length})
              </span>
              {allTags.map(tag => (
                <span 
                  key={tag}
                  className={`tag-chip ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === tag ? 'all' : tag)}
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="filter-toggle-group">
              <button 
                className={`filter-pill ${filterStatus === 'all' ? 'active' : ''}`}
                onClick={() => setFilterStatus('all')}
              >
                Tất cả
              </button>
              <button 
                className={`filter-pill ${filterStatus === 'active' ? 'active' : ''}`}
                onClick={() => setFilterStatus('active')}
              >
                Đang bật ({activeCount})
              </button>
              <button 
                className={`filter-pill ${filterStatus === 'inactive' ? 'active' : ''}`}
                onClick={() => setFilterStatus('inactive')}
              >
                Chưa bật
              </button>
            </div>
          </div>
        )}

        {/* Dynamic View Body */}
        <div className="view-container">
          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <div>
              <div className="dashboard-grid">
                <div className="metric-card">
                  <div className="metric-icon-box" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                    📚
                  </div>
                  <div>
                    <div className="metric-label">Tổng số Kỹ năng</div>
                    <div className="metric-value">{skills.length}</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                    ⚡
                  </div>
                  <div>
                    <div className="metric-label">Đang bật trong Dự án</div>
                    <div className="metric-value">{activeCount}</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-box" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                    🏷️
                  </div>
                  <div>
                    <div className="metric-label">Danh mục / Tags</div>
                    <div className="metric-value">{allTags.length}</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-box" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
                    🤖
                  </div>
                  <div>
                    <div className="metric-label">Trạng thái MCP Server</div>
                    <div className="metric-value" style={{ fontSize: '1.1rem', color: '#10b981' }}>Sẵn sàng (Active)</div>
                  </div>
                </div>
              </div>

              <h2 className="section-title">🚀 Lối tắt nhanh</h2>
              <div className="quick-actions-grid">
                <div className="action-card" onClick={() => setActiveTab('skills')}>
                  <div className="action-card-header">
                    <span>📚</span> Khám phá Thư viện Kỹ năng
                  </div>
                  <div className="action-card-desc">
                    Tìm kiếm, duyệt và kích hoạt ngay các skill lập trình (React, Vitest, Git, Docker, v.v.) vào dự án hiện tại.
                  </div>
                </div>

                <div className="action-card" onClick={handleOpenProjectPicker}>
                  <div className="action-card-header">
                    <span>📂</span> Chọn Thư mục Dự án
                  </div>
                  <div className="action-card-desc">
                    Đang nhắm tới: <code>{projectPath}</code>. Nhấn để chuyển sang dự án khác bạn đang phát triển.
                  </div>
                </div>

                <div className="action-card" onClick={() => setActiveTab('settings')}>
                  <div className="action-card-header">
                    <span>⚙️</span> Kiểm tra Cấu hình & Kho
                  </div>
                  <div className="action-card-desc">
                    Xem đường dẫn lưu trữ tri thức cục bộ <code>~/.ai-skills</code>, đồng bộ Git và các thông số CLI.
                  </div>
                </div>
              </div>

              <h2 className="section-title">⭐ Kỹ năng nổi bật</h2>
              <div className="skills-grid">
                {skills.slice(0, 6).map(skill => (
                  <div key={skill.id} className={`skill-card ${skill.active ? 'active' : ''}`}>
                    <div className="card-top">
                      <div className="card-icon-badge">{skill.icon}</div>
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={skill.active} 
                          onChange={() => handleToggleSkill(skill)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    <div>
                      <h3 className="card-title">{skill.name}</h3>
                      <p className="card-desc">{skill.desc}</p>
                    </div>

                    <div className="card-footer">
                      <button className="btn-icon" onClick={() => handleViewDetail(skill)}>
                        👁️ Chi tiết
                      </button>
                      <div className="status-indicator">
                        <span className={`status-dot ${skill.active ? 'active' : ''}`}></span>
                        <span>{skill.active ? 'Active' : 'Off'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: SKILLS LIBRARY */}
          {activeTab === 'skills' && (
            <div>
              {loading && (
                <div className="empty-state">
                  <div className="empty-icon">⏳</div>
                  <div className="empty-title">Đang tải kho kỹ năng...</div>
                </div>
              )}

              {!loading && filteredSkills.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">Không tìm thấy kỹ năng nào</div>
                  <div className="empty-subtitle">
                    Không có skill nào khớp với từ khóa "{searchQuery}" hoặc bộ lọc hiện tại.
                  </div>
                  <button 
                    className="btn-primary"
                    onClick={() => { setSearchQuery(''); setSelectedTag('all'); setFilterStatus('all'); }}
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              )}

              {!loading && filteredSkills.length > 0 && (
                <div className="skills-grid">
                  {filteredSkills.map(skill => (
                    <div key={skill.id} className={`skill-card ${skill.active ? 'active' : ''}`}>
                      <div>
                        <div className="card-top">
                          <div className="card-icon-badge">{skill.icon}</div>
                          <label className="toggle-switch">
                            <input 
                              type="checkbox" 
                              checked={skill.active} 
                              onChange={() => handleToggleSkill(skill)}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>

                        <h3 className="card-title">{skill.name}</h3>
                        <p className="card-desc">{skill.desc}</p>

                        {skill.tags && skill.tags.length > 0 && (
                          <div className="card-tags">
                            {skill.tags.map(t => (
                              <span 
                                key={t} 
                                className="tag-badge" 
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedTag(t)}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="card-footer">
                        <div className="card-actions">
                          <button className="btn-icon" onClick={() => handleViewDetail(skill)}>
                            👁️ Xem nội dung
                          </button>
                        </div>
                        <div className="status-indicator">
                          <span className={`status-dot ${skill.active ? 'active' : ''}`}></span>
                          <span style={{ color: skill.active ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                            {skill.active ? 'Đã bật' : 'Chưa bật'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="projects-container">
              <div className="project-details-card">
                <h2 className="section-title">📂 Dự án hiện tại</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                  Dự án này là đích đến để bơm các kỹ năng (`.agents/skills/`). Các AI Coding Agent (Antigravity, Cursor, Claude Code) sẽ tự động nạp tri thức từ thư mục này.
                </p>

                <div className="project-path-bar">
                  <span style={{ color: 'var(--accent-cyan)' }}>ROOT:</span>
                  <span style={{ color: '#fff', wordBreak: 'break-all' }}>{projectPath}</span>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
                  <button className="btn-primary" onClick={handleOpenProjectPicker}>
                    📁 Đổi thư mục dự án
                  </button>
                  <button 
                    className="btn-icon"
                    onClick={() => {
                      loadSkills(projectPath)
                      showToast('🔄 Đã đồng bộ trạng thái kỹ năng trong dự án!')
                    }}
                  >
                    🔄 Kiểm tra lại symlink
                  </button>
                </div>
              </div>

              <div className="project-details-card">
                <h2 className="section-title">
                  ⚡ Kỹ năng đang kích hoạt trong dự án ({activeCount})
                </h2>

                {activeCount === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Chưa có kỹ năng nào được bật cho dự án này. Chuyển sang tab <strong>Skills Library</strong> và gạt công tắc để kích hoạt.
                  </p>
                ) : (
                  <div className="skills-grid" style={{ marginTop: '1rem' }}>
                    {skills.filter(s => s.active).map(skill => (
                      <div key={skill.id} className="skill-card active" style={{ padding: '1rem' }}>
                        <div className="card-top" style={{ marginBottom: '0.5rem' }}>
                          <strong>{skill.name}</strong>
                          <button 
                            className="btn-icon" 
                            style={{ color: 'var(--accent-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => handleToggleSkill(skill)}
                          >
                            ✕ Tắt
                          </button>
                        </div>
                        <p className="card-desc" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>{skill.desc}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div>
              <div className="settings-section">
                <h2 className="section-title">⚙️ Cấu hình Registry Cục bộ</h2>
                <div className="settings-row">
                  <div>
                    <strong>Thư mục lưu trữ kỹ năng (Global Skills Dir)</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      Nơi chứa toàn bộ các file markdown gốc của kỹ năng
                    </div>
                  </div>
                  <code style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '8px' }}>
                    {systemInfo?.skillsDir || '~/.ai-skills'}
                  </code>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Phiên bản AI Skill Manager</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      CLI Core & Desktop UI Engine
                    </div>
                  </div>
                  <span className="tag-badge" style={{ fontSize: '0.85rem' }}>v1.3.0</span>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Môi trường thực thi</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      Chế độ chạy hiện tại của giao diện
                    </div>
                  </div>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                    {isElectron ? '🖥️ Native Electron Window' : '🌐 Web Browser (HTTP Bridge)'}
                  </span>
                </div>
              </div>

              <div className="settings-section">
                <h2 className="section-title">🔄 Bảo trì & Dọn dẹp</h2>
                <div className="settings-row">
                  <div>
                    <strong>Làm mới Cache Tri thức</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      Đọc lại toàn bộ file trên đĩa và cập nhật trạng thái
                    </div>
                  </div>
                  <button 
                    className="btn-primary" 
                    onClick={() => {
                      loadSkills(projectPath)
                      loadSystemInfo()
                      showToast('✓ Đã cập nhật lại toàn bộ dữ liệu!')
                    }}
                  >
                    🔄 Cập nhật ngay
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL: Skill Markdown Content Viewer --- */}
      {detailSkill && (
        <div className="modal-overlay" onClick={() => setDetailSkill(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <span style={{ fontSize: '1.5rem' }}>{detailSkill.icon}</span>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{detailSkill.name}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    File: <code>{detailSkill.id}.md</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button 
                  className={`btn-icon ${detailSkill.active ? 'active' : ''}`}
                  onClick={() => handleToggleSkill(detailSkill)}
                >
                  {detailSkill.active ? '✓ Đang kích hoạt' : '+ Bật kỹ năng'}
                </button>
                <button className="modal-close-btn" onClick={() => setDetailSkill(null)}>✕</button>
              </div>
            </div>

            <div className="modal-body">
              {loadingContent ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  ⏳ Đang đọc nội dung Markdown...
                </div>
              ) : (
                <pre className="markdown-preview" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {skillContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Project Directory Picker --- */}
      {isProjectModalOpen && (
        <div className="modal-overlay" onClick={() => setIsProjectModalOpen(false)}>
          <div className="modal-dialog" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>📂 Chọn Thư mục Dự án Đích</h3>
              <button className="modal-close-btn" onClick={() => setIsProjectModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Nhập đường dẫn tuyệt đối hoặc chọn một trong các thư mục gợi ý sẵn bên dưới:
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <input 
                  type="text" 
                  value={customPathInput} 
                  onChange={(e) => setCustomPathInput(e.target.value)}
                  placeholder="Ví dụ: d:\Coding hoặc d:\Coding\ai-skill-cli"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--border-highlight)',
                    borderRadius: '10px',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  GỢI Ý NHANH:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {['d:\\Coding', 'd:\\Coding\\ai-skill-cli'].map(p => (
                    <div 
                      key={p}
                      onClick={() => setCustomPathInput(p)}
                      style={{
                        padding: '0.65rem 0.9rem',
                        background: customPathInput === p ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.04)',
                        border: '1px solid',
                        borderColor: customPathInput === p ? 'var(--accent-purple)' : 'var(--border-subtle)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace'
                      }}
                    >
                      📁 {p}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn-icon" onClick={() => setIsProjectModalOpen(false)}>
                  Hủy
                </button>
                <button className="btn-primary" onClick={() => handleApplyCustomPath(customPathInput)}>
                  ✓ Xác nhận chọn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
