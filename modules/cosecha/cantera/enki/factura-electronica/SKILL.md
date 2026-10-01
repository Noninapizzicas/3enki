---
name: factura-electronica
description: >-
  Skill FULL del módulo CONVERSOR STATELESS `factura-electronica` de la vertical contabilidad
  (Enki). Frontera ÚNICA de formato de la factura: cruza entre la representación externa
  (Facturae/UBL/JSON…) y la FacturaEmitida canónica del dominio. Cruza FORMATO, no decide
  CONTENIDO (no calcula importes, no compone desglose, no firma, no presenta). LA LEY ENTRA
  COMO DATO: `formato` y `mapeo` son declarables; cero esquemas cableados. NO escribe, NO
  persiste. RPC `entrar` y `salir` son CLASE PREGUNTA (por el bus, sin panel).
when-to-use: >-
  - Cuando necesites traducir una representación externa a FacturaEmitida canónica o al revés
    (RPC factura-electronica.entrar.request / .salir.request).
  - Cuando depures por qué se rechaza la conversión (400 FORMATO_NO_DECLARADO o
    422 FORMATO_NO_DECLARABLE) o por qué un campo sale `null` en `abierto`.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes): es conversor puro,
    no publica hecho de dominio.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, stateless, contabilidad, fiscal, factura, formato, mapeo]
---

# factura-electronica — CONVERSOR de la frontera de formato de la factura

## Qué hace el módulo

`factura-electronica` es un **CONVERSOR STATELESS** (D9, hoja del plan). Es la frontera
ÚNICA de formato de la factura: convierte entre la representación **externa** (formato
estructurado que pida el sitio: Facturae, UBL, JSON de un programa externo…) y la
`FacturaEmitida` **canónica** del dominio.

**Cruza FORMATO, no decide CONTENIDO**: no calcula importes, no compone el desglose (eso es
`emision-factura-venta` O1), no firma y no presenta. **La ley entra como dato**: el `formato`
y el `mapeo` (campo canónico → clave externa) son **DECLARABLES**; no hay ningún esquema
Facturae cableado (ni versiones, ni etiquetas XML, ni namespaces, ni códigos de impuesto).

Sin `formato` declarado no convierte (`400 FORMATO_NO_DECLARADO`). Si el formato no tiene
`mapeo` declarado y no es el canónico ni un esquema declarado → `422 FORMATO_NO_DECLARABLE`.

**Dato ausente = desconocido**: un campo que no viene del exterior queda `null` y se declara
en `abierto` (jamás se estima ni se completa). **NO escribe, NO persiste**.

Sus dos RPC (`entrar` y `salir`) son **CLASE PREGUNTA** → sin `ui_handlers`; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `factura-electronica.entrar.request` | `onEntrarRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id, formato, externo, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'entrar', factura, abierto[]}`. Traduce la representación externa a la FacturaEmitida canónica. Sin formato → `FORMATO_NO_DECLARADO`; formato sin mapeo y no canónico → `FORMATO_NO_DECLARABLE`. Responde por `.entrar.response`. |
| `factura-electronica.salir.request` | `onSalirRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id, formato, factura, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'salir', externo}`. Traduce la FacturaEmitida canónica al formato estructurado externo. No firma ni presenta. Responde por `.salir.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `factura-electronica.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `factura-electronica.entrar.failed` | Fallo determinista de `entrar.request` (formato no declarado/no declarable o externo inválido). |
| `factura-electronica.salir.response` | Respuesta RPC correlada de la op `salir`. |
| `factura-electronica.salir.failed` | Fallo determinista de `salir.request`. |

