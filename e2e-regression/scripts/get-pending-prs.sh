#!/bin/bash
# get-pending-prs.sh - 获取自上次 E2E 测试以来合并的 PR 列表
#
# 用法:
#   bash get-pending-prs.sh [last-e2e-state.json]
#
# 参数:
#   last-e2e-state.json - 追踪文件路径（默认: e2e-regression/last-e2e-state.json）
#
# 输出:
#   待验证的 PR 列表（JSON 格式）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 追踪文件路径
STATE_FILE="${1:-$REPO_ROOT/e2e-regression/last-e2e-state.json}"

# 检查追踪文件是否存在
if [ ! -f "$STATE_FILE" ]; then
  echo "错误: 追踪文件不存在: $STATE_FILE" >&2
  echo "请先创建 e2e-regression/last-e2e-state.json" >&2
  exit 1
fi

# 读取上次 E2E 的时间戳
LAST_TIMESTAMP=$(jq -r '.timestamp' "$STATE_FILE")
LAST_COMMIT=$(jq -r '.commit' "$STATE_FILE")
LAST_VERSION=$(jq -r '.version' "$STATE_FILE")

echo "上次 E2E 测试: $LAST_VERSION ($LAST_COMMIT) @ $LAST_TIMESTAMP" >&2
echo "" >&2

# 获取自上次以来的所有合并 PR
# 使用 GitHub CLI 查询
PENDING_PRS=$(gh pr list \
  --repo clodyWp/confwrite \
  --state merged \
  --base master \
  --search "merged:>=$LAST_TIMESTAMP" \
  --json number,title,mergedAt \
  --jq '.[] | {number: .number, title: .title, mergedAt: .mergedAt}' 2>/dev/null || echo "")

if [ -z "$PENDING_PRS" ]; then
  echo "没有待验证的 PR"
  exit 0
fi

# 输出 JSON 格式
echo "["
FIRST=true
echo "$PENDING_PRS" | while IFS= read -r line; do
  if [ -n "$line" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo ","
    fi
    echo "  $line"
  fi
done
echo "]"

# 输出摘要
PR_COUNT=$(echo "$PENDING_PRS" | wc -l)
echo "" >&2
echo "待验证 PR 数量: $PR_COUNT" >&2