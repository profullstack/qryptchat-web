import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const SRC = '/home/ubuntu/src/qryptchat-web/src/routes/api';
const DEST = '/home/ubuntu/src/qryptchat-web/src/app/api';

// Get all +server.js files
const files = execSync(`find ${SRC} -name "+server.js"`, { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

for (const file of files) {
  const rel = file.replace(SRC + '/', '');
  const dir = dirname(rel);
  const destDir = join(DEST, dir);
  mkdirSync(destDir, { recursive: true });
  const outFile = join(destDir, 'route.js');

  let content = readFileSync(file, 'utf8');

  // Fix imports
  content = content
    .replace(/import \{ json \} from '@sveltejs\/kit'/g, "import { NextResponse } from 'next/server'")
    .replace(/import \{ json, redirect \} from '@sveltejs\/kit'/g, "import { NextResponse } from 'next/server'")
    .replace(/from '\$lib\//g, "from '@/lib/")
    .replace(/from '\$env\/static\/public'/g, "// env vars via process.env.NEXT_PUBLIC_*")
    .replace(/PUBLIC_SUPABASE_URL/g, "process.env.NEXT_PUBLIC_SUPABASE_URL")
    .replace(/PUBLIC_SUPABASE_ANON_KEY/g, "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY")
    .replace(/PUBLIC_ONION_URL/g, "process.env.NEXT_PUBLIC_ONION_URL");

  // Fix json() calls -> NextResponse.json()
  content = content.replace(/\bjson\(/g, 'NextResponse.json(');

  // Fix createSupabaseServerClient(event)
  content = content.replace(/createSupabaseServerClient\(event\)/g, 'createSupabaseServerClient()');

  // Fix function signatures
  content = content
    .replace(/export async function GET\s*\(\s*event\s*\)/g, 'export async function GET(request, { params } = {})')
    .replace(/export async function POST\s*\(\s*event\s*\)/g, 'export async function POST(request, { params } = {})')
    .replace(/export async function PUT\s*\(\s*event\s*\)/g, 'export async function PUT(request, { params } = {})')
    .replace(/export async function DELETE\s*\(\s*event\s*\)/g, 'export async function DELETE(request, { params } = {})')
    .replace(/export async function PATCH\s*\(\s*event\s*\)/g, 'export async function PATCH(request, { params } = {})');

  // Fix event references inside functions
  content = content
    .replace(/const \{ request \} = event;?\n?/g, '')
    .replace(/event\.request\b/g, 'request')
    .replace(/event\.params\b/g, 'params')
    .replace(/event\.url\.searchParams/g, 'new URL(request.url).searchParams')
    .replace(/event\.url\b/g, 'new URL(request.url)')
    .replace(/applyRateLimit\(event\b/g, 'applyRateLimit(request')
    .replace(/getClientIp\(event\)/g, 'getClientIp(request)')
    .replace(/event\.getClientAddress\(\)/g, "request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'");

  // Remove SvelteKit type comments
  content = content.replace(/\/\*\* @type \{import\('\.\/\$types'\)\.RequestHandler\} \*\//g, '');

  // Remove sveltekit-rate-limiter import (we use our own)
  content = content.replace(/import.*sveltekit-rate-limiter.*\n/g, '');

  writeFileSync(outFile, content, 'utf8');
  console.log(`Converted: ${rel}`);
}

console.log(`\nDone. Converted ${files.length} routes.`);
