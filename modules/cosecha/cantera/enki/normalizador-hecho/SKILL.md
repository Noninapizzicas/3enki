---
name: normalizador-hecho
description: >-
  Skill FULL del módulo CONVERSOR STATELESS `normalizador-hecho` de la vertical contabilidad
  (Enki). ÚNICA PUERTA DE FORMATO: homogeneiza el hecho de cada vertical a FORMA ASENTABLE (fechas
  a ISO, moneda a mayúsculas, texto recortado, mapeo declarado), SIN decidir contenido (no calcula
  importes ni elige contrapartida). La forma es DECLARABLE (`mapeo` entra como dato); sin mapeo y
  sin claves canónicas en el crudo, la forma NO se fabrica: se declara ABIERTO. Dato ausente =
  desconocido. Conversor puro: no escribe → no anuncia hecho. Escucha contabilidad.hecho_recibido.
when-to-use: >-
  - Cuando necesites homogeneizar un hecho crudo a forma asentable
    (RPC normalizador-hecho.entrar.request; o al recibir contabilidad.hecho_recibido).
  - Cuando depures por qué `forma_declarada:false` (falta mapeo y claves canónicas) o por qué hay
    campos en `faltantes`.
  - Cuando quieras entender su contrato de eventos: es conversor, no publica hecho de dominio.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, stateless, contabilidad, entrada, normalizador, formato, asentable]
---

# normalizador-hecho — CONVERSOR de la única puerta de formato

## Qué hace el módulo

`normalizador-hecho` es un **CONVERSOR STATELESS** (A2, hoja del plan). Es la **ÚNICA PUERTA DE
FORMATO**: homogeneiza el hecho de cada vertical a **FORMA ASENTABLE**. Homogeneiza la **FORMA**
(fechas a ISO, moneda a mayúsculas, texto recortado, mapeo declarado), **NO decide CONTENIDO**: no
calcula importes, no elige contrapartida (eso es de otros). Cruza forma.

Invariantes:
- **"Forma asentable" DECLARABLE**: el `mapeo` (campo canónico → clave del crudo) entra como DATO.
  Si no hay mapeo y el crudo no trae las claves canónicas, la forma no se fabrica: se declara
  **ABIERTO**.
- **Dato ausente = desconocido**: un campo canónico que no viene queda `null` y se declara en
  `abierto`/`faltantes`. JAMÁS se estima ni se completa.
- **Conversor puro**: no escribe → **no hay hecho que anunciar** (R2). Su cara es el bus
  (`entrar.response`).

**Escucha** `contabilidad.hecho_recibido` (emitido por `puerto-evento-vertical`). Cuando falta la
forma declarada, sube una **petición best-effort** a `cola-declaraciones-criterio.fijar.request`
(sin suplantar al JEFE). RPC **PREGUNTA** → sin `ui_handlers`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `normalizador-hecho.entrar.request` | `onEntrarRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id?, hecho, vertical?, mapeo?}` → `{project_id, vertical, forma_asentable, faltantes, forma_declarada, abierto}`. Homogeneiza el hecho; no decide contenido. Sin hecho → `INVALID_INPUT`. Responde por `.entrar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (A2): la puerta (`puerto-evento-vertical`) admitió un hecho crudo → se normaliza con la misma lógica de `_entrar`. No publica hecho de dominio ni decide contenido; si falta la forma declarada, deja la petición a `cola-declaraciones-criterio`. |

> **Nota de deriva (R3):** el plan declara también escucha de `contabilidad.documento_recibido`,
> pero su emisor (`puerto-documento-digital` A4) **aún no existe** en el repo: declararlo daría
> cadena colgada, así que NO se declara (solo `hecho_recibido`).

### Publishes

| Evento | Cuándo |
|---|---|
| `normalizador-hecho.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `normalizador-hecho.entrar.failed` | Fallo determinista: falta el hecho. |

