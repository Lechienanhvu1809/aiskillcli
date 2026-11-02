import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

function parseFrontmatterSimple(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) return { meta: {} as Record<string, any>, body: content.trim() }
  const meta: Record<string, any> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      let val = line.slice(colonIdx + 1).trim()
      if (key === 'tags' || key === 'requires') {
        if (val.startsWith('[') && val.endsWith(']')) val = val.slice(1, -1)
        meta[key] = val
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      } else {
        meta[key] = val.replace(/^['"]|['"]$/g, '')
      }
    }
  }
  const body = content.slice(match[0].length).trim()
  return { meta, body }
}

function apiMiddlewarePlugin(): Plugin {
  return {
    name: 'ai-skills-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        const globalSkillsDir = path.join(os.homedir(), '.ai-skills')

        if (url.pathname === '/api/skills') {
          const projectPath = url.searchParams.get('projectPath') || ''
          if (!fs.existsSync(globalSkillsDir)) {
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify([]))
          }
          const files = fs.readdirSync(globalSkillsDir).filter((f) => f.endsWith('.md'))
          const skills = files.map((f) => {
            const id = f.replace('.md', '')
            try {
              const content = fs.readFileSync(path.join(globalSkillsDir, f), 'utf8')
              const { meta } = parseFrontmatterSimple(content)
              let active = false
              if (projectPath) {
                const targetPath = path.join(projectPath, '.agents', 'skills', id, 'SKILL.md')
                active = fs.existsSync(targetPath)
              }
              return {
                id,
                name: meta.name || id,
                desc: meta.description || 'Kỹ năng dành cho AI Coding Agent.',
                tags: Array.isArray(meta.tags) ? meta.tags : [],
                icon: '⚡',
                active,
              }
            } catch {
              return { id, name: id, desc: '', tags: [], icon: '⚡', active: false }
            }
          })
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(skills))
        }

        if (url.pathname === '/api/skill-content') {
          const id = url.searchParams.get('id')
          if (!id) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'Missing id' }))
          }
          const filePath = path.join(globalSkillsDir, `${id}.md`)
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'Skill not found' }))
          }
          const content = fs.readFileSync(filePath, 'utf8')
          const { meta, body } = parseFrontmatterSimple(content)
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ id, meta, body, rawContent: content }))
        }

        if (url.pathname === '/api/toggle-skill' && req.method === 'POST') {
          let reqBody = ''
          req.on('data', (chunk) => {
            reqBody += chunk
          })
          req.on('end', () => {
            try {
              const { projectPath, skillId, activate } = JSON.parse(reqBody)
              if (!projectPath) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                return res.end(JSON.stringify({ error: 'Vui lòng chọn thư mục dự án trước!' }))
              }
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
                try {
                  fs.rmdirSync(targetDir)
                } catch {}
              }

              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ success: true, active: activate, skillId }))
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        if (url.pathname === '/api/system-info') {
          const files = fs.existsSync(globalSkillsDir)
            ? fs.readdirSync(globalSkillsDir).filter((f) => f.endsWith('.md'))
            : []
          const suggestions = [
            'd:\\Coding',
            'd:\\Coding\\ai-skill-cli',
            process.cwd(),
          ].filter((p, idx, arr) => fs.existsSync(p) && arr.indexOf(p) === idx)

          res.setHeader('Content-Type', 'application/json')
          return res.end(
            JSON.stringify({
              skillsDir: globalSkillsDir,
              skillCount: files.length,
              version: '1.3.0',
              suggestions,
            }),
          )
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    apiMiddlewarePlugin(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
})
