#!/usr/bin/env bash
# get-models.sh — provisiona los modelos de motor-traduce (NO van en el binario,
# como ocr4rs get-models). Descarga con curl (que confía en el CA del entorno),
# no desde el binario. Cada par en <dir>/<de>-<a>/.
#
# Uso: ./get-models.sh [DIR]   (default: /opt/enki-sense/models/traduce)
#
# Par verificado: fr-en (Opus-MT + tokenizers de lmz/candle-marian). Añadir otro
# par = registrar su Config en translate.rs + descargar sus assets aquí.
#
# NOTA honesta: los tokenizers de lmz emparejan bien con los pesos Helsinki para
# el contenido, pero el EOS puede no cerrar 100% limpio (queda algún token de
# cola; el freno anti-bucle del motor lo acota). Un tokenizer convertido del
# propio modelo (transformers) lo dejaría perfecto — mejora futura.
set -euo pipefail
DIR="${1:-/opt/enki-sense/models/traduce}"
HF="https://huggingface.co"

bajar() {  # bajar <url> <destino>
  [ -s "$2" ] && { echo "  ya está: $2"; return; }
  echo "  ↓ $2"
  curl -fsSL -m 600 "$1" -o "$2.tmp" && mv "$2.tmp" "$2"
}

par_fr_en() {
  local d="$DIR/fr-en"; mkdir -p "$d"
  bajar "$HF/lmz/candle-marian/resolve/main/tokenizer-marian-base-fr.json" "$d/tokenizer-src.json"
  bajar "$HF/lmz/candle-marian/resolve/main/tokenizer-marian-base-en.json" "$d/tokenizer-tgt.json"
  bajar "$HF/Helsinki-NLP/opus-mt-fr-en/resolve/main/model.safetensors"    "$d/model.safetensors"
}

echo "motor-traduce · provisionando modelos en $DIR"
par_fr_en
echo "listo. Pares disponibles: $(ls "$DIR" 2>/dev/null | tr '\n' ' ')"
