import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src/app/api';

const files = execSync(
  `find ${ROOT} -name "route.js"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

let fixed = 0;
for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix broken import statements from env vars inside import {}
  // Pattern: import { process.env.NEXT_PUBLIC_SUPABASE_URL ... } // env vars...;
  content = content.replace(
    /import\s*\{[^}]*process\.env\.[A-Z_]+[^}]*\}\s*(\/\/[^\n]*)?\n?/g,
    ''
  );

  // Fix: import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
  content = content.replace(
    /import\s*\{[^}]*\}\s*from\s*'\$env\/static\/private'[^;]*;\s*\n?/g,
    ''
  );

  // Fix: from '$env/static/public' partial replacements
  content = content.replace(
    /import\s*\{[^}]*\}\s*\/\/\s*env vars via process\.env\.NEXT_PUBLIC_\*[^;]*;\s*\n?/g,
    ''
  );

  // Replace SUPABASE_SERVICE_ROLE_KEY with process.env
  content = content
    .replace(/\bSUPABASE_SERVICE_ROLE_KEY\b/g, 'process.env.SUPABASE_SERVICE_ROLE_KEY')
    .replace(/process\.env\.process\.env\./g, 'process.env.');

  // Fix double process.env patterns
  content = content.replace(/process\.env\.process\.env\./g, 'process.env.');

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    fixed++;
  }
}

console.log(`Fixed ${fixed} route files`);
