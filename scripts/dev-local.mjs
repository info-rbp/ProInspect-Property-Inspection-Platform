import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`)));
});

try {
  await access('node_modules/.bin/vite');
} catch {
  console.log('Workspace dependencies are missing; installing them before local development starts...');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
}
await run('npm', ['run', 'build:packages']);

const commands = [
  ['npm', ['run', 'emulators']],
  ['npm', ['run', 'dev:api']],
  ['npm', ['run', 'dev:web']],
];
const children = commands.map(([command,args]) => spawn(command, args, { stdio:'inherit', shell: process.platform === 'win32' }));
const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await Promise.race(children.map((child) => new Promise((resolve) => child.once('exit', resolve)))); stop();
