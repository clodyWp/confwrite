#!/bin/bash
# E2E Test Script for v0.25.0
# This script runs the complete E2E workflow

set -e

PROJECT_DIR="/home/water/proj/c4/projects/e2e-v25"
LOG_DIR="$PROJECT_DIR/logs"

echo "=== E2E Test v0.25.0 ==="
echo "Project: $PROJECT_DIR"
echo "Start Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Create logs directory
mkdir -p "$LOG_DIR"

# Change to project directory
cd "$PROJECT_DIR"

# Initialize ConfWrite project
echo ""
echo "=== Phase 0: Initialize ==="
echo "Running /confwrite:init..."

# Note: This requires pi to be running in this directory
# The pi agent should execute: /confwrite:init e2e-v25 reference_material

echo ""
echo "=== Monitoring Progress ==="
echo "Check project-state.json for current phase"
echo "Check logs/confwrite-log.jsonl for events"

# Monitor loop (run for 2 hours max)
TIMEOUT=7200  # 2 hours in seconds
ELAPSED=0
INTERVAL=60   # Check every 60 seconds

while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "project-state.json" ]; then
        PHASE=$(jq -r '.currentPhase' project-state.json 2>/dev/null || echo "unknown")
        STATUS=$(jq -r '.status' project-state.json 2>/dev/null || echo "unknown")
        
        echo "[$(date +"%H:%M:%S")] Phase: $PHASE, Status: $STATUS"
        
        # Check if done
        if [ "$STATUS" = "done" ] || [ "$PHASE" = "done" ]; then
            echo ""
            echo "=== E2E Test Completed ==="
            echo "End Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
            exit 0
        fi
    else
        echo "[$(date +"%H:%M:%S")] Waiting for project-state.json..."
    fi
    
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "=== Timeout Reached ==="
echo "E2E test did not complete within 2 hours"
exit 1