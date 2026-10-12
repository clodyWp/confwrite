#!/usr/bin/env bash
#
# ConfWrite 端到端测试脚本 (bash 版本)
# 通过 herdr 驱动远程 pi agent 完成全流程测试。
#
# 功能与 e2e-test-herdr.ps1 完全对等。
#
# Usage:
#   ./scripts/e2e-test-herdr.sh -p <project-name> [options]
#
# Options:
#   -p, --project <name>       项目名称（必填）
#   -w, --workspace <path>     远程工作区路径（默认 /home/water/proj/c4）
#   -i, --pane-id <id>         herdr pane ID（留空则自动创建）
#   -l, --log-dir <dir>        本地日志目录（默认 ./e2e-test-logs/）
#   --skip-init                跳过 init 阶段
#   --skip-organize            跳过 organize 阶段
#   --skip-outline             跳过 outline 阶段
#   -t, --timeout <minutes>    每阶段最大等待分钟数（默认 30）
#   -n, --dry-run              只打印命令序列，不实际执行
#   -h, --help                 显示帮助

set -euo pipefail

# ─── 默认参数 ─────────────────────────────────────────────────────────────────

WORKSPACE_PATH="/home/water/proj/c4"
PROJECT_NAME=""
PANE_ID=""
LOG_DIR=""
SKIP_INIT=false
SKIP_ORGANIZE=false
SKIP_OUTLINE=false
MAX_WAIT_MINUTES=30
DRY_RUN=false

# ─── 参数解析 ─────────────────────────────────────────────────────────────────

usage() {
    sed -n '2,/^$/{ s/^# \{0,1\}//; p }' "$0"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--project)     PROJECT_NAME="$2"; shift 2 ;;
        -w|--workspace)   WORKSPACE_PATH="$2"; shift 2 ;;
        -i|--pane-id)     PANE_ID="$2"; shift 2 ;;
        -l|--log-dir)     LOG_DIR="$2"; shift 2 ;;
        --skip-init)      SKIP_INIT=true; shift ;;
        --skip-organize)  SKIP_ORGANIZE=true; shift ;;
        --skip-outline)   SKIP_OUTLINE=true; shift ;;
        -t|--timeout)     MAX_WAIT_MINUTES="$2"; shift 2 ;;
        -n|--dry-run)     DRY_RUN=true; shift ;;
        -h|--help)        usage ;;
        *)                echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_NAME" ]]; then
    echo "Error: --project is required" >&2
    exit 1
fi

# ─── 路径与常量 ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$WORKSPACE_PATH/projects/$PROJECT_NAME"

if [[ -z "$LOG_DIR" ]]; then
    LOG_DIR="$PROJECT_ROOT/e2e-test-logs"
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/e2e-test-$PROJECT_NAME-$TIMESTAMP.log"
ANOMALY_LOG="$LOG_DIR/anomalies-$PROJECT_NAME-$TIMESTAMP.log"
PROGRESS_FILE="$LOG_DIR/progress-$PROJECT_NAME-$TIMESTAMP.json"

# ─── 异常检测模式 ─────────────────────────────────────────────────────────────

# 远程 pi 自行分析代码的典型模式
ANOMALY_PATTERNS=(
    '[Ii]让我\(来\|先\)\{0,1\}分析\(一下\)\{0,1\}'
    '[Ii]我\(来\|先\)\{0,1\}看看\(代码\|源码\|实现\)'
    '[Ii]\(这个\|这段\)\(代码\|逻辑\|实现\).\(问题\|bug\|错误\)'
    '[Ii]根据代码\(分析\|来看\|可以看出\)'
    '[Ii]源代码.*显示\|代码.*表明\|从.*代码.*可以'
    '[Ii]\(需要\|应该\|必须\)\(先\|首先\).\(理解\|了解\|分析\|检查\).\(代码\|实现\|逻辑\)'
    'src/.*\.ts'
    'function[[:space:]]\+[a-zA-Z_]\+\|const[[:space:]]\+[a-zA-Z_]\+[[:space:]]*=\|import[[:space:]]\+{'
)

