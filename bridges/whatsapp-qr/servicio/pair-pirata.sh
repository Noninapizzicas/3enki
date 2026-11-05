#!/bin/bash
# Deja el número de la pizzería (643283034) pidiendo el código de 8 dígitos en el puente.
# Se lanza UNA sola vez, con el móvil del número en la mano: WhatsApp devuelve 429
# (RateOverlimit) si se piden códigos en ráfaga, y el freno dura más de una hora.
set -u
CFG=/home/hermes/wa-rust/data/accounts-tienda.json
LOG=/home/hermes/wa-servicio/puente.log

python3 - "$CFG" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
accs = d.setdefault('accounts', [])
if not any(a.get('slug') == 'the-pirate' for a in accs):
    accs.append({"slug": "the-pirate",
                 "db": "/home/hermes/wa-sessions/pirata/whatsapp.db",
                 "enabled": True})
for a in accs:
    if a.get('slug') == 'the-pirate':
        a['phone'] = '34643283034'
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print('config lista:', [a.get('slug') + ':' + str(a.get('phone')) for a in accs])
PY

mkdir -p /home/hermes/wa-sessions/pirata

# El supervisor vigila cada 20 s; matar el puente lo levanta con la config nueva.
pid=$(pgrep -f "^\./target/release/examples/enki-wa-bridge data/accounts-tienda.json$" | head -1)
[ -z "$pid" ] && pid=$(pgrep -f "enki-wa-bridge data/accounts-tienda.json" | head -1)
if [ -n "$pid" ]; then
  kill "$pid" 2>/dev/null
  echo "puente $pid detenido, el supervisor lo levanta"
else
  echo "no habia puente vivo"
fi

# El código llega al construirse el cliente: se sondea el endpoint (y se contrasta con el log).
for i in $(seq 1 45); do
  sleep 2
  out=$(curl -s -m 3 http://127.0.0.1:8235/codigo/the-pirate 2>/dev/null)
  code=$(printf '%s' "$out" | python3 -c "import sys,json;print(json.load(sys.stdin).get('pair_code') or '')" 2>/dev/null)
  if [ -n "$code" ]; then
    echo "PAIR_CODE=$code"
    printf '%s' "$out" | python3 -c "import sys,json;d=json.load(sys.stdin);print('QR_LEN=%d'%len(d.get('qr') or ''))" 2>/dev/null
    echo "--- log (the-pirate) ---"
    grep -a "the-pirate" "$LOG" | tail -6
    exit 0
  fi
done

echo "SIN_CODIGO tras 90 s"
echo "--- log (ultimas lineas) ---"
tail -25 "$LOG"
