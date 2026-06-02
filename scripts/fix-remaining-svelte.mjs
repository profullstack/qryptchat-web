import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src/app';

const files = execSync(
  `grep -rl "sveltejs/kit" ${ROOT} --include="*.js" --include="*.jsx"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with @sveltejs/kit`);

for (const file of files) {
  let content = readFileSync(file, 'utf8');

  // Replace all @sveltejs/kit imports with NextResponse
  content = content
    .replace(/import\s*\{[^}]*\}\s*from\s*'@sveltejs\/kit'[^;]*;\s*\n?/g, "import { NextResponse } from 'next/server';\n")
    .replace(/\bjson\(/g, 'NextResponse.json(')
    .replace(/\berror\(/g, 'NextResponse.json({ error: ')
    // Fix double NextResponse imports
    .replace(/(import \{ NextResponse \} from 'next\/server';\n)\1/g, '$1');

  writeFileSync(file, content, 'utf8');
  console.log(`Fixed: ${file.replace(ROOT, 'app')}`);
}

// Also fix any remaining $lib/ imports in app/api files
const allApiFiles = execSync(
  `grep -rl "\\$lib/" ${ROOT}/api --include="*.js"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

for (const file of allApiFiles) {
  let content = readFileSync(file, 'utf8');
  content = content.replace(/from '\$lib\//g, "from '@/lib/");
  writeFileSync(file, content, 'utf8');
}

console.log('Done');
