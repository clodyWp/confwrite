<#
.SYNOPSIS
    ConfWrite 端到端测试脚本 — 通过 herdr 驱动远程 pi agent 完成全流程测试。

.DESCRIPTION
    解决的核心问题：
    1. 远程 pi 的 cwd 是工作区（/home/water/proj/c4），不是项目目录
    2. organize/write 命令必须先 cd 到项目目录才能正确工作（Bug 38/39）
    3. 远程 pi 可能自行分析代码而不执行命令
    4. 需要监控测试进度并检测异常行为

.PARAMETER WorkspacePath
    远程 pi 的工作区路径（默认 /home/water/proj/c4）

.PARAMETER ProjectName
    要测试的项目名称（工作区下的 projects/<ProjectName>）

.PARAMETER PaneId
    herdr pane ID（如 w1:p1）。留空则自动创建新 pane。

.PARAMETER LogDir
    本地日志目录（默认 ./e2e-test-logs/）

.PARAMETER SkipInit
    跳过 init 阶段（项目已存在时使用）

.PARAMETER SkipOrganize
    跳过 organize 阶段（素材已整理时使用）

.PARAMETER SkipOutline
    跳过 outline 阶段（大纲已存在时使用）

.PARAMETER MaxWaitMinutes
    每个阶段的最大等待时间（分钟，默认 30）

.PARAMETER DryRun
    只生成命令序列，不实际执行

.EXAMPLE
    # 完整流程测试
    .\scripts\e2e-test-herdr.ps1 -ProjectName "test-project"

.EXAMPLE
    # 从写作阶段开始（项目已初始化）
    .\scripts\e2e-test-herdr.ps1 -ProjectName "test-project" -SkipInit -SkipOrganize -SkipOutline

.EXAMPLE
    # 使用已有 pane
    .\scripts\e2e-test-herdr.ps1 -ProjectName "test-project" -PaneId "w1:p3"

.EXAMPLE
    # 干跑模式（只打印命令序列）
    .\scripts\e2e-test-herdr.ps1 -ProjectName "test-project" -DryRun
#>

