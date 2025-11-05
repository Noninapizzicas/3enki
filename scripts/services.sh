#!/bin/bash

###############################################################################
# Service Management Wrapper
#
# Simple wrapper around orchestrator-cli.js for easier access
#
# Usage:
#   ./scripts/services.sh start          # Start all services
#   ./scripts/services.sh start core-a   # Start specific service
#   ./scripts/services.sh stop           # Stop all services
#   ./scripts/services.sh status         # Show status
#   ./scripts/services.sh list           # List services
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SCRIPT="$SCRIPT_DIR/orchestrator-cli.js"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if CLI script exists
if [ ! -f "$CLI_SCRIPT" ]; then
    echo "Error: orchestrator-cli.js not found at $CLI_SCRIPT"
    exit 1
fi

# Forward all arguments to the Node.js CLI
node "$CLI_SCRIPT" "$@"
