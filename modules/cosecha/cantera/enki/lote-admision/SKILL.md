---
name: lote-admision
description: >-
  Skill FULL del módulo REFLEJO STATELESS `lote-admision` de la vertical
  contabilidad (Enki). DESACOPLE DEL CUELLO: admite N hechos en paralelo, pero la
  ESCRITURA sigue única (escritor-diario B2, single-writer del libro). Reparte el
  lote y sube cada elemento por EVENTO (normalizador-hecho.entrar.request y, si
  trae asiento, escritor-diario.asentar.request). Sin lote declarado NO se admite
  nada. Determinista; no escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites admitir/repartir un lote de hechos en paralelo (RPC
    lote-admision.admitir.request).
  - Cuando depures un lote rechazado (400 INVALID_INPUT sin project_id o lote) o
    por qué la escritura se mantiene única.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    reparto de ramas.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, entrada, lote, admision, paralelismo, single-writer]
---

# lote-admision — REFLEJO STATELESS de la admisión de lotes

## Qué hace el módulo

`lote-admision` es un **REFLEJO STATELESS** (A9, hoja del plan): **desacopla el
cuello de botella** admitiendo **N hechos en paralelo**. La clave del diseño es
que **el paralelismo es de ADMISIÓN** y **la ESCRITURA sigue única**
(`escritor-diario` B2, single-writer del libro).

Esta hoja **NO escribe el libro ni normaliza**: REPARTE el lote y **SUBE cada
elemento por EVENTO** a `normalizador-hecho.entrar.request` y, si el elemento ya
trae su asiento, a `escritor-diario.asentar.request`. **Sin lote declarado NO se
admite nada** (dato ausente = desconocido); `paralelo` es un hecho de la admisión,
no una promesa. Es **DETERMINISTA** y no escribe ni persiste. Su op es **CLASE
PREGUNTA** → va por el bus, sin panel (F6: sin superficie). Publica
`lote-admision.admitir.response` y su par `.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `lote-admision.admitir.request` | `onAdmitirRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, lote:[hechos], destino?}` → `{project_id, admitidos, descartados, paralelo, ramas:[{indice, hecho, destino, con_asiento}], escritura:'unica (escritor-diario)'}`. Reparte el lote y lo sube por evento. Sin lote → `INVALID_INPUT`. Responde por `lote-admision.admitir.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `lote-admision.admitir.response` | Respuesta RPC correlada de la op `admitir` (una sola cara: el bus). |
| `lote-admision.admitir.failed` | Par de fallo determinista: falta `project_id` o el lote declarado es inválido → `{status, code, message}`. Cierra el círculo de `admitir.request`. |

> Además, en la admisión, sube por EVENTO (REQUEST) `normalizador-hecho.entrar.request`
> por cada elemento y `escritor-diario.asentar.request` si el elemento trae asiento
> (`_encolar`). No son `publishes` declarados del manifest: son subidas a otros
> módulos.

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `admitir` | **PREGUNTA** (bus, sin panel) | `{project_id, lote:[hechos], destino?}` (acepta `hechos`/`elementos` como alias) | `{project_id, admitidos, descartados, paralelo, ramas[], escritura:'unica (escritor-diario)'}` | `400 INVALID_INPUT` (`project_id`, `lote`) |

Tool expuesta: `lote-admision.admitir` (`toolAdmitir` → `_admitir`).

## Reglas de negocio

1. **Paralelismo de admisión, escritura única**: admite en paralelo, pero el
   asiento lo sigue apilando solo `escritor-diario` (B2). El campo
   `escritura:'unica (escritor-diario)'` lo declara.
2. **Sin lote no se admite**: `lote` ausente (y sin `hechos`/`elementos`) →
   `400 INVALID_INPUT lote`. Los elementos no-objeto se **descartan** y se
   reportan en `descartados`; no se inventan.
3. **Reparto por ramas**: cada elemento se convierte en una rama
   `{indice, hecho, destino, con_asiento}`; `destino` puede venir declarado.
4. **No escribe ni normaliza**: solo reparte y sube por evento.
5. **Sin project_id** → `400 INVALID_INPUT`.
6. **Determinista**: sin relojes ni aleatoriedad en el reparto.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `admitir` — repartir un lote de hechos

```json
{
  "project_id": "e57a318a-...",
  "lote": [
    { "tipo": "compra", "importe": 120.0, "asiento": { "lineas": [ { "cuenta": "600", "debe": 120 }, { "cuenta": "400", "haber": 120 } ] } },
    { "tipo": "venta", "importe": 300.0 }
  ],
  "destino": "normalizador",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y sube `normalizador-hecho.entrar.request` por cada rama y
`escritor-diario.asentar.request` donde el elemento traiga asiento):
```json
{ "project_id": "e57a318a-...", "admitidos": 2, "descartados": 0, "paralelo": true, "ramas": [ { "indice": 0, "hecho": { "tipo": "compra", ... }, "destino": "normalizador", "con_asiento": true }, { "indice": 1, "hecho": { "tipo": "venta", ... }, "destino": "normalizador", "con_asiento": false } ], "escritura": "unica (escritor-diario)" }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `lote` — falta el campo; sin lote no se admite.
- `500 UNKNOWN_ERROR` — excepción no prevista.
- `descartados > 0` — elementos no-objeto filtrados (no son error: se declaran).

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (sube por evento)**: `normalizador-hecho.entrar.request` (A2) por
  cada elemento; `escritor-diario.asentar.request` (B2) si el elemento ya trae
  asiento. La escritura la centraliza B2.
- **Hacia atrás**: quien llame al RPC con el lote (p. ej. `puerto-evento-vertical`).
- No importa ni escribe a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/lote-admision/` (clase `LoteAdmision
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "admitir.request" module.json` y confirmar
  `normalizador-hecho.entrar.request` / `escritor-diario.asentar.request` en
  `index.js`.
- **Test unitario**: lote de 2 objetos → `admitidos:2`, `paralelo:true`,
  `escritura:'unica (escritor-diario)'`; sin lote → `400 INVALID_INPUT`; elementos
  no-objeto se descartan.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- `onAdmitirRequest` delega en `_atender(e, 'admitir',
  'lote-admision.admitir.response', ...)`; si status ≠ 200 publica el par
  `.failed`, si no `_encolar(res, d)` (sube cada rama por evento).
- Helpers: `_admitir`, `_encolar`, `toolAdmitir`.