[CmdletBinding()]
param(
    [string]$WorkspacePath = "/home/water/proj/c4",
    [Parameter(Mandatory=$true)]
    [string]$ProjectName,
    [string]$PaneId = "",
    [string]$LogDir = "",
    [switch]$SkipInit,
    [switch]$SkipOrganize,
    [switch]$SkipOutline,
    [int]$MaxWaitMinutes = 30,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ─── 路径与常量 ───────────────────────────────────────────────────────────────

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ProjectDir = "$WorkspacePath/projects/$ProjectName"

if (-not $LogDir) {
    $LogDir = Join-Path $ProjectRoot "e2e-test-logs"
}
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "e2e-test-$ProjectName-$Timestamp.log"
$AnomalyLog = Join-Path $LogDir "anomalies-$ProjectName-$Timestamp.log"
$ProgressFile = Join-Path $LogDir "progress-$ProjectName-$Timestamp.json"

# ─── 异常检测模式 ─────────────────────────────────────────────────────────────

# 远程 pi 自行分析代码的典型模式（应该执行命令而非分析）
$AnomalyPatterns = @(
    @{ Pattern = '(?i)让我(来|先)?分析(一下)?'; Description = "pi 开始自行分析而非执行命令" }
    @{ Pattern = '(?i)我(来|先)?看看(代码|源码|实现)'; Description = "pi 查看代码而非执行命令" }
    @{ Pattern = '(?i)(这个|这段)(代码|逻辑|实现).*(问题|bug|错误)'; Description = "pi 在分析代码问题" }
    @{ Pattern = '(?i)根据代码(分析|来看|可以看出)'; Description = "pi 基于代码分析而非执行" }
    @{ Pattern = '(?i)源代码.*显示|代码.*表明|从.*代码.*可以'; Description = "pi 在解读代码" }
    @{ Pattern = '(?i)(需要|应该|必须)(先|首先).*(理解|了解|分析|检查).*(代码|实现|逻辑)'; Description = "pi 认为需要先分析代码" }
    @{ Pattern = '(?i)src/.*\.ts'; Description = "pi 在引用源码文件路径" }
    @{ Pattern = '(?i)function\s+\w+|const\s+\w+\s*=|import\s+\{'; Description = "pi 在展示代码片段" }
)

# 命令成功的关键指标
$SuccessIndicators = @{
    "init"     = @("项目初始化完成", "项目目录结构已创建", "project-state.json")
    "organize" = @("素材整理完成", "扫描.*个文件", "索引.*个文件")
    "outline"  = @("大纲生成完成", "outline\.md", "章节")
    "write"    = @("Phase", "phase", "写作", "审阅", "图表", "组装", "导出", "done", "completed")
    "status"   = @("Phase", "phase", "章节", "状态")
}

# 命令失败的标志
$FailureIndicators = @(
    '(?i)Error:',
    '(?i)未找到项目状态文件',
    '(?i)请先运行',
    '(?i)blocked',
    '(?i)扫描: 0 个文件',      # organize 扫描 0 文件 = cwd 错误
    '(?i)失败',
    '(?i)找不到',
)

# ─── 日志函数 ─────────────────────────────────────────────────────────────────

function Initialize-LogDir {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "STEP", "OK", "ANOMALY")]
        [string]$Level = "INFO"
    )
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"

    switch ($Level) {
        "ERROR"   { Write-Host $line -ForegroundColor Red }
        "WARN"    { Write-Host $line -ForegroundColor Yellow }
        "OK"      { Write-Host $line -ForegroundColor Green }
        "STEP"    { Write-Host $line -ForegroundColor Cyan }
        "ANOMALY" { Write-Host $line -ForegroundColor Magenta }
        default   { Write-Host $line }
    }

    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Write-Anomaly {
    param([string]$Description, [string]$Context = "")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] ANOMALY: $Description"
    if ($Context) { $line += "`n  Context: $($Context.Substring(0, [Math]::Min(200, $Context.Length)))" }
    Add-Content -Path $AnomalyLog -Value $line -Encoding UTF8
    Write-Log $Description -Level ANOMALY
}

function Save-Progress {
    param([hashtable]$State)
    $State["timestamp"] = Get-Date -Format "o"
    $State | ConvertTo-Json -Depth 5 | Set-Content -Path $ProgressFile -Encoding UTF8
}

# ─── Herdr 交互函数 ───────────────────────────────────────────────────────────

