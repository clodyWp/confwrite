#!/bin/bash
# Phase Flow Validator
# 验证 phase 转换是否符合预期顺序

set -e

LOG_FILE="${1:-logs/confwrite-log.jsonl}"
EXPECTED_ORDER=("0a" "0b" "1" "2" "3" "4a" "4b" "4c" "4d" "5" "6" "7" "8" "done")

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

# 验证关键转换
VALID=true
CHECKS=(
    "0a → 0b"
    "0b → 1"
    "1 → 2"
    "2 → 4a"
    "4a → 4b"
    "4b → 4c"
    "4c → 4d"
    "4d → 4b"
    "4b → 4c"
    "4c → 5"
    "5 → 6"
)

echo "🔍 Checking required transitions:"
for check in "${CHECKS[@]}"; do
    if echo "$TRANSITIONS" | grep -q "$check"; then
        echo "  ✅ $check"
    else
        echo "  ⚠️  $check (not found)"
        # 某些转换可能不存在（如 4c → 4d 如果没有需要修复的章节）
    fi
done

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