ANOMALY_DESCRIPTIONS=(
    "pi 开始自行分析而非执行命令"
    "pi 查看代码而非执行命令"
    "pi 在分析代码问题"
    "pi 基于代码分析而非执行"
    "pi 在解读代码"
    "pi 认为需要先分析代码"
    "pi 在引用源码文件路径"
    "pi 在展示代码片段"
)

# ─── 日志函数 ─────────────────────────────────────────────────────────────────

init_log_dir() {
    mkdir -p "$LOG_DIR"
}

log() {
    local level="${2:-INFO}"
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local line="[$ts] [$level] $1"

    case "$level" in
        ERROR)   echo -e "\033[31m$line\033[0m" ;;   # Red
        WARN)    echo -e "\033[33m$line\033[0m" ;;   # Yellow
        OK)      echo -e "\033[32m$line\033[0m" ;;   # Green
        STEP)    echo -e "\033[36m$line\033[0m" ;;   # Cyan
        ANOMALY) echo -e "\033[35m$line\033[0m" ;;   # Magenta
        *)       echo "$line" ;;
    esac

    echo "$line" >> "$LOG_FILE"
}

write_anomaly() {
    local description="$1"
    local context="${2:-}"
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local line="[$ts] ANOMALY: $description"
    if [[ -n "$context" ]]; then
        line+=$'\n'"  Context: ${context:0:200}"
    fi
    echo "$line" >> "$ANOMALY_LOG"
    log "$description" "ANOMALY"
}

save_progress() {
    # $1 = JSON content
    echo "$1" > "$PROGRESS_FILE"
}

# ─── Herdr 交互函数 ───────────────────────────────────────────────────────────

test_herdr_available() {
    herdr --help >/dev/null 2>&1
}

