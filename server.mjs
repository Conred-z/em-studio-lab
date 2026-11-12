import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const hostIndex = args.indexOf('--host')
const port = portIndex >= 0 ? args[portIndex + 1] : '7100'
const host = hostIndex >= 0 && args[hostIndex + 1] && !args[hostIndex + 1].startsWith('--') ? args[hostIndex + 1] : '0.0.0.0'
const bundledPython = path.resolve(root, '../.venv/bin/python')
const python = process.env.EM_PYTHON || (existsSync(bundledPython) ? bundledPython : 'python3')
const child = spawn(python, [path.join(root, 'server.py'), '--host', host, '--port', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
})

const shutdown = () => {
  if (!child.killed) child.kill('SIGTERM')
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', (code) => process.exit(code ?? 0))
