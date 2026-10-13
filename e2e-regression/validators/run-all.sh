#!/bin/bash
# Run All Validators
# 运行所有验证脚本并汇总结果

set -e

PROJECT_DIR="${1:-.}"
VALIDATORS_DIR="$(dirname "$0")"

echo "🚀 Running all validators for: $PROJECT_DIR"
echo ""

TOTAL=0
PASSED=0
FAILED=0
WARNINGS=0

run_validator() {
    local name="$1"
    local script="$2"
    
    TOTAL=$((TOTAL + 1))
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "▶ Running: $name"
    echo ""
    
    if bash "$VALIDATORS_DIR/$script" "$PROJECT_DIR"; then
        PASSED=$((PASSED + 1))
        echo ""
        echo "✅ $name: PASSED"
    else
        FAILED=$((FAILED + 1))
        echo ""
        echo "❌ $name: FAILED"
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