ensure_pane() {
    if [[ -n "$PANE_ID" ]]; then
        log "使用已有 pane: $PANE_ID"
        if ! herdr pane get "$PANE_ID" >/dev/null 2>&1; then
            echo "Pane $PANE_ID 不存在或不可用" >&2
            exit 1
        fi
        echo "$PANE_ID"
        return
    fi

    log "创建新 pane 并启动远程 pi..." "STEP"

    # 获取当前 workspace
    local ws_list current_ws ws_id
    ws_list="$(herdr workspace list 2>&1)"
    # 简单解析：取第一个 workspace_id
    ws_id="$(echo "$ws_list" | grep -o '"workspace_id":"[^"]*"' | head -1 | cut -d'"' -f4)"
    if [[ -z "$ws_id" ]]; then
        ws_id="$(echo "$ws_list" | grep -o '"workspace_id": *"[^"]*"' | head -1 | cut -d'"' -f4)"
    fi

    # 分割 pane
    local split_result new_pane_id
    split_result="$(herdr pane split --current --direction right --no-focus 2>&1)"
    new_pane_id="$(echo "$split_result" | grep -o '"pane_id":"[^"]*"' | head -1 | cut -d'"' -f4)"
    if [[ -z "$new_pane_id" ]]; then
        new_pane_id="$(echo "$split_result" | grep -o '"pane_id": *"[^"]*"' | head -1 | cut -d'"' -f4)"
    fi
    log "新 pane 创建: $new_pane_id"

    # 重命名 pane
    herdr pane rename "$new_pane_id" "e2e-test-pi" >/dev/null 2>&1 || true

    # 在 pane 中启动 pi
    herdr pane run "$new_pane_id" "cd $WORKSPACE_PATH && pi" >/dev/null 2>&1 || true

    # 等待 pi 启动
    log "等待 pi 启动..."
    if ! herdr wait agent-status "$new_pane_id" --status idle --timeout 60000 >/dev/null 2>&1; then
        local pane_status
        pane_status="$(herdr pane get "$new_pane_id" 2>&1 | grep -o '"agent_status":"[^"]*"' | cut -d'"' -f4)"
        if [[ "$pane_status" != "idle" && "$pane_status" != "working" && "$pane_status" != "unknown" ]]; then
            echo "pi 启动失败，状态: $pane_status" >&2
            exit 1
        fi
    fi

    log "pi 已在 pane $new_pane_id 中启动" "OK"
    echo "$new_pane_id"
}

send_command() {
    local target_pane_id="$1"
    local command="$2"
    local stage="${3:-unknown}"
    local need_project_dir="${4:-false}"

    log "发送命令 [$stage]: $command" "STEP"

    local full_command
    if [[ "$need_project_dir" == "true" ]]; then
        full_command="cd $PROJECT_DIR && $command"
        log "带 cwd 修正的命令: $full_command"
    else
        full_command="$command"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY-RUN] 将发送: $full_command" "WARN"
        return
    fi

    herdr pane run "$target_pane_id" "$full_command" >/dev/null 2>&1 || true
}

wait_for_output() {
    local target_pane_id="$1"
    local stage="$2"
    local timeout_seconds="${3:-$((MAX_WAIT_MINUTES * 60))}"
    shift 3 || true
    local success_patterns=("$@")

    local start_time elapsed last_output="" anomaly_count=0
    local check_interval=10
    start_time="$(date +%s)"

    log "等待 [$stage] 完成（超时: ${timeout_seconds}s）..."

    while true; do
        elapsed=$(( $(date +%s) - start_time ))
        if [[ $elapsed -ge $timeout_seconds ]]; then
            log "[$stage] 超时！等待了 ${timeout_seconds} 秒" "ERROR"
            echo "timeout"
            return 1
        fi

        # 读取 pane 输出
        local output
        output="$(herdr pane read "$target_pane_id" --source recent-unwrapped --lines 80 2>&1)" || true

        # 检测异常行为
        for pattern in "${ANOMALY_PATTERNS[@]}"; do
            if echo "$output" | grep -qE "$pattern" 2>/dev/null; then
                anomaly_count=$((anomaly_count + 1))
                local match_text
                match_text="$(echo "$output" | grep -oE "$pattern" 2>/dev/null | head -1)" || true
                local idx=0
                for p in "${ANOMALY_PATTERNS[@]}"; do
                    if [[ "$p" == "$pattern" ]]; then break; fi
                    idx=$((idx + 1))
                done
                write_anomaly "${ANOMALY_DESCRIPTIONS[$idx]}" "$match_text"

                if [[ $anomaly_count -ge 3 ]]; then
                    log "检测到 $anomaly_count 次异常行为，尝试纠正..." "WARN"
                    herdr pane run "$target_pane_id" "请执行命令，不要分析代码。运行: cd $PROJECT_DIR && /confwrite:status" >/dev/null 2>&1 || true
                    anomaly_count=0
                fi
            fi
        done

        # 检查成功标志
        for pattern in "${success_patterns[@]}"; do
            if echo "$output" | grep -qE "$pattern" 2>/dev/null; then
                log "[$stage] 检测到成功标志: $pattern" "OK"
                echo "success"
                return 0
            fi
        done

        # 检查 agent 状态
        local pane_info agent_status
        pane_info="$(herdr pane get "$target_pane_id" 2>&1)" || true
        agent_status="$(echo "$pane_info" | grep -o '"agent_status":"[^"]*"' | cut -d'"' -f4)" || true

        if [[ "$agent_status" == "idle" || "$agent_status" == "done" ]]; then
            sleep 5
            local final_output
            final_output="$(herdr pane read "$target_pane_id" --source recent-unwrapped --lines 120 2>&1)" || true

            for pattern in "${success_patterns[@]}"; do
                if echo "$final_output" | grep -qE "$pattern" 2>/dev/null; then
                    log "[$stage] 完成" "OK"
                    echo "success"
                    return 0
                fi
            done

            log "[$stage] pi 已空闲但未匹配到预期输出" "WARN"
            echo "idle_no_match"
            return 1
        fi

        # 保存进度
        save_progress "{\"stage\":\"$stage\",\"status\":\"waiting\",\"elapsed_seconds\":$elapsed,\"anomaly_count\":$anomaly_count,\"agent_status\":\"$agent_status\"}"

        sleep "$check_interval"
    done
}

wait_for_agent_status() {
    local target_pane_id="$1"
    local target_status="$2"
    local timeout_ms="${3:-120000}"

    herdr wait agent-status "$target_pane_id" --status "$target_status" --timeout "$timeout_ms" >/dev/null 2>&1
}

get_pane_output() {
    local target_pane_id="$1"
    local lines="${2:-120}"

    herdr pane read "$target_pane_id" --source recent-unwrapped --lines "$lines" 2>&1 || true
}

# ─── 测试阶段函数 ─────────────────────────────────────────────────────────────

invoke_init_stage() {
    local target_pane_id="$1"

    log "═══ 阶段: init ═══" "STEP"

    send_command "$target_pane_id" "/confwrite:init $PROJECT_NAME" "init" "false"

    local result
    if result="$(wait_for_output "$target_pane_id" "init" 120 "项目初始化完成" "项目目录结构已创建" "project-state\.json")"; then
        log "init 阶段完成 ✓" "OK"
    else
        log "init 阶段可能失败: $result" "WARN"
    fi

    save_progress "{\"stage\":\"init\",\"result\":\"$result\"}"
}

invoke_organize_stage() {
    local target_pane_id="$1"

    log "═══ 阶段: organize ═══" "STEP"

    send_command "$target_pane_id" "/confwrite:organize" "organize" "true"

    local result
    if result="$(wait_for_output "$target_pane_id" "organize" $((10 * 60)) "素材整理完成" "扫描.*个文件" "索引.*个文件")"; then
        log "organize 阶段完成 ✓" "OK"

        # 验证扫描文件数
        local output
        output="$(get_pane_output "$target_pane_id" 80)"
        if echo "$output" | grep -qE '扫描:[[:space:]]*0[[:space:]]*个文件'; then
            log "organize 扫描了 0 个文件！可能是 cwd 问题（Bug 38）" "ERROR"
            return 1
        fi
        local file_count
        file_count="$(echo "$output" | grep -oE '扫描:[[:space:]]*[0-9]+[[:space:]]*个文件' | grep -oE '[0-9]+' | head -1)" || true
        if [[ -n "$file_count" ]]; then
            log "organize 扫描了 $file_count 个文件" "OK"
        fi
    else
        log "organize 阶段失败: $result" "ERROR"
        return 1
    fi

    save_progress "{\"stage\":\"organize\",\"result\":\"$result\"}"
}

invoke_outline_stage() {
    local target_pane_id="$1"

    log "═══ 阶段: outline ═══" "STEP"

    local outline_cmd="/confwrite:outline $PROJECT_NAME technical-proposal 50000"
    send_command "$target_pane_id" "$outline_cmd" "outline" "false"

    local result
    if result="$(wait_for_output "$target_pane_id" "outline" $((15 * 60)) "大纲生成完成" "outline\.md" "章节")"; then
        log "outline 阶段完成 ✓" "OK"
    else
        log "outline 阶段可能失败: $result" "WARN"
    fi

    save_progress "{\"stage\":\"outline\",\"result\":\"$result\"}"
}

invoke_write_stage() {
    local target_pane_id="$1"

    log "═══ 阶段: write（长流程）═══" "STEP"

    send_command "$target_pane_id" "/confwrite:write" "write" "true"

    local start_time max_duration last_phase=""
    start_time="$(date +%s)"
    max_duration=$((MAX_WAIT_MINUTES * 60))
    local status_check_interval=60

    log "写作流程启动，将持续监控进度（最长 ${MAX_WAIT_MINUTES} 分钟）..."

    while true; do
        local elapsed=$(( $(date +%s) - start_time ))
        if [[ $elapsed -ge $max_duration ]]; then
            log "写作流程达到最大等待时间" "WARN"
            break
        fi

        sleep "$status_check_interval"

        local output
        output="$(get_pane_output "$target_pane_id" 50)"

        # 检测 phase 转换
        local current_phase
        current_phase="$(echo "$output" | grep -oiE 'Phase[[:space:]]+[^ ]+' | tail -1 | awk '{print $2}')" || true
        if [[ -n "$current_phase" && "$current_phase" != "$last_phase" ]]; then
            local elapsed_min
            elapsed_min=$(echo "scale=1; $elapsed / 60" | bc 2>/dev/null || echo "$((elapsed / 60))")
            log "Phase 转换: $last_phase → $current_phase (${elapsed_min}min)" "STEP"
            last_phase="$current_phase"
        fi

        # 检查是否完成
        if echo "$output" | grep -qiE '(done|完成|流程结束|Phase.*done)'; then
            log "写作流程完成！✓" "OK"
            break
        fi

        # 检查是否卡住
        if echo "$output" | grep -qiE '(达到最大推进次数|MAX_TICKS|空转)'; then
            log "检测到空转/MAX_TICKS！" "ERROR"
            write_anomaly "写作流程空转" "$output"
            break
        fi

        # 检查 agent 状态
        local pane_info agent_status
        pane_info="$(herdr pane get "$target_pane_id" 2>&1)" || true
        agent_status="$(echo "$pane_info" | grep -o '"agent_status":"[^"]*"' | cut -d'"' -f4)" || true

        if [[ "$agent_status" == "blocked" ]]; then
            log "Agent 被阻塞，需要输入" "WARN"
            herdr pane run "$target_pane_id" "/confwrite:status" >/dev/null 2>&1 || true
            sleep 10
        fi

        # 检测异常
        for pattern in "${ANOMALY_PATTERNS[@]}"; do
            if echo "$output" | grep -qE "$pattern" 2>/dev/null; then
                local match_text
                match_text="$(echo "$output" | grep -oE "$pattern" 2>/dev/null | head -1)" || true
                local idx=0
                for p in "${ANOMALY_PATTERNS[@]}"; do
                    if [[ "$p" == "$pattern" ]]; then break; fi
                    idx=$((idx + 1))
                done
                write_anomaly "${ANOMALY_DESCRIPTIONS[$idx]}" "$match_text"
            fi
        done

        # 保存进度
        local elapsed_min
        elapsed_min=$(echo "scale=1; $elapsed / 60" | bc 2>/dev/null || echo "$((elapsed / 60))")
        save_progress "{\"stage\":\"write\",\"status\":\"running\",\"current_phase\":\"$last_phase\",\"elapsed_minutes\":$elapsed_min}"
    done

    save_progress "{\"stage\":\"write\",\"result\":\"completed\",\"current_phase\":\"$last_phase\"}"
}

invoke_status_check() {
    local target_pane_id="$1"

    log "═══ 检查状态 ═══" "STEP"

    send_command "$target_pane_id" "/confwrite:status" "status" "true"

    sleep 10
    local output
    output="$(get_pane_output "$target_pane_id" 80)"

    log "当前状态输出:
$output"
    echo "$output"
}

# ─── 主流程 ───────────────────────────────────────────────────────────────────

main() {
    init_log_dir

    log "╔══════════════════════════════════════════════════════════╗"
    log "║  ConfWrite E2E Test — herdr 驱动远程 pi               ║"
    log "╠══════════════════════════════════════════════════════════╣"
    log "║  项目: $PROJECT_NAME"
    log "║  工作区: $WORKSPACE_PATH"
    log "║  项目目录: $PROJECT_DIR"
    log "║  日志: $LOG_FILE"
    log "║  最大等待: ${MAX_WAIT_MINUTES} 分钟/阶段"
    log "║  DryRun: $DRY_RUN"
    log "╚══════════════════════════════════════════════════════════╝"

    if [[ "$DRY_RUN" == "true" ]]; then
        log ""
        log "═══ 命令序列（DRY-RUN 模式）═══" "WARN"
        log ""

        if [[ "$SKIP_INIT" == "false" ]]; then
            log "1. /confwrite:init $PROJECT_NAME" "STEP"
            log "   cwd: $WORKSPACE_PATH (init 可在工作区执行)"
        fi
        if [[ "$SKIP_ORGANIZE" == "false" ]]; then
            log "2. cd $PROJECT_DIR && /confwrite:organize" "STEP"
            log "   cwd: $PROJECT_DIR (Bug 38: organize 必须在项目目录)"
        fi
        if [[ "$SKIP_OUTLINE" == "false" ]]; then
            log "3. /confwrite:outline $PROJECT_NAME technical-proposal 50000" "STEP"
            log "   cwd: $WORKSPACE_PATH (outline 可在工作区执行)"
        fi
        log "4. cd $PROJECT_DIR && /confwrite:write" "STEP"
        log "   cwd: $PROJECT_DIR (Bug 39: write 必须在项目目录)"
        log ""
        log "═══ 异常检测模式 ═══" "WARN"
        local idx=0
        for desc in "${ANOMALY_DESCRIPTIONS[@]}"; do
            log "  检测: $desc"
            log "  模式: ${ANOMALY_PATTERNS[$idx]}"
            idx=$((idx + 1))
        done
        return
    fi

    # 验证 herdr 可用
    if ! test_herdr_available; then
        echo "herdr 不可用！请确保在 herdr 环境中运行此脚本。" >&2
        exit 1
    fi

    # 准备 pane
    local target_pane
    target_pane="$(ensure_pane)"
    log "目标 pane: $target_pane"

    # 测试结果
    local init_ok="skip" organize_ok="skip" outline_ok="skip" write_ok="skip"

    # ── 阶段 1: init ──
    if [[ "$SKIP_INIT" == "false" ]]; then
        invoke_init_stage "$target_pane"
        if [[ $? -eq 0 ]]; then
            init_ok="pass"
        else
            init_ok="fail"
            log "init 失败，中止测试" "ERROR"
            exit 1
        fi
        wait_for_agent_status "$target_pane" "idle" 30000 || true
    fi

    # ── 阶段 2: organize ──
    if [[ "$SKIP_ORGANIZE" == "false" ]]; then
        if invoke_organize_stage "$target_pane"; then
            organize_ok="pass"
        else
            organize_ok="fail"
            log "organize 失败，中止测试" "ERROR"
            exit 1
        fi
        wait_for_agent_status "$target_pane" "idle" 30000 || true
    fi

    # ── 阶段 3: outline ──
    if [[ "$SKIP_OUTLINE" == "false" ]]; then
        invoke_outline_stage "$target_pane"
        outline_ok="pass"

        wait_for_agent_status "$target_pane" "idle" 60000 || true

        log "大纲已生成，请在远程 pi 中确认 outline.md" "WARN"
        log "确认后输入 /confwrite:write 继续" "WARN"

        log "等待 60 秒让用户确认大纲..."
        sleep 60
    fi

    # ── 阶段 4: write ──
    invoke_write_stage "$target_pane"
    write_ok="pass"

    # ── 最终状态检查 ──
    invoke_status_check "$target_pane"

    # ── 汇总报告 ──
    log ""
    log "╔══════════════════════════════════════════════════════════╗"
    log "║  测试报告                                               ║"
    log "╠══════════════════════════════════════════════════════════╣"
    log "║  init:     $init_ok"
    log "║  organize: $organize_ok"
    log "║  outline:  $outline_ok"
    log "║  write:    $write_ok"
    log "║"
    log "║  日志: $LOG_FILE"
    log "║  异常: $ANOMALY_LOG"
    log "║  进度: $PROGRESS_FILE"
    log "╚══════════════════════════════════════════════════════════╝"

    # 保存最终报告
    local report_file="$LOG_DIR/report-$PROJECT_NAME-$TIMESTAMP.json"
    cat > "$report_file" <<EOF
{
  "project": "$PROJECT_NAME",
  "workspace": "$WORKSPACE_PATH",
  "project_dir": "$PROJECT_DIR",
  "pane_id": "$target_pane",
  "stages": {
    "init": "$init_ok",
    "organize": "$organize_ok",
    "outline": "$outline_ok",
    "write": "$write_ok"
  },
  "timestamp": "$(date -Iseconds)"
}
EOF
    log "完整报告: $report_file"
}

main
