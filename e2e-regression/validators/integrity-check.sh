#!/bin/bash
# Integrity Check Validator
# 检测 subagent 是否读取了 ConfWrite 源码（会导致测试无效）

set -e

PROJECT_DIR="${1:-.}"
LOGS_DIR="$PROJECT_DIR/logs"

if [ ! -d "$LOGS_DIR" ]; then
    echo "❌ Logs directory not found: $LOGS_DIR"
    exit 1
fi

echo "🔍 Checking test integrity: $PROJECT_DIR"
echo ""

VIOLATIONS=0

# 检查 subagent 日志中是否读取了 ConfWrite 源码
echo "📋 Checking for source code access..."

# 1. 检查是否读取 node_modules/confwrite/src
if grep -r "node_modules/confwrite/src" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/src"
    grep -r "node_modules/confwrite/src" "$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/src"
fi

# 2. 检查是否读取 node_modules/confwrite/dist
if grep -r "node_modules/confwrite/dist" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/dist"
    grep -r "node_modules/confwrite/dist" "$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/dist"
fi

# 3. 检查是否读取 node_modules/confwrite/package.json
if grep -r "node_modules/confwrite/package.json" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/package.json"
    grep -r "node_modules/confwrite/package.json" "$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/package.json"
fi

# 4. 检查是否有探索 ConfWrite 目录的 bash 命令
echo ""
echo "📋 Checking for directory exploration..."

if grep -rE "(ls|find|cat).*confwrite" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ⚠️  WARNING: Possible directory exploration detected"
    grep -rE "(ls|find|cat).*confwrite" "$LOGS_DIR"/subagent-*.log | head -3
    # 这不一定是违规，可能是误报
else
    echo "  ✅ No directory exploration detected"
fi

# 5. 检查是否读取 src/ 目录（可能是 ConfWrite 源码）
echo ""
echo "📋 Checking for src/ directory access..."

if grep -rE "read.*src/(writing|orchestrator|dispatcher|scheduler)" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read src/ directory"
    grep -rE "read.*src/(writing|orchestrator|dispatcher|scheduler)" "$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "  ✅ No access to src/ directory"
fi

echo ""
echo "📊 Summary:"
echo "  Violations: $VIOLATIONS"

if [ $VIOLATIONS -eq 0 ]; then
    echo ""
    echo "✅ Test integrity verified - no source code access detected"
    exit 0
else
    echo ""
    echo "❌ Test integrity compromised - $VIOLATIONS violation(s) detected"
    echo "   Test results are INVALID and should be discarded"
    exit 1
fi
