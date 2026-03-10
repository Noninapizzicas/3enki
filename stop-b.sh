#!/bin/bash
###############################################################################
# Event-Core Instance B - Stop Script
#
# Detiene la instancia B sin afectar la instancia A.
#
# Uso:
#   ./stop-b.sh              # Detiene todo (backend + frontend)
#   ./stop-b.sh backend      # Solo backend
#   ./stop-b.sh frontend     # Solo frontend
#   ./stop-b.sh --force      # Forzar (SIGKILL)
###############################################################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
INSTANCE="b"
FORCE=false

log_info()    { echo -e "${CYAN}[B]${NC} ${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${CYAN}[B]${NC} ${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${CYAN}[B]${NC} ${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${CYAN}[B]${NC} ${RED}[ERROR]${NC} $1"; }

stop_process() {
    local name=$1
    local pid_file="$PID_DIR/${name}-${INSTANCE}.pid"
    local port_file="$PID_DIR/${name}-${INSTANCE}.port"

    if [ ! -f "$pid_file" ]; then
        log_warn "$name B: No hay PID registrado"
        return 0
    fi

    local pid=$(cat "$pid_file")

    if ! kill -0 $pid 2>/dev/null; then
        log_warn "$name B: Proceso no encontrado (PID: $pid)"
        rm -f "$pid_file" "$port_file"
        return 0
    fi

    log_info "Deteniendo $name B (PID: $pid)..."

    if [ "$FORCE" = true ]; then
        kill -9 $pid 2>/dev/null || true
    else
        kill -15 $pid 2>/dev/null || true

        local count=0
        while kill -0 $pid 2>/dev/null && [ $count -lt 50 ]; do
            sleep 0.1
            count=$((count + 1))
        done

        if kill -0 $pid 2>/dev/null; then
            log_warn "$name B no respondió a SIGTERM, usando SIGKILL..."
            kill -9 $pid 2>/dev/null || true
        fi
    fi

    rm -f "$pid_file" "$port_file"
    log_success "$name B detenido"
}

###############################################################################
# Main
###############################################################################

COMMAND="all"
for arg in "$@"; do
    case $arg in
        --force|-f) FORCE=true ;;
        --help|-h|help)
            echo "Uso: ./stop-b.sh [backend|frontend|all] [--force]"
            exit 0
            ;;
        backend|frontend|all) COMMAND=$arg ;;
        *) log_error "Argumento desconocido: $arg"; exit 1 ;;
    esac
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}        Event-Core Instance B - Deteniendo Servicios       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

case "$COMMAND" in
    backend)  stop_process "backend" ;;
    frontend) stop_process "frontend" ;;
    all)
        stop_process "frontend"
        stop_process "backend"
        ;;
esac

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}              Instancia B detenida                         ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