function Test-HerdrAvailable {
    try {
        $result = & herdr --help 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Ensure-Pane {
    <#
    .SYNOPSIS
        确保有一个可用的 pane 来驱动远程 pi。
        如果未指定 PaneId，则在当前 workspace 创建新 pane 并启动 pi。
    #>
    if ($PaneId) {
        Write-Log "使用已有 pane: $PaneId"
        # 验证 pane 存在
        $paneInfo = & herdr pane get $PaneId 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Pane $PaneId 不存在或不可用: $paneInfo"
        }
        return $PaneId
    }

    Write-Log "创建新 pane 并启动远程 pi..." -Level STEP

    # 获取当前 workspace
    $wsList = & herdr workspace list 2>&1 | ConvertFrom-Json
    $currentWs = $wsList | Where-Object { $_.is_current -eq $true } | Select-Object -First 1
    if (-not $currentWs) {
        $currentWs = $wsList | Select-Object -First 1
    }
    $wsId = $currentWs.workspace_id

    # 分割 pane
    $splitResult = & herdr pane split --current --direction right --no-focus 2>&1 | ConvertFrom-Json
    $newPaneId = $splitResult.pane.pane_id
    Write-Log "新 pane 创建: $newPaneId"

    # 重命名 pane
    & herdr pane rename $newPaneId "e2e-test-pi" 2>&1 | Out-Null

    # 在 pane 中启动 pi（cwd 设为工作区）
    # 关键：pi 的 cwd 是工作区，不是项目目录
    # 我们需要先 cd 到项目目录再执行命令
    & herdr pane run $newPaneId "cd $WorkspacePath && pi" 2>&1 | Out-Null

    # 等待 pi 启动（idle 状态）
    Write-Log "等待 pi 启动..."
    $waitResult = & herdr wait agent-status $newPaneId --status idle --timeout 60000 2>&1
    if ($LASTEXITCODE -ne 0) {
        # 也接受 working 状态（pi 可能已经在忙）
        $paneStatus = & herdr pane get $newPaneId 2>&1 | ConvertFrom-Json
        if ($paneStatus.agent_status -notin @("idle", "working", "unknown")) {
            throw "pi 启动失败，状态: $($paneStatus.agent_status)"
        }
    }

    Write-Log "pi 已在 pane $newPaneId 中启动" -Level OK
    return $newPaneId
}

function Send-Command {
    <#
    .SYNOPSIS
        向远程 pi 发送命令。
        关键：先 cd 到项目目录，再执行 confwrite 命令。
    #>
    param(
        [string]$TargetPaneId,
        [string]$Command,
        [string]$Stage = "unknown",
        [switch]$NeedProjectDir
    )

    Write-Log "发送命令 [$Stage]: $Command" -Level STEP

    if ($NeedProjectDir) {
        # Bug 38/39 解决方案：先 cd 到项目目录，再执行命令
        # 使用 && 确保 cd 成功后才执行命令
        $fullCommand = "cd $ProjectDir && $Command"
        Write-Log "带 cwd 修正的命令: $fullCommand"
    } else {
        $fullCommand = $Command
    }

    if ($DryRun) {
        Write-Log "[DRY-RUN] 将发送: $fullCommand" -Level WARN
        return
    }

    & herdr pane run $TargetPaneId $fullCommand 2>&1 | Out-Null
}

function Wait-ForOutput {
    <#
    .SYNOPSIS
        等待远程 pi 的输出匹配预期模式。
        同时检测异常行为（pi 自行分析代码）。
    #>
    param(
        [string]$TargetPaneId,
        [string]$Stage,
        [int]$TimeoutSeconds = ($MaxWaitMinutes * 60),
        [string[]]$SuccessPatterns = @(),
        [string[]]$FailurePatterns = @()
    )

    # 合并默认的成功/失败指标
    $allSuccess = $SuccessPatterns
    if ($SuccessIndicators.ContainsKey($Stage)) {
        $allSuccess = $allSuccess + $SuccessIndicators[$Stage]
    }
    $allFailure = $FailurePatterns + $FailureIndicators

    $startTime = Get-Date
    $lastOutput = ""
    $anomalyCount = 0
    $checkInterval = 10  # 秒

    Write-Log "等待 [$Stage] 完成（超时: ${TimeoutSeconds}s）..."

    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        # 读取 pane 输出
        $output = & herdr pane read $TargetPaneId --source recent-unwrapped --lines 80 2>&1
        $outputText = $output -join "`n"

        # 检测异常行为
        foreach ($ap in $AnomalyPatterns) {
            if ($outputText -match $ap.Pattern) {
                $anomalyCount++
                $matchText = $Matches[0]
                Write-Anomaly -Description $ap.Description -Context $matchText

                if ($anomalyCount -ge 3) {
                    Write-Log "检测到 $anomalyCount 次异常行为，尝试纠正..." -Level WARN
                    # 发送纠正指令：告诉 pi 执行命令而非分析
                    & herdr pane run $TargetPaneId "请执行命令，不要分析代码。运行: cd $ProjectDir && /confwrite:status" 2>&1 | Out-Null
                    $anomalyCount = 0
                }
            }
        }

        # 检查成功标志
        foreach ($pattern in $allSuccess) {
            if ($outputText -match $pattern) {
                Write-Log "[$Stage] 检测到成功标志: $pattern" -Level OK
                return @{
                    Success = $true
                    Output = $outputText
                    MatchedPattern = $pattern
                    Duration = ((Get-Date) - $startTime).TotalSeconds
                }
            }
        }

        # 检查失败标志
        foreach ($pattern in $allFailure) {
            if ($outputText -match $pattern) {
                # 某些失败标志可能是误报，需要结合上下文
                if ($pattern -eq '(?i)扫描: 0 个文件' -and $Stage -ne 'organize') {
                    continue
                }
                Write-Log "[$Stage] 检测到失败标志: $pattern" -Level ERROR
                return @{
                    Success = $false
                    Output = $outputText
                    MatchedPattern = $pattern
                    Duration = ((Get-Date) - $startTime).TotalSeconds
                    Error = "Failure pattern matched: $pattern"
                }
            }
        }

        # 检查 agent 状态
        $paneInfo = & herdr pane get $TargetPaneId 2>&1 | ConvertFrom-Json
        $agentStatus = $paneInfo.agent_status

        # 如果 pi 完成了（idle/done）但没匹配到成功/失败标志
        if ($agentStatus -in @("idle", "done")) {
            # 给一些额外时间让输出稳定
            Start-Sleep -Seconds 5
            $finalOutput = & herdr pane read $TargetPaneId --source recent-unwrapped --lines 120 2>&1
            $finalText = $finalOutput -join "`n"

            # 再次检查
            foreach ($pattern in $allSuccess) {
                if ($finalText -match $pattern) {
                    return @{
                        Success = $true
                        Output = $finalText
                        MatchedPattern = $pattern
                        Duration = ((Get-Date) - $startTime).TotalSeconds
                    }
                }
            }

            Write-Log "[$Stage] pi 已空闲但未匹配到预期输出" -Level WARN
            return @{
                Success = $false
                Output = $finalText
                MatchedPattern = ""
                Duration = ((Get-Date) - $startTime).TotalSeconds
                Error = "Agent became idle without matching success patterns"
            }
        }

        # 保存进度
        Save-Progress @{
            stage = $Stage
            status = "waiting"
            elapsed_seconds = [int]((Get-Date) - $startTime).TotalSeconds
            anomaly_count = $anomalyCount
            agent_status = $agentStatus
        }

        Start-Sleep -Seconds $checkInterval
    }

    Write-Log "[$Stage] 超时！等待了 ${TimeoutSeconds} 秒" -Level ERROR
    return @{
        Success = $false
        Output = $outputText
        MatchedPattern = ""
        Duration = $TimeoutSeconds
        Error = "Timeout after ${TimeoutSeconds}s"
    }
}

