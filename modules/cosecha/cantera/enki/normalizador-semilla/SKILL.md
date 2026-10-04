---
name: normalizador-semilla
description: >-
  MICRO-AGENTE del vertical NICHOS: normaliza la semilla cruda via LLM
  (ai-gateway) extrayendo campos estructurados (territorio, senal, intencion,
  keywords, vertical_sugerido). Encola candidato tras normalizar. Carga este
  modulo cuando el pipeline de descubrimiento necesite estructurar una semilla
  capturada, o cuando otro modulo necesite reaccionar al pulso
  nichos.semilla.normalizada.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, semilla, normalizacion, llm, bus, mqtt]
---

# nichos . normalizador-semilla

> **Que es.** MICRO-AGENTE que normaliza la semilla cruda via LLM,
> extrayendo campos estructurados del texto libre del dueno. Segundo paso
> del pipeline de descubrimiento del vertical NICHOS.
>
> Codigo: `modules/nichos/normalizador-semilla/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado, usa LLM via ai-gateway).
- Base: `ModuloHibridoReflejo`.
- Sin store (sin persistencia).
- LLM: `llm.complete.request` / `llm.complete.response` (ai-gateway).

## Campos que extrae el LLM

| Campo | Tipo | Semantica |
|---|---|---|
| `territorio` | `String` | zona geografica o segmento de mercado |
| `senal` | `String` | senal de oportunidad detectada (max 80 chars) |
| `intencion` | `String` | que quiere lograr el dueno (max 80 chars) |
| `keywords` | `Array<String>` | 3-5 palabras clave relevantes |
| `vertical_sugerido` | `String` | tipo de negocio sugerido |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.semilla.normalizar.request` | `onNormalizarRequest` | `{status:200, data:{semilla_normalizada:{texto_original, territorio, senal, intencion, keywords, vertical_sugerido, normalizado_en}}}` o error |

### Payload de `.normalizar.request`

```json
{
  "request_id": "uuid",
  "semilla_cruda": {
    "texto": "montar tienda de ropa deportiva eco en Valencia",
    "origen": "telegram",
    "meta": null,
    "capturado_en": "2026-10-04T12:00:00.000Z"
  },
  "project_id": "prj_xxx",
  "correlation_id": "cor_xxx"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.semilla.normalizada` | tras normalizar la semilla via LLM | `{semilla_cruda, semilla_normalizada, campos_extraidos, correlation_id, project_id, timestamp}` |
| `nichos.cola.candidatos.meter.request` | encola candidato tras normalizar | `{request_id, candidato:{semilla, origen, estado}, correlation_id, project_id}` |
| `nichos.semilla.normalizada.failed` | el LLM fallo o timeout | `{correlation_id, project_id, code, message, timestamp}` |

## Invariantes

- **Sin estado**: no persiste nada. Cada request es independiente.
- **semilla_cruda requerida**: sin semilla cruda valida devuelve 400 INVALID_INPUT.
- **Degradacion honesta**: si el LLM no devuelve JSON valido, usa el texto como senal
  y devuelve campos nulos en lugar de fallar.
- **Encadenamiento**: toda normalizacion exitosa encola candidato automaticamente.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `semilla_cruda` o `semilla_cruda.texto` |
| 502 | `LLM_ERROR` | el LLM no respondio o timeout |

## Integracion (patron RPC del bus)

```javascript
// NORMALIZAR semilla
const resp = await bus.publishAndWait('nichos.semilla.normalizar.request', {
  semilla_cruda: { texto: 'tienda eco Valencia', origen: 'telegram' },
  project_id
});
const { semilla_normalizada } = resp.data;
```

## Donde encaja en el vertical NICHOS

- **Segundo paso del pipeline**: recibe de `capturador-semilla` (via
  nichos.semilla.normalizar.request).
- **Encadena a**: `cola-candidatos` (via nichos.cola.candidatos.meter.request).
- **Escuchado por**: `orquestador` (via pulso nichos.semilla.normalizada).
