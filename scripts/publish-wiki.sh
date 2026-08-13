#!/usr/bin/env bash
# Publish every docs/*.md page to the GitHub wiki, regenerating Home from what is there.
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

# Page title: the H1 text. Summary: first sentence of the first paragraph, links flattened.
page_title() { sed -n 's/^# //p' "$1" | head -1; }
page_summary() {
  awk 'NR==1 && /^# /{next} /^[#>]/{next} NF{print; exit}' "$1" |
    sed -e 's/\[\([^]]*\)\]([^)]*)/\1/g' -e 's/\([^.]*\.\).*/\1/' -e 's/\*\*//g'
}

{
  echo "# Vinya Canadell Tennis wiki"
  echo
  echo "Internal documentation for the [vctennis](https://github.com/etorhub/vctennis) booking PWA."
  echo
  echo "Published from \`docs/\` by \`npm run docs:wiki\` — edit there, not here."
  echo
  echo "## Pages"
  echo
} > "$WIKI_DIR/Home.md"

for doc in "$ROOT"/docs/*.md; do
  name="$(basename "$doc" .md)"
  cp "$doc" "$WIKI_DIR/$name.md"
  echo "- [$(page_title "$doc")]($name) — $(page_summary "$doc")" >> "$WIKI_DIR/Home.md"
done

cd "$WIKI_DIR"
git add -A
if git diff --cached --quiet; then
  echo "Wiki already up to date."
  exit 0
fi
git commit -m "Sync wiki pages from docs/"
git push origin HEAD
echo "Published https://github.com/etorhub/vctennis/wiki"
