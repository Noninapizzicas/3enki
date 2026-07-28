---
name: motor-voz-supertonic
description: >-
  Migrar motor-voz de piper-rs a Supertonic (ONNX directo, sin espeak-ng,
  44.1kHz, 31 idiomas). Plan de acción para reemplazar la dependencia de
  espeak-ng + libclang-dev por inferencia ONNX directa.
when-to-use: >-
  Cuando se decida migrar el TTS de piper-rs a Supertonic. También como
  referencia para evaluar la viabilidad del cambio.
source: hermes
tags: [tts, voz, supertonic, onnx, migracion, enki-sense]
---

# motor-voz → Supertonic

Migrar el órgano de voz `motor-voz` de `piper-rs` (espeak-ng, libclang-dev,
22kHz) a inferencia ONNX directa con Supertonic (sin espeak-ng, 44.1kHz,
31 idiomas).

## Problema actual

`motor-voz` usa `piper-rs` que depende de:
- `espeak-ng` — fonemización
- `libclang-dev` — bindgen
- `ProtectSystem=strict` incompatible con espeak-ng
- Solo español, 22kHz

## Solución

Reemplazar `piper-rs` por inferencia ONNX directa con Supertonic.

Modelos: https://huggingface.co/Supertone/supertonic-3

## Pasos

1. Probar Supertonic standalone
2. Adaptar motor-voz (reemplazar speak.rs)
3. systemd service sin ProtectSystem
4. get-models.sh para descargar ONNX + voice styles
5. vps-setup.sh: eliminar espeak-ng y libclang-dev del apt

## Ventajas

| Antes | Después |
|-------|---------|
| espeak-ng + libclang-dev | Solo ONNX Runtime |
| 22kHz | 44.1kHz |
| 1 idioma | 31 idiomas |
| ProtectSystem conflictos | Sin conflictos |
