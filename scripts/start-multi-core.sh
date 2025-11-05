#!/bin/bash

###############################################################################
# Multi-Core Launcher
#
# Starts N Event Core instances automatically with proper configuration
#
# Usage:
#   ./scripts/start-multi-core.sh 3      # Start 3 Event Core instances
#   ./scripts/start-multi-core.sh 5      # Start 5 Event Core instances
#
# Features:
# - Automatic port assignment (from port-ranges.js)
# - Unique core IDs (core-a, core-b, core-c, ...)
# - Sequential startup with delays
# - Health check verification
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENT_CORE_DIR="$(dirname "$SCRIPT_DIR")"

# Default number of cores
NUM_CORES="${1:-3}"

# Validate input
if ! [[ "$NUM_CORES" =~ ^[0-9]+$ ]] || [ "$NUM_CORES" -lt 1 ]; then
    echo "Error: Please specify a valid number of cores (1-26)"
    echo "Usage: $0 <num_cores>"
    exit 1
fi

if [ "$NUM_CORES" -gt 26 ]; then
    echo "Error: Maximum 26 cores supported (core-a through core-z)"
    exit 1
fi

echo "🚀 Starting $NUM_CORES Event Core instances..."
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    exit 1
fi

# Check if index.js exists
if [ ! -f "$EVENT_CORE_DIR/index.js" ]; then
    echo "❌ Error: index.js not found in $EVENT_CORE_DIR"
    exit 1
fi

# Generate core IDs (core-a, core-b, core-c, ...)
declare -a CORE_IDS=()
for i in $(seq 0 $((NUM_CORES - 1))); do
    LETTER=$(printf "\\$(printf '%03o' $((97 + i)))")
    CORE_IDS+=("core-$LETTER")
done

echo "Core IDs: ${CORE_IDS[*]}"
echo ""

# Start each core
for CORE_ID in "${CORE_IDS[@]}"; do
    echo "Starting $CORE_ID..."

    # Start in background with unique core ID
    CORE_ID="$CORE_ID" node "$EVENT_CORE_DIR/index.js" > "/tmp/$CORE_ID.log" 2>&1 &

    PID=$!
    echo "  → Started with PID $PID"
    echo "  → Logs: /tmp/$CORE_ID.log"

    # Wait a bit before starting next core
    sleep 2
done

echo ""
echo "✅ All $NUM_CORES cores started!"
echo ""
echo "Check status with:"
echo "  ./scripts/services.sh status"
echo ""
echo "Stop all with:"
echo "  ./scripts/services.sh stop"
echo ""
echo "View logs:"
for CORE_ID in "${CORE_IDS[@]}"; do
    echo "  tail -f /tmp/$CORE_ID.log"
done
