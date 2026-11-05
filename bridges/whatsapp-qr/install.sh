#!/bin/bash
# Instala el canal WhatsApp-QR en una máquina, desde un clon de este repo.
#
#   ./install.sh              # layout por defecto (~/wa-servicio, ~/enki-wa-ingest, ~/wa-rust)
#   WA_BASE=/srv/tienda ./install.sh
#
# Reproduce el MISMO layout que corre en la VPS (por eso los scripts se copian
# tal cual y solo se reescribe la raíz), con tres piezas:
#   $WA_BASE/wa-rust/         el puente (crate de bridge/, compilado aquí)
#   $WA_BASE/enki-wa-ingest/  el lector JSONL -> pedido en el POS
#   $WA_BASE/wa-servicio/     supervisor + watchdog + unit de systemd
#
# NO copia credenciales de WhatsApp: la sesión NACE escaneando el QR en esta
# máquina. Es lo único que no viaja en el repo, a propósito.
set -eu
AQUI=$(cd "$(dirname "$0")" && pwd)
WA_BASE=${WA_BASE:-$HOME}
SLUG=${SLUG:-rapitvapers}
ENKI_HOME_DIR=${ENKI_HOME:-/opt/enki}

say() { printf '%s\n' "$*"; }

say "== 1/5 · puente en $WA_BASE/wa-rust"
mkdir -p "$WA_BASE/wa-rust"
cp -r "$AQUI/bridge/." "$WA_BASE/wa-rust/"
"$AQUI/build.sh" >/dev/null
[ -x "$WA_BASE/wa-rust/target/release/enki-wa-bridge" ] || {
  say "ERROR: no se construyó el binario. Corre $AQUI/build.sh y mira el error."
  exit 1
}
if [ ! -f "$WA_BASE/wa-rust/data/accounts-tienda.json" ]; then
  mkdir -p "$WA_BASE/wa-rust/data"
  sed "s#/home/hermes#$WA_BASE#g" "$AQUI/bridge/accounts.example.json" \
    > "$WA_BASE/wa-rust/data/accounts-tienda.json"
  chmod 600 "$WA_BASE/wa-rust/data/accounts-tienda.json"
  say "   config de cuentas creada (slug=$SLUG). Añade más cuentas en ese fichero."
fi

say "== 2/5 · lector en $WA_BASE/enki-wa-ingest"
mkdir -p "$WA_BASE/enki-wa-ingest"
cp "$AQUI/ingest/ingest.js" "$WA_BASE/enki-wa-ingest/"

say "== 3/5 · supervisor en $WA_BASE/wa-servicio"
mkdir -p "$WA_BASE/wa-servicio"
for f in servicio.sh watchdog.sh pair-pirata.sh; do
  sed -e "s#/home/hermes#$WA_BASE#g" \
      -e "s#target/release/examples/enki-wa-bridge#target/release/enki-wa-bridge#g" \
      "$AQUI/servicio/$f" > "$WA_BASE/wa-servicio/$f"
  chmod +x "$WA_BASE/wa-servicio/$f"
done

say "== 4/5 · ENKI_HOME apuntando a $ENKI_HOME_DIR"
# El lector importa el parser de pedidos de Enki y la carta del proyecto.
if [ ! -f "$ENKI_HOME_DIR/modules/_shared/pedido-mensaje-parser.js" ]; then
  say "   AVISO: no encuentro $ENKI_HOME_DIR/modules/_shared/pedido-mensaje-parser.js"
  say "          el lector arrancará pero no sabrá parsear pedidos hasta que exista."
fi

say "== 5/5 · arranque"
say "   ahora:         setsid $WA_BASE/wa-servicio/servicio.sh </dev/null >>$WA_BASE/wa-servicio/servicio.out 2>&1 &"
say "   con systemd:   la unit está en servicio/wa-servicio.service.in (reescribe rutas y cópiala a /etc/systemd/system)"
say "   latido Hermes: cron cada 2 min → $WA_BASE/wa-servicio/watchdog.sh (silencio = todo bien)"
say
say "Vincular el móvil: abre $WA_BASE/wa-servicio/puente.log y busca el QR, o"
say "  curl -s http://127.0.0.1:8235/codigo/$SLUG"
say "Después: WhatsApp > Dispositivos vinculados > Vincular un dispositivo."
