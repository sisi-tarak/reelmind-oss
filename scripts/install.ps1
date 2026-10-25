# ReelMind one-click setup for Windows.
# Run it by double-clicking Install-ReelMind.cmd in the ReelMind folder. Safe to run again: it skips what is already done.
# Works with the Windows PowerShell 5.1 that ships with Windows 10 and 11.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Helper = Join-Path $Root 'helper'
$EnvFile = Join-Path $Helper '.env'
$EnvExample = Join-Path $Helper '.env.example'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($n, $text) { Write-Host ''; Write-Host "[$n/6] $text" -ForegroundColor Cyan }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Ask($question, $default) {
  $suffix = ''
  if ($default) { $suffix = " [$default]" }
  $answer = Read-Host "$question$suffix"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}
function AskYes($question, $defaultYes) {
  $hint = 'y/N'
  if ($defaultYes) { $hint = 'Y/n' }
  $answer = Read-Host "$question ($hint)"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $defaultYes }
  return $answer.Trim().ToLower().StartsWith('y')
}
# Newly installed programs are not on PATH in this window until we reload it.
function Reload-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}
function Winget-Install($id, $name, $cmd) {
  if ($cmd -and (Has $cmd)) { Say "  $name is already installed." 'Green'; return }
  if (-not (Has 'winget')) {
    Say "  winget is not available, so $name can't be installed automatically. Install 'App Installer' from the Microsoft Store, then run this again." 'Yellow'
    return
  }
  Say "  Installing $name..."
  & winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent | Out-Host
  Reload-Path
  if ($cmd -and -not (Has $cmd)) { Say "  $name was installed but needs a new window to be found. If something fails later, close this window and run the installer again." 'Yellow' }
  else { Say "  $name installed." 'Green' }
}

# Reads and writes KEY=value lines in helper\.env, keeping everything else as it is.
function Get-EnvValue($text, $key) {
  $m = [regex]::Match($text, "(?m)^$([regex]::Escape($key))=(.*)$")
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ''
}
function Set-EnvValue($text, $key, $value) {
  $pattern = "(?m)^#?\s*$([regex]::Escape($key))=.*$"
  if ([regex]::IsMatch($text, $pattern)) { return [regex]::Replace($text, $pattern, "$key=$value", 1) }
  if (-not $text.EndsWith("`n")) { $text += "`r`n" }
  return $text + "$key=$value`r`n"
}

Write-Host ''
Write-Host '  ReelMind setup' -ForegroundColor White
Write-Host '  This installs what ReelMind needs, asks for your free Gemini key(s), and adds shortcuts.' -ForegroundColor Gray