> **No publica hecho de dominio** (R2, `ui_handlers: []`).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** (bus) | `{project_id?, hecho\|documento\|d, vertical?, mapeo?}` | `{project_id, vertical, forma_asentable, contenido_compuesto:false, mapeo_declarado, forma_declarada, faltantes, abierto}` | 400 `INVALID_INPUT` (`hecho`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Crudo obligatorio**: `hecho`/`documento`/`d` objeto → si no, `_invalid('hecho')`.
2. **Campos canónicos** (`CAMPOS_ASENTABLE`): `fecha, fecha_valor, concepto, importe, moneda,
   cuenta, contrapartida, origen, vertical, referencia`.
3. **Resolución de clave** (`_clave`): si hay `mapeo` declarado se usa; si no, se prueban los
   `ALIAS` por defecto (p. ej. `fecha←date/fecha_operacion/fecha_factura`, `importe←amount/total/
   cuantia`, `cuenta←cuenta_bancaria/iban`, `referencia←ref/numero/documento`).
4. **Homogeneización mecánica** (`_normCampo`): `fecha`/`fecha_valor` parseables → ISO
   (`new Date(raw).toISOString()`), no parseables → literal recortado (no se inventa fecha);
   `moneda` → mayúsculas; objeto → tal cual; string → trim + colapsa espacios.
5. **Ausente → `null` + `faltantes`**; nada se estima.
6. **`metadatos`**: los campos del crudo no reconocidos se conservan (no se pierde nada).
7. **`forma_declarada`**: `true` si se declaró `mapeo` o si el crudo traía al menos una clave
   canónica reconocida con valor. Si `false` → `abierto.forma` declarado y el handler sube la
   petición a la cola de criterios.
8. **`vertical`**: de `input.vertical`, de la forma o del crudo.
9. **`contenido_compuesto:false`**: cruza formato, no compone contenido.

## Cómo se usa (RPC y evento)

### 1. Normalizar por RPC

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "hecho": { "date": "2026-10-01", "amount": "42.5", "descripcion": "venta 42", "currency": "eur", "ref": "F-42" } }
```
Respuesta `200`: `forma_asentable` con `fecha:'2026-10-01T00:00:00.000Z'`, `importe:42.5` (crudo),
`concepto:'venta 42'`, `moneda:'EUR'`, `referencia:'F-42'`, `vertical:'pizzepos'`, `metadatos:{...}`,
`forma_declarada:true`.

### 2. Al recibir un hecho

Se dispara `onHechoRecibido` con el evento `contabilidad.hecho_recibido` de `puerto-evento-vertical`;
normaliza `d.hecho || d.documento` con `d.vertical`/`d.mapeo`.

### Fallo — sin hecho

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `normalizador-hecho.entrar.failed` (`INVALID_INPUT`, field `hecho`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`hecho`) | no viene hecho/documento objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; sube best-effort a `cola-declaraciones-criterio`).
- **De quién depende por evento:** `contabilidad.hecho_recibido` lo emite `puerto-evento-vertical`
  (A1).
- **Quién la usa:** la cadena de entrada (deduplicacion, completitud, escritor-diario).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/normalizador-hecho/module.json` + `index.js`.
2. Smoke: `entrar` con crudo con alias → forma asentable homogeneizada; `forma_declarada:true`.
3. Crudo sin claves canónicas ni `mapeo` → `forma_declarada:false`, `abierto.forma` declarado.
4. Sin `hecho` → 400 + `.entrar.failed`.
5. `grep -E '"event"' module.json` (los 2 subscribes reales + 2 publishes).

## Notas de implementación

- Clase `NormalizadorHecho extends ModuloHibridoReflejo`; `name = 'normalizador-hecho'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless). Constantes `CAMPOS_ASENTABLE` y
  `ALIAS`.
- Handlers `onEntrarRequest` (RPC) y `onHechoRecibido` (dominio); helpers `_clave`, `_normCampo`,
  `_subirPeticionCriterio`; tool `toolEntrar`.
