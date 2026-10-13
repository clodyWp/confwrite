#!/bin/bash
# update-e2e-state.sh - 更新 E2E 追踪文件
#
# 用法:
#   bash update-e2e-state.sh <version> <commit> <project-dir> [issues-json]
#
# 参数:
#   version       - ConfWrite 版本号（如 v0.25.0）
#   commit        - Git commit hash
#   project-dir   - 测试项目目录
#   issues-json   - 发现的问题 JSON 数组（可选）
#
# 示例:
#   bash update-e2e-state.sh v0.25.0 abc123 /home/water/proj/c4/projects/e2e-v25 '[{"id":"NEW-001","description":"新问题"}]'

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 参数检查
if [ $# -lt 3 ]; then
  echo "用法: $0 <version> <commit> <project-dir> [issues-json]" >&2
  exit 1
fi

VERSION="$1"
COMMIT="$2"
PROJECT_DIR="$3"
ISSUES_JSON="${4:-[]}"

# 追踪文件路径
STATE_FILE="$REPO_ROOT/e2e-regression/last-e2e-state.json"

# 生成时间戳
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 写入文件
cat > "$STATE_FILE" << EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "timestamp": "$TIMESTAMP",
  "projectDir": "$PROJECT_DIR",
  "issuesFound": $ISSUES_JSON,
  "notes": "Updated after E2E test on $TIMESTAMP"
}
EOF

echo "已更新追踪文件: $STATE_FILE"
echo "  版本: $VERSION"
echo "  Commit: $COMMIT"
echo "  发现问题: $(echo "$ISSUES_JSON" | jq 'length' 2>/dev/null || echo '0')"