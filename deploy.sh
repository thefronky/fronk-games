#!/usr/bin/env bash
# One-shot deploy: create the GitHub repo, push, enable Pages, print the links.
# Requires you to be logged in first:  gh auth login
set -e
cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then echo "GitHub CLI (gh) not installed. Run: brew install gh"; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then
  echo "You're not logged in to GitHub yet. Run this once, then re-run me:"
  echo "    gh auth login        # GitHub.com -> HTTPS -> Login with a web browser"
  exit 1
fi

USER=$(gh api user -q .login)
echo "Logged in as: $USER"

if git remote | grep -q '^origin$'; then
  echo "Pushing to existing remote…"; git push -u origin main
else
  echo "Creating public repo 'fronk-games' and pushing…"
  gh repo create fronk-games --public --source=. --remote=origin --push
fi

echo "Enabling GitHub Pages (main / root)…"
gh api --method POST "repos/$USER/fronk-games/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
  || gh api --method PUT "repos/$USER/fronk-games/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
  || echo "  (Pages may need to be toggled once in Settings -> Pages)"

echo ""
echo "✅ Done — live in ~1 minute:"
echo "   Hub:  https://$USER.github.io/fronk-games/"
echo "   Game: https://$USER.github.io/fronk-games/monster-fighter/"
echo ""
echo "Send the Game link to friends. On a phone: open it -> Add to Home Screen -> plays like an app."
