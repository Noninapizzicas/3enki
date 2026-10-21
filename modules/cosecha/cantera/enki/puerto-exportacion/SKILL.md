---
name: puerto-exportacion
description: >-
  Skill FULL del módulo CONVERSOR STATELESS `puerto-exportacion` de la vertical
  contabilidad (Enki). Frontera de FORMATOS contables estándar hacia el programa
  del asesor; si falta un formato, se CREA declarándolo. Cruza FORMATO, no decide
  CONTENIDO. La ley entra como DATO (formato + mapeo declarables; cero esquemas
  cableados). salir (canónico→externo) y entrar (externo→canónico); sin formato no
  convierte. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites traducir un paquete contable a/desde el formato del asesor
    (RPC puerto-exportacion.salir.request / puerto-exportacion.entrar.request).
  - Cuando depures un 400 FORMATO_NO_DECLARADO o 422 FORMATO_NO_DECLARABLE.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    mapeo declarable.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, contabilidad, libro, exportacion, formatos, mapeo, declarable]
---

# puerto-exportacion — CONVERSOR STATELESS de formatos contables

## Qué hace el módulo

`puerto-exportacion` es un **CONVERSOR STATELESS** (L1, hoja del plan): la
**frontera de FORMATOS** contables estándar hacia el **programa del asesor**. Si
falta un formato, **se CREA declarándolo**. Cruza **FORMATO**, no decide
**CONTENIDO** (no calcula saldos, no compone el asiento, no firma, no presenta).

**LA LEY ENTRA COMO DATO**: `formato` y `mapeo` (campo canónico → clave externa)
son **declarables**; **cero esquemas cableados**. Sin formato declarado **no
convierte**; formato sin mapeo y no canónico → `422 FORMATO_NO_DECLARABLE`.

Tiene dos direcciones: `salir` (canónico → externo) y `entrar` (externo →
canónico). `entrar`, si el paquete **YA declara su asiento**, lo **sube a
`asiento-ajuste` (B5)** por EVENTO. **Dato ausente = desconocido.** No escribe, no
persiste. **Ambas ops son CLASE PREGUNTA** → van por el bus, sin panel. Publica los
pares `salir`/`entrar` `.response`/`.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-exportacion.salir.request` | `onSalirRequest` | RPC conversor (PREGUNTA, por el bus): `{project_id, formato, paquete, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'salir', externo}`. Traduce el paquete canónico al formato externo declarado. Sin formato → `FORMATO_NO_DECLARADO`; formato sin mapeo y no canónico → `FORMATO_NO_DECLARABLE`. Responde por `puerto-exportacion.salir.response`. |
| `puerto-exportacion.entrar.request` | `onEntrarRequest` | RPC conversor (PREGUNTA, por el bus): `{project_id, formato, externo, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'entrar', paquete, abierto[]}`. Traduce la representación externa al paquete canónico; si el paquete ya declara su asiento, lo sube a `asiento-ajuste`. Responde por `puerto-exportacion.entrar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-exportacion.salir.response` | Respuesta RPC correlada de la op `salir` (una sola cara: el bus). |
| `puerto-exportacion.salir.failed` | Par de fallo determinista: formato no declarado/no declarable o paquete inválido → `{status, code, message}`. Cierra el círculo de `salir.request`. |
| `puerto-exportacion.entrar.response` | Respuesta RPC correlada de la op `entrar` (una sola cara: el bus). |
| `puerto-exportacion.entrar.failed` | Par de fallo determinista de `entrar.request`: formato no declarado/no declarable o externo inválido → `{status, code, message}`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `salir` | **PREGUNTA** (bus) | `{project_id, formato, paquete, mapeo?\|esquemas_declarables?}` | `{project_id, formato, direccion:'salir', externo}` | `400 FORMATO_NO_DECLARADO`; `422 FORMATO_NO_DECLARABLE`; `400 INVALID_INPUT paquete` |
| `entrar` | **PREGUNTA** (bus) | `{project_id, formato, externo, mapeo?\|esquemas_declarables?}` | `{project_id, formato, direccion:'entrar', paquete, abierto[]}` | `400 FORMATO_NO_DECLARADO`; `422 FORMATO_NO_DECLARABLE`; `400 INVALID_INPUT externo` |

