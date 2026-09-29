---
name: factura-electronica
description: >
  Skill FULL del módulo CONVERSOR `factura-electronica` de la vertical contabilidad de
  Enki. LA FRONTERA ÚNICA DE FORMATO de la factura: convierte entre la representación
  EXTERNA (Facturae, UBL, JSON de un programa) y la `FacturaEmitida` canónica — cruza
  FORMATO, no decide CONTENIDO: no calcula importes, no compone desglose, no firma y no
  presenta. El `formato`, el `mapeo` y los `esquemas_declarables` son declarables; sin
  formato no convierte y lo ausente queda null + `abierto`. Úsala para operar, depurar o
  extender el conversor, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites traducir un formato externo estructurado a la factura canónica
    (RPC factura-electronica.entrar.request) o la factura canónica a un formato externo
    (RPC factura-electronica.salir.request).
  - Cuando depures por qué la conversión falla (400 FORMATO_NO_DECLARADO, 422
    FORMATO_NO_DECLARABLE, 400 INVALID_INPUT si falta el externo/factura).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la frontera de formato (formato como DATO, sin esquema cableado, nada se
    estima, no firma ni presenta).
  - Cuando vayas a escribir/ampliar el test unitario del conversor factura-electronica.
tags: [enki, modulo, conversor, contabilidad, factura-electronica]
---

# factura-electronica — CONVERSOR STATELESS de la frontera de formato

## Qué hace el módulo

`factura-electronica` es un **CONVERSOR STATELESS** (D9, hoja del plan): **LA FRONTERA
ÚNICA DE FORMATO** de la factura. Convierte entre la representación **EXTERNA** (formato
estructurado que pida el sitio: Facturae, UBL, JSON de un programa externo…) y la
`FacturaEmitida` **canónica** del dominio. **Cruza FORMATO, no decide CONTENIDO**: no
calcula importes, no compone el desglose (eso es `emision-factura-venta` O1), **no firma y
no presenta**.

**LA LEY ENTRA COMO DATO** (invariante 5): el `formato` y el `mapeo` (campo canónico →
clave externa) son **DECLARABLES** y entran como **DATO**. **NO hay ningún esquema Facturae
cableado** — ni versiones, ni etiquetas XML, ni namespaces, ni códigos de impuesto. Sin
`formato` declarado **NO se convierte** (`400 FORMATO_NO_DECLARADO`); si el formato no tiene
`mapeo` declarado y no es el canónico, se rechaza (`422 FORMATO_NO_DECLARABLE`). Los
`esquemas_declarables` los declara el sitio.

Campos canónicos de la `FacturaEmitida`: `serie, numero, fecha, emisor, receptor, base,
impuestos, total, moneda` (ausente → `null` + `abierto`, **jamás se estima**). Los campos
extra del exterior **se conservan** bajo `metadatos` (no se pierde nada).

Dos direcciones: **entrar** (externo → factura) y **salir** (factura → externo). Es un
**CONVERSOR stateless**: sin `PosPersistencia`, sin `onProjectActivated`. Proyecciones
`_entrar` y `_salir`. **Sin evento de dominio propio** (solo responde).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `factura-electronica.entrar.request` | `onEntrarRequest` | RPC conversor: {project_id, formato, externo, mapeo?, esquemas_declarables?} → {formato, direccion:'entrar', factura, adaptador_declarado, contenido_compuesto:false, abierto:[faltantes]}. Traduce el formato externo a la FacturaEmitida canonica con el `mapeo` declarado. Sin formato → FORMATO_NO_DECLARADO; formato sin mapeo ni esquema declarado → 422 FORMATO_NO_DECLARABLE. Dato ausente → null + abierto (no se estima). Responde por factura-electronica.entrar.response; fallo → factura-electronica.entrar.failed. |
| `factura-electronica.salir.request` | `onSalirRequest` | RPC conversor: {project_id, formato, factura, mapeo?, esquemas_declarables?} → {formato, direccion:'salir', externo, adaptador_declarado, firmado:false, presentado:false}. Traduce la FacturaEmitida canonica al formato externo con el `mapeo` declarado. Sin formato → FORMATO_NO_DECLARADO; formato sin mapeo ni esquema declarado → 422 FORMATO_NO_DECLARABLE. No firma ni presenta. Responde por factura-electronica.salir.response; fallo → factura-electronica.salir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `factura-electronica.entrar.response` | Respuesta RPC correlada de factura-electronica.entrar.request → {request_id, status:200, data:{formato, direccion, factura, adaptador_declarado, contenido_compuesto:false, abierto}}. Emitida por el helper _atender. |
| `factura-electronica.entrar.failed` | Par de fallo determinista (D9): formato no declarado (400) o no declarable (422), externo invalido (400) → {status, error:{code, message, details?}}. Cierra el circulo de factura-electronica.entrar.request. |
| `factura-electronica.salir.response` | Respuesta RPC correlada de factura-electronica.salir.request → {request_id, status:200, data:{formato, direccion, externo, adaptador_declarado, firmado:false, presentado:false}}. Emitida por el helper _atender. |
| `factura-electronica.salir.failed` | Par de fallo determinista (D9): formato no declarado (400) o no declarable (422), factura invalida (400) → {status, error:{code, message, details?}}. Cierra el circulo de factura-electronica.salir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `factura-electronica.entrar.failed` cierra `entrar.request` y
> `factura-electronica.salir.failed` cierra `salir.request`, cada uno cuando su proyección
> devuelve status ≠ 200 (`400`/`422`).

