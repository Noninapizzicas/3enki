#!/data/data/com.termux/files/usr/bin/bash
# =============================================================================
# EVENT-CORE - Script de Instalacion para Termux
# =============================================================================
# Uso: curl -fsSL https://raw.githubusercontent.com/.../install-termux.sh | bash
#      o: bash install-termux.sh
# =============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funciones de utilidad
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Banner
echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           EVENT-CORE - Instalador para Termux                ║"
echo "║                     Version 0.2.0                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar que estamos en Termux
if [ ! -d "/data/data/com.termux" ]; then
    log_error "Este script debe ejecutarse en Termux"
    exit 1
fi

log_info "Detectado: Termux en Android"

# =============================================================================
# PASO 1: Actualizar repositorios
# =============================================================================
log_info "[1/6] Actualizando repositorios de Termux..."
pkg update -y && pkg upgrade -y
log_success "Repositorios actualizados"

# =============================================================================
# PASO 2: Instalar dependencias del sistema
# =============================================================================
log_info "[2/6] Instalando dependencias del sistema..."

# Dependencias base
pkg install -y \
    nodejs \
    git \
    openssh \
    curl \
    wget \
    nano \
    vim

# Dependencias para compilacion nativa (algunas deps de npm lo necesitan)
pkg install -y \
    build-essential \
    python3 \
    make \
    clang

# Dependencias opcionales para OCR/PDF
log_info "Instalando dependencias para OCR y PDF (opcional)..."
pkg install -y \
    tesseract \
    poppler \
    imagemagick || log_warn "Algunas dependencias opcionales no se instalaron"

log_success "Dependencias del sistema instaladas"

# Verificar version de Node.js
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
log_info "Node.js version: $NODE_VERSION"

if [[ "$NODE_VERSION" == "none" ]]; then
    log_error "Node.js no se instalo correctamente"
    exit 1
fi

# Verificar que sea >= 18
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
    log_error "Se requiere Node.js >= 18. Version actual: $NODE_VERSION"
    exit 1
fi

log_success "Node.js $NODE_VERSION verificado"

# =============================================================================
# PASO 3: Clonar o actualizar repositorio
# =============================================================================
log_info "[3/6] Configurando repositorio..."

EVENT_CORE_DIR="$HOME/event-core"

if [ -d "$EVENT_CORE_DIR" ]; then
    log_info "Directorio existente encontrado. Actualizando..."
    cd "$EVENT_CORE_DIR"
    git pull origin main || log_warn "No se pudo actualizar (puede ser instalacion local)"
else
    log_info "Clonando repositorio..."
    # Si se ejecuta desde el repo, copiar en lugar de clonar
    if [ -f "./package.json" ] && grep -q "event-core" ./package.json 2>/dev/null; then
        log_info "Ejecutando desde el repositorio local"
        EVENT_CORE_DIR=$(pwd)
    else
        log_warn "Repositorio no encontrado. Por favor clona manualmente:"
        echo "  git clone <url-del-repositorio> ~/event-core"
        echo "  cd ~/event-core"
        echo "  bash scripts/install-termux.sh"
        exit 1
    fi
fi

cd "$EVENT_CORE_DIR"
log_success "Repositorio configurado en: $EVENT_CORE_DIR"

# =============================================================================
# PASO 4: Instalar dependencias de Node.js
# =============================================================================
log_info "[4/6] Instalando dependencias de Node.js..."

# Configurar npm para Termux (evitar problemas de permisos)
npm config set prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"

# Agregar al perfil si no existe
if ! grep -q ".npm-global" "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.bashrc"
fi

# Instalar dependencias
npm install --production

# Instalar dependencias de desarrollo (opcional, para tests)
# npm install

log_success "Dependencias de Node.js instaladas"

# =============================================================================
# PASO 5: Configurar entorno
# =============================================================================
log_info "[5/6] Configurando entorno..."

# Crear .env si no existe
if [ ! -f ".env" ]; then
    cp .env.example .env
    log_success "Archivo .env creado desde .env.example"
    log_warn "Edita .env para agregar tus credenciales: nano .env"
else
    log_info "Archivo .env ya existe"
fi

# Crear directorios necesarios
mkdir -p data logs

# Permisos de ejecucion para scripts
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x cli/index.js 2>/dev/null || true

log_success "Entorno configurado"

# =============================================================================
# PASO 6: Verificar instalacion
# =============================================================================
log_info "[6/6] Verificando instalacion..."

# Test basico
if node -e "require('./core/events/bus.js')" 2>/dev/null; then
    log_success "Modulos core cargados correctamente"
else
    log_warn "Algunos modulos pueden tener problemas"
fi

# =============================================================================
# RESUMEN FINAL
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            INSTALACION COMPLETADA EXITOSAMENTE               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Directorio:${NC} $EVENT_CORE_DIR"
echo ""
echo -e "${YELLOW}Comandos disponibles:${NC}"
echo ""
echo "  # Iniciar el servidor"
echo "  npm start"
echo ""
echo "  # Iniciar en modo desarrollo (mas logs)"
echo "  npm run dev"
echo ""
echo "  # Ejecutar tests"
echo "  npm test"
echo ""
echo "  # Ver estado via CLI"
echo "  node cli/index.js health"
echo ""
echo -e "${YELLOW}Configuracion:${NC}"
echo ""
echo "  # Editar configuracion"
echo "  nano .env"
echo ""
echo "  # Agregar API keys (ejemplo)"
echo "  OPENAI_API_KEY=sk-..."
echo "  DEEPSEEK_API_KEY=sk-..."
echo ""
echo -e "${YELLOW}Puertos por defecto:${NC}"
echo "  HTTP:  3000"
echo "  MQTT:  1883"
echo ""
echo -e "${BLUE}Para iniciar ahora:${NC}"
echo "  cd $EVENT_CORE_DIR && npm start"
echo ""

# Crear script de inicio rapido
cat > "$HOME/start-event-core.sh" << 'STARTUP'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/event-core
npm start
STARTUP
chmod +x "$HOME/start-event-core.sh"

log_success "Script de inicio rapido creado: ~/start-event-core.sh"
