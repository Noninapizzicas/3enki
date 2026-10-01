---
name: historial-proceso-contable
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `historial-proceso-contable` de la vertical
  contabilidad (Enki). Registro APPEND-ONLY e inmutable de lo PROCESADO y lo FALLADO de la
  entrada, con su rastro (asunto/origen/motivo/fases/en_cola). Es el historial del PROCESO de
  entrada, no del asiento (eso es traza-asiento B4). El resultado (PROCESADO|FALLADO) es
  obligatorio: sin él no se anota. NADA se borra ni se sobrescribe. Publica el hecho
  contabilidad.proceso_anotado. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites anotar (append-only) un paso del proceso de entrada con su resultado
    (RPC historial-proceso-contable.anotar.request).
  - Cuando depures por qué una anotación se rechaza (400 INVALID_INPUT por falta de
    `registro` o `resultado` no declarado).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.proceso_anotado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, historial, append-only, proceso]
---

# historial-proceso-contable — CUSTODIO del historial del proceso de entrada

## Qué hace el módulo

`historial-proceso-contable` es un **CUSTODIO CON PERSISTENCIA** (P2, hoja del plan).
Registro **APPEND-ONLY e inmutable** de lo **PROCESADO** y lo **FALLADO** de la entrada, con
su rastro (quién/cuándo/de dónde vino/si cayó a cola). Es el historial del **PROCESO DE
ENTRADA** — no del asiento: `traza-asiento` (B4) registra el ASIENTO; este registra el proceso.

Invariantes:
- **APPEND-ONLY**: cada registro se APILA con su secuencia; NADA se borra, NADA se sobrescribe.
- **El RESULTADO es obligatorio** (`PROCESADO`|`FALLADO`); sin resultado NO se anota (dato
  ausente = desconocido: no se aprime un resultado que no consta).
