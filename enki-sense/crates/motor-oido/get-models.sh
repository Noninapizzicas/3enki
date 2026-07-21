#!/usr/bin/env bash
# get-models.sh — provisiona el modelo de motor-oido (NO va en el binario, patrón
# ocr4rs). Descarga con curl (que confía en el CA del entorno).
# Uso: ./get-models.sh [DIR]   (default: /opt/enki-sense/models/oido)
#
# Modelo: whisper-tiny (multilingüe, ~145MB). Para mejor calidad, cambiar a
# whisper-base (~290MB) editando WHISPER abajo. Los filtros mel van con el modelo.
set -euo pipefail
DIR="${1:-/opt/enki-sense/models/oido}"
WHISPER="openai/whisper-tiny"      # multilingüe; ES/EN/FR/CA...
HF="https://huggingface.co/${WHISPER}/resolve/main"
CANDLE="https://raw.githubusercontent.com/huggingface/candle/0.8.4/candle-examples/examples/whisper"
mkdir -p "$DIR"
bajar() { [ -s "$2" ] && { echo "  ya está: $2"; return; }; echo "  ↓ $2"; curl -fsSL -m 600 "$1" -o "$2.tmp" && mv "$2.tmp" "$2"; }
echo "motor-oido · provisionando whisper en $DIR"
bajar "$HF/config.json"          "$DIR/config.json"
bajar "$HF/tokenizer.json"       "$DIR/tokenizer.json"
bajar "$HF/model.safetensors"    "$DIR/model.safetensors"
# Filtros mel (80 bins para tiny/base; candle los provee precomputados).
bajar "$CANDLE/melfilters.bytes" "$DIR/melfilters.bytes"
echo "listo."
