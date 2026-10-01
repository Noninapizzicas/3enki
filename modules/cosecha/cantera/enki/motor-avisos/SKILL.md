---
name: motor-avisos
description: >-
  Skill FULL del módulo PUENTE (stateless) `motor-avisos` de la vertical
  contabilidad (Enki). LA PIEZA QUE CIERRA EL CÍRCULO DE LOS AVISOS: PRODUCE el
  aviso y lo ENTREGA subiendo aviso-al-negocio.entregar.request al puente R1 (que lo
  hace llegar al negocio). AQUÍ solo se PRODUCE (no se pisan). Recibe las señales de
  revisión, cuadre, plazo, presupuesto y hecho; publica contabilidad.aviso_producido.
  Sin señal no se inventa un aviso. No persiste.
when-to-use: >-
  - Cuando necesites producir un aviso (RPC motor-avisos.producir.request) o
    entender de dónde salen los avisos del negocio.
  - Cuando depures por qué no se produce un aviso (sin señal → no se inventa) o un
    400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    señales que escucha.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, analitica, avisos, produccion, motor]
---

# motor-avisos — PUENTE stateless que PRODUCE los avisos

## Qué hace el módulo

`motor-avisos` es un **PUENTE (stateless)** (K2, hoja del plan): **LA PIEZA QUE
CIERRA EL CÍRCULO DE LOS AVISOS**. **PRODUCE** el aviso (requisito 4 del dueño) y lo
**ENTREGA** subiendo `aviso-al-negocio.entregar.request` al puente **R1** (que es
quien lo hace llegar al negocio). **La ENTREGA es de R1; aquí solo se PRODUCE** (no
se pisan).

Recibe las señales **por EVENTO** de dominio: `contabilidad.revision_solicitada`
(`aviso-revision` A8.2), `contabilidad.cuadre_no_cuadra` (`aviso-cuadre` C6),
`contabilidad.plazo_declarado` (`calendario-fiscal` D6),
`contabilidad.presupuesto_fijado` (`presupuesto` J3) y `contabilidad.hecho_recibido`
(`puerto-evento-vertical` A1). Publica el HECHO `contabilidad.aviso_producido` (lo
escuchan `aviso-al-negocio` R1 e `informe-accionable` R2) y **SUBE**
`aviso-al-negocio.entregar.request`. **PUENTE STATELESS**: sin PosPersistencia.

**Invariante**: sin señal declarada **NO se inventa un aviso** (dato ausente =
desconocido). Su op es **CLASE ORDEN** (panel) → **SÍ lleva `ui_handler`**
(`system_panel`, `lateral_derecha`).

