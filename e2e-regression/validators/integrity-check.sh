#!/bin/bash
# Integrity Check Validator
# 检测 subagent 是否读取了 ConfWrite 源码（会导致测试无效）

set -e

# 参数解析
HOST=""
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            HOST="$2"
            shift 2
            ;;
        --dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        *)
            PROJECT_DIR="$1"
            shift
            ;;
    esac
done

# 远程模式
if [ -n "$HOST" ]; then
    if [ -z "$PROJECT_DIR" ]; then
        echo "❌ --dir is required in remote mode"
        exit 1
    fi
    
    echo "🔍 Checking test integrity (remote: $HOST): $PROJECT_DIR"
    echo ""
    
    ssh "$HOST" bash <<REMOTE_SCRIPT
set -e

PROJECT_DIR="$PROJECT_DIR"
LOGS_DIR="\$PROJECT_DIR/logs"

if [ ! -d "\$LOGS_DIR" ]; then
    echo "❌ Logs directory not found: \$LOGS_DIR"
    exit 1
fi

VIOLATIONS=0

echo "📋 Checking for source code access..."

# 1. 检查是否读取 node_modules/confwrite/src
if grep -r "node_modules/confwrite/src" "\$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/src"
    grep -r "node_modules/confwrite/src" "\$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=\$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/src"
fi

# 2. 检查是否读取 node_modules/confwrite/dist
if grep -r "node_modules/confwrite/dist" "\$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/dist"
    grep -r "node_modules/confwrite/dist" "\$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=\$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/dist"
fi

# 3. 检查是否读取 node_modules/confwrite/package.json
if grep -r "node_modules/confwrite/package.json" "\$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read confwrite/package.json"
    grep -r "node_modules/confwrite/package.json" "\$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=\$((VIOLATIONS + 1))
else
    echo "  ✅ No access to confwrite/package.json"
fi

echo ""
echo "📋 Checking for directory exploration..."

# 4. 检查是否有探索 ConfWrite 目录的 bash 命令
if grep -rE "(ls|find|cat).*confwrite" "\$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ⚠️  WARNING: Possible directory exploration detected"
    grep -rE "(ls|find|cat).*confwrite" "\$LOGS_DIR"/subagent-*.log | head -3
else
    echo "  ✅ No directory exploration detected"
fi

echo ""
echo "📋 Checking for src/ directory access..."

# 5. 检查是否读取 src/ 目录
if grep -rE "read.*src/(writing|orchestrator|dispatcher|scheduler)" "\$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ❌ VIOLATION: Subagent read src/ directory"
    grep -rE "read.*src/(writing|orchestrator|dispatcher|scheduler)" "\$LOGS_DIR"/subagent-*.log | head -3
    VIOLATIONS=\$((VIOLATIONS + 1))
else
    echo "  ✅ No access to src/ directory"
fi

echo ""
echo "📊 Summary:"
echo "  Violations: \$VIOLATIONS"

if [ \$VIOLATIONS -eq 0 ]; then
    echo ""
    echo "✅ Test integrity verified - no source code access detected"
    exit 0
else
    echo ""
    echo "❌ Test integrity compromised - \$VIOLATIONS violation(s) detected"
    echo "   Test results are INVALID and should be discarded"
    exit 1
fi
REMOTE_SCRIPT
    exit $?
fi

# 本地模式
if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR="."
fi

LOGS_DIR="$PROJECT_DIR/logs"

if [ ! -d "$LOGS_DIR" ]; then
    echo "❌ Logs directory not found: $LOGS_DIR"
    exit 1
fi

echo "🔍 Checking test integrity: $PROJECT_DIR"
echo ""

VIOLATIONS=0

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

echo ""
echo "📋 Checking for directory exploration..."

# 4. 检查是否有探索 ConfWrite 目录的 bash 命令
if grep -rE "(ls|find|cat).*confwrite" "$LOGS_DIR"/subagent-*.log > /dev/null 2>&1; then
    echo "  ⚠️  WARNING: Possible directory exploration detected"
    grep -rE "(ls|find|cat).*confwrite" "$LOGS_DIR"/subagent-*.log | head -3
else
    echo "  ✅ No directory exploration detected"
fi

echo ""
echo "📋 Checking for src/ directory access..."

# 5. 检查是否读取 src/ 目录
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
