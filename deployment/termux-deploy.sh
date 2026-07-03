#!/usr/bin/env bash
# termux-deploy.sh — despliega Enki a N VPS desde Termux (o cualquier bash).
#
# Por cada VPS:  ssh → cd <remote_dir> → git pull origin <branch> → sudo ./deployment/vps-setup.sh <dominio>
#
# NO guarda contraseñas en el repo. Dos modos, elegidos por servidor:
#   A) CLAVES SSH (recomendado, cero passwords) — ver "Pasar a claves" abajo. El script usa ssh -t.
#   B) CONTRASEÑA (fallback) — sshpass lee la pass de un fichero 600, o la pregunta. Misma pass
#      para el login SSH y para sudo -S (que es tu caso: login y sudo comparten contraseña).
#
# Uso:
#   ./deployment/termux-deploy.sh                # TODOS los VPS del conf
#   ./deployment/termux-deploy.sh vps1 vps3      # solo esos alias
#
# Config (FUERA del repo, uno por servidor). Copia el .example:
#   ~/.config/enki-deploy/servers.conf     alias | user@host | remote_dir | dominio
#   ~/.config/enki-deploy/secrets  (600)   alias contraseña   # una por VPS; o '* contraseña'
#                                          para la MISMA en todos. Si falta, se pregunta.
#
# Añadir un VPS = una línea más en servers.conf. Nada más.

set -u

CONF="${ENKI_DEPLOY_CONF:-$HOME/.config/enki-deploy/servers.conf}"
SECRETS="${ENKI_DEPLOY_SECRETS:-$HOME/.config/enki-deploy/secrets}"
BRANCH="${ENKI_DEPLOY_BRANCH:-main}"

c_ok(){  printf '\033[32m%s\033[0m\n' "$*"; }
c_err(){ printf '\033[31m%s\033[0m\n' "$*" >&2; }
c_hdr(){ printf '\n\033[1;36m══ %s ══\033[0m\n' "$*"; }
have(){  command -v "$1" >/dev/null 2>&1; }
trim(){  local s="$*"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }

[ -f "$CONF" ] || { c_err "No existe $CONF"; echo "Copia deployment/termux-servers.conf.example → $CONF y rellénalo." >&2; exit 1; }

# alias → contraseña. Orden: línea exacta del alias en secrets → comodín '*' (misma pass para
# TODOS los VPS) → env ENKI_DEPLOY_PASS → pregunta. Cadena vacía = usar clave SSH (modo A).
pass_for(){
  local a="$1" p=""
  if [ -f "$SECRETS" ]; then
    p="$(awk -v a="$a" '$1==a{$1="";sub(/^[ \t]+/,"");print;exit}' "$SECRETS")"
    [ -z "$p" ] && p="$(awk '$1=="*"{$1="";sub(/^[ \t]+/,"");print;exit}' "$SECRETS")"
  fi
  [ -z "$p" ] && p="${ENKI_DEPLOY_PASS:-}"
  if [ -z "$p" ] && [ -t 0 ]; then
    read -rs -p "Contraseña para $a (enter = usar clave SSH): " p </dev/tty; echo >&2
  fi
  printf '%s' "$p"
}

deploy_one(){
  local alias="$1" target="$2" dir="$3" domain="$4"
  c_hdr "$alias   $target → $domain   [$dir @ $BRANCH]"
  # El bloque remoto: pull + deploy. sudo -S lee su contraseña por stdin (modo B).
  # Ojo: el bloque va envuelto en comillas SIMPLES para bash -lc → NO puede contener comillas
  # simples. Por eso -p usa comillas dobles (literales dentro del envoltorio), no ''.
  local remote="set -e; cd \"$dir\"; git pull origin \"$BRANCH\"; sudo -S -p \"\" ./deployment/vps-setup.sh \"$domain\""

  local pass; pass="$(pass_for "$alias")"
  if [ -n "$pass" ]; then
    have sshpass || { c_err "sshpass no está — instala: pkg install sshpass"; return 1; }
    # sshpass -e toma la pass de SSH del env SSHPASS (no aparece en 'ps', a diferencia de -p).
    # printf … | ssh  → ese stdin se reenvía al remoto → lo lee 'sudo -S'.
    printf '%s\n' "$pass" | SSHPASS="$pass" sshpass -e \
      ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$target" "bash -lc '$remote'"
  else
    # Modo A (clave SSH). -t da tty por si sudo pide contraseña (o pon NOPASSWD, ver abajo).
    ssh -t -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$target" "bash -lc '$remote'"
  fi
}

# ── selección: args = alias concretos; sin args = todos ──
selected=("$@")
is_selected(){ [ ${#selected[@]} -eq 0 ] && return 0; local s; for s in "${selected[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

declare -a OK=() BAD=(); RC=0
while IFS='|' read -r a target dir domain || [ -n "${a:-}" ]; do
  a="$(trim "$a")"; [ -z "$a" ] && continue
  case "$a" in \#*) continue;; esac
  target="$(trim "$target")"; dir="$(trim "$dir")"; domain="$(trim "$domain")"
  is_selected "$a" || continue
  if [ -z "$target" ] || [ -z "$dir" ] || [ -z "$domain" ]; then
    c_err "línea incompleta para '$a' (faltan campos) — se salta"; BAD+=("$a"); RC=1; continue
  fi
  if deploy_one "$a" "$target" "$dir" "$domain"; then OK+=("$a"); c_ok "✔ $a OK"
  else BAD+=("$a"); RC=1; c_err "✗ $a FALLÓ"; fi
done < "$CONF"

c_hdr "Resumen"
c_ok  "OK:    ${OK[*]:-—}"
[ ${#BAD[@]} -gt 0 ] && c_err "FALLÓ: ${BAD[*]}"
exit $RC
