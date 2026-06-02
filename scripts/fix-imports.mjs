import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = '/home/ubuntu/src/qryptchat-web/src';

// Find all JS/JSX files that have SvelteKit imports
const files = execSync(
  `grep -rl "\\$app/environment\\|\\$app/navigation\\|\\$app/stores\\|\\$lib/" ${ROOT} --include="*.js" --include="*.jsx"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with SvelteKit imports`);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Skip if it's already been converted (has 'use client' or uses zustand)
  // but still fix $lib/ imports

  // Fix $lib/ -> @/lib/ (absolute path alias)
  content = content.replace(/from '\$lib\//g, "from '@/lib/");
  content = content.replace(/import '\$lib\//g, "import '@/lib/");

  // Fix $app/environment - replace browser usage
  if (content.includes("'$app/environment'")) {
    // Remove the import line
    content = content.replace(/import\s*\{[^}]*\}\s*from\s*'\$app\/environment';\s*\n?/g, '');
    content = content.replace(/import\s*\{[^}]*\}\s*from\s*"\$app\/environment";\s*\n?/g, '');

    // Replace usages of `browser` variable with typeof check
    // Handle: if (!browser) return; -> if (typeof window === 'undefined') return;
    content = content.replace(/if\s*\(!browser\)/g, 'if (typeof window === \'undefined\')');
    content = content.replace(/if\s*\(browser\)/g, 'if (typeof window !== \'undefined\')');
    // Handle: browser && ... -> typeof window !== 'undefined' && ...
    content = content.replace(/\bbrowser\s*&&/g, 'typeof window !== \'undefined\' &&');
    // Handle: ... && browser -> ... && typeof window !== 'undefined'
    content = content.replace(/&&\s*browser\b/g, '&& typeof window !== \'undefined\'');
    // Handle standalone browser references
    content = content.replace(/\bbrowser\b/g, "(typeof window !== 'undefined')");
  }

  // Fix $app/navigation
  if (content.includes("'$app/navigation'")) {
    content = content.replace(/import\s*\{[^}]*\}\s*from\s*'\$app\/navigation';\s*\n?/g, '');
    // goto is replaced by router.push in components, but in non-component files we can ignore it
  }

  // Fix $app/stores
  if (content.includes("'$app/stores'")) {
    content = content.replace(/import\s*\{[^}]*\}\s*from\s*'\$app\/stores';\s*\n?/g, '');
  }

  // Fix $env/static/public
  content = content
    .replace(/import\s*\{[^}]*\}\s*from\s*'\$env\/static\/public';\s*\n?/g, '')
    .replace(/PUBLIC_SUPABASE_URL\b/g, 'process.env.NEXT_PUBLIC_SUPABASE_URL')
    .replace(/PUBLIC_SUPABASE_ANON_KEY\b/g, 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
    .replace(/PUBLIC_ONION_URL\b/g, 'process.env.NEXT_PUBLIC_ONION_URL');

  // Fix $env/static/private
  content = content.replace(/import\s*\{[^}]*\}\s*from\s*'\$env\/static\/private';\s*\n?/g, '');

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file.replace(ROOT, 'src')}`);
  }
}

console.log('Done fixing imports');
