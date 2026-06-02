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

  // Fix: logger.NextResponse.json( -> logger.info(  (logger calls)
  // Fix: console.NextResponse.json( -> console.error(  (console calls)
  // These are cases where json( was incorrectly replaced inside method chains
  content = content
    // Fix logger.NextResponse.json({ -> logger.error(  (these were logger.info/error calls)
    .replace(/logger\.NextResponse\.json\(\s*\{?\s*error:/g, "logger.error(")
    .replace(/logger\.NextResponse\.json\(/g, "logger.info(")
    // Fix console.NextResponse.json( -> console.error( or console.log(
    .replace(/console\.NextResponse\.json\(\s*\{?\s*error:/g, "console.error(")
    .replace(/console\.NextResponse\.json\(/g, "console.log(")
    // Fix NextResponse.NextResponse.json( -> NextResponse.json(
    .replace(/NextResponse\.NextResponse\.json\(/g, "NextResponse.json(")
    // Fix double import of NextResponse
    .replace(/(import \{ NextResponse \} from 'next\/server';\n)+/g, "import { NextResponse } from 'next/server';\n");

  // Fix logger.error( calls that got broken by the json replacement
  // e.g., logger.NextResponse.json({ error: '...' }); -> logger.error('...');
  // These are hard to fix automatically but let's do what we can

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    fixed++;
  }
}

console.log(`Fixed ${fixed} files`);
