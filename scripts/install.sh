#!/usr/bin/env bash
# ConfWrite 安装脚本
# 用法: ./scripts/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "📦 ConfWrite 安装"
echo "================="

# 1. 编译
echo "🔨 编译 TypeScript..."
npm run build

# 2. 安装到 pi（使用本地目录）
echo "🔌 安装到 pi..."
pi install "$PROJECT_DIR"

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方式:"
echo "  /confwrite:init <project-slug>"
echo "  /confwrite:organize"
echo "  /confwrite:write"
echo "  /confwrite:status"
echo "  /confwrite:export <format>"