function Wait-ForAgentStatus {
    <#
    .SYNOPSIS
        等待 agent 达到指定状态。
    #>
    param(
        [string]$TargetPaneId,
        [string]$TargetStatus,  # idle, working, done, blocked
        [int]$TimeoutMs = 120000
    )

    $result = & herdr wait agent-status $TargetPaneId --status $TargetStatus --timeout $TimeoutMs 2>&1
    return $LASTEXITCODE -eq 0
}

function Get-PaneOutput {
    <#
    .SYNOPSIS
        读取 pane 的最近输出。
    #>
    param(
        [string]$TargetPaneId,
        [int]$Lines = 120
    )

    $output = & herdr pane read $TargetPaneId --source recent-unwrapped --lines $Lines 2>&1
    return $output -join "`n"
}

# ─── 测试阶段函数 ─────────────────────────────────────────────────────────────

function Invoke-InitStage {
    param([string]$TargetPaneId)

    Write-Log "═══ 阶段: init ═══" -Level STEP

    # init 可以在工作区目录执行（指定项目名即可）
    Send-Command -TargetPaneId $TargetPaneId -Command "/confwrite:init $ProjectName" -Stage "init"

    $result = Wait-ForOutput -TargetPaneId $TargetPaneId -Stage "init" -TimeoutSeconds 120

    if ($result.Success) {
        Write-Log "init 阶段完成 ✓" -Level OK
    } else {
        Write-Log "init 阶段可能失败: $($result.Error)" -Level WARN
    }

    Save-Progress @{ stage = "init"; result = $result }
    return $result
}

