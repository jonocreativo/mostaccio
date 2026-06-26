const { spawn } = require('child_process');
const port = process.env.PORT || '8080';
const host = '0.0.0.0';

console.log(`Starting Next.js standalone production server on ${host}:${port}...`);

// Se configuran las variables de entorno necesarias para Next.js en modo standalone
const nextStart = spawn('node', ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: host
  }
});

nextStart.on('close', (code) => {
  process.exit(code);
});
