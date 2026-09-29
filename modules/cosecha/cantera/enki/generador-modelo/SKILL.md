---
name: generador-modelo
description: >
  Skill FULL del módulo PUENTE `generador-modelo` de la vertical contabilidad de Enki.
  LA SALIDA AL PROGRAMA DEL ASESOR: toma el modelo ya construido (modelo-303 D2,
  modelo-390 D3) y lo EXPORTA en el formato que el programa del asesor consuma — el
  sistema PREPARA el modelo; el ASESOR presenta y firma. El `formato`, el `destino` y el
  `mapeo` son declarables; sin formato no se exporta (FORMATO_NO_DECLARADO) y sin modelo
  no se inventa un fichero. Úsala para operar, depurar o extender el puente, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites exportar un modelo fiscal al formato del programa del asesor (RPC
    generador-modelo.exportar.request).
  - Cuando depures por qué no se exporta (400 FORMATO_NO_DECLARADO si falta el formato,
    exportado:false + motivo si no hay modelo disponible).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (la ley entra como dato, el sistema prepara pero no presenta ni
    firma, nada se estima).
  - Cuando vayas a escribir/ampliar el test unitario del puente generador-modelo.
tags: [enki, modulo, puente, contabilidad, generador-modelo]
---

# generador-modelo — PUENTE STATELESS de la exportación al asesor

## Qué hace el módulo

`generador-modelo` es un **PUENTE STATELESS** (D7, hoja del plan): **LA SALIDA AL PROGRAMA
DEL ASESOR**. Toma el modelo ya construido (`modelo-303` D2, `modelo-390` D3) y lo
**EXPORTA** en el formato que el programa del asesor consuma. Cruza la **frontera hacia
fuera**; **no decide el contenido del modelo ni lo presenta**.

**EL SISTEMA PREPARA EL MODELO; EL ASESOR PRESENTA Y FIRMA.** Este módulo **NO presenta,
NO firma y NO envía** a ninguna administración: solo deja el modelo exportado en el formato
declarado para que el asesor lo meta en su programa. Cada respuesta declara
`presentado:false`, `firmado:false`, `preparado_para_asesor:true`.

**LA LEY ENTRA COMO DATO** (invariante 5): el `destino` y el `formato` son **DECLARABLES**
(`ParametroDeclarable`) — **ABIERTO** en el diseño (formato no declarado aún). **NO hay
ninguna codificación cableada** (ni XML, ni BOE, ni CSV de un programa concreto): sin
`formato` declarado **NO se exporta** (`FORMATO_NO_DECLARADO` + `exportado:false`). El
`mapeo` (campo canónico → clave externa) también entra como **DATO**.

El modelo llega por **DOS vías, ninguna un `require` cruzado**: declarado en la petición
(`modelo`) o pedido **POR EVENTO** a `modelo-303` / `modelo-390` (RPC). Sin modelo **NO se
exporta un fichero vacío ni inventado**.

Campos de exportación canónicos: `modelo, ejercicio, periodo, nif, casillas, datos`
(ausente → `null`, no se estima).

