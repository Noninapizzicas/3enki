#!/bin/bash
# =============================================================================
# EVENT-CORE - Instalador Universal
# =============================================================================
# Detecta automaticamente el entorno (Termux o Linux) y ejecuta el instalador
# correcto.
#
# Uso:
#   curl -fsSL <url>/install.sh | bash
#   o desde el repo: bash install.sh
# =============================================================================

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              EVENT-CORE - Instalador Universal               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Detectar entorno
if [ -d "/data/data/com.termux" ]; then
    echo -e "${GREEN}[DETECTADO]${NC} Termux en Android"
    echo ""

    # Verificar que el script existe
    SCRIPT_PATH="scripts/install-termux.sh"
    if [ -f "$SCRIPT_PATH" ]; then
        exec bash "$SCRIPT_PATH"
    else
        echo -e "${YELLOW}Descargando instalador de Termux...${NC}"
        # Si no existe localmente, descargar (placeholder URL)
        echo "Por favor ejecuta: bash scripts/install-termux.sh"
        exit 1
    fi
else
    echo -e "${GREEN}[DETECTADO]${NC} Linux"
    echo ""

    SCRIPT_PATH="scripts/install-linux.sh"
    if [ -f "$SCRIPT_PATH" ]; then
        exec bash "$SCRIPT_PATH"
    else
        echo -e "${YELLOW}Descargando instalador de Linux...${NC}"
        echo "Por favor ejecuta: bash scripts/install-linux.sh"
        exit 1
    fi
fi
