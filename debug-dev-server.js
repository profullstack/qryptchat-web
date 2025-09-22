#!/usr/bin/env node

import { createServer } from 'net';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

console.log('🔍 Development Server Diagnostics\n');

// Check environment variables
console.log('Environment Variables:');
console.log('- PORT:', process.env.PORT || 'not set');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- PWD:', process.cwd());

// Check if port 8080 is in use
function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, (err) => {
      if (err) {
        resolve({ port, available: false, error: err.message });
      } else {
        server.close();
        resolve({ port, available: true });
      }
    });
    
    server.on('error', (err) => {
      resolve({ port, available: false, error: err.message });
    });
  });
}

// Check common dev ports
const ports = [5173, 8080, 3000, 4173];
console.log('\nPort Availability:');

for (const port of ports) {
  const result = await checkPort(port);
  console.log(`- ${port}: ${result.available ? '✅ Available' : '❌ In Use'} ${result.error || ''}`);
}

// Check if node_modules exists and key dependencies
console.log('\nDependency Check:');
const nodeModulesPath = join(process.cwd(), 'node_modules');
console.log('- node_modules exists:', existsSync(nodeModulesPath) ? '✅' : '❌');

if (existsSync(nodeModulesPath)) {
  const viteePath = join(nodeModulesPath, 'vite');
  const sveltekitPath = join(nodeModulesPath, '@sveltejs', 'kit');
  console.log('- vite installed:', existsSync(viteePath) ? '✅' : '❌');
  console.log('- @sveltejs/kit installed:', existsSync(sveltekitPath) ? '✅' : '❌');
}

// Check .env file
const envPath = join(process.cwd(), '.env');
console.log('\n.env File:');
console.log('- .env exists:', existsSync(envPath) ? '✅' : '❌');

if (existsSync(envPath)) {
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const portMatch = envContent.match(/^PORT\s*=\s*(.+)$/m);
    if (portMatch) {
      console.log('- PORT defined in .env:', portMatch[1]);
    }
  } catch (err) {
    console.log('- Error reading .env:', err.message);
  }
}

console.log('\n🎯 Recommendations:');
console.log('1. If PORT=8080 is set, try unsetting it or changing to 5173');
console.log('2. Consider temporarily disabling the WebSocket plugin');
console.log('3. Run `pnpm install` to ensure dependencies are intact');