function Invoke-OrganizeStage {
    param([string]$TargetPaneId)

    Write-Log "═══ 阶段: organize ═══" -Level STEP

    # 关键：organize 必须在项目目录下执行（Bug 38）
    Send-Command -TargetPaneId $TargetPaneId -Command "/confwrite:organize" -Stage "organize" -NeedProjectDir

    $result = Wait-ForOutput -TargetPaneId $TargetPaneId -Stage "organize" -TimeoutSeconds (10 * 60)

    if ($result.Success) {
        Write-Log "organize 阶段完成 ✓" -Level OK

        # 验证：检查扫描文件数不为 0
        if ($result.Output -match '扫描:\s*(\d+)\s*个文件') {
            $fileCount = [int]$Matches[1]
            if ($fileCount -eq 0) {
                Write-Log "organize 扫描了 0 个文件！可能是 cwd 问题（Bug 38）" -Level ERROR
                $result.Success = $false
                $result.Error = "Scanned 0 files - likely cwd issue"
            } else {
                Write-Log "organize 扫描了 $fileCount 个文件" -Level OK
            }
        }
    } else {
        Write-Log "organize 阶段失败: $($result.Error)" -Level ERROR
    }

    Save-Progress @{ stage = "organize"; result = $result }
    return $result
}

function Invoke-OutlineStage {
    param([string]$TargetPaneId)

    Write-Log "═══ 阶段: outline ═══" -Level STEP

    # outline 需要指定项目名和模板
    $outlineCmd = "/confwrite:outline $ProjectName technical-proposal 50000"
    Send-Command -TargetPaneId $TargetPaneId -Command $outlineCmd -Stage "outline"

    $result = Wait-ForOutput -TargetPaneId $TargetPaneId -Stage "outline" -TimeoutSeconds (15 * 60)

    if ($result.Success) {
        Write-Log "outline 阶段完成 ✓" -Level OK
    } else {
        Write-Log "outline 阶段可能失败: $($result.Error)" -Level WARN
    }

    Save-Progress @{ stage = "outline"; result = $result }
    return $result
}

function Invoke-WriteStage {
    param([string]$TargetPaneId)

    Write-Log "═══ 阶段: write（长流程）═══" -Level STEP

    # 关键：write 必须在项目目录下执行（Bug 39）
    Send-Command -TargetPaneId $TargetPaneId -Command "/confwrite:write" -Stage "write" -NeedProjectDir

    # write 阶段可能非常长（几十分钟到几小时）
    # 我们采用轮询模式，定期检查状态
    $startTime = Get-Date
    $maxDuration = $MaxWaitMinutes * 60
    $statusCheckInterval = 60  # 每 60 秒检查一次状态
    $lastPhase = ""
    $phaseTransitions = @()

    Write-Log "写作流程启动，将持续监控进度（最长 ${MaxWaitMinutes} 分钟）..."

    while (((Get-Date) - $startTime).TotalSeconds -lt $maxDuration) {
        Start-Sleep -Seconds $statusCheckInterval

        # 读取当前输出
        $output = Get-PaneOutput -TargetPaneId $TargetPaneId -Lines 50

        # 检测当前 phase
        if ($output -match '(?i)Phase\s+(\S+)') {
            $currentPhase = $Matches[1]
            if ($currentPhase -ne $lastPhase) {
                $phaseTransitions += @{
                    phase = $currentPhase
                    time = (Get-Date -Format "HH:mm:ss")
                    elapsed_minutes = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
                }
                Write-Log "Phase 转换: $lastPhase → $currentPhase ($([math]::Round(((Get-Date) - $startTime).TotalMinutes, 1))min)" -Level STEP
                $lastPhase = $currentPhase
            }
        }

        # 检查是否完成
        if ($output -match '(?i)(done|完成|流程结束|Phase.*done)') {
            Write-Log "写作流程完成！✓" -Level OK
            break
        }

        # 检查是否卡住
        if ($output -match '(?i)(达到最大推进次数|MAX_TICKS|空转)') {
            Write-Log "检测到空转/MAX_TICKS！" -Level ERROR
            Write-Anomaly -Description "写作流程空转" -Context $output
            break
        }

        # 检查 agent 状态
        $paneInfo = & herdr pane get $TargetPaneId 2>&1 | ConvertFrom-Json
        if ($paneInfo.agent_status -eq "blocked") {
            Write-Log "Agent 被阻塞，需要输入" -Level WARN
            # 尝试发送 status 命令来恢复
            & herdr pane run $TargetPaneId "/confwrite:status" 2>&1 | Out-Null
            Start-Sleep -Seconds 10
        }

        # 检测异常
        foreach ($ap in $AnomalyPatterns) {
            if ($output -match $ap.Pattern) {
                Write-Anomaly -Description $ap.Description -Context $Matches[0]
            }
        }

        # 保存进度
        Save-Progress @{
            stage = "write"
            status = "running"
            current_phase = $lastPhase
            elapsed_minutes = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
            phase_transitions = $phaseTransitions
        }
    }

    $finalOutput = Get-PaneOutput -TargetPaneId $TargetPaneId -Lines 120

    $result = @{
        Success = ($finalOutput -match '(?i)(done|完成)')
        Output = $finalOutput
        PhaseTransitions = $phaseTransitions
        Duration = ((Get-Date) - $startTime).TotalSeconds
    }

    Save-Progress @{ stage = "write"; result = "completed"; transitions = $phaseTransitions }
    return $result
}

