---
name: capturador-semilla
description: >-
  REFLEJO del vertical NICHOS (entrada): captura la semilla cruda del input
  del dueno (texto libre), la valida, emite el pulso nichos.semilla.capturada
  y encadena al normalizador (nichos.semilla.normalizar.request). Sin estado
  persistido. Carga este modulo cuando el dueno envie una idea de nicho por
  cualquier canal y necesites capturarla como semilla, o cuando otro modulo
  necesite reaccionar al pulso nichos.semilla.capturada.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, semilla, captura, entrada, bus, mqtt]
---

# nichos . capturador-semilla

> **Que es.** REFLEJO puro (sin estado) que captura la semilla cruda del
> input del dueno y la encadena al normalizador. Primer paso del pipeline
> de descubrimiento del vertical NICHOS.
>
> Codigo: `modules/nichos/capturador-semilla/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** (sin estado, determinista).
- Base: `ModuloHibridoReflejo`.
- Sin store (sin persistencia).

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.semilla.capturar.request` | `onCapturarRequest` | `{status:200, data:{semilla_cruda:{texto, origen, meta, capturado_en}}}` o `{status:400, error:{code:'INVALID_INPUT',...}}` si falta texto |

### Payload de `.capturar.request`

```json
{
  "request_id": "uuid",
  "texto": "montar tienda de ropa deportiva eco en Valencia",
  "origen": "telegram",
  "meta": {},
  "project_id": "prj_xxx",
  "correlation_id": "cor_xxx"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.semilla.capturada` | tras capturar una semilla valida | `{texto, origen, timestamp, correlation_id, project_id}` |
| `nichos.semilla.normalizar.request` | encadena al normalizador tras capturar | `{request_id, semilla_cruda, correlation_id, project_id}` |

## Invariantes

- **Sin estado**: no persiste nada. Cada request es independiente.
- **Texto requerido**: sin texto valido (no vacio, string) devuelve 400 INVALID_INPUT.
- **Encadenamiento**: toda captura exitosa dispara el normalizador automaticamente.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `texto` o es vacio |

## Integracion (patron RPC del bus)

```javascript
// CAPTURAR semilla
const resp = await bus.publishAndWait('nichos.semilla.capturar.request', {
  texto: 'tienda de ropa eco en Valencia',
  origen: 'telegram',
  project_id
});
const { semilla_cruda } = resp.data;
```

## Donde encaja en el vertical NICHOS

- **Entrada del pipeline**: primer paso. Recibe texto del dueno y lo convierte
  en semilla cruda.
- **Encadena a**: `normalizador-semilla` (via nichos.semilla.normalizar.request).
- **Escuchado por**: `orquestador` (via pulso nichos.semilla.capturada).
