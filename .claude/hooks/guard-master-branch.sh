#!/usr/bin/env bash
# Claude Code PreToolUse: block commits/pushes and file edits on master/main.
set -euo pipefail

input=$(cat)
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo_root"

branch=$(git branch --show-current 2>/dev/null || true)
if [[ -z "$branch" || ( "$branch" != "master" && "$branch" != "main" ) ]]; then
  exit 0
fi

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
command=$(echo "$input" | jq -r '.tool_input.command // empty')

msg="You are on \`$branch\`. Create a dedicated branch from up-to-date master before implementation. Run: git fetch origin && git checkout master && git pull --ff-only origin master && git checkout -b feat/<short-name>"

case "$tool_name" in
  Edit|MultiEdit|Write|NotebookEdit)
    echo "$msg" >&2
    exit 2
    ;;
  Bash)
    if echo "$command" | grep -Eqi 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c|branch[[:space:]]+)'; then
      exit 0
    fi
    if echo "$command" | grep -Eqi 'git[[:space:]]+(commit|push|merge|rebase|cherry-pick|am|revert|tag[[:space:]]+-)|gh[[:space:]]+pr[[:space:]]+create'; then
      echo "$msg" >&2
      exit 2
    fi
    exit 0
    ;;
esac

exit 0