Tools expuestas: `puerto-exportacion.salir` (`toolSalir`) y
`puerto-exportacion.entrar` (`toolEntrar`).

## Reglas de negocio

1. **La ley entra como dato**: `formato` y `mapeo` (campo canónico → clave externa)
   son declarables. **Cero esquemas cableados.**
2. **Sin formato no convierte** → `400 FORMATO_NO_DECLARADO`.
3. **Formato sin mapeo y no canónico** → `422 FORMATO_NO_DECLARABLE`.
4. **Campos del paquete canónico (const `CAMPOS_PAQUETE`)**:
   `['ejercicio', 'asientos', 'cuentas', 'terceros', 'saldos']`. Los campos que no
   mapean se declaran en `abierto[]` (faltantes).
5. **`entrar` sube el asiento si el paquete lo declara**: a `asiento-ajuste` (B5)
   por EVENTO; no escribe el libro.
6. **Dato ausente = desconocido**: no se inventa el contenido; se declara `abierto`.
7. **No escribe, no persiste**: conversor puro.
8. **HTTP exacto**: éxito `200`; formato no declarado → `400`; no declarable → `422`;
   paquete/externo inválido → `400 INVALID_INPUT`; excepción → `500`.

## Cómo se usa (RPC)

### `salir` — canónico → formato del asesor

```json
{
  "project_id": "e57a318a-...",
  "formato": "A3_ASESOR",
  "paquete": { "ejercicio": "2026", "asientos": [ ... ], "cuentas": [ ... ] },
  "mapeo": { "asientos": "Apuntes", "cuentas": "Cuentas" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "formato": "A3_ASESOR", "direccion": "salir", "externo": { "Apuntes": [ ... ], "Cuentas": [ ... ] } }
```

### `entrar` — externo → canónico (y sube asiento si lo trae)

```json
{ "project_id": "e57a318a-...", "formato": "A3_ASESOR", "externo": { "Apuntes": [ ... ] }, "mapeo": { "asientos": "Apuntes" } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "formato": "A3_ASESOR", "direccion": "entrar", "paquete": { "asientos": [ ... ] }, "abierto": [ "cuentas", "terceros" ] }
```

## Errores y qué significan

- `400 FORMATO_NO_DECLARADO` — no se declaró el formato; no se convierte.
- `422 FORMATO_NO_DECLARABLE` — formato sin mapeo y no canónico.
- `400 INVALID_INPUT paquete` / `externo` — el objeto a traducir es inválido.
- `abierto[]` — campos sin mapeo declarado (honestidad, no error).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (sube por evento)**: `entrar` puede subir a `asiento-ajuste` (B5)
  cuando el paquete trae su asiento declarado.
- **Hacia atrás**: el asesor/`informe` provee el formato y el mapeo declarados.
- No escribe, no calcula: conversor de frontera.

## Verificación

- **Fichero**: `modules/contabilidad-libro/puerto-exportacion/` (clase
  `PuertoExportacion extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "salir.request" module.json` y
  `grep -F "FORMATO_NO_DECLARABLE" index.js`.
- **Test unitario**: `salir` con formato+mapeo → traduce; sin formato →
  `400 FORMATO_NO_DECLARADO`; formato sin mapeo → `422 FORMATO_NO_DECLARABLE`;
  `entrar` con asiento declarado sube a `asiento-ajuste`.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- Helpers: `_salir`, `_entrar`, `_encadenar`, `_formato`, `_esquemas`, `_mapeoDe`,
  `toolSalir`, `toolEntrar`.
