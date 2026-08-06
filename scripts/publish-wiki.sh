#!/usr/bin/env bash
# Publish docs/Event-logging.md to the GitHub wiki.
# Prerequisite: create the first wiki page once in the GitHub UI
# (https://github.com/etorhub/vctennis/wiki) so the vctennis.wiki.git remote exists.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIKI_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WIKI_DIR"; }
trap cleanup EXIT

if ! git ls-remote "https://github.com/etorhub/vctennis.wiki.git" HEAD &>/dev/null; then
  echo "Wiki remote not found. Open https://github.com/etorhub/vctennis/wiki and create the first page, then re-run." >&2
  exit 1
fi

git clone --depth 1 "https://github.com/etorhub/vctennis.wiki.git" "$WIKI_DIR"
cp "$ROOT/docs/Event-logging.md" "$WIKI_DIR/Event-logging.md"
cat > "$WIKI_DIR/Home.md" <<'EOF'
# Vinya Canadell Tennis wiki

Internal documentation for the [vctennis](https://github.com/etorhub/vctennis) booking PWA.

## Pages

- [Event logging](Event-logging) — domain events stored in Turso (`Events` table), catalog, PII rules, and query examples
EOF

cd "$WIKI_DIR"
git add Home.md Event-logging.md
if git diff --cached --quiet; then
  echo "Wiki already up to date."
  exit 0
fi
git commit -m "Sync Event-logging from docs/"
git push origin HEAD
echo "Published https://github.com/etorhub/vctennis/wiki/Event-logging"
