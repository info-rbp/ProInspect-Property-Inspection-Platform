import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}.`));
  });
});

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const requiredInstallArtifacts = [
  'node_modules/.bin/vite',
  'node_modules/@pcr/config/package.json',
  'node_modules/@pcr/domain/package.json',
];

if (!(await Promise.all(requiredInstallArtifacts.map(exists))).every(Boolean)) {
  console.log('Workspace dependencies are missing; installing them before development starts...');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
}

console.log('Building shared workspace packages required by the API...');
await run('npm', ['run', 'build:packages']);

const children = [
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn('npm', ['run', 'dev:api'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await Promise.race(children.map((child) => new Promise((resolve) => child.once('exit', resolve))));
stop();
