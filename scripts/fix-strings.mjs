import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src';

// Find files with the broken pattern
const files = execSync(
  `grep -rl "(typeof window !== 'undefined')" ${ROOT} --include="*.js" --include="*.jsx"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with broken strings`);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix broken string literals - restore 'browser' in string contexts
  content = content
    .replace(/\(typeof window !== 'undefined'\) environment/g, 'browser environment')
    .replace(/only available in \(typeof window !== 'undefined'\)/g, 'only available in browser')
    .replace(/in \(typeof window !== 'undefined'\) environment/g, 'in browser environment')
    .replace(/Not in \(typeof window !== 'undefined'\)/g, 'Not in browser')
    .replace(/'(typeof window !== 'undefined')'/g, "'browser'");

  // Fix the case where the replacement broke string quotes
  // e.g., 'Not in (typeof window !== 'undefined') environment'
  // became: 'Not in (typeof window !== 'undefined') environment'
  // which breaks the single-quoted string

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT, 'src')}`);
  }
}

// Also find files where 'browser' was incorrectly replaced in strings
const files2 = execSync(
  `grep -rl "only available in (typeof" ${ROOT} --include="*.js" --include="*.jsx"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

for (const file of files2) {
  let content = readFileSync(file, 'utf8');
  // Fix any remaining broken patterns
  content = content.replace(/only available in \(typeof window !== \\?'undefined\\?'\)/g, 'only available in browser');
  writeFileSync(file, content, 'utf8');
  console.log(`Also fixed: ${file.replace(ROOT, 'src')}`);
}

console.log('Done');