function Invoke-StatusCheck {
    param([string]$TargetPaneId)

    Write-Log "═══ 检查状态 ═══" -Level STEP

    Send-Command -TargetPaneId $TargetPaneId -Command "/confwrite:status" -Stage "status" -NeedProjectDir

    Start-Sleep -Seconds 10
    $output = Get-PaneOutput -TargetPaneId $TargetPaneId -Lines 80

    Write-Log "当前状态输出:`n$output"
    return $output
}

# ─── 主流程 ───────────────────────────────────────────────────────────────────

function Invoke-E2ETest {
    Initialize-LogDir

    Write-Log "╔══════════════════════════════════════════════════════════╗"
    Write-Log "║  ConfWrite E2E Test — herdr 驱动远程 pi               ║"
    Write-Log "╠══════════════════════════════════════════════════════════╣"
    Write-Log "║  项目: $ProjectName"
    Write-Log "║  工作区: $WorkspacePath"
    Write-Log "║  项目目录: $ProjectDir"
    Write-Log "║  日志: $LogFile"
    Write-Log "║  最大等待: ${MaxWaitMinutes} 分钟/阶段"
    Write-Log "║  DryRun: $DryRun"
    Write-Log "╚══════════════════════════════════════════════════════════╝"

    if ($DryRun) {
        Write-Log ""
        Write-Log "═══ 命令序列（DRY-RUN 模式）═══" -Level WARN
        Write-Log ""

        if (-not $SkipInit) {
            Write-Log "1. /confwrite:init $ProjectName" -Level STEP
            Write-Log "   cwd: $WorkspacePath (init 可在工作区执行)"
        }
        if (-not $SkipOrganize) {
            Write-Log "2. cd $ProjectDir && /confwrite:organize" -Level STEP
            Write-Log "   cwd: $ProjectDir (Bug 38: organize 必须在项目目录)"
        }
        if (-not $SkipOutline) {
            Write-Log "3. /confwrite:outline $ProjectName technical-proposal 50000" -Level STEP
            Write-Log "   cwd: $WorkspacePath (outline 可在工作区执行)"
        }
        Write-Log "4. cd $ProjectDir && /confwrite:write" -Level STEP
        Write-Log "   cwd: $ProjectDir (Bug 39: write 必须在项目目录)"
        Write-Log ""
        Write-Log "═══ 异常检测模式 ═══" -Level WARN
        foreach ($ap in $AnomalyPatterns) {
            Write-Log "  检测: $($ap.Description)"
            Write-Log "  模式: $($ap.Pattern)"
        }
        return
    }

    # 验证 herdr 可用
    if (-not (Test-HerdrAvailable)) {
        throw "herdr 不可用！请确保在 herdr 环境中运行此脚本。"
    }

    # 准备 pane
    $targetPane = Ensure-Pane
    Write-Log "目标 pane: $targetPane"

    # 测试结果收集
    $testResults = @{
        project = $ProjectName
        workspace = $WorkspacePath
        project_dir = $ProjectDir
        pane_id = $targetPane
        start_time = Get-Date -Format "o"
        stages = @{}
        anomalies = @()
    }

    try {
        # ── 阶段 1: init ──
        if (-not $SkipInit) {
            $initResult = Invoke-InitStage -TargetPaneId $targetPane
            $testResults.stages["init"] = $initResult

            if (-not $initResult.Success) {
                Write-Log "init 失败，中止测试" -Level ERROR
                throw "init 阶段失败"
            }

            # 等待 pi 回到 idle
            Wait-ForAgentStatus -TargetPaneId $targetPane -TargetStatus "idle" -TimeoutMs 30000
        }

        # ── 阶段 2: organize ──
        if (-not $SkipOrganize) {
            $organizeResult = Invoke-OrganizeStage -TargetPaneId $targetPane
            $testResults.stages["organize"] = $organizeResult

            if (-not $organizeResult.Success) {
                Write-Log "organize 失败，中止测试" -Level ERROR
                throw "organize 阶段失败"
            }

            Wait-ForAgentStatus -TargetPaneId $targetPane -TargetStatus "idle" -TimeoutMs 30000
        }

        # ── 阶段 3: outline ──
        if (-not $SkipOutline) {
            $outlineResult = Invoke-OutlineStage -TargetPaneId $targetPane
            $testResults.stages["outline"] = $outlineResult

            # outline 有 waitPoint（需要人工确认），这里等 pi 暂停
            Wait-ForAgentStatus -TargetPaneId $targetPane -TargetStatus "idle" -TimeoutMs 60000

            # 提示用户确认大纲
            Write-Log "大纲已生成，请在远程 pi 中确认 outline.md" -Level WARN
            Write-Log "确认后输入 /confwrite:write 继续" -Level WARN

            # 等待用户确认（通过检测 write 阶段启动）
            # 这里简化处理：等待 5 分钟后自动继续
            Write-Log "等待 60 秒让用户确认大纲..."
            Start-Sleep -Seconds 60
        }

        # ── 阶段 4: write（核心长流程）──
        $writeResult = Invoke-WriteStage -TargetPaneId $targetPane
        $testResults.stages["write"] = $writeResult

        # ── 最终状态检查 ──
        $finalStatus = Invoke-StatusCheck -TargetPaneId $targetPane
        $testResults["final_status"] = $finalStatus

    } catch {
        Write-Log "测试异常中止: $_" -Level ERROR
        $testResults["error"] = $_.ToString()
    }

    # ── 汇总报告 ──
    $testResults["end_time"] = Get-Date -Format "o"

    Write-Log ""
    Write-Log "╔══════════════════════════════════════════════════════════╗"
    Write-Log "║  测试报告                                               ║"
    Write-Log "╠══════════════════════════════════════════════════════════╣"

    foreach ($stageName in @("init", "organize", "outline", "write")) {
        if ($testResults.stages.ContainsKey($stageName)) {
            $sr = $testResults.stages[$stageName]
            $status = if ($sr.Success) { "✓ PASS" } else { "✗ FAIL" }
            $duration = if ($sr.Duration) { "$([math]::Round($sr.Duration, 1))s" } else { "N/A" }
            Write-Log "║  $stageName : $status ($duration)"
        }
    }

    Write-Log "║"
    Write-Log "║  日志: $LogFile"
    Write-Log "║  异常: $AnomalyLog"
    Write-Log "║  进度: $ProgressFile"
    Write-Log "╚══════════════════════════════════════════════════════════╝"

    # 保存最终结果
    $reportFile = Join-Path $LogDir "report-$ProjectName-$Timestamp.json"
    $testResults | ConvertTo-Json -Depth 10 | Set-Content -Path $reportFile -Encoding UTF8
    Write-Log "完整报告: $reportFile"

    return $testResults
}

# ─── 入口 ─────────────────────────────────────────────────────────────────────

Invoke-E2ETest
