#!/bin/bash
# Run All Validators
# 运行所有验证脚本并汇总结果

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

VALIDATORS_DIR="$(dirname "$0")"

if [ -n "$HOST" ]; then
    echo "🚀 Running all validators (remote: $HOST) for: $PROJECT_DIR"
else
    echo "🚀 Running all validators for: $PROJECT_DIR"
fi
echo ""

TOTAL=0
PASSED=0
FAILED=0

run_validator() {
    local name="$1"
    local script="$2"
    
    TOTAL=$((TOTAL + 1))
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "▶ Running: $name"
    echo ""
    
    # 构建命令参数
    if [ -n "$HOST" ]; then
        if bash "$VALIDATORS_DIR/$script" --host "$HOST" --dir "$PROJECT_DIR"; then
            PASSED=$((PASSED + 1))
            echo ""
            echo "✅ $name: PASSED"
        else
            FAILED=$((FAILED + 1))
            echo ""
            echo "❌ $name: FAILED"
        fi
    else
        if bash "$VALIDATORS_DIR/$script" --dir "$PROJECT_DIR"; then
            PASSED=$((PASSED + 1))
            echo ""
            echo "✅ $name: PASSED"
        else
            FAILED=$((FAILED + 1))
            echo ""
            echo "❌ $name: FAILED"
        fi
    fi
    echo ""
}

# 运行验证脚本
run_validator "Integrity Check" "integrity-check.sh"
run_validator "Phase Flow" "phase-flow.sh"
run_validator "Word Count" "word-count.sh"
run_validator "Chapter Types" "chapter-types.sh"

# 汇总结果
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 VALIDATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total validators: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ ALL VALIDATIONS PASSED"
    exit 0
else
    echo "❌ SOME VALIDATIONS FAILED"
    exit 1
fi
