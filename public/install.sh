#!/bin/sh
# Install qc, the qrypt.chat terminal client (npm: @profullstack/qryptchat).
#
#   curl -fsSL https://qrypt.chat/install.sh | sh
#
# Uses bun if present, otherwise npm (Node >= 22). When the global npm prefix
# is not writable it installs into ~/.local instead of asking for sudo.
set -eu

PKG="@profullstack/qryptchat"

say() { printf '%s\n' "$*"; }
die() { printf 'qc install: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

say "Installing qc (qrypt.chat terminal client)..."

if have bun; then
  bun add -g "$PKG"
  BIN_DIR="${BUN_INSTALL:-$HOME/.bun}/bin"
elif have npm && have node; then
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$major" -ge 22 ] || die "Node >= 22 required (found $(node -v)). Upgrade Node or install bun: https://bun.sh"
  prefix=$(npm config get prefix)
  modules="$prefix/lib/node_modules"
  [ -d "$modules" ] || modules="$prefix/lib"
  if [ -w "$modules" ] && [ -w "$prefix/bin" ]; then
    npm install -g "$PKG"
    BIN_DIR="$prefix/bin"
  else
    BIN_DIR="$HOME/.local/bin"
    say "npm prefix $prefix is not writable; installing into $HOME/.local"
    npm install -g --prefix "$HOME/.local" "$PKG"
  fi
else
  die "needs bun (https://bun.sh) or Node >= 22 with npm (https://nodejs.org)"
fi

say ""
if have qc; then
  say "$(qc --version 2>/dev/null || echo qc) installed."
else
  say "qc installed to $BIN_DIR, which is not on your PATH. Add it:"
  say "  export PATH=\"$BIN_DIR:\$PATH\""
fi
say ""
say "Next:"
say "  qc login    # approve in your browser; keys are sealed to this device"
say "  qc          # open the TUI"
say "  qc --help   # CLI and MCP usage"
