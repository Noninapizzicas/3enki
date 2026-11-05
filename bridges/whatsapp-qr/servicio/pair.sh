#!/bin/bash
# Vincula un número al puente y devuelve su código de 8 dígitos (o el QR).
#
#   ./pair.sh <slug> <telefono internacional sin +>     ej: ./pair.sh tienda 34684062224
#
# Se lanza UNA vez, con el móvil en la mano: WhatsApp devuelve 429 (RateOverlimit)
# si se piden códigos en ráfaga y el freno dura más de una hora. Cada arranque del
# puente pide uno nuevo, así que reintentar empeora.
set -u
SLUG=${1:?uso: pair.sh <slug> <telefono>}
TEL=${2:?uso: pair.sh <slug> <telefono>}
WA_ENV=${WA_ENV:-$(cd "$(dirname "$0")" && pwd)/wa.env}
[ -f "$WA_ENV" ] && { set -a; . "$WA_ENV"; set +a; }
BASE=${WA_BASE:-$HOME}
CUENTAS=${WA_ACCOUNTS:-accounts-$SLUG.json}
CFG="$BASE/wa-rust/data/$CUENTAS"
LOG="$BASE/wa-servicio/puente.log"

node - "$CFG" "$SLUG" "$TEL" "$BASE" <<'JS'
const fs = require('fs');
const [cfg, slug, tel, base] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(cfg, 'utf8'));
const accs = (d.accounts ||= []);
const a = accs.find((x) => x.slug === slug) || accs[accs.push({ slug, enabled: true }) - 1];
Object.assign(a, { phone: tel, db: a.db || `data/${slug}.db` });
fs.writeFileSync(cfg, JSON.stringify(d, null, 2));
console.log('config lista:', accs.map((x) => `${x.slug}:${x.phone || '-'}`).join(' '));
fs.mkdirSync(`${base}/wa-rust/data`, { recursive: true });
JS

# El supervisor vigila el puente cada 20 s: matarlo lo levanta con la config nueva.
pid=$(pgrep -f "enki-wa-bridge data/$CUENTAS" | head -1)
if [ -n "$pid" ]; then
  kill "$pid" 2>/dev/null && echo "puente $pid detenido, el supervisor lo levanta"
else
  echo "no había puente vivo"
fi

# El código existe en cuanto se construye el cliente: se sondea el endpoint.
for _ in $(seq 1 45); do
  sleep 2
  out=$(curl -s -m 3 "http://127.0.0.1:8235/codigo/$SLUG" 2>/dev/null)
  code=$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).pair_code||"")}catch{}})' 2>/dev/null)
  if [ -n "$code" ]; then
    echo "PAIR_CODE=$code   (8 dígitos, ~3 min de vida)"
    echo "WhatsApp → Dispositivos vinculados → Vincular con número de teléfono"
    exit 0
  fi
done

echo "SIN_CÓDIGO tras 90 s — mira el QR: curl -s http://127.0.0.1:8235/codigo/$SLUG"
echo "--- últimas líneas del puente ---"
tail -15 "$LOG" 2>/dev/null
