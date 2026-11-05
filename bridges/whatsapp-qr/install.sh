#!/bin/bash
# Instala el canal WhatsApp-QR en una máquina, desde un clon de este repo.
#
#   ./install.sh                          # layout por defecto ($HOME/wa-*, el de la VPS)
#   WA_BASE=/opt/whatsapp ./install.sh     # otro sitio (lo usa vps-setup.sh --whatsapp)
#   SLUG=tienda ./install.sh               # slug de la cuenta del puente (def. "tienda")
#
# Reproduce el MISMO layout que corre en la VPS, con tres piezas:
#   $WA_BASE/wa-rust/         el puente (compilado AQUÍ, no se copia ningún binario)
#   $WA_BASE/enki-wa-ingest/  el lector JSONL -> pedido en el POS
#   $WA_BASE/wa-servicio/     supervisor + watchdog + unit de systemd
#
# NO copia credenciales de WhatsApp ni la caché de compilación: la sesión NACE
# escaneando el QR en esta máquina (data/*.db) y target/ son varios GB.
set -eu

AQUI=$(cd "$(dirname "$0")" && pwd)
WA_BASE=${WA_BASE:-$HOME}
SLUG=${SLUG:-tienda}
ENKI_HOME_DIR=${ENKI_HOME:-/opt/enki}
UNIT_USER=${UNIT_USER:-$(id -un)}
UNIT_GROUP=${UNIT_GROUP:-$(id -gn)}

say() { printf '%s\n' "$*"; }
die() { say "ERROR: $*" >&2; exit 1; }

command -v node > /dev/null 2>&1 || die "falta node (>= 18). Instálalo y repite."
CARGO=${CARGO:-$(command -v cargo 2>/dev/null || echo "$HOME/.cargo/bin/cargo")}
[ -x "$CARGO" ] || die "falta cargo (toolchain Rust): curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"

say "== 1/6 · fuentes del puente → $WA_BASE/wa-rust"
mkdir -p "$WA_BASE/wa-rust"
# Solo las fuentes: target/ es caché de compilación (GB) y no viaja en el repo.
for f in main.rs Cargo.toml Cargo.lock accounts.example.json; do
  cp "$AQUI/bridge/$f" "$WA_BASE/wa-rust/"
done

say "== 2/6 · compilando el puente (la 1ª vez tarda varios minutos)"
cd "$WA_BASE/wa-rust"
"$CARGO" build --release > /dev/null
BIN="$WA_BASE/wa-rust/target/release/enki-wa-bridge"
[ -x "$BIN" ] || die "no se construyó $BIN. Mira la salida de cargo arriba."
say "   binario: $BIN ($(du -h "$BIN" | cut -f1))"

say "== 3/6 · config de cuentas (no viaja en el repo: lleva teléfonos y rutas)"
CFG="$WA_BASE/wa-rust/data/accounts-tienda.json"
mkdir -p "$WA_BASE/wa-rust/data"
if [ ! -f "$CFG" ]; then
  sed -e "s#/home/hermes#$WA_BASE#g" -e "s#\"rapitvapers\"#\"$SLUG\"#g" \
    "$AQUI/bridge/accounts.example.json" > "$CFG"
  chmod 600 "$CFG"
  say "   creada $CFG (cuenta \"$SLUG\"). Añade más cuentas en ese fichero."
else
  say "   ya existía $CFG — no la toco (tiene la sesión/teléfonos de esta máquina)."
fi
mkdir -p "$WA_BASE/wa-rust/data/sesiones"

say "== 4/6 · lector → $WA_BASE/enki-wa-ingest"
mkdir -p "$WA_BASE/enki-wa-ingest"
cp "$AQUI/ingest/ingest.js" "$WA_BASE/enki-wa-ingest/"
if [ ! -f "$ENKI_HOME_DIR/modules/_shared/pedido-mensaje-parser.js" ]; then
  say "   AVISO: no encuentro $ENKI_HOME_DIR/modules/_shared/pedido-mensaje-parser.js"
  say "          el lector arranca pero no sabrá parsear pedidos hasta que exista."
  say "          (pon ENKI_HOME=/ruta/a/tu/clon si Enki no está en /opt/enki)"
fi

say "== 5/6 · supervisor → $WA_BASE/wa-servicio"
mkdir -p "$WA_BASE/wa-servicio"
for f in servicio.sh watchdog.sh; do
  sed -e "s#/home/hermes#$WA_BASE#g" \
      -e "s#target/release/examples/enki-wa-bridge#target/release/enki-wa-bridge#g" \
      -e "s#--slug rapitvapers#--slug $SLUG#g" \
      "$AQUI/servicio/$f" > "$WA_BASE/wa-servicio/$f"
  chmod +x "$WA_BASE/wa-servicio/$f"
done
# La unit de systemd se genera con las rutas y el usuario de ESTA máquina.
sed -e "s#/home/hermes#$WA_BASE#g" \
    -e "s#^User=hermes#User=$UNIT_USER#" \
    -e "s#^Group=hermes#Group=$UNIT_GROUP#" \
    "$AQUI/servicio/wa-servicio.service.in" > "$WA_BASE/wa-servicio/wa-servicio.service"
# El lector importa el parser de pedidos de Enki: la unit le dice DÓNDE está el
# runtime, para que el mismo clon funcione aunque Enki no viva en /opt/enki.
sed -i "/^\[Service\]/a Environment=ENKI_HOME=${ENKI_HOME_DIR}" "$WA_BASE/wa-servicio/wa-servicio.service"

say "== 6/6 · listo — así se arranca"
cat <<FIN

  ahora mismo:   setsid $WA_BASE/wa-servicio/servicio.sh </dev/null >>$WA_BASE/wa-servicio/servicio.out 2>&1 &
  en el arranque:  sudo cp $WA_BASE/wa-servicio/wa-servicio.service /etc/systemd/system/ \\
                   && sudo systemctl daemon-reload && sudo systemctl enable --now wa-servicio
  red si systemd no:  cron cada 2 min → $WA_BASE/wa-servicio/watchdog.sh  (silencio = todo bien)

Vincula el móvil (una vez por máquina):
  curl -s http://127.0.0.1:8235/codigo/$SLUG     # QR; el primero tras arrancar dura 59 s
  WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo

Nada de esto se activa solo: sin sesión escaneada el puente no tiene a qué contestar.
FIN
