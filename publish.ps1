# publish.ps1 — 将 dsh-web-custom-title 发布为 GitHub 公开仓库
#
# 前置条件：
#   1. 安装 GitHub CLI：winget install GitHub.cli   （或 https://cli.github.com）
#   2. 登录：gh auth login
# 用法：
#   powershell -ExecutionPolicy Bypass -File publish.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'gh 未安装。请先运行：' -ForegroundColor Yellow
  Write-Host '  winget install GitHub.cli' -ForegroundColor Cyan
  Write-Host '安装后重新运行本脚本。' -ForegroundColor Yellow
  exit 1
}

gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '请先登录 GitHub CLI：' -ForegroundColor Yellow
  Write-Host '  gh auth login' -ForegroundColor Cyan
  exit 1
}

$repo = 'zxiaoshen/dsh-web-custom-title'
$desc = 'DSH Web 插件：自定义新页面大标题与圆形图标（双击改名 / 双击换图）'

Write-Host ''
Write-Host "创建并推送公开仓库 $repo ..." -ForegroundColor Cyan
gh repo create $repo --public --source . --push --description $desc 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  # 仓库已存在等情况：只补 remote 并推送
  git remote add origin "https://github.com/$repo.git" 2>$null
  git push -u origin main 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Write-Host '推送失败，请检查凭据（gh auth login）与分支名（git branch --show-current）。' -ForegroundColor Yellow; exit 1 }
}

Write-Host ''
Write-Host "✅ 发布完成：https://github.com/$repo" -ForegroundColor Green