- **El ABIERTO se declara, no se oculta**: un registro sin `motivo` se apila con su hueco
  (`abierto.motivo`).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/historial-proceso-contable`,
archivo `historial-proceso-contable.json`), restaura en `project.activated` y vuelca en
`onUnload`. Emite `contabilidad.proceso_anotado` en éxito y su par `*.anotar.failed` en rechazo.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `historial-proceso-contable.anotar.request` | `onAnotarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, registro{resultado:'PROCESADO'\|'FALLADO', asunto?, origen?, motivo?, fases?, en_cola?, destino_cola?, hecho_id?, documento_id?}}` → `{project_id, registro, anotado, total, append_only}`. Apila el registro (append-only; sin resultado → `INVALID_INPUT`). Publica `contabilidad.proceso_anotado` y responde por `.anotar.response`. Payload inválido → `.anotar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el historial del proceso del proyecto activado desde el storage. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.hecho_recibido`,
> `contabilidad.excepcion_encolada`, `contabilidad.excepcion_desatascada` y
> `contabilidad.asiento_asentado`, pero el `module.json` real **solo** declara el
> `.anotar.request` + `project.activated`. El proceso se anota *por petición*, no escuchando
> el bus. (Declarar escuchas de hechos aún no emitidos daría cadena colgada.)

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.proceso_anotado` | Fire-and-forget (P2): quedó anotado un paso del proceso con su resultado → `{project_id, registro, resultado, anotado:true}`. Lo consume `panel-proceso-contable` (P1) para mostrar el proceso. |
| `historial-proceso-contable.anotar.response` | Respuesta RPC correlada de la op `anotar`. |
| `historial-proceso-contable.anotar.failed` | Fallo determinista: falta `project_id`, `registro` inválido o resultado no declarado. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `anotar` | **ORDEN** (panel) | `{project_id, registro\|r}` | `{project_id, registro, anotado:true, total, append_only:true, abierto}` | 400 `INVALID_INPUT` (`project_id`/`registro`/`registro.resultado`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin `registro`/`r` objeto →
   `_invalid('registro')` (400).
2. **Resultado obligatorio**: `_resultado` acepta `r.resultado` o `r.estado`, normaliza a
   mayúsculas y exige que esté en `RESULTADOS = {'PROCESADO','FALLADO'}`. Si no →
   `_invalid('registro.resultado')`.
3. **Append-only**: el registro se `push` con `id = '${pid}-p${n+1}'` y `secuencia`. NUNCA se
   sobrescribe.
4. **Rastro copiado**: `asunto, origen, motivo, fases[], en_cola(bool), destino_cola, detalle,
   hecho_id, documento_id, en`. Lo ausente queda `null`/`[]`/`false` (no se inventa).
5. **`abierto.motivo`** declarado si no vino `motivo`.
6. **`total`** = registros acumulados; **`append_only:true`** siempre.
7. **Lectura directa** `historialDe(pid)` (mismo proceso, no muta) devuelve copia del array.

## Cómo se usa (RPC)

### Anotar un paso procesado

```json
{
  "project_id": "e57a318a-...",
  "registro": { "resultado": "PROCESADO", "asunto": "factura proveedor FAC-42", "origen": "puerto-evento-vertical", "fases": ["normalizar","deduplicar","asentar"], "en_cola": false, "hecho_id": "h-42" },
  "correlation_id": "abc-3"
}
```
Respuesta `200` + `contabilidad.proceso_anotado`:
```json
{ "project_id": "e57a318a-...", "registro": { "id": "e57a318a-...-p1", "secuencia": 1, "resultado": "PROCESADO", "asunto": "factura proveedor FAC-42", "origen": "puerto-evento-vertical", "motivo": null, "fases": ["normalizar","deduplicar","asentar"], "en_cola": false, "destino_cola": null, "detalle": null, "hecho_id": "h-42", "documento_id": null, "en": "2026-10-01T..." }, "anotado": true, "total": 1, "append_only": true, "abierto": { "motivo": "el registro no declaró un motivo (se anota el hueco, no se inventa)" } }
```

### Anotar un fallo

```json
{ "project_id": "e57a318a-...", "registro": { "resultado": "FALLADO", "motivo": "cuadre no cierra", "en_cola": true, "destino_cola": "encolado-excepcion" } }
```

### Fallo — sin resultado

```json
{ "project_id": "e57a318a-...", "registro": { "asunto": "x" } }
```
Respuesta `400` + `historial-proceso-contable.anotar.failed` (`INVALID_INPUT`, field
`registro.resultado`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`registro`) | no viene registro objeto (`registro`/`r`). |
| `400 INVALID_INPUT` (`registro.resultado`) | falta el resultado o no es `PROCESADO`/`FALLADO`. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager` + `metricas`.
- **De quién depende:** ninguna escucha real declarada (ver nota R3).
- **Quién la consume:** `panel-proceso-contable` (P1) lee `contabilidad.proceso_anotado` para
  mostrar el proceso. Distinta de `traza-asiento` (B4, que traza el asiento).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/historial-proceso-contable/module.json` + `index.js`.
2. Smoke: `anotar` con `resultado:'PROCESADO'` → 200 + `contabilidad.proceso_anotado`.
3. Sin resultado → `400 INVALID_INPUT registro.resultado` + `.anotar.failed`.
4. Append-only: dos anotaciones → `total:2`, secuencias 1 y 2, sin sobrescribir.
5. `project.activated` restaura vía PosPersistencia.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `HistorialProcesoContable extends ModuloHibridoReflejo`; `name =
  'historial-proceso-contable'`, `version = 'reflejo-0.1.0'`. Store `this._historiales` (Map
  `pid → {esquema, registros[]}`).
- **PosPersistencia**: `file:'historial-proceso-contable.json'`,
  `dir:'/contabilidad/historial-proceso-contable'`.
- Proyección `_anotar`; helper `_resultado`; lectura directa `historialDe(pid)`; tool
  `toolAnotar`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
