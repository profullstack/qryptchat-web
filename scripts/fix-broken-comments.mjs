import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src';

// Find any file containing broken (typeof window...) patterns inside strings/comments
const files = execSync(
  `grep -rl "(typeof window" ${ROOT} --include="*.js" --include="*.jsx"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

let fixed = 0;
for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix patterns where 'browser' was replaced inside comment/string contexts
  // These patterns appear in strings and comments, not code
  content = content
    // Fix "new (typeof window !== 'undefined')" -> "new browser"
    .replace(/new \(typeof window !== '?undefined'?\)/g, 'new browser')
    // Fix "this is a new (typeof window !== 'undefined')" in strings/comments
    .replace(/a new \(typeof window !== '?undefined'?\)/g, 'a new browser')
    // Fix "or this is a new (typeof...)" in log strings
    .replace(/or this is a new \(typeof window !== '?undefined'?\)/g, 'or this is a new browser');

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT + '/', '')}`);
    fixed++;
  }
}

console.log(`Fixed ${fixed} files`);
