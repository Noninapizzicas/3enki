---
name: media-generator
description: >-
  El LÍDER GENERADOR: puerto provider-agnóstico media.generar (request→response)
  que enruta por TIPO (imagen/audio/música) al MOTOR concreto configurado.
  Provider-agnóstico: cambiar de motor = cambiar config, no el especialista.
  Motor de imagen por defecto: Google Imagen 3. Swappable a OpenAI/SD/local.
fuente: enki
dominio: comercio
tags: [pizzepos, media, generador, imagen, provider-agnostic, tools-http]
---

# Pizzepos · media-generator

> **Qué es.** El puerto de generación de media provider-agnóstico. Un especialista
> LLM (diseñador gráfico, sound designer) redacta el prompt y pide al puerto;
> el líder lo renderiza con el motor que esté configurado. Cambiar de motor =
> cambiar `motores.imagen.tool`, no tocar el especialista.
>
> **Degradable:** tipo sin motor configurado → `NO_MOTOR` (sin reventar).
>
> Código: `modules/pizzepos/media-generator/index.js` · v`1.0.0`

---

## 1 · LÓGICA

### Provider-agnóstico

```
ESPECIALISTA (LLM)            MEDIA-GENERATOR               MOTOR (HTTP)
─────────────────             ───────────────               ───────────
"genera una imagen             media.generar.request
 de una pizza margarita"             │
       │                             ├─ ¿qué motor para "imagen"?
       │                             │   config.motores.imagen.tool
       │                             │   = "motor.imagen.google"
       │                             │
       │                             ├─ resuelve credencial (credential-manager)
       │                             ├─ hace fetch a la API
       │                             │   (body_template + response_path)
       │                             │
       │                             └─ media.generar.response
       │←──── { url, base64, ... } ──
```

### Motores configurados

| Tipo | Motor default | Provider | Tool |
|------|---------------|----------|------|
| Imagen | Google Imagen 3 | `GOOGLE` | `motor.imagen.google` |
| Imagen (alt) | OpenAI DALL-E 3 | `OPENAI` | `motor.imagen.openai` |

### tools_http

El loader resuelve credencial + fetch + response_path automáticamente:

```jsonc
// motor.imagen.google — config
{
  "http": {
    "method": "POST",
    "url": "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict",
    "auth_type": "api_key_query",
    "auth_query_param_name": "key",
    "credential_id": "GOOGLE",
    "body_template": {
      "instances": [{ "prompt": "{{prompt}}" }],
      "parameters": { "sampleCount": 1 }
    },
    "response_path": "predictions.0.bytesBase64Encoded",
    "timeout_ms": 90000
  }
}
```

---

## 2 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `media.generar.response` | Media generada (base64 + metadatos) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `media.generar.request` | — | Genera media según tipo y motor configurado |

### Errores

| Código | Significado |
|--------|-------------|
| `NO_MOTOR` | Tipo sin motor configurado (degradable) |
| `MOTOR_ERROR` | El motor HTTP respondió con error |

---

## 3 · INTEGRACIÓN

> **Uso desde el LLM:** el especialista (diseñador, sound designer) redacta
> el prompt y llama a `media.generar.request`. El puerto resuelve el motor
> según el tipo.

> **Config:** cambiar de motor = editar `motores.imagen.tool` en config.
> `motor.imagen.google` usa `GOOGLE_API_KEY_GLOBAL` (ya existente).
> `motor.imagen.openai` requiere `OPENAI_API_KEY`.

> **tools_http:** el loader resuelve credencial + fetch automáticamente.
> Solo hay que configurar url, body_template y response_path.