# 1. Node.js -----------------------------------------------------------------------
Step 1 'Node.js'
$needNode = $true
if (Has 'node') {
  $major = [int]((& node -v).TrimStart('v').Split('.')[0])
  if ($major -ge 22) { $needNode = $false; Say "  Node.js $(& node -v) is ready." 'Green' }
  else { Say "  Node.js $(& node -v) is too old; ReelMind needs version 22 or newer." 'Yellow' }
}
if ($needNode) { Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js' $null; Reload-Path }
if (-not (Has 'node')) { Say '  Node.js is still missing. Install it from https://nodejs.org (LTS), then run this again.' 'Red'; exit 1 }

# 2. Tools that download and process reels -----------------------------------------
Step 2 'Download tools (yt-dlp, ffmpeg) and phone access (cloudflared)'
Winget-Install 'yt-dlp.yt-dlp' 'yt-dlp' 'yt-dlp'
Winget-Install 'Gyan.FFmpeg' 'ffmpeg' 'ffmpeg'
Winget-Install 'Cloudflare.cloudflared' 'cloudflared' 'cloudflared'

# 3. App packages ------------------------------------------------------------------
Step 3 'App packages (this can take a few minutes the first time)'
& npm install --no-fund --no-audit | Out-Host
if ($LASTEXITCODE -ne 0) { Say '  npm install failed. Check your internet connection and run this again.' 'Red'; exit 1 }
Say '  Packages installed.' 'Green'

# 4. Keys and settings ---------------------------------------------------------------
Step 4 'Your settings (helper\.env)'
if (-not (Test-Path $EnvFile)) {
  if (Test-Path $EnvExample) { Copy-Item $EnvExample $EnvFile } else { Set-Content -Path $EnvFile -Value '' -Encoding UTF8 }
}
$text = Get-Content -Raw -Path $EnvFile
if ($null -eq $text) { $text = '' }

$keys = @('GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5')
$have = @($keys | Where-Object { Get-EnvValue $text $_ })
Say "  Gemini keys saved so far: $($have.Count) of 5."
if ($have.Count -lt 5) {
  Say '  Get free keys at https://aistudio.google.com/apikey (click "Create API key in new project" for each one,'
  Say '  because keys in the same project share one daily limit). Press Enter to skip.'
  if (AskYes '  Open that page in your browser now?' ($have.Count -eq 0)) { Start-Process 'https://aistudio.google.com/apikey' }
  foreach ($k in $keys) {
    if (Get-EnvValue $text $k) { continue }
    $value = Read-Host "  Paste key for $k (or Enter to stop)"
    if ([string]::IsNullOrWhiteSpace($value)) { break }
    $text = Set-EnvValue $text $k $value.Trim()
  }
}
if (-not (Get-EnvValue $text 'ANTHROPIC_API_KEY')) {
  $claude = Read-Host '  Optional Claude API key (Enter to skip)'
  if (-not [string]::IsNullOrWhiteSpace($claude)) { $text = Set-EnvValue $text 'ANTHROPIC_API_KEY' $claude.Trim() }
}
$appUrl = Get-EnvValue $text 'REELMIND_APP_URL'
if (-not $appUrl -or $appUrl -match '^https://reelmind(-tau)?\.vercel\.app$') { $appUrl = 'https://reelmind-oss.vercel.app' }
$appUrl = Ask '  Your ReelMind website' $appUrl
$text = Set-EnvValue $text 'REELMIND_APP_URL' $appUrl
if (AskYes '  Use ReelMind from your phone while away (secure tunnel)?' ((Get-EnvValue $text 'REELMIND_TUNNEL') -ne '')) {
  $text = Set-EnvValue $text 'REELMIND_TUNNEL' 'on'
} else {
  $text = Set-EnvValue $text 'REELMIND_TUNNEL' ''
}
Set-Content -Path $EnvFile -Value $text -Encoding UTF8 -NoNewline
Say '  Settings saved. Your keys stay on this computer only.' 'Green'

# 5. Shortcuts -------------------------------------------------------------------------
Step 5 'Shortcuts'
$shell = New-Object -ComObject WScript.Shell
$starter = Join-Path $Root 'Start-ReelMind.cmd'
$icon = Join-Path $Root 'scripts\reelmind.ico'
function Make-Shortcut($path, $arguments, $style) {
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = $starter
  $s.Arguments = $arguments
  $s.WorkingDirectory = $Root
  $s.WindowStyle = $style
  if (Test-Path $icon) { $s.IconLocation = $icon }
  $s.Description = 'Start the ReelMind helper'
  $s.Save()
}
$desktop = [Environment]::GetFolderPath('Desktop')
Make-Shortcut (Join-Path $desktop 'ReelMind.lnk') '' 1
Say '  Added "ReelMind" to your desktop.' 'Green'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'ReelMind.lnk'
if (AskYes '  Start ReelMind automatically when Windows starts (minimized)?' $false) {
  Make-Shortcut $startup 'minimized' 7
  Say '  ReelMind will start with Windows.' 'Green'
} elseif (Test-Path $startup) {
  Remove-Item $startup
}

# 6. Done -----------------------------------------------------------------------------
Step 6 'All set'
Say '  Start ReelMind any time from the desktop shortcut. It opens your connect link automatically.'
if (AskYes '  Start ReelMind now?' $true) { Start-Process -FilePath $starter -WorkingDirectory $Root }
