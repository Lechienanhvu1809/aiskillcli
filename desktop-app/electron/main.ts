import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
const APP_ROOT = path.join(__dirname, '..')
process.env.APP_ROOT = APP_ROOT

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')

const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    width: 1200,
    height: 800,
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()

  // IPC Handlers cho AI Skill Manager
  ipcMain.handle('get-skills', async (event, projectPath: string) => {
    const globalSkillsDir = path.join(os.homedir(), '.ai-skills')
    if (!fs.existsSync(globalSkillsDir)) {
      return []
    }

    // Dynamic import to bypass some esbuild/vite CJS/ESM bundling issues if needed,
    // but a static import at the top is cleaner. Let's just use it dynamically here or statically at the top.
    // Let's use dynamic import to be safe with Electron Vite dev server:
    const { parseSkillFile } = await import('../../src/utils/frontmatter.js')

    const files = fs.readdirSync(globalSkillsDir)
    const skills = files.filter(f => f.endsWith('.md')).map(f => {
      const id = f.replace('.md', '')
      
      const content = fs.readFileSync(path.join(globalSkillsDir, f), 'utf8')
      const { meta } = parseSkillFile(content)
      
      const name = meta.name || id
      const desc = meta.description || ''
      
      // Check if active in current project
      let active = false
      if (projectPath) {
        const targetPath = path.join(projectPath, '.agents', 'skills', id, 'SKILL.md')
        active = fs.existsSync(targetPath)
      }

      return { id, name, desc, icon: '🚀', active }
    })
    return skills
  })

  ipcMain.handle('toggle-skill', async (event, projectPath: string, skillId: string, activate: boolean) => {
    if (!projectPath) throw new Error("No project selected")
    
    const globalSkillsDir = path.join(os.homedir(), '.ai-skills')
    const sourcePath = path.join(globalSkillsDir, `${skillId}.md`)
    const targetDir = path.join(projectPath, '.agents', 'skills', skillId)
    const targetPath = path.join(targetDir, 'SKILL.md')

    if (activate) {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true })
      }
      try {
        fs.symlinkSync(sourcePath, targetPath, 'file')
      } catch {
        fs.copyFileSync(sourcePath, targetPath)
      }
    } else {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true })
      }
      // Clean up empty dir
      try {
        fs.rmdirSync(targetDir)
      } catch {}
    }
    return true
  })

  ipcMain.handle('select-project', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })
})
