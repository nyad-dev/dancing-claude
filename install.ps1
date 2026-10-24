# Dancing Claude installer for Windows.
#   irm https://raw.githubusercontent.com/nyad-dev/dancing-claude/main/install.ps1 | iex
& {
  $repo = 'nyad-dev/dancing-claude'
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host 'Claude Code is not installed yet: https://claude.com/claude-code' -ForegroundColor Yellow
    return
  }
  Write-Host 'Adding the dancing-claude marketplace...'
  claude plugin marketplace add $repo
  if ($LASTEXITCODE -ne 0) { claude plugin marketplace update dancing-claude }
  Write-Host 'Installing Clawd...'
  claude plugin install dancing-claude@dancing-claude
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Install failed; see the message above.' -ForegroundColor Red
    return
  }
  Write-Host ''
  Write-Host '  Clawd is installed! Start a new Claude Code session and look above your prompt.' -ForegroundColor DarkYellow
  Write-Host '  Try /clawd dance'
}
