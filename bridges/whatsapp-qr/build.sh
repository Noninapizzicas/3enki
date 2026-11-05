#!/bin/bash
# Construye el puente. Deja el binario en bridge/target/release/enki-wa-bridge.
#
# La primera vez descarga whatsapp-rust desde GitHub (rev pineada en Cargo.toml)
# y compila el árbol entero: son varios minutos y ~2 GB de target/. Después es
# incremental.
set -eu
AQUI=$(cd "$(dirname "$0")" && pwd)
cd "$AQUI/bridge"
CARGO=${CARGO:-$HOME/.cargo/bin/cargo}
[ -x "$CARGO" ] || CARGO=cargo
exec "$CARGO" build --release
