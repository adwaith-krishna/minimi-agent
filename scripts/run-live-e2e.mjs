import { spawnSync } from 'node:child_process'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['vitest', 'run', 'tests/integration/live-agent.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_LIVE_E2E: '1' },
})
process.exit(result.status ?? 1)