Es un **PUENTE stateless**: sin `PosPersistencia`, sin `onProjectActivated`. Proyección
`_exportar`. Publica `contabilidad.modelo_exportado`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `generador-modelo.exportar.request` | `onExportarRequest` | RPC puente: {project_id, formato, destino?, modelo?, modelo_slug?, ejercicio?, periodo?, regimen?, territorio?, estructura?, mapeo?} → {exportado:true, fichero, modelo_slug, origen_modelo, destino, formato, adaptador_declarado, presentado:false, firmado:false, preparado_para_asesor:true}. Sin `formato` declarado → FORMATO_NO_DECLARADO (no se adivina la codificacion). El modelo se toma declarado en la peticion o pedido POR EVENTO a modelo-303/modelo-390; sin modelo → exportado:false + motivo. Exito → publica contabilidad.modelo_exportado y responde por generador-modelo.exportar.response; fallo → generador-modelo.exportar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `generador-modelo.exportar.response` | Respuesta RPC correlada de generador-modelo.exportar.request → {request_id, status:200, data:{exportado, fichero, modelo_slug, origen_modelo, destino, formato, adaptador_declarado, presentado:false, firmado:false, preparado_para_asesor:true}}. Emitida por el helper _atender. |
| `generador-modelo.exportar.failed` | Par de fallo determinista (D7): formato no declarado (400 FORMATO_NO_DECLARADO) → {status, error:{code, message, details?}}. Cierra el circulo de generador-modelo.exportar.request. |
| `contabilidad.modelo_exportado` | Fire-and-forget (D7): el modelo fiscal quedo exportado hacia el programa del asesor → {project_id, modelo, destino, formato, presentado:false, firmado:false, correlation_id}. Cierra el bucle hacia fuera; el asesor presenta y firma. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `generador-modelo.exportar.failed` cierra el círculo de
> `generador-modelo.exportar.request` cuando `_exportar` devuelve status ≠ 200
> (hoy, solo el `400 FORMATO_NO_DECLARADO`).

> Nota de honestidad (cruce con `index.js`): `onExportarRequest` publica
> `contabilidad.modelo_exportado` **solo si `status === 200 && data.exportado`**; la rama
> `else if (res.status !== 200)` publica `generador-modelo.exportar.failed`. La rama
> **sin modelo** devuelve **`200` con `exportado:false`** → **ni** evento de exportación
> **ni** failed: se declara el motivo (`no hay modelo disponible`) y se responde.

## Reglas de negocio

1. **La ley/codificación entran como DATO**: el `formato` es obligatorio y se normaliza con
   `String(input.formato)`; sin él → `400 FORMATO_NO_DECLARADO` con `{destino}`. **Jamás se
   adivina la codificación del programa del asesor**.
2. **`destino` declarable y opcional**: `String(input.destino)` o `null`; viaja en la
   respuesta y no condiciona la exportación.
3. **El modelo: declarado o pedido POR EVENTO**: `_modelo(pid, input)`:
   - si `input.modelo` es objeto → `{modelo, origen:'declarado_en_peticion'}`;
   - si no, con `modelo_slug` (o por defecto `['modelo-303','modelo-390']`) hace
     `_rpc('<candidato>.construir.request', {project_id, ejercicio, periodo, regimen,
     territorio, estructura, formato:null}, {timeout_ms:5000})` y toma el primer
     `data.modelo` con status `200` → `origen = candidato`;
   - sin resultado → `{modelo:null, origen:null}`.
4. **Sin modelo NO se exporta un fichero vacío ni inventado**: `exportado:false`,
   `fichero:null`, `motivo:'no hay modelo disponible…'`, **status `200`**.
5. **El fichero se COMPONE con el `mapeo` DECLARADO**: `_componer(modelo, mapeo)` toma los
   `CAMPOS_EXPORT` (`modelo, ejercicio, periodo, nif, casillas, datos`) y, si hay mapeo,
   renombra cada campo a su clave externa; **ausente → `null`, no se estima**.
6. **`_mapeoDe`**: si viene `input.mapeo` (objeto) se usa; si no, y el formato es
   `'canonico'` o `'enki'`, construye la **identidad** (campo → su propio nombre); en
   cualquier otro caso → `null` (el fichero sale con nombres canónicos).
7. **`adaptador_declarado`**: `Boolean(input.mapeo)` — refleja si vino mapeo en la petición.
8. **El sistema NO presenta ni firma**: la respuesta siempre lleva `presentado:false`,
   `firmado:false`, `preparado_para_asesor:true`.
9. **`origen_modelo`**: procedencia del modelo (`declarado_en_peticion` o el slug candidato).
10. **Stateless**: no persiste nada, no se suscribe a `project.activated`; `onUnload` solo
    delega a la base.
11. **HTTP exacto**: éxito `200` (exportado o no); formato no declarado → `400`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `generador-modelo.exportar.response` y emite `contabilidad.modelo_exportado`.

