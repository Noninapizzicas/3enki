---
name: generador-modelo
description: >-
  Skill FULL del módulo PUENTE `generador-modelo` de la vertical contabilidad (Enki). PREPARA el
  modelo fiscal EXPORTABLE (formato abierto: json/csv/xml/txt) para el asesor y AVANZA el estado de
  presentación. Las casillas/partidas son DECLARADAS: ausentes → `null` (no se rellenan a ojo). No
  presenta nada: prepara. Al exportar publica el hecho `contabilidad.modelo_exportado` y sube por
  EVENTO a `estado-presentacion-fiscal` (D12). Sin store propio (PUENTE). La op `exportar` es ORDEN
  → system_panel.
when-to-use: >-
  - Cuando necesites preparar el artefacto exportable de un modelo (303/390…)
    (RPC generador-modelo.exportar.request).
  - Cuando depures por qué se rechaza (falta modelo) o por qué la exportación sale vacía
    (`casillas:[]` → `abierto.casillas`) o con huecos (`abierto.huecos`).
  - Cuando quieras entender su contrato de eventos y que NO presenta (prepara para el asesor).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, fiscal, modelos, exportacion, asesor]
---

# generador-modelo — PUENTE que prepara el modelo exportable

## Qué hace el módulo

`generador-modelo` es un **PUENTE** (D7, hoja del plan) de la vertical **contabilidad**, eje
**fiscal**. **PREPARA el modelo fiscal exportable** en un **formato abierto** (`json`, `csv`,
`xml`, `txt`) para que el asesor lo consuma, y **AVANZA el estado de presentación** subiendo por
EVENTO a `estado-presentacion-fiscal` (D12).

**No presenta nada: prepara.** Las **casillas/partidas** son **DECLARADAS** y su valor se **copia**
(nunca se calcula): ausente → `null` (no se rellenan a ojo).

El puente **no guarda estado** (`persistido:false`). Al exportar, **anuncia el hecho**
`contabilidad.modelo_exportado` y sube a D12. La op `exportar` es **ORDEN** → `ui_handler` `system_panel`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `generador-modelo.exportar.request` | `onExportarRequest` | RPC puente (ORDEN): `{project_id, modelo\|tipo_modelo, formato?, ejercicio?, periodo?, casillas?\|partidas?\|datos?}` → `{modelo, formato, casillas, contenido:{mime,datos}, persistido:false, presentacion, sube, abierto}`. Delega en `_atender` → `_exportar`. Al exportar publica el hecho `contabilidad.modelo_exportado` y sube a D12; si `status ≠ 200` publica `.failed`. Responde por `generador-modelo.exportar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.modelo_exportado` | Fire-and-forget (D7): el modelo quedó exportado → `{project_id, modelo, ejercicio, periodo, formato, casillas:<n>, abierto, correlation_id}`. |
| `estado-presentacion-fiscal.avanzar.request` | Sube a D12: el modelo exportado queda preparado (`{modelo, ejercicio, periodo, preparado:true}`). |
| `generador-modelo.exportar.response` / `.exportar.failed` | Respuesta + par de fallo de `exportar`. |

> **SÍ publica un HECHO** (`contabilidad.modelo_exportado`): preparar y dejar el artefacto listo es
> una escritura del puente → R2 obliga a anunciarlo. **No presenta** (eso es del circuito fiscal).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `exportar` | **ORDEN** (ui_handler: system_panel) | `{project_id, modelo?\|tipo_modelo?, formato?, ejercicio?, periodo?, casillas?:[{casilla?\|clave?, concepto?, valor?}]}` | `{project_id, tipo, modelo, ejercicio, periodo, formato, casillas, num_casillas, contenido:{mime,datos}, persistido:false, presentacion, sube, abierto}` | `400 INVALID_INPUT` (falta `project_id` o `modelo`); `500`. |

## Reglas de negocio

1. **Modelo obligatorio**: `modelo` (o `tipo_modelo`) ausente → `400 INVALID_INPUT modelo`.
   Sin modelo no se sabe qué exportar.
2. **Formato abierto**: `FORMATOS = ['json','csv','xml','txt']`; por defecto `json`. Otro valor → `json`.
3. **Las casillas se COPIAN, no se calculan** (`_casillas`): cada una → `{orden, casilla: casilla??clave,
   concepto, valor}`. **`valor` ausente → `null`** (no se estima).
4. **Serialización abierta** (`_serializar`): devuelve `{mime, datos}` — `csv` (`text/csv`), `xml`
   (`application/xml`, escapando `<>&`), `txt` (`text/plain`), `json` (objeto, `application/json`).
5. **Sin casillas no se inventan cifras fiscales**: `casillas:[]` → `abierto.casillas` lo declara.
6. **Huecos declarados**: si alguna casilla tiene `valor === null` → `abierto.huecos` (se exporta en
   `null`, no rellena a ojo).
7. **No persiste**: `persistido:false`; declara `presentacion:'estado-presentacion-fiscal (D12)'`.
8. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Exportar un 303 a CSV

```json
{
  "project_id": "e57a318a-...",
  "modelo": "303",
  "ejercicio": "2026",
  "periodo": "T1",
  "formato": "csv",
  "casillas": [
    { "casilla": "01", "concepto": "Base al 21%", "valor": 10000 },
    { "casilla": "03", "concepto": "Cuota al 21%", "valor": 2100 },
    { "casilla": "28", "concepto": "Resultado", "valor": null }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "generador-modelo",
  "modelo": "303",
  "ejercicio": "2026",
  "periodo": "T1",
  "formato": "csv",
  "casillas": [ { "orden": 1, "casilla": "01", "concepto": "Base al 21%", "valor": 10000 }, {…}, { "orden": 3, "casilla": "28", "concepto": "Resultado", "valor": null } ],
  "num_casillas": 3,
  "contenido": { "mime": "text/csv", "datos": "casilla,concepto,valor\n01,Base al 21%,10000\n03,Cuota al 21%,2100\n28,Resultado," },
  "persistido": false,
  "presentacion": "estado-presentacion-fiscal (D12)",
  "sube": ["estado-presentacion-fiscal.avanzar.request"],
  "abierto": { "casillas": null, "huecos": "hay casillas sin valor declarado: se exportan en null (no se rellenan a ojo)" }
}
```
Emite `contabilidad.modelo_exportado` y sube a D12 (`preparado:true`).

### Sin modelo — se rechaza

`{ "project_id": "..." }` → `400 INVALID_INPUT modelo` + `generador-modelo.exportar.failed`.

### Sin casillas — exporta vacío declarado

→ `casillas:[]`, `abierto.casillas = "el modelo no declara casillas/partidas: se exporta vacio (no se inventan cifras fiscales)"`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `modelo`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `estado-presentacion-fiscal.avanzar.request` (D12, preparado).
- **Publica el hecho** `contabilidad.modelo_exportado`.
- **Cierra el ciclo con**: `acuse-presentacion` (D13) que liga el justificante del modelo exportado.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/generador-modelo/`.
2. Eventos reales: subscribes `generador-modelo.exportar.request`; publishes `contabilidad.modelo_exportado`,
   `estado-presentacion-fiscal.avanzar.request`, `generador-modelo.exportar.response`, `.exportar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-fiscal/generador-modelo/index.js
   # → contabilidad.modelo_exportado / estado-presentacion-fiscal.avanzar.request / generador-modelo.exportar.failed
   ```
4. Test unitario (si existe): exporta csv/xml/txt/json; casilla sin valor → `null` + `abierto.huecos`;
   sin modelo → 400; sin casillas → `abierto.casillas`.
