#!/bin/bash
# Supervisor de entrada de WhatsApp para Enki (rapitvapers).
#
# Dos hilos INDEPENDIENTES, porque el fallo que importa es el que no se ve:
#   hilo 1 — puente Rust (:8235): lo levanta si NO hay proceso; si el proceso vive
#            pero lleva 3 revisiones sin contestar, lo mata y arranca uno limpio.
#            (Arrancar uno nuevo solo porque /health no contesta en 3s deja DOS
#            clientes con la misma sesion: WhatsApp los echa por turnos y el puente
#            entra en bucle de reconexion. Medido el 5-nov: 5 CONECTADO en 4 min.)
#   hilo 2 — ingest (JSONL -> pedido en el POS): si muere, lo relanza; y no arranca
#            hasta que el POS conteste.
#
# Cerrojo por PIDFILE, no por flock: el cerrojo de flock lo heredan los hijos
# (puente, node) y si el supervisor muere queda echado por un nieto -> el watchdog
# no puede levantar nada. El pidfile con kill -0 muere con el proceso, sin herencia.
# Se lanza SIEMPRE desde watchdog.sh (que hace setsid), nunca en primer plano.
set -u
BASE=/home/hermes
DIR=$BASE/wa-servicio
LOG=$DIR/servicio.log
PIDFILE=$DIR/servicio.pid
MIO_PIDFILE=$DIR/ingest.$$.pid   # el ingest de ESTE supervisor, no el de otro
PUENTE_CMD="enki-wa-bridge data/accounts-tienda.json"
mkdir -p "$DIR"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [servicio] $*" >> "$LOG"; }

# --- un supervisor y no dos ---
if [ -f "$PIDFILE" ]; then
  p=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "${p:-}" ] && [ "$p" != "$$" ] && kill -0 "$p" 2>/dev/null; then
    log "ya hay supervisor vivo ($p), salgo"; exit 0
  fi
  log "pidfile obsoleto (${p:-vacio}), lo sobrescribo"
fi
echo $$ > "$PIDFILE"

puente_ok() { curl -s -m 3 http://127.0.0.1:8235/health 2>/dev/null | grep -q '"ok":true'; }
puente_pid() { pgrep -f "$PUENTE_CMD" | head -1; }

arrancar_puente() {
  cd "$BASE/wa-rust" || return 1
  ./target/release/examples/enki-wa-bridge data/accounts-tienda.json >> "$DIR/puente.log" 2>&1 &
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 2
    if puente_ok; then log "puente arriba (${i}x2s, pid $(puente_pid))"; return 0; fi
  done
  log "puente NO responde tras 24s (pid $(puente_pid))"
  return 1
}

# --- hilo 1: vigilar el puente ---
(
  fallos=0
  while true; do
    pid=$(puente_pid)
    if [ -z "$pid" ]; then
      log "puente no esta vivo, arrancando"
      arrancar_puente
      fallos=0
    elif puente_ok; then
      fallos=0
    else
      fallos=$((fallos+1))
      log "puente vivo (pid $pid) pero sin salud · fallo $fallos/3"
      if [ "$fallos" -ge 3 ]; then
        log "puente colgado (pid $pid), lo mato y arranco limpio"
        kill "$pid" 2>/dev/null; sleep 2
        kill -9 "$pid" 2>/dev/null
        arrancar_puente
        fallos=0
      fi
    fi
    sleep 20
  done
) &
H1=$!

# --- hilo 2: vigilar el ingest ---
(
  while true; do
    # No arrancar el lector hasta que el POS conteste: tras un reinicio, Enki tarda
    # mas que el puente y un mensaje que llegue en ese hueco se leeria con el POS
    # caido. (El ingest ademas ya no consume la linea si el POST falla.)
    hasta=0
    until curl -s -m 2 -o /dev/null http://127.0.0.1:3000/health; do
      [ "$hasta" = 0 ] && log "POS (:3000) aun no responde, espero antes de arrancar el ingest"
      hasta=1
      sleep 5
    done
    [ "$hasta" = 1 ] && log "POS arriba, arranco el ingest"
    log "arrancando ingest rapitvapers"
    cd "$BASE/enki-wa-ingest" || { log "no existe $BASE/enki-wa-ingest"; sleep 30; continue; }
    node ingest.js --slug rapitvapers --eventos "$BASE/wa-rust/data/eventos-tienda.jsonl" >> "$DIR/ingest.log" 2>&1 &
    ING=$!
    echo "$ING" > "$MIO_PIDFILE"
    wait "$ING"
    log "ingest termino (codigo $?), reinicio en 5s"
    sleep 5
  done
) &
H2=$!

limpiar() {
  log "supervisor termina (pid $$)"
  pkill -TERM -P "$H1" 2>/dev/null   # el puente que cuelga del hilo 1
  pkill -TERM -P "$H2" 2>/dev/null   # el node que cuelga del hilo 2
  for p in "$H1" "$H2"; do kill "$p" 2>/dev/null; done
  rm -f "$MIO_PIDFILE" "$PIDFILE"
}
trap limpiar EXIT TERM INT

log "supervisor arriba (pid $$)"
wait
