#!/bin/bash
# Chapter Types Validator
# 验证章节类型覆盖率

set -e

PROJECT_DIR="${1:-.}"
STATE_FILE="$PROJECT_DIR/project-state.json"

if [ ! -f "$STATE_FILE" ]; then
    echo "❌ State file not found: $STATE_FILE"
    exit 1
fi

echo "📋 Validating chapter types: $PROJECT_DIR"
echo ""

# 定义必需的类型
REQUIRED_TYPES=("functional" "technical" "requirements")

# 提取所有章节类型
CHAPTER_TYPES=$(cat "$STATE_FILE" | jq -r '.chapters | to_entries | map(.value.type) | .[]' 2>/dev/null | sort | uniq -c)

if [ -z "$CHAPTER_TYPES" ]; then
    echo "❌ No chapter types found in state"
    exit 1
fi

echo "📊 Chapter type distribution:"
echo "$CHAPTER_TYPES" | while read count type; do
    echo "  $type: $count"
done
echo ""

# 检查必需类型
echo "🔍 Checking required types:"
ALL_PRESENT=true

for required in "${REQUIRED_TYPES[@]}"; do
    if cat "$STATE_FILE" | jq -e ".chapters | to_entries | map(.value.type) | index(\"$required\")" > /dev/null 2>&1; then
        echo "  ✅ $required"
    else
        echo "  ❌ $required (missing)"
        ALL_PRESENT=false
    fi
done

# 统计总章节数
TOTAL=$(cat "$STATE_FILE" | jq '.chapters | length')
echo ""
echo "📊 Total chapters: $TOTAL"

if [ "$ALL_PRESENT" = true ]; then
    echo ""
    echo "✅ All required chapter types present"
    exit 0
else
    echo ""
    echo "⚠️  Some required chapter types missing"
    exit 1
fi
