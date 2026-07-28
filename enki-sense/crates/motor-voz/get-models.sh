#!/usr/bin/env bash
# get-models.sh — provisiona los modelos Supertonic 3 para motor-voz.
# Descarga 4 ONNX + unicode_indexer + tts.json + voice styles desde HuggingFace.
# Uso: ./get-models.sh [DIR]   (default: /opt/enki-sense/models/voz)
set -euo pipefail

DIR="${1:-/opt/enki-sense/models/voz}"
HF="https://huggingface.co/Supertone/supertonic-3/resolve/main"

bajar() {
  [ -s "$2" ] && { echo "  ya está: $2"; return; }
  echo "  ↓ $2"
  curl -fsSL -m 600 "$1" -o "$2.tmp" && mv "$2.tmp" "$2"
}

echo "motor-voz · provisionando Supertonic 3 en $DIR"

# ── ONNX models ──
mkdir -p "$DIR/onnx"
bajar "$HF/assets/onnx/duration_predictor.onnx"  "$DIR/onnx/duration_predictor.onnx"
bajar "$HF/assets/onnx/text_encoder.onnx"        "$DIR/onnx/text_encoder.onnx"
bajar "$HF/assets/onnx/vector_estimator.onnx"    "$DIR/onnx/vector_estimator.onnx"
bajar "$HF/assets/onnx/vocoder.onnx"             "$DIR/onnx/vocoder.onnx"
bajar "$HF/assets/onnx/unicode_indexer.json"     "$DIR/onnx/unicode_indexer.json"
bajar "$HF/assets/onnx/tts.json"                 "$DIR/onnx/tts.json"

# ── Voice styles ──
mkdir -p "$DIR/voice_styles"
for V in M1 M2 M3 M4 M5 F1 F2 F3 F4 F5; do
  bajar "$HF/assets/voice_styles/${V}.json" "$DIR/voice_styles/${V}.json"
done

echo "listo. Voces: M1-M5 F1-F5 (10 estilos, 31 idiomas, 44.1kHz)"
