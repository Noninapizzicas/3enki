#!/bin/bash
###############################################################################
# Event-Core Instance B - Start Script
#
# Inicia una segunda instancia independiente de Event-Core.
# Usa puertos separados, PIDs separados, logs separados, core-id separado.
#
# Puertos:
#   Backend HTTP:   3005
#   Frontend:       5178
#   MQTT TCP:       1888
#   MQTT WebSocket: 9005
#
# Uso:
#   ./start-b.sh              # Inicia todo (backend + frontend)
#   ./start-b.sh backend      # Solo backend
#   ./start-b.sh frontend     # Solo frontend
#   ./start-b.sh status       # Estado de la instancia B
###############################################################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/logs"

# Puertos fijos para instancia B
BACKEND_PORT=3005
FRONTEND_PORT=5178
MQTT_PORT=1888
MQTT_WS_PORT=9005
CORE_ID="core-b"

# Prefijo para archivos PID/log (evita colisión con instancia A)
INSTANCE="b"

# Crear directorios necesarios
mkdir -p "$PID_DIR" "$LOG_DIR"

###############################################################################
# Funciones de utilidad
###############################################################################

log_info() {
    echo -e "${CYAN}[B]${NC} ${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${CYAN}[B]${NC} ${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${CYAN}[B]${NC} ${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${CYAN}[B]${NC} ${RED}[ERROR]${NC} $1"
}

is_port_available() {
    local port=$1
    ! (lsof -i :$port > /dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$port ")
}

get_port_process() {
    local port=$1
    lsof -i :$port 2>/dev/null | tail -n1 | awk '{print $1 " (PID: " $2 ")"}'
}

check_dependencies() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js no está instalado"
        exit 1
    fi
    log_info "Node $(node -v) / npm $(npm -v)"
}

show_help() {
    cat << EOF
${CYAN}Event-Core Instance B - Script de Inicio${NC}

${GREEN}Puertos:${NC}
  Backend HTTP:   $BACKEND_PORT
  Frontend:       $FRONTEND_PORT
  MQTT TCP:       $MQTT_PORT
  MQTT WebSocket: $MQTT_WS_PORT
  Core ID:        $CORE_ID

${GREEN}Uso:${NC}
  ./start-b.sh              # Inicia backend + frontend
  ./start-b.sh backend      # Solo backend
  ./start-b.sh frontend     # Solo frontend
  ./start-b.sh status       # Estado de instancia B

${GREEN}Archivos:${NC}
  .pids/backend-b.pid       PID del backend B
  .pids/frontend-b.pid      PID del frontend B
  logs/backend-b.log         Log del backend B
  logs/frontend-b.log        Log del frontend B

${GREEN}Gestión:${NC}
  ./stop-b.sh               Detener instancia B
  ./restart-b.sh            Reiniciar instancia B

EOF
}

###############################################################################
# Funciones de servicios
###############################################################################

start_backend() {
    log_info "Iniciando Backend B (core-b) en puerto $BACKEND_PORT..."

    # Verificar dependencias
    if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        log_info "Instalando dependencias del backend..."
        cd "$SCRIPT_DIR"
        npm install
    fi

    # Verificar puertos
    for check_port in $BACKEND_PORT $MQTT_PORT $MQTT_WS_PORT; do
        if ! is_port_available $check_port; then
            log_error "Puerto $check_port ocupado por: $(get_port_process $check_port)"
            exit 1
        fi
    done

    # Verificar que instancia B no esté ya corriendo
    if [ -f "$PID_DIR/backend-${INSTANCE}.pid" ]; then
        local existing_pid=$(cat "$PID_DIR/backend-${INSTANCE}.pid")
        if kill -0 $existing_pid 2>/dev/null; then
            log_error "Instancia B ya corriendo (PID: $existing_pid). Usa ./stop-b.sh primero."
            exit 1
        fi
    fi

    # Exportar configuración
    export PORT=$BACKEND_PORT
    export MQTT_PORT=$MQTT_PORT
    export MQTT_WS_PORT=$MQTT_WS_PORT
    export CORE_ID=$CORE_ID
    export NODE_ENV=${NODE_ENV:-development}

    # Iniciar backend
    cd "$SCRIPT_DIR"
    nohup node index.js > "$LOG_DIR/backend-${INSTANCE}.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/backend-${INSTANCE}.pid"
    echo $BACKEND_PORT > "$PID_DIR/backend-${INSTANCE}.port"

    # Esperar a que inicie
    sleep 2
    if kill -0 $pid 2>/dev/null; then
        log_success "Backend B iniciado en http://localhost:$BACKEND_PORT (PID: $pid, MQTT: $MQTT_PORT, WS: $MQTT_WS_PORT)"
        echo -e "  ${CYAN}→${NC} Health: curl http://localhost:$BACKEND_PORT/health"
        echo -e "  ${CYAN}→${NC} Logs:   tail -f logs/backend-${INSTANCE}.log"
    else
        log_error "Backend B falló al iniciar. Ver logs/backend-${INSTANCE}.log"
        return 1
    fi
}

