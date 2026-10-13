#!/bin/bash
# Word Count Validator
# 验证章节字数是否在预算范围内

set -e

PROJECT_DIR="${1:-.}"
STATE_FILE="$PROJECT_DIR/project-state.json"
DRAFTS_DIR="$PROJECT_DIR/drafts/chapters"

if [ ! -f "$STATE_FILE" ]; then
    echo "❌ State file not found: $STATE_FILE"
    exit 1
fi

if [ ! -d "$DRAFTS_DIR" ]; then
    echo "❌ Drafts directory not found: $DRAFTS_DIR"
    exit 1
fi

echo "📋 Validating word counts: $PROJECT_DIR"
echo ""

TOTAL_CHAPTERS=0
VALID_COUNT=0
INVALID_COUNT=0
MISSING_COUNT=0

# 遍历所有章节
for chapter_file in "$DRAFTS_DIR"/*.md; do
    if [ ! -f "$chapter_file" ]; then
        continue
    fi
    
    filename=$(basename "$chapter_file")
    chapter_id=$(echo "$filename" | sed 's/-v[0-9]*\.md$//')
    
    # 获取字数预算
    budget=$(cat "$STATE_FILE" | jq -r ".chapters[\"$chapter_id\"].wordBudget // empty" 2>/dev/null)
    
    if [ -z "$budget" ]; then
        echo "  ⚠️  $chapter_id: No budget defined"
        MISSING_COUNT=$((MISSING_COUNT + 1))
        continue
    fi
    
    min=$(echo "$budget" | jq '.min')
    max=$(echo "$budget" | jq '.max')
    
    # 统计字数（字符数）
    actual=$(wc -m < "$chapter_file" | tr -d ' ')
    
    TOTAL_CHAPTERS=$((TOTAL_CHAPTERS + 1))
    
    if [ "$actual" -lt "$min" ]; then
        echo "  ❌ $chapter_id: $actual chars (min: $min, max: $max) - TOO SHORT"
        INVALID_COUNT=$((INVALID_COUNT + 1))
    elif [ "$actual" -gt "$max" ]; then
        echo "  ⚠️  $chapter_id: $actual chars (min: $min, max: $max) - OVER BUDGET"
        INVALID_COUNT=$((INVALID_COUNT + 1))
    else
        echo "  ✅ $chapter_id: $actual chars (min: $min, max: $max)"
        VALID_COUNT=$((VALID_COUNT + 1))
    fi
done

echo ""
echo "📊 Summary:"
echo "  Total chapters: $TOTAL_CHAPTERS"
echo "  Valid: $VALID_COUNT"
echo "  Invalid: $INVALID_COUNT"
echo "  Missing budget: $MISSING_COUNT"

if [ $INVALID_COUNT -eq 0 ]; then
    echo ""
    echo "✅ All chapters within word budget"
    exit 0
else
    echo ""
    echo "⚠️  Some chapters outside word budget"
    exit 1
fi
