#!/bin/bash
# Phase Flow Validator
# 验证 phase 转换是否符合预期顺序

set -e

# 参数解析
HOST=""
LOG_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            HOST="$2"
            shift 2
            ;;
        --dir)
            PROJECT_DIR="$2"
            LOG_FILE="$PROJECT_DIR/logs/confwrite-log.jsonl"
            shift 2
            ;;
        *)
            LOG_FILE="$1"
            shift
            ;;
    esac
done

EXPECTED_ORDER=("0a" "0b" "1" "2" "3" "4a" "4b" "4c" "4d" "5" "6" "7" "8" "done")

# 远程模式
if [ -n "$HOST" ]; then
    if [ -z "$LOG_FILE" ]; then
        echo "❌ --dir is required in remote mode"
        exit 1
    fi
    
    echo "📋 Validating phase flow (remote: $HOST): $LOG_FILE"
    echo ""
    
    # 在远端执行验证
    ssh "$HOST" bash <<REMOTE_SCRIPT
set -e

LOG_FILE="$LOG_FILE"

if [ ! -f "\$LOG_FILE" ]; then
    echo "❌ Log file not found: \$LOG_FILE"
    exit 1
fi

# 提取所有 phase transition 事件
TRANSITIONS=\$(cat "\$LOG_FILE" | jq -r 'select(.event.type == "phase.transition") | "\(.event.from) → \(.event.to)"' 2>/dev/null || echo "")

if [ -z "\$TRANSITIONS" ]; then
    echo "❌ No phase transitions found in log"
    exit 1
fi

echo "📊 Detected transitions:"
echo "\$TRANSITIONS" | while read line; do
    echo "  \$line"
done
echo ""

# 检查是否到达最终阶段
if echo "\$TRANSITIONS" | grep -q "→ done"; then
    echo "✅ Phase flow completed successfully"
    exit 0
elif echo "\$TRANSITIONS" | grep -q "→ 6"; then
    echo "⚠️  Phase flow reached assembly (phase 6) but not done"
    echo "    This is acceptable if user stopped at waitPoint"
    exit 0
else
    echo "❌ Phase flow did not complete"
    exit 1
fi
REMOTE_SCRIPT
    exit $?
fi

# 本地模式
if [ -z "$LOG_FILE" ]; then
    LOG_FILE="logs/confwrite-log.jsonl"
fi

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    exit 1
fi

echo "📋 Validating phase flow: $LOG_FILE"
echo ""

# 提取所有 phase transition 事件
TRANSITIONS=$(cat "$LOG_FILE" | jq -r 'select(.event.type == "phase.transition") | "\(.event.from) → \(.event.to)"' 2>/dev/null || echo "")

if [ -z "$TRANSITIONS" ]; then
    echo "❌ No phase transitions found in log"
    exit 1
fi

echo "📊 Detected transitions:"
echo "$TRANSITIONS" | while read line; do
    echo "  $line"
done
echo ""

# 检查是否到达最终阶段
if echo "$TRANSITIONS" | grep -q "→ done"; then
    echo ""
    echo "✅ Phase flow completed successfully"
    exit 0
elif echo "$TRANSITIONS" | grep -q "→ 6"; then
    echo ""
    echo "⚠️  Phase flow reached assembly (phase 6) but not done"
    echo "    This is acceptable if user stopped at waitPoint"
    exit 0
else
    echo ""
    echo "❌ Phase flow did not complete"
    exit 1
fi