start_frontend() {
    log_info "Iniciando Frontend B en puerto $FRONTEND_PORT..."

    if [ ! -d "$SCRIPT_DIR/frontend" ]; then
        log_error "Directorio frontend/ no encontrado"
        return 1
    fi

    # Verificar puerto
    if ! is_port_available $FRONTEND_PORT; then
        log_error "Puerto $FRONTEND_PORT ocupado por: $(get_port_process $FRONTEND_PORT)"
        exit 1
    fi

    # Verificar que no esté ya corriendo
    if [ -f "$PID_DIR/frontend-${INSTANCE}.pid" ]; then
        local existing_pid=$(cat "$PID_DIR/frontend-${INSTANCE}.pid")
        if kill -0 $existing_pid 2>/dev/null; then
            log_error "Frontend B ya corriendo (PID: $existing_pid). Usa ./stop-b.sh primero."
            exit 1
        fi
    fi

    # Apuntar al backend B
    export PUBLIC_API_URL="http://localhost:$BACKEND_PORT"
    export PUBLIC_MQTT_URL="ws://localhost:$MQTT_WS_PORT"

    cd "$SCRIPT_DIR/frontend"

    if [ ! -d "node_modules" ]; then
        log_info "Instalando dependencias del frontend..."
        npm install
    fi

    nohup npm run dev -- --port $FRONTEND_PORT > "$LOG_DIR/frontend-${INSTANCE}.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/frontend-${INSTANCE}.pid"
    echo $FRONTEND_PORT > "$PID_DIR/frontend-${INSTANCE}.port"

    sleep 3
    if kill -0 $pid 2>/dev/null; then
        log_success "Frontend B iniciado en http://localhost:$FRONTEND_PORT (PID: $pid)"
        echo -e "  ${CYAN}→${NC} Logs: tail -f logs/frontend-${INSTANCE}.log"
    else
        log_error "Frontend B falló al iniciar. Ver logs/frontend-${INSTANCE}.log"
        return 1
    fi

    cd "$SCRIPT_DIR"
}

show_status() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}           Event-Core Instance B - Estado                  ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    # Backend B
    if [ -f "$PID_DIR/backend-${INSTANCE}.pid" ]; then
        local pid=$(cat "$PID_DIR/backend-${INSTANCE}.pid")
        if kill -0 $pid 2>/dev/null; then
            echo -e "  ${GREEN}●${NC} Backend B:  http://localhost:$BACKEND_PORT (PID: $pid)"
            echo -e "    MQTT TCP: $MQTT_PORT / WS: $MQTT_WS_PORT / Core: $CORE_ID"
        else
            echo -e "  ${RED}●${NC} Backend B:  No ejecutándose (PID inválido: $pid)"
        fi
    else
        echo -e "  ${YELLOW}●${NC} Backend B:  No iniciado"
    fi

    # Frontend B
    if [ -f "$PID_DIR/frontend-${INSTANCE}.pid" ]; then
        local pid=$(cat "$PID_DIR/frontend-${INSTANCE}.pid")
        if kill -0 $pid 2>/dev/null; then
            echo -e "  ${GREEN}●${NC} Frontend B: http://localhost:$FRONTEND_PORT (PID: $pid)"
        else
            echo -e "  ${RED}●${NC} Frontend B: No ejecutándose (PID inválido: $pid)"
        fi
    else
        echo -e "  ${YELLOW}●${NC} Frontend B: No iniciado"
    fi

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

###############################################################################
# Main
###############################################################################

case "${1:-all}" in
    backend)
        check_dependencies
        start_backend
        ;;
    frontend)
        check_dependencies
        start_frontend
        ;;
    status)
        show_status
        ;;
    --help|-h|help)
        show_help
        ;;
    all|"")
        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}         Event-Core Instance B - Iniciando Servicios       ${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        check_dependencies
        echo ""
        start_backend
        echo ""
        start_frontend
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}              ¡Instancia B iniciada!                       ${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        show_status
        ;;
    *)
        log_error "Comando desconocido: $1"
        show_help
        exit 1
        ;;
esac
