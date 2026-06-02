import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src/app/api';

const files = execSync(
  `grep -rl "error: [0-9][0-9][0-9]," ${ROOT} --include="*.js"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix template literal patterns: NextResponse.json({ error: 500, `message`);
  content = content.replace(
    /NextResponse\.json\(\{\s*error:\s*(\d+),\s*`([^`]+)`\s*\)/g,
    (_, status, msg) => `NextResponse.json({ error: \`${msg}\` }, { status: ${status} })`
  );

  // Fix string patterns: NextResponse.json({ error: 401, 'message');
  content = content.replace(
    /NextResponse\.json\(\{\s*error:\s*(\d+),\s*'([^']+)'\s*\)/g,
    (_, status, msg) => `NextResponse.json({ error: '${msg}' }, { status: ${status} })`
  );

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT, '')}`);
  }
}
console.log('Done');