> Nota: a diferencia de los puertos con evento de dominio, este conversor **no publica
> fire-and-forget**: no emite ningún `contabilidad.*`; solo la response y el par de fallo.
> El contenido de la factura lo decide `emision-factura-venta` (O1); aquí solo se cruza
> formato.

## Reglas de negocio

1. **La ley/codificación entran como DATO**: `_formato(input)` toma `String(input.formato).trim()`;
   vacío/ausente → `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`. **No se adivina
   la codificación**.
2. **Los esquemas son declarables**: `_esquemas(input)` devuelve `input.esquemas_declarables`
   (array de strings, filtrado); sin declarar → `[]`. **El módulo NO conoce ningún esquema
   de memoria.**
3. **Formato no declarable sin mapeo**: `_mapeoDe(input, formato, esquemas)` devuelve el
   `input.mapeo` si es objeto; si no, construye la **identidad** (campo → su propio nombre)
   cuando `formato === 'canonico' || formato === 'enki'` **o** cuando el formato está entre
   los `esquemas_declarables`; en cualquier otro caso → `null` → `422 FORMATO_NO_DECLARABLE`
   con `{formato, esquemas_declarables}`.
4. **`entrar` — el externo es obligatorio y debe ser objeto**: si no → `400 INVALID_INPUT`
   (`field:'externo'`).
5. **Traducción entrada con mapeo**: `_aFactura(externo, mapeo)` recorre `CAMPOS_FACTURA`
   (`serie, numero, fecha, emisor, receptor, base, impuestos, total, moneda`), lee
   `externo[mapeo[campo] ?? campo]`; **si el valor es `undefined`/`null`/`''` → `null` y se
   apila en `faltantes`**. Nada se estima.
6. **Metadatos**: los campos del exterior **no reconocidos** (fuera de las claves mapeadas)
   se conservan bajo `value.metadatos` — no se pierde información.
7. **`salir` — la factura es obligatoria y debe ser objeto**: si no → `400 INVALID_INPUT`
   (`field:'factura'`).
8. **Codificación inversa**: cada campo canónico se escribe en su clave externa declarada;
   **ausente → `null`** (no se estima).
9. **Cruza formato, no contenido**: `entrar` declara `contenido_compuesto:false`; `salir`
   declara `firmado:false` y `presentado:false` (firma y presentación son del asesor).
10. **`adaptador_declarado`**: `Boolean(input.mapeo)` — refleja si vino mapeo en la petición.
11. **`project_id` con fallback**: `input.project_id || this.project_id || null` (no es
    obligatorio; se propaga en la respuesta).
12. **HTTP exacto**: éxito `200`; formato no declarado → `400`; formato no declarable → `422`;
    externo/factura inválidos → `400 INVALID_INPUT`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `factura-electronica.entrar.response` y `factura-electronica.salir.response`.

### 1. `entrar` — Facturae externo → factura canónica (con mapeo)

```json
{
  "project_id": "e57a318a-...",
  "formato": "facturae_3_2",
  "externo": { "SerieFactura": "A", "NumFactura": "1", "ImporteTotal": 121, "FechaExpedicion": "2026-09-01", "XMLNS": "..." },
  "mapeo": { "serie": "SerieFactura", "numero": "NumFactura", "total": "ImporteTotal", "fecha": "FechaExpedicion" }
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "formato": "facturae_3_2",
  "direccion": "entrar",
  "factura": { "serie": "A", "numero": "1", "fecha": "2026-09-01", "emisor": null, "receptor": null, "base": null, "impuestos": null, "total": 121, "moneda": null, "metadatos": { "XMLNS": "..." } },
  "adaptador_declarado": true,
  "contenido_compuesto": false,
  "abierto": ["emisor", "receptor", "base", "impuestos", "moneda"]
}
```

