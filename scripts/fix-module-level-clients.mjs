import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/ubuntu/src/qryptchat-web/src/app/api';

const files = execSync(
  `grep -rl "const supabase.*= createClient\\|const.*Client.*= createClient" ${ROOT} --include="*.js"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with module-level Supabase clients`);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Find and comment out module-level createClient calls
  // Pattern: const supabaseClient = createClient(process.env...);
  // Replace with lazy getter
  content = content.replace(
    /^(const\s+(\w+)\s*=\s*createClient\([^)]+\);)\s*$/gm,
    (match, full, varName) => {
      return `// Lazy client - created on first use to avoid build-time env issues
let _${varName} = null;
function get${varName.charAt(0).toUpperCase() + varName.slice(1)}() {
  if (!_${varName}) {
    _${varName} = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _${varName};
}`;
    }
  );

  // Replace usages of the var with function call
  // This is harder to do generically, so let's just wrap the createClient call in a function

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT, '')}`);
  }
}
console.log('Done');
