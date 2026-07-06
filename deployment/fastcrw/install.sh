#!/usr/bin/env bash
#
# install.sh — instala el motor fastCRW (crw-server) NATIVO en el VPS. Sin Docker.
#
# El stack Rust es un binario estático de una pieza → mucho más limpio nativo que
# en contenedor. Escucha en :3002 (el core de Enki tiene el :3000). Sin auth local.
#
# Uso:  sudo deployment/fastcrw/install.sh
#
# Requiere el toolchain de Rust (no hay releases precompiladas publicadas). Si no
# está, lo instala vía rustup (usuario que ejecuta). Luego coloca el binario en
# /usr/local/bin y deja listo el systemd unit para copiar.

set -euo pipefail

BIN_DEST="/usr/local/bin/crw-server"

echo "==> fastCRW crw-server — instalación nativa (sin Docker)"

# 1. Rust toolchain (cargo)
if ! command -v cargo >/dev/null 2>&1; then
  echo "==> Rust/cargo no encontrado. Instalando vía rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

# 2. Compilar/instalar crw-server desde crates.io
echo "==> cargo install crw-server (compila el binario estático)…"
cargo install crw-server

# 3. Localizar el binario recién instalado y publicarlo en /usr/local/bin
SRC_BIN="$(command -v crw-server || echo "$HOME/.cargo/bin/crw-server")"
if [ ! -x "$SRC_BIN" ]; then
  echo "ERROR: no encuentro el binario crw-server tras cargo install." >&2
  exit 1
fi

echo "==> Copiando $SRC_BIN -> $BIN_DEST"
install -m 0755 "$SRC_BIN" "$BIN_DEST"

echo ""
echo "==> Listo. Binario en $BIN_DEST"
echo "    Siguiente:"
echo "      sudo cp deployment/fastcrw/crw-server.service /etc/systemd/system/"
echo "      sudo systemctl daemon-reload && sudo systemctl enable --now crw-server"
echo "      curl http://localhost:3002/health"
echo ""
echo "    Enki lo alcanza vía el módulo modules/fastcrw (tools_http -> :3002)."
echo "    /search es opcional: necesita SearXNG (deployment/python-tools/)."
