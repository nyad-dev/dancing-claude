#!/usr/bin/env bash
# Dancing Claude installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/nyad-dev/dancing-claude/main/install.sh | bash
set -u
repo="nyad-dev/dancing-claude"
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code is not installed yet: https://claude.com/claude-code" >&2
  exit 1
fi
echo "Adding the dancing-claude marketplace..."
claude plugin marketplace add "$repo" || claude plugin marketplace update dancing-claude
echo "Installing Clawd..."
claude plugin install dancing-claude@dancing-claude || { echo "Install failed; see the message above." >&2; exit 1; }
printf '\n  \033[38;2;217;119;87mClawd is installed!\033[0m Start a new Claude Code session and look above your prompt.\n  Try /clawd dance\n'
