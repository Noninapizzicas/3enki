---
name: acuse-presentacion
description: >-
  Skill FULL del módulo PUENTE `acuse-presentacion` de la vertical contabilidad (Enki). LIGA el
  acuse/justificante de la administración a su modelo y a su asiento, y CIERRA el bucle hacia
  fuera. Sin acuse no hay nada que ligar (no se finge). Al ligar publica el hecho
  `contabilidad.declaracion_justificada` y SUBE por EVENTO a `estado-presentacion-fiscal`
  (D12, avanzar), `escritor-diario` (B2, asiento si lo hay) y `expediente-documental` (archivar).
  Sin store propio (PUENTE). La op `ligar` es ORDEN → system_panel.
when-to-use: >-
  - Cuando necesites ligar un acuse/justificante de la AEAT a su modelo (RPC acuse-presentacion.ligar.request).
  - Cuando depures por qué se rechaza (falta acuse) o por qué se liga «a medias» (sin modelo → `abierto.modelo`).
  - Cuando quieras entender su contrato de eventos y los tres destinos a los que sube.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, fiscal, acuse, presentacion, justificante]
---

# acuse-presentacion — PUENTE que liga el acuse al modelo

## Qué hace el módulo

`acuse-presentacion` es un **PUENTE** (D13, hoja del plan) de la vertical **contabilidad**, eje
**fiscal**. **Liga** el **acuse/justificante** de la administración a su **modelo** y a su
**asiento** (si toca), y **cierra el bucle hacia fuera**.

El puente **no guarda estado** (`persistido:false`): su cara es el bus. Al ligar, **anuncia el
hecho** `contabilidad.declaracion_justificada` y **sube por EVENTO** a los tres que sí actúan:

1. `estado-presentacion-fiscal.avanzar.request` (D12) — la declaración justificada vuelve al ciclo;
2. `escritor-diario.asentar.request` (B2) — solo si el acuse trae asiento;
3. `expediente-documental.archivar.request` — solo si hay acuse.

**Honestidad (invariante 13):** sin **acuse** no hay nada que ligar → `400 INVALID_INPUT acuse`.
Si el acuse no declara **modelo**, se liga «a medias» y se declara en `abierto.modelo`
(no se inventa el modelo).

La op `ligar` es **ORDEN** → `ui_handler` `system_panel`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `acuse-presentacion.ligar.request` | `onLigarRequest` | RPC puente (ORDEN): `{project_id, acuse\|justificante\|documento, modelo?\|obligacion?, asiento?}` → `{modelo, acuse, asiento, ligado, liga, persistido:false, sube, abierto}`. Delega en `_atender` → `_ligar`. Al ligar publica el hecho y sube a D12/B2/expediente; si `status ≠ 200` publica `.failed`. Responde por `acuse-presentacion.ligar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.declaracion_justificada` | Fire-and-forget (D13): al ligar (status 200) → `{project_id, modelo, acuse, ligado, abierto, correlation_id}`. |
| `estado-presentacion-fiscal.avanzar.request` | Sube a D12: la declaración queda justificada (`{modelo, justificada, acuse}`). |
| `escritor-diario.asentar.request` | **Solo si el input trae asiento**: sube el asiento al libro (B2). |
| `expediente-documental.archivar.request` | **Solo si hay acuse**: archiva el justificante en el expediente. |
| `acuse-presentacion.ligar.response` / `.ligar.failed` | Respuesta + par de fallo de `ligar`. |

> **SÍ publica un HECHO** (`contabilidad.declaracion_justificada`): ligar ES cerrar el bucle →
> R2 obliga a anunciarlo. No persiste estado propio por ser PUENTE.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `ligar` | **ORDEN** (ui_handler: system_panel) | `{project_id, acuse?\|\|justificante?\|\|documento?, modelo?\|obligacion?, asiento?}` | `{project_id, tipo, modelo, acuse:{ref,fecha,csv,tipo}, asiento, ligado, liga:{modelo,asiento}, persistido:false, sube, abierto}` | `400 INVALID_INPUT` (falta `project_id` o falta `acuse`); `500`. |

## Reglas de negocio

1. **Sin acuse no se liga**: el acuse (`acuse`/`justificante`/`documento`) ausente, `null`, o un
   objeto vacío → `400 INVALID_INPUT acuse`. **No se finge el justificante.**
2. **Normalización del acuse** (`acuseNorm`): si es objeto → `{ref: ref??id, fecha, csv, tipo}`;
   si es escala → `{ref: String(acuse), fecha:null, csv:null, tipo:null}`. Lo ausente queda `null`.
3. **Modelo**: `modelo` → `obligacion`; `ligado = Boolean(modelo)`. Sin modelo se liga a medias y se
   declara en `abierto.modelo`.
4. **Asiento opcional**: solo se sube a B2 si llega un `asiento` objeto. Sin él, `abierto.asiento`.
5. **Sin estado propio**: `persistido:false`; el puente declara `sube` (la lista de destinos).
6. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Ligar un acuse con modelo y asiento

```json
{
  "project_id": "e57a318a-...",
  "modelo": "303-2026-T1",
  "acuse": { "ref": "303T1-2026", "fecha": "2026-04-20", "csv": "ABCD1234", "tipo": "presentacion" },
  "asiento": { "fecha": "2026-04-20", "lineas": [ … ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "acuse-presentacion",
  "modelo": "303-2026-T1",
  "acuse": { "ref": "303T1-2026", "fecha": "2026-04-20", "csv": "ABCD1234", "tipo": "presentacion" },
  "asiento": { "fecha": "2026-04-20", "lineas": [ … ] },
  "ligado": true,
  "liga": { "modelo": true, "asiento": true },
  "persistido": false,
  "sube": ["estado-presentacion-fiscal.avanzar.request", "escritor-diario.asentar.request", "expediente-documental.archivar.request"],
  "abierto": { "modelo": null, "asiento": null }
}
```
Emite `contabilidad.declaracion_justificada` + sube a D12, B2 (asiento) y expediente (acuse).

### Acuse sin modelo — se liga a medias

→ `ligado:false`, `liga.modelo:false`,
`abierto.modelo = "el acuse no declara el modelo al que pertenece: se liga a medias (no se inventa el modelo)"`.

### Sin acuse — se rechaza

`{ "project_id": "..." }` → `400 INVALID_INPUT acuse` + `acuse-presentacion.ligar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `acuse`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `estado-presentacion-fiscal.avanzar.request` (D12), `escritor-diario.asentar.request` (B2),
  `expediente-documental.archivar.request`.
- **Publica el hecho** `contabilidad.declaracion_justificada`.
- **Cierra el ciclo de**: el modelo preparado por `generador-modelo` (D7) que avanza D12.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/acuse-presentacion/`.
2. Eventos reales: subscribes `acuse-presentacion.ligar.request`; publishes
   `contabilidad.declaracion_justificada`, `estado-presentacion-fiscal.avanzar.request`,
   `escritor-diario.asentar.request`, `expediente-documental.archivar.request`,
   `acuse-presentacion.ligar.response`, `.ligar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-fiscal/acuse-presentacion/index.js
   # → contabilidad.declaracion_justificada / estado-presentacion-fiscal.avanzar.request / escritor-diario.asentar.request
   # → expediente-documental.archivar.request / acuse-presentacion.ligar.failed
   ```
4. Test unitario (si existe): con modelo+asiento → hecho + 3 subidas; sin modelo → liga a medias;
   sin acuse → 400; sin `project_id` → 400.
