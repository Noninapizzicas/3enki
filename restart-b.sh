#!/bin/bash
###############################################################################
# Event-Core Instance B - Restart Script
#
# Reinicia la instancia B sin afectar la instancia A.
#
# Uso:
#   ./restart-b.sh              # Reinicia todo
#   ./restart-b.sh backend      # Solo backend
#   ./restart-b.sh frontend     # Solo frontend
###############################################################################

set -e

CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-all}"

case "$COMMAND" in
    --help|-h|help)
        echo "Uso: ./restart-b.sh [backend|frontend|all]"
        exit 0
        ;;
    backend|frontend|all)
        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}       Event-Core Instance B - Reiniciando Servicios       ${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        "$SCRIPT_DIR/stop-b.sh" "$COMMAND"
        sleep 1
        "$SCRIPT_DIR/start-b.sh" "$COMMAND"
        ;;
    *)
        echo "Comando desconocido: $COMMAND"
        echo "Uso: ./restart-b.sh [backend|frontend|all]"
        exit 1
        ;;
esac
