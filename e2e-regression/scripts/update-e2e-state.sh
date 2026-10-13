#!/bin/bash
# update-e2e-state.sh - 更新 E2E 追踪文件
#
# 用法:
#   bash update-e2e-state.sh <version> <commit> <project-dir> [verified-prs...]
#
# 参数:
#   version       - ConfWrite 版本号（如 v0.25.0）
#   commit        - Git commit hash
#   project-dir   - 测试项目目录
#   verified-prs  - 已验证的 PR 列表（可选，空格分隔）
#
# 示例:
#   bash update-e2e-state.sh v0.25.0 abc123 /home/water/proj/c4/projects/e2e-v25 "#68" "#69"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 参数检查
if [ $# -lt 3 ]; then
  echo "用法: $0 <version> <commit> <project-dir> [verified-prs...]" >&2
  exit 1
fi

VERSION="$1"
COMMIT="$2"
PROJECT_DIR="$3"
shift 3

# 剩余的参数是已验证的 PR
VERIFIED_PRS=("$@")

# 追踪文件路径
STATE_FILE="$REPO_ROOT/e2e-regression/last-e2e-state.json"

# 生成时间戳
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 构建 JSON
PR_ARRAY="["
FIRST=true
for pr in "${VERIFIED_PRS[@]}"; do
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    PR_ARRAY+=", "
  fi
  PR_ARRAY+="\"$pr\""
done
PR_ARRAY+="]"

# 写入文件
cat > "$STATE_FILE" << EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "timestamp": "$TIMESTAMP",
  "verifiedPRs": $PR_ARRAY,
  "projectDir": "$PROJECT_DIR",
  "notes": "Updated after E2E test on $TIMESTAMP"
}
EOF

echo "已更新追踪文件: $STATE_FILE"
echo "  版本: $VERSION"
echo "  Commit: $COMMIT"
echo "  已验证 PR: ${VERIFIED_PRS[*]}"