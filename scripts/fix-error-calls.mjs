import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src/app/api';

const files = execSync(
  `grep -rl "NextResponse\\.json({ error:" ${ROOT} --include="*.js"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with broken error() calls`);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix: return NextResponse.json({ error: 401, 'Unauthorized');
  // -> return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Pattern: NextResponse.json({ error: <number>, '<message>');
  content = content.replace(
    /NextResponse\.json\(\{\s*error:\s*(\d+),\s*'([^']+)'\s*\)/g,
    "NextResponse.json({ error: '$2' }, { status: $1 })"
  );
  content = content.replace(
    /NextResponse\.json\(\{\s*error:\s*(\d+),\s*"([^"]+)"\s*\)/g,
    'NextResponse.json({ error: "$2" }, { status: $1 })'
  );

  // Fix: return NextResponse.json({ error: status, message); (no closing brace before paren)
  content = content.replace(
    /NextResponse\.json\(\{\s*error:\s*(\d+),\s*([^}]+?)\s*\)\s*;/g,
    (match, status, rest) => {
      // If rest looks like a string literal or variable
      const trimmed = rest.trim();
      return `NextResponse.json({ error: ${trimmed} }, { status: ${status} });`;
    }
  );

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT, 'api')}`);
  }
}
console.log('Done');
