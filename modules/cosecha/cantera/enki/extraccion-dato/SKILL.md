---
name: extraccion-dato
description: >-
  Skill FULL del módulo MICRO-AGENTE `extraccion-dato` de la vertical contabilidad (Enki). Extrae
  datos de un documento NO estructurado con el ESQUEMA DECLARADO (campo → path/regex) y los PROPONE.
  No asienta: lo que no se extrae se declara abierto y el documento incompleto va a la cola (A8.1).
  Encadena la salida a `control-cuadre-documento` (A4.3). Sin store propio. La op `juzgar` es
  PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites extraer campos de un documento (texto/objeto) con un esquema declarado
    (RPC extraccion-dato.juzgar.request).
  - Cuando depures por qué sale `propuesta:false` (sin esquema o faltan obligatorios) o por qué el
    documento fue a la cola.
  - Cuando quieras entender su contrato de eventos y su encadenado con A4.3 y A8.1.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, reflejo, stateless, contabilidad, entrada, extraccion, ocr]
---

# extraccion-dato — MICRO-AGENTE que extrae y PROPONE datos

## Qué hace el módulo

`extraccion-dato` es un **MICRO-AGENTE** (mitad refleja) (A4.1, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Extrae datos de un **documento no estructurado** (texto u objeto)
aplicando un **ESQUEMA DECLARADO** (campo → `path`/`regex`) y los **PROPONE**.

**No asienta** (`asienta:false`): el asiento es de `escritor-diario` (B2). **Lo que no se extrae se
declara abierto**: sin esquema no se interpreta «a ojo» (eso sería juicio fuzzy) y los campos
obligatorios sin extraer se declaran (`abierto.campos`). El documento **incompleto/ambiguo va a la
cola** (`encolado-excepcion`, A8.1) — no se inventa el valor.

Al proponer, encadena la salida a `control-cuadre-documento.cuadra.request` (A4.3).

**No persiste** (STATELESS). La op `juzgar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `extraccion-dato.juzgar.request` | `onJuzgarRequest` | RPC (PREGUNTA): `{project_id, documento?\|texto?\|contenido?, esquema?\|mapeo?, obligatorios?, clave?}` → `{documento, campos, extraido, faltantes, propuesta, asienta:false, encolar, abierto}`. Delega en `_atender` → `_juzgar`. **Si hay propuesta** publica `control-cuadre-documento.cuadra.request`; **si `encolar:true`** publica `encolado-excepcion.encolar.request`; si `status ≠ 200` publica `.failed`. Responde por `extraccion-dato.juzgar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `extraccion-dato.juzgar.response` | Respuesta RPC correlada de la op `juzgar`. |
| `extraccion-dato.juzgar.failed` | Par de fallo determinista: falta `project_id` o `documento`. |
| `control-cuadre-documento.cuadra.request` | **Si hay propuesta** (esquema declarado y sin faltantes obligatorios): se encadena el control de cuadre (A4.3). |
| `encolado-excepcion.encolar.request` | **Solo si `encolar:true`** (sin esquema o faltan obligatorios): `{rol:'ENCOLADO_EXCEPCION', clave, motivo:'documento incompleto/ambiguo', origen:'extraccion-dato', payload:extraido}`. |

> **NO publica un hecho de dominio**: PROPONE. Su salida es la respuesta, el cuadre (A4.3) o la
> excepción (A8.1), por EVENTO.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **PREGUNTA** | `{project_id, documento?:{id?, ruta?\|path?, tipo?, texto?, contenido?}, texto?, contenido?, esquema?:{campo: path\|{path?, regex?, flags?}}, mapeo?, obligatorios?:[campo], clave?}` | `{project_id, tipo, documento:{id,ruta,tipo}, campos, extraido, faltantes, propuesta, asienta:false, encolar, clave_excepcion, determinista, abierto}` | `400 INVALID_INPUT` (falta `project_id` o `documento`); `500`. |

## Reglas de negocio

1. **Documento obligatorio** (`_documento`): `documento` objeto → o `{texto: input.texto|contenido}`.
   Sin él → `400 INVALID_INPUT documento`.
2. **El esquema es DECLARABLE** (`_esquema`): `esquema`/`mapeo` (objeto `campo → regla`). **No se
   cablea ningún formato.**
3. **Extracción por regla** (`_extraer`): la regla puede ser:
   - un **string** = ruta directa (`_porRuta`, separada por `.`);
   - un objeto con **`path`** (ruta en el documento);
   - un objeto con **`regex`/`patron`** (sobre `documento.texto`/`contenido`, con `flags`); se
     devuelve el grupo 1 si existe, si no la coincidencia completa.
4. **Campo no extraíble** → `null` y entra en `faltantes`.
5. **`propuesta`**: `true` solo si **hay esquema** y **no faltan obligatorios**. Los obligatorios por
   defecto son todos los campos del esquema (o el array `obligatorios` declarado).
6. **Sin esquema** → `abierto.esquema` (interpretar libremente es juicio fuzzy — no se hace).
7. **`encolar`**: `true` si no hay esquema **o** faltan obligatorios → se publica la excepción (A8.1).
8. **`asienta:false`**: el dato queda PROPUESTO, no asentado.
9. **Clave de la excepción** (`_clave`): `clave` → `doc:<id>` → `doc:<ruta>` → `doc:<Date.now()>`.
10. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Extraer con esquema declarado

```json
{
  "project_id": "e57a318a-...",
  "documento": { "id": "4455", "texto": "Total: 1210,00 EUR\nBase: 1000,00\nIVA: 210,00" },
  "esquema": {
    "base": { "regex": "Base:\\s*([\\d.,]+)" },
    "cuota": { "regex": "IVA:\\s*([\\d.,]+)" },
    "total": { "regex": "Total:\\s*([\\d.,]+)" }
  },
  "obligatorios": ["base", "cuota", "total"],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "extraccion-dato",
  "documento": { "id": "4455", "ruta": null, "tipo": null },
  "campos": ["base","cuota","total"],
  "extraido": { "base": "1000,00", "cuota": "210,00", "total": "1210,00" },
  "faltantes": [],
  "propuesta": true,
  "asienta": false,
  "encolar": false,
  "clave_excepcion": "doc:4455",
  "determinista": true,
  "abierto": { "esquema": null, "campos": null }
}
```
Publica `control-cuadre-documento.cuadra.request`.

### Sin esquema — no se interpreta a ojo

```json
{ "project_id": "e57a318a-...", "documento": { "id": "9999", "texto": "factura suelta" } }
```
→ `propuesta:false`, `encolar:true`,
`abierto.esquema = "no se declaro esquema de extraccion (campo → patron): interpretar libremente es juicio (mitad fuzzy)"`.
Publica `encolado-excepcion.encolar.request`.

### Fallo — falta documento

`{ "project_id": "..." }` → `400 INVALID_INPUT documento` + `.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `documento`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |
| (no es error) | 200 | Sin esquema / faltan obligatorios → `propuesta:false` + encola (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `control-cuadre-documento.cuadra.request` (A4.3), `encolado-excepcion.encolar.request` (A8.1).
- **Le alimentan**: `captura-documento` (A3) y `puerto-documento` (A4.2) y `puerto-documento-digital`
  (A5) publican `extraccion-dato.juzgar.request`.

## Verificación

1. Fichero: `modules/contabilidad-entrada/extraccion-dato/`.
2. Eventos reales: subscribes `extraccion-dato.juzgar.request`; publishes `extraccion-dato.juzgar.response`,
   `.failed`, `control-cuadre-documento.cuadra.request`, `encolado-excepcion.encolar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/extraccion-dato/index.js
   # → extraccion-dato.juzgar.failed / control-cuadre-documento.cuadra.request / encolado-excepcion.encolar.request
   ```
4. Test unitario (si existe): extrae por path y por regex; falta obligatorio → `propuesta:false` + encola;
   sin esquema → encola; sin `project_id`/`documento` → 400 + failed.
