#!/bin/bash
# scripts/push-to-remote.sh
# 构建 confwrite 包并推送到 herdr 远程机器

set -euo pipefail

# 配置（可通过环境变量覆盖）
REMOTE_HOST="${CONFWRITE_REMOTE_HOST:-water@8.160.160.85}"
REMOTE_DIR="${CONFWRITE_REMOTE_DIR:-confwrite}"
HERDR_MACHINE="${CONFWRITE_HERDR_MACHINE:-774acc1020ca346983f301baef778373}"
REMOTE_PANE="${CONFWRITE_REMOTE_PANE:-w8:p1}"
REMOTE_AGENT_NAME="${CONFWRITE_REMOTE_AGENT:-c1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version")
TARBALL="confwrite-${VERSION}.tgz"

echo "=== 推送 confwrite v${VERSION} 到远程 ==="
echo "远程主机: ${REMOTE_HOST}"
echo "远程目录: ~/${REMOTE_DIR}"
echo "Herdr 机器: ${HERDR_MACHINE} / pane: ${REMOTE_PANE}"
echo ""

# 1. 构建
echo "1. 构建项目..."
npm run build 2>&1 | grep -v "^$" | tail -3
echo "✓ 构建完成"

# 2. 打包
echo ""
echo "2. 打包..."
rm -f ./*.tgz
npm pack 2>&1 | grep -E "^(npm notice name:|npm notice version:|npm notice filename:)" || true
echo "✓ 打包完成: ${TARBALL}"

# 3. 传输
echo ""
echo "3. 传输到远程..."
scp -o ConnectTimeout=15 "$TARBALL" "${REMOTE_HOST}:~/" > /dev/null 2>&1
echo "✓ 传输完成"

# 4. 解压（替换旧版本）
echo ""
echo "4. 解压到远程 ~/${REMOTE_DIR}..."
ssh "$REMOTE_HOST" "
  set -e
  cd ~
  rm -rf '${REMOTE_DIR}'
  mkdir -p '${REMOTE_DIR}'
  tar xzf '${TARBALL}' -C '${REMOTE_DIR}' --strip-components=1
  rm -f '${TARBALL}'
"
echo "✓ 解压完成"

# 5. 安装依赖（优化：检查是否已安装）
echo ""
echo "5. 安装依赖（远程）..."
NEED_INSTALL=$(ssh "$REMOTE_HOST" "
  if [ -d '/home/water/${REMOTE_DIR}/node_modules' ] && [ -f '/home/water/${REMOTE_DIR}/node_modules/.package-lock.json' ]; then
    echo 'skip'
  else
    echo 'install'
  fi
" 2>/dev/null || echo "install")

if [ "$NEED_INSTALL" = "install" ]; then
  echo "   正在安装依赖（首次或依赖变更）..."
  ssh "$REMOTE_HOST" "cd ~/'${REMOTE_DIR}' && npm install --omit=dev --no-audit --no-fund > /dev/null 2>&1"
  echo "✓ 依赖安装完成"
else
  echo "✓ 依赖已存在，跳过安装"
fi

# 6. 重启远程 pi
echo ""
echo "6. 重启远程 pi..."
herdr --machine "$HERDR_MACHINE" agent prompt "$REMOTE_PANE" "/quit" --wait --timeout 10000 > /dev/null 2>&1 || true
sleep 2
herdr --machine "$HERDR_MACHINE" agent start "$REMOTE_AGENT_NAME" --kind pi --pane "$REMOTE_PANE" --timeout 60000 > /dev/null 2>&1
echo "✓ pi 已重启"

# 7. 验证
echo ""
echo "7. 验证..."
STATUS=$(herdr --machine "$HERDR_MACHINE" agent list 2>&1 | jq -r ".result.agents[] | select(.pane_id == \"${REMOTE_PANE}\") | .agent_status")
if [ "$STATUS" != "idle" ]; then
  echo "✗ 验证失败: pi 状态为 ${STATUS}"
  exit 1
fi

REMOTE_VERSION=$(ssh "$REMOTE_HOST" "node -p \"require(process.env.HOME + '/${REMOTE_DIR}/package.json').version\"")
echo "   远程版本: ${REMOTE_VERSION}"
echo "   pi 状态: ${STATUS}"

if [ "$REMOTE_VERSION" != "$VERSION" ]; then
  echo "✗ 版本不匹配: 期望 ${VERSION}, 实际 ${REMOTE_VERSION}"
  exit 1
fi

# 本地清理
rm -f "$TARBALL"

echo ""
echo "=== 完成：v${VERSION} 已推送到远程 ==="