> **No publica hecho de dominio**: es conversor puro (no escribe) → no hay `contabilidad.*`
> que anunciar (R2). Cada handler publica su `*.failed` solo si `status !== 200`.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** (bus) | `{project_id, formato, externo, mapeo?, esquemas_declarables?}` | `{project_id, formato, direccion:'entrar', factura, adaptador_declarado, contenido_compuesto:false, abierto[]}` | 400 `FORMATO_NO_DECLARADO`; 422 `FORMATO_NO_DECLARABLE`; 400 `INVALID_INPUT` (`externo`) |
| `salir` | **PREGUNTA** (bus) | `{project_id, formato, factura, mapeo?, esquemas_declarables?}` | `{project_id, formato, direccion:'salir', externo, adaptador_declarado, firmado:false, presentado:false}` | 400 `FORMATO_NO_DECLARADO`; 422 `FORMATO_NO_DECLARABLE`; 400 `INVALID_INPUT` (`factura`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Campos canónicos** (`CAMPOS_FACTURA`): `serie, numero, fecha, emisor, receptor, base,
   impuestos, total, moneda`. Su origen externo es declarable vía `mapeo`.
2. **Sin `formato`** (o vacío) → `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`.
3. **Resolución del mapeo** (`_mapeoDe`): si `input.mapeo` es objeto se usa tal cual; si no,
   solo se acepta el formato canónico (`'canonico'` o `'enki'`) o un formato incluido en
   `esquemas_declarables` — en ese caso el mapeo es identidad. Si no → `422 FORMATO_NO_DECLARABLE`.
4. **`_aFactura`** (entrar): para cada campo canónico busca `externo[mapeo[campo] || campo]`.
   Si el valor es `undefined/null/''` → `null` **y** se apila en `faltantes` (→ `abierto`).
5. **Metadatos**: los campos del exterior no conocidos se conservan bajo `value.metadatos`
   (no se pierde nada).
6. **`_salir`**: itera `CAMPOS_FACTURA`, aplica el mapeo inverso y pone `factura[campo] ?? null`
   (ausente → null, no se estima). Marca `firmado:false, presentado:false`.
7. **`adaptador_declarado`**: `Boolean(input.mapeo)` — si el mapeo vino declarado o se asumió
   identidad canónica.
8. **NO decide contenido**: `contenido_compuesto:false` en `entrar`; `firmado/presentado:false`
   en `salir`.

## Cómo se usa (RPCs)

### 1. entrar — externo → canónico

```json
{
  "project_id": "e57a318a-...",
  "formato": "facturae-3.2",
  "externo": { "Serie": "A", "Numero": "42", "Total": 1210.0, "extra": "x" },
  "mapeo": { "serie": "Serie", "numero": "Numero", "total": "Total" }
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "formato": "facturae-3.2", "direccion": "entrar", "factura": { "serie": "A", "numero": "42", "fecha": null, "emisor": null, "receptor": null, "base": null, "impuestos": null, "total": 1210.0, "moneda": null, "metadatos": { "extra": "x" } }, "adaptador_declarado": true, "contenido_compuesto": false, "abierto": ["fecha","emisor","receptor","base","impuestos","moneda"] }
```

### 2. salir — canónico → externo

```json
{
  "project_id": "e57a318a-...",
  "formato": "canonico",
  "factura": { "serie": "A", "numero": "42", "total": 1210.0 }
}
```
Respuesta `200`: `externo` con cada campo canónico (`fecha:null`, etc.), `adaptador_declarado:false`,
`firmado:false`, `presentado:false`.

### Fallo — formato sin mapeo ni canónico

```json
{ "project_id": "e57a318a-...", "formato": "facturae-3.2", "externo": { "x": 1 } }
```
Respuesta `422` + `factura-electronica.entrar.failed`:
```json
{ "status": 422, "code": "FORMATO_NO_DECLARABLE", "mensaje": "formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado", "data": { "formato": "facturae-3.2", "esquemas_declarables": [] } }
```

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 FORMATO_NO_DECLARADO` | falta `formato` (entrar o salir). |
| `422 FORMATO_NO_DECLARABLE` | formato sin `mapeo` y no canónico ni declarado en `esquemas_declarables`. |
| `400 INVALID_INPUT` (`externo` / `factura`) | el cuerpo a traducir no es objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager` + `credential-manager`.
- **De quién depende:** ninguna escucha declarada. Recibe/entrega la factura en la petición.
- **Quién la usa:** `emision-factura-venta` (O1) compone el CONTENIDO; esta cruza el FORMATO.
  El asesor firma/presenta (fuera del módulo).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/factura-electronica/module.json` + `index.js`.
2. Smoke: `entrar` con `formato:'canonico'` → 200; con `formato+mapeo` → 200.
3. Sin `formato` → `400 FORMATO_NO_DECLARADO`; formato con mapeo ausente y no canónico →
   `422 FORMATO_NO_DECLARABLE` + `.entrar.failed`.
4. `abierto[]` lista los campos que vinieron ausentes (`null`).
5. Comprobar eventos reales: `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `FacturaElectronica extends ModuloHibridoReflejo`; `name = 'factura-electronica'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- Handlers: `onEntrarRequest`/`onSalirRequest` delegan en `_atender` y publican su `*.failed`
  si `status !== 200`.
- Proyecciones `_entrar`/`_salir`; helpers `_aFactura`, `_formato`, `_esquemas`, `_mapeoDe`;
  tools `toolEntrar`/`toolSalir`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
