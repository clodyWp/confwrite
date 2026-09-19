# ConfWrite 安装脚本 (PowerShell)
# 用法: .\scripts\install.ps1
$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectDir

try {
    Write-Host "📦 ConfWrite 安装" -ForegroundColor Cyan
    Write-Host "================="

    # 1. 安装依赖（确保 shims 为当前平台正确生成）
    Write-Host "📥 安装依赖..."
    npm install

    # 2. 编译
    Write-Host "🔨 编译 TypeScript..."
    npm run build

    # 3. 安装到 pi（使用本地目录）
    Write-Host "🔌 安装到 pi..."
    pi install $ProjectDir

    Write-Host ""
    Write-Host "✅ 安装完成！" -ForegroundColor Green
    Write-Host ""
    Write-Host "使用方式:"
    Write-Host "  /confwrite:init <project-slug>"
    Write-Host "  /confwrite:organize"
    Write-Host "  /confwrite:write"
    Write-Host "  /confwrite:status"
    Write-Host "  /confwrite:export <format>"
} finally {
    Pop-Location
}
