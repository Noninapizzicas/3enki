#!/bin/bash
###############################################################################
# Event-Core - Restart Script
#
# Reinicia los servicios de Event-Core.
#
# Uso:
#   ./restart.sh              # Reinicia todo
#   ./restart.sh backend      # Solo backend
#   ./restart.sh frontend     # Solo frontend
###############################################################################

set -e

# Colores
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

# Directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
    cat << EOF
${BLUE}Event-Core - Script de Reinicio${NC}

${GREEN}Uso:${NC}
  ./restart.sh [comando]

${GREEN}Comandos:${NC}
  (sin args)    Reinicia backend + frontend
  backend       Solo reinicia el backend
  frontend      Solo reinicia el frontend
  --help, -h    Muestra esta ayuda

${GREEN}Ejemplos:${NC}
  ./restart.sh              # Reiniciar todo
  ./restart.sh backend      # Solo backend (útil tras cambios en módulos)
  ./restart.sh frontend     # Solo frontend (útil tras cambios en UI)

EOF
}

###############################################################################
# Main
###############################################################################

COMMAND="${1:-all}"

case "$COMMAND" in
    --help|-h|help)
        show_help
        exit 0
        ;;
    backend|frontend|all)
        echo ""
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}             Event-Core - Reiniciando Servicios             ${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""

        # Detener
        "$SCRIPT_DIR/stop.sh" "$COMMAND"

        # Pequeña pausa
        sleep 1

        # Iniciar
        "$SCRIPT_DIR/start.sh" "$COMMAND"
        ;;
    *)
        echo "Comando desconocido: $COMMAND"
        show_help
        exit 1
        ;;
esac
