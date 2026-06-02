#!/bin/bash
# Convert all SvelteKit API routes to Next.js route handlers

SRC="/home/ubuntu/src/qryptchat-web/src/routes/api"
DEST="/home/ubuntu/src/qryptchat-web/src/app/api"

# Find all +server.js files
find "$SRC" -name "+server.js" | while read -r file; do
  # Compute relative path
  rel="${file#$SRC/}"
  dir=$(dirname "$rel")

  # Create destination directory
  destdir="$DEST/$dir"
  mkdir -p "$destdir"

  # Output file
  outfile="$destdir/route.js"

  # Read and transform the file
  content=$(cat "$file")

  # Replace SvelteKit imports
  content=$(echo "$content" | sed "s|from '@sveltejs/kit'|from 'next/server'|g")
  content=$(echo "$content" | sed "s|import { json } from 'next/server'|import { NextResponse } from 'next/server'|g")
  content=$(echo "$content" | sed "s|json(|NextResponse.json(|g")

  # Replace $lib imports with @/lib
  content=$(echo "$content" | sed "s|from '\$lib/|from '@/lib/|g")
  content=$(echo "$content" | sed "s|from '\$lib/|from '@/lib/|g")

  # Replace event.request with request
  content=$(echo "$content" | sed "s|event\.request\b|request|g")

  # Replace createSupabaseServerClient(event) with createSupabaseServerClient()
  content=$(echo "$content" | sed "s|createSupabaseServerClient(event)|createSupabaseServerClient()|g")

  # Replace event.getClientAddress()
  content=$(echo "$content" | sed "s|event\.getClientAddress()|request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'|g")

  # Update applyRateLimit calls
  content=$(echo "$content" | sed "s|applyRateLimit(event,|applyRateLimit(request,|g")
  content=$(echo "$content" | sed "s|applyRateLimit(event)|applyRateLimit(request)|g")

  # Update function signatures: GET(event) -> GET(request)
  content=$(echo "$content" | sed "s|async function GET(event)|async function GET(request, { params } = {})|g")
  content=$(echo "$content" | sed "s|async function POST(event)|async function POST(request, { params } = {})|g")
  content=$(echo "$content" | sed "s|async function PUT(event)|async function PUT(request, { params } = {})|g")
  content=$(echo "$content" | sed "s|async function DELETE(event)|async function DELETE(request, { params } = {})|g")
  content=$(echo "$content" | sed "s|async function PATCH(event)|async function PATCH(request, { params } = {})|g")

  # Replace event.params with params
  content=$(echo "$content" | sed "s|event\.params\b|params|g")

  # Replace event.url.searchParams
  content=$(echo "$content" | sed "s|event\.url\b|new URL(request.url)|g")

  # Replace event.cookies with a comment
  content=$(echo "$content" | sed "s|event\.cookies\b|/* cookies - use next/headers */\nconst { cookies } = await import('next/headers'); const cookieStore = await cookies()|g")

  # Remove SvelteKit type imports/comments
  content=$(echo "$content" | sed "s|\/\*\* @type {import('\.\/\$types')\.RequestHandler} \*\/||g")

  echo "$content" > "$outfile"
  echo "Converted: $rel -> $dir/route.js"
done

echo "Done converting API routes"