### 1. `exportar` — modelo declarado + formato y mapeo declarados

```json
{
  "project_id": "e57a318a-...",
  "formato": "programa_asesor_json",
  "destino": "/salida/303-2T.json",
  "modelo": { "modelo": "303", "ejercicio": "2026", "periodo": "2T", "nif": "B123", "casillas": { "01": 1000 }, "datos": {} },
  "mapeo": { "modelo": "MOD", "ejercicio": "EJ", "periodo": "PER", "nif": "NIF", "casillas": "CAS", "datos": "DTO" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "modelo_slug": "303",
  "origen_modelo": "declarado_en_peticion",
  "destino": "/salida/303-2T.json",
  "formato": "programa_asesor_json",
  "adaptador_declarado": true,
  "exportado": true,
  "fichero": { "MOD": "303", "EJ": "2026", "PER": "2T", "NIF": "B123", "CAS": { "01": 1000 }, "DTO": {} },
  "presentado": false,
  "firmado": false,
  "preparado_para_asesor": true
}
```

Emite `contabilidad.modelo_exportado`:

```json
{ "project_id": "e57a318a-...", "modelo": "303", "destino": "/salida/303-2T.json", "formato": "programa_asesor_json", "presentado": false, "firmado": false, "correlation_id": "abc-123" }
```

### 2. `exportar` — modelo pedido POR EVENTO (sin declarar `modelo`)

```json
{ "project_id": "e57a318a-...", "formato": "canonico", "ejercicio": "2026", "periodo": "2T" }
```

`_modelo` hará `modelo-303.construir.request` (y, si no responde, `modelo-390.construir.request`).
Con modelo → `200 {exportado:true, origen_modelo:'modelo-303'}`; sin él → `200 {exportado:false, fichero:null, motivo}`.

### 3. Fallo — sin formato declarado

```json
{ "project_id": "e57a318a-...", "modelo": { "modelo": "303" } }
```

Respuesta `400` + `generador-modelo.exportar.failed`:

```json
{ "status": 400, "error": { "code": "FORMATO_NO_DECLARADO", "message": "hay que declarar el formato de salida (el del programa del asesor); esta ABIERTO como ParametroDeclarable", "details": { "destino": null } } }
```

## Tests

El test unitario vive en `tests/unit/generador-modelo.test.js`. Cubre:

- `exportar` con modelo + formato + mapeo → `200 {exportado:true}` con `fichero` mapeado y
  `adaptador_declarado:true`; emite `contabilidad.modelo_exportado`.
- Formato `'canonico'`/`'enki'` sin mapeo → identidad por nombre canónico; ausentes `null`.
- Sin `formato` → `400 FORMATO_NO_DECLARADO` + `generador-modelo.exportar.failed`.
- Sin modelo (y sin respuesta de `modelo-303`/`modelo-390`) → `200 {exportado:false, motivo}`
  — **no** emite `contabilidad.modelo_exportado` ni el par de fallo.
- `presentado:false` / `firmado:false` / `preparado_para_asesor:true` siempre presentes.
- `toolExportar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `GeneradorModelo extends ModuloHibridoReflejo`; `name = 'generador-modelo'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/generador-modelo/`).
- Constante `CAMPOS_EXPORT = ['modelo','ejercicio','periodo','nif','casillas','datos']`.
- `onExportarRequest` usa `this._atender(e, 'exportar',
  'generador-modelo.exportar.response', async (d) => {...})`; dentro hace el cierre de
  círculo. Proyección `async _exportar(input)`; helpers `async _modelo(pid, input)`,
  `_componer(modelo, mapeo)`, `_mapeoDe(input, formato)`. Tool `toolExportar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `modelo-303.construir.request` / `modelo-390.construir.request` (D2/D3) POR
  EVENTO. Su salida es el fichero que el asesor mete en su programa: el sistema **prepara**;
  presentar y firmar es del asesor.
