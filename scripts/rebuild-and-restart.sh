#!/bin/bash
# scripts/rebuild-and-restart.sh
# 自动构建并重启 t3 的 pi 进程

set -e

echo "=== 自动构建并重启 t3 pi ==="

# 1. 构建
echo "1. 构建项目..."
npm run build
echo "✓ 构建完成"

# 2. 退出 t3 的 pi
echo ""
echo "2. 退出 t3 pi..."
herdr agent prompt wK:p1 "/quit" --wait --timeout 5000 > /dev/null 2>&1 || true
sleep 1
echo "✓ pi 已退出"

# 3. 重新启动 pi
echo ""
echo "3. 重新启动 pi..."
herdr agent start t3 --kind pi --pane wK:p1 --timeout 30000 > /dev/null 2>&1
echo "✓ pi 已启动"

# 4. 验证
echo ""
echo "4. 验证 pi 状态..."
STATUS=$(herdr agent list 2>&1 | jq -r '.result.agents[] | select(.pane_id == "wK:p1") | .agent_status')
echo "   状态: $STATUS"

if [ "$STATUS" = "idle" ]; then
  echo "✓ 验证完成"
else
  echo "✗ 验证失败"
  exit 1
fi

echo ""
echo "=== 完成 ==="
