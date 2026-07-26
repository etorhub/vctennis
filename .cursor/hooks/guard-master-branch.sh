#!/usr/bin/env bash
# Cursor hook: block commits/pushes and (via preToolUse) file mutations on master.
set -euo pipefail

input=$(cat)
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo_root"

branch=$(git branch --show-current 2>/dev/null || true)
if [[ -z "$branch" ]]; then
  # Detached HEAD — allow (e.g. bisect); agents should still prefer named branches.
  echo '{"permission":"allow"}'
  exit 0
fi

if [[ "$branch" != "master" && "$branch" != "main" ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Allow creating / switching onto a new branch from master.
command=$(echo "$input" | jq -r '.command // empty')
tool_name=$(echo "$input" | jq -r '.tool_name // .toolName // empty')

if [[ -n "$command" ]]; then
  if echo "$command" | grep -Eqi 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c|branch[[:space:]]+)'; then
    echo '{"permission":"allow"}'
    exit 0
  fi
  # Read-only / non-mutating git and other commands are fine; only block write-ish git.
  if echo "$command" | grep -Eqi 'git[[:space:]]+(commit|push|merge|rebase|cherry-pick|am|revert|tag[[:space:]]+-)|gh[[:space:]]+pr[[:space:]]+create'; then
    jq -n \
      --arg um "Blocked: you are on \`$branch\`. Create a feature branch first, then retry." \
      --arg am "You are on \`$branch\`. Per project policy, create a dedicated branch from up-to-date master before committing or opening a PR. Run: git fetch origin && git checkout master && git pull --ff-only origin master && git checkout -b feat/<short-name>" \
      '{permission:"deny", user_message:$um, agent_message:$am}'
    exit 0
  fi
  echo '{"permission":"allow"}'
  exit 0
fi

# preToolUse for Write/Delete (and similar): block file mutations on master.
case "$tool_name" in
  Write|Delete|StrReplace|Edit|MultiEdit|TabWrite)
    jq -n \
      --arg um "Blocked edit on \`$branch\`. Use a feature branch." \
      --arg am "You are on \`$branch\`. Create a dedicated branch from up-to-date master before editing files. Run: git fetch origin && git checkout master && git pull --ff-only origin master && git checkout -b feat/<short-name>" \
      '{permission:"deny", user_message:$um, agent_message:$am}'
    exit 0
    ;;
esac

echo '{"permission":"allow"}'
exit 0