> **Nota R3**: el plan declara también escucha de
> `contabilidad.fuente_faltante_declarada` (`declaracion-fuente-faltante`), pero
> **ningún módulo del repo lo emite aún**: **NO se declara** (cadena colgada).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `motor-avisos.producir.request` | `onProducirRequest` | RPC puente (ORDEN, panel): `{project_id, tipo?, titulo?, detalle?, severidad?, senal?/hecho?, origen?}` → `{project_id, aviso, producido, entregador, senal_presente, abierto}`. PRODUCE el aviso (no lo entrega) y SUBE `aviso-al-negocio.entregar.request`. Publica `contabilidad.aviso_producido`. Responde por `motor-avisos.producir.response`; falta `project_id` → `motor-avisos.producir.failed`. |
| `contabilidad.revision_solicitada` | `onRevisionSolicitada` | Señal (fire-and-forget) de `aviso-revision` A8.2: una excepción pide revisión → produce un aviso de tipo revisión y lo entrega a R1. |
| `contabilidad.cuadre_no_cuadra` | `onCuadreNoCuadra` | Señal (fire-and-forget) de `aviso-cuadre` C6: falta cobertura y el cuadre NO cuadra → produce un aviso de tipo cuadre. |
| `contabilidad.plazo_declarado` | `onPlazoDeclarado` | Señal (fire-and-forget) de `calendario-fiscal` D6: un plazo declarable fue declarado → produce el aviso proactivo de tipo plazo. |
| `contabilidad.presupuesto_fijado` | `onPresupuestoFijado` | Señal (fire-and-forget) de `presupuesto` J3: un objetivo quedó fijado → produce un aviso informativo de tipo presupuesto. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Señal (fire-and-forget) de `puerto-evento-vertical` A1: un hecho de la operación entró. SOLO produce aviso si el hecho lo DECLARA (`hecho.aviso`); no se inventa un aviso por cada hecho. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.aviso_producido` | Fire-and-forget (K2): se PRODUJO un aviso → `{project_id, aviso_id, tipo, severidad, titulo, detalle, origen}`. Lo escuchan `aviso-al-negocio` (R1, entrega) e `informe-accionable` (R2, qué hacer). |
| `aviso-al-negocio.entregar.request` | Subida (REQUEST por EVENTO) al puente R1: entrega este aviso al negocio. MotorAvisos PRODUCE; aviso-al-negocio ENTREGA. |
| `motor-avisos.producir.response` | Respuesta RPC correlada de la op `producir` (una sola cara: el bus). |
| `motor-avisos.producir.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `producir.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `producir` | **ORDEN** (panel) | `{project_id, tipo?, titulo?, detalle?, severidad?, senal?/hecho?, origen?}` | `{project_id, aviso, producido, entregador, senal_presente, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `motor-avisos.producir` (`toolProducir` → `_producir`).

## Reglas de negocio

1. **PRODUCE, no ENTREGA**: publica `contabilidad.aviso_producido` y sube
   `aviso-al-negocio.entregar.request` (R1). La entrega es de R1.
2. **Tipos cerrados (const `TIPOS`)**: `['revision', 'cuadre', 'plazo', 'fuente',
   'presupuesto', 'hecho', 'aviso', 'otro']`.
3. **Sin señal no se inventa un aviso** (invariante; dato ausente = desconocido). En
   `onHechoRecibido`, solo si el hecho declara `hecho.aviso`.
4. **`senal_presente`**: declara si la producción vino de una señal real.
5. **Puente stateless**: sin `PosPersistencia`, no persiste.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `producir` — producir un aviso y entregarlo a R1

```json
{
  "project_id": "e57a318a-...",
  "tipo": "cuadre",
  "titulo": "El cuadre no cuadra",
  "detalle": "Falta cobertura del periodo 2026-09",
  "severidad": "alta",
  "origen": "aviso-cuadre",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.aviso_producido` + sube
`aviso-al-negocio.entregar.request`):
```json
{ "project_id": "e57a318a-...", "aviso": { "aviso_id": "AV-1", "tipo": "cuadre", "severidad": "alta", "titulo": "El cuadre no cuadra" }, "producido": true, "entregador": "aviso-al-negocio", "senal_presente": true, "abierto": { "senal": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {senal_presente:false, abierto}` — sin señal real no se inventa el aviso.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.revision_solicitada` (A8.2),
  `contabilidad.cuadre_no_cuadra` (C6), `contabilidad.plazo_declarado` (D6),
  `contabilidad.presupuesto_fijado` (J3), `contabilidad.hecho_recibido` (A1).
- **Hacia delante (publica el hecho)**: `contabilidad.aviso_producido` lo escuchan
  `aviso-al-negocio` (R1) e `informe-accionable` (R2). Sube
  `aviso-al-negocio.entregar.request` (R1).
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/motor-avisos/` (clase `MotorAvisos
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "aviso_producido" module.json index.js` y confirmar las cinco
  escuchas (`revision_solicitada`, `cuadre_no_cuadra`, `plazo_declarado`,
  `presupuesto_fijado`, `hecho_recibido`) en `module.json`.
- **Test unitario**: `producir` → `producido:true` + hecho + subida a R1;
  `onHechoRecibido` sin `hecho.aviso` no produce; sin `project_id` → `400`.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- Helpers: `_producirDeSenal`, `_producir`, `_tipo`, `_senal`, `toolProducir`.
- `_producirDeSenal` mapea cada señal a un tipo de aviso.
