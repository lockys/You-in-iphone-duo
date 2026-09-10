import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const cli = path.resolve('node_modules/@modern-js/app-tools/bin/modern.js');
const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : process.env.PORT || '3000';
const child = spawn(process.execPath, [cli, 'serve'], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, PORT: port },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