### 2. `entrar` — formato canónico sin mapeo (identidad)

```json
{ "formato": "canonico", "externo": { "serie": "A", "numero": "1", "total": 121 } }
```

Respuesta `200` con `adaptador_declarado:false`, la identidad por nombre canónico y `abierto`
con los campos ausentes.

### 3. `salir` — factura canónica → externo declarado

```json
{ "formato": "programa_externo_csv", "factura": { "serie": "A", "numero": "1", "total": 121 }, "mapeo": { "serie": "SER", "numero": "NUM", "total": "TOT" } }
```

Respuesta `200`:

```json
{ "project_id": null, "formato": "programa_externo_csv", "direccion": "salir", "externo": { "SER": "A", "NUM": "1", "fecha": null, "emisor": null, "receptor": null, "base": null, "impuestos": null, "TOT": 121, "moneda": null }, "adaptador_declarado": true, "firmado": false, "presentado": false }
```

### 4. Fallo — sin formato

```json
{ "externo": { "serie": "A" } }
```

Respuesta `400` + `factura-electronica.entrar.failed`:

```json
{ "status": 400, "error": { "code": "FORMATO_NO_DECLARADO", "message": "hay que declarar el formato estructurado de entrada", "details": { "esquemas_declarables": [] } } }
```

### 5. Fallo — formato no declarable sin mapeo

```json
{ "formato": "facturae_3_2", "externo": { "serie": "A" } }
```

Respuesta `422` + `factura-electronica.entrar.failed`:

```json
{ "status": 422, "error": { "code": "FORMATO_NO_DECLARABLE", "message": "formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado", "details": { "formato": "facturae_3_2", "esquemas_declarables": [] } } }
```

Un `esquema_declarado` (p. ej. `esquemas_declarables:["facturae_3_2"]`) **sí** activa la
identidad por nombre canónico para ese formato.

## Tests

El test unitario vive en `tests/unit/factura-electronica.test.js`. Cubre:

- `entrar` con mapeo declarado → `200`, campos mapeados, `abierto` con los ausentes,
  `adaptador_declarado:true`, `contenido_compuesto:false`.
- `entrar` con formato canonico sin mapeo → identidad por nombre; `adaptador_declarado:false`.
- `entrar` con formato declarado en `esquemas_declarables` → identidad sin mapeo.
- `entrar` sin `formato` → `400 FORMATO_NO_DECLARADO` + `factura-electronica.entrar.failed`.
- `entrar` con formato no declarable sin mapeo → `422 FORMATO_NO_DECLARABLE`.
- `externo` ausente/no objeto → `400 INVALID_INPUT` (`field:'externo'`).
- Campos extra del exterior → conservados en `metadatos`.
- `salir` con formato canonico → `200 {formato, direccion, externo}` con ausentes `null`,
  `firmado:false`, `presentado:false`; sin `formato` → `400` + `factura-electronica.salir.failed`.
- `toolEntrar` / `toolSalir` devuelven las mismas proyecciones.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `FacturaElectronica extends ModuloHibridoReflejo`; `name = 'factura-electronica'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/factura-electronica/`).
- Constante `CAMPOS_FACTURA = ['serie','numero','fecha','emisor','receptor','base',
  'impuestos','total','moneda']`.
- `onEntrarRequest` usa `this._atender(e, 'entrar', 'factura-electronica.entrar.response',
  async (d) => {...})`; `onSalirRequest` usa `this._atender(e, 'salir',
  'factura-electronica.salir.response', ...)`. En ambos, si `res.status !== 200` publican
  el par de fallo correspondiente.
- Proyecciones `_entrar(input)` y `_salir(input)`; helpers `_aFactura(externo, mapeo)`,
  `_formato(input)`, `_esquemas(input)`, `_mapeoDe(input, formato, esquemas)`. Tools
  `toolEntrar` / `toolSalir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: es la frontera de formato que `emision-factura-venta` (O1) puede delegar POR EVENTO;
  el contenido (importes/desglose) lo decide O1, no este módulo.
