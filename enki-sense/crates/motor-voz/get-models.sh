#!/usr/bin/env bash
# get-models.sh — provisiona las VOCES de motor-voz (NO van en el binario, patrón
# ocr4rs). Descarga con curl (que confía en el CA del entorno).
# Uso: ./get-models.sh [DIR]   (default: /opt/enki-sense/models/voz)
#
# Voz por defecto: es_ES-davefx-medium (~61MB). Añadir otra = otra carpeta
# <DIR>/<voz>/ con voz.onnx + voz.onnx.json (rhasspy/piper-voices).
set -euo pipefail
DIR="${1:-/opt/enki-sense/models/voz}"
VOZ="es_ES-davefx-medium"
V="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium"
bajar() { [ -s "$2" ] && { echo "  ya está: $2"; return; }; echo "  ↓ $2"; curl -fsSL -m 600 "$1" -o "$2.tmp" && mv "$2.tmp" "$2"; }
mkdir -p "$DIR/$VOZ"
echo "motor-voz · provisionando voz $VOZ en $DIR"
bajar "$V/es_ES-davefx-medium.onnx"      "$DIR/$VOZ/voz.onnx"
bajar "$V/es_ES-davefx-medium.onnx.json" "$DIR/$VOZ/voz.onnx.json"
echo "listo."
