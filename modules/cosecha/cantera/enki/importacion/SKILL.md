---
name: importacion
description: >
  Skill FULL del módulo CONVERSOR `importacion` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Frontera de formato
  de la moneda real del taller: importa modelos externos multi-formato (STL/3MF/GCODE) y
  lee sus metadatos vía un lector por formato (puerto LectorArchivo ABIERTO). Distingue el
  GCODE ya preparado (→ cupula-gcode) del STL/3MF fuente (→ catálogo). Úsala para operar,
  depurar o extender el conversor de importación, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites importar un archivo externo multi-formato o leer sus metadatos,
    decidiendo si va al catálogo (STL/3MF fuente) o a la cúpula (GCODE preparado).
  - Cuando depures por qué no se reconoce un formato, por qué falla el registro en
    catalogo/cupula por RPC o por qué los metadatos llegan con huecos.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de negocio
    del conversor de importación.
  - Cuando vayas a escribir/ampliar el test unitario del conversor de importación.
tags: [enki, modulo, conversor, impresora-3d, importacion, formato, proyecto-3d]
---

# importacion — CONVERSOR de importación de modelos (frontera de formato)

## Qué hace el módulo

`importacion` es un **CONVERSOR** **stateless** (pieza 5): **frontera de formato** de la
moneda real del taller. Importa modelos externos **multi-formato** (STL/3MF/GCODE) y lee
sus **metadatos** vía un lector por formato. El puerto `LectorArchivo` es **ABIERTO**:
`LectorSTL/Lector3MF/LectorGCODE` se **inyectan en despliegue** (`registrarLector(formato,
fn)` o `opts.lectores`); para el `.3mf` se puede reutilizar `adaptador-slicing.leer_3mf`
(RPC `adaptador-slicing.leer_3mf.request`).

**Distingue el destino según el formato**: el **GCODE ya preparado** va a la **cupula-gcode**
directo como `ArchivoPreparado` ya listo (RPC `cupula-gcode.registrar.request`); el
**STL/3MF fuente** va al **catálogo** como ficha de modelo (RPC `catalogo.registrar.request`).
Registra en catálogo por RPC (depende de `catalogo`).

Es **stateless**: sin store, sin `project.activated`, sin PosPersistencia. Es un
**CONVERSOR sin juicio**: no decide qué pieza imprimir; solo normaliza la entrada del
formato al sistema y la entrega. La aprobación sigue siendo decisión humana.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `importacion.importar.request` | `onImportarRequest` | Importa un archivo externo (STL/3MF/GCODE): lee metadatos y lo entrega — GCODE a la cupula, STL/3MF al catalogo (RPC). |
| `importacion.leer_metadatos.request` | `onLeerMetadatosRequest` | Lee metadatos de un archivo por su formato (nombre, unidades, material sugerido, formatos). |

### Publishes

| Evento | Descripción |
|---|---|
| `importacion.importar.response` | Respuesta correlada: resultado de importar (registrado en catalogo o cupula). |
| `importacion.leer_metadatos.response` | Respuesta correlada: metadatos leídos del archivo. |
| `importacion.importar.failed` | Par de fallo: no se pudo importar (formato no soportado, RPC destino falló, metadatos inválidos). |

> **Regla de cierre de círculo**: `importacion.importar.failed` es el par de fallo canónico
> del flujo de importación; responde en `importacion.importar.response`. El módulo **no
> publica eventos de dominio** propios: es un conversor que responde y delega por RPC a
> catalogo/cupula.

## Reglas de negocio

1. **Formato por extensión**: `.stl`→STL, `.3mf`→3MF, `.gcode/.g/.gco`→GCODE; si no se
   reconoce → `DESCONOCIDO`. `_importar` con formato no soportado o `DESCONOCIDO` →
   `422 FORMATO_NO_SOPORTADO` + `importacion.importar.failed`
   (`motivo:'formato_no_soportado'`).
2. **Destino según formato**: GCODE → `cupula-gcode.registrar.request` como `ArchivoPreparado`
   `listo:true` (NO duplica catálogo); STL/3MF → `catalogo.registrar.request` (ficha, con
   `archivo_<formato.toLowerCase()>`).
3. **Reconciliación vía catálogo**: el STL/3MF se registra con `catalogo.registrar.request`
   (que reconcilia por nombre+fuente+origenUrl). La respuesta `importar` devuelve
   `{ destino: 'catalogo', modelo, reconciliado }`.
4. **CERO invención de metadatos**: `_leerMetadatos` devuelve huecos como
   `null`/`'desconocido'` cuando el lector no los provee (nombre, unidades, material, autor,
   licencia, dimensiones, origenUrl, perfil, gramos_est, tiempo_est, formatos). Nunca se
   inventan.
5. **Fallo de RPC destino honesto**: si `cupula-gcode.registrar` o `catalogo.registrar` no
   responden o responden `>=400` → `502` con `CUPULA_FALLO`/`CATALOGO_FALLO` +
   `importacion.importar.failed` (`motivo:'cupula_registro_fallo'` /
   `'catalogo_registro_fallo'`). Excepción en el RPC → `500 RPC_FALLO` +
   `failed` (`rpc_fallo`).
6. **`_leerMetadatos`**: valida que exista `archivo`; formato detectado por extensión o
   `input.formato`; formato no soportado → `422`. Para `.3mf` sin lector propio, delega en
   `adaptador-slicing.leer_3mf.request`.
7. **Stateless**: sin store propio, sin `project.activated`, sin persistencia; el estado son
   las dependencias inyectadas (lectores) y los RPCs delegados.

## Uso / cómo invocarlo

### 1. `importar` — importar un archivo externo

```json
{
  "project_id": "e57a318a-...",
  "archivo": "/descargas/soporte-extrusor.3mf",
  "formato": "3MF"
}
```
Respuesta `201` (STL/3MF → catálogo):
```json
{ "destino": "catalogo", "archivo": "/descargas/soporte-extrusor.3mf", "formato": "3MF", "modelo": {...}, "reconciliado": false }
```
Respuesta `201` (GCODE → cúpula):
```json
{ "destino": "cupula", "archivo": "/descargas/soporte.gcode", "formato": "GCODE", "archivo_id": "arc_xxx" }
```

### 2. `leer_metadatos` — leer metadatos de un archivo por su formato

```json
{ "archivo": "/descargas/soporte-extrusor.3mf", "formato": "3MF" }
```
Respuesta `200`:
```json
{ "archivo": "/descargas/soporte-extrusor.3mf", "formato": "3MF", "metadatos": { "nombre": "soporte-extrusor", "unidades": "mm", "material": "PETG", "fuente": "ARCHIVO", "formatos": ["3MF"] } }
```
Huecos sin lector → `null`/`'desconocido'` (nunca inventados).

## Tests

El test vive en `tests/unit/importacion.test.js`. Cubre:

- `importar` STL/3MF → `201` con `destino:'catalogo'` (llama a `catalogo.registrar.request`).
- `importar` GCODE → `201` con `destino:'cupula'` (llama a `cupula-gcode.registrar.request`,
  `listo:true`), sin duplicar catálogo.
- `importar` formato no soportado/desconocido → `422` + `importacion.importar.failed`
  (`formato_no_soportado`).
- `importar` sin `project_id` / sin `archivo` → `400`.
- `importar` con RPC destino fallando → `502` + `failed` (`cupula_registro_fallo` /
  `catalogo_registro_fallo`).
- `leer_metadatos` ok con lector inyectado → `200` con nombre/unidades/material/formatos;
  huecos → `null`/`desconocido`.
- `leer_metadatos` delega en `adaptador-slicing.leer_3mf` para `.3mf` sin lector propio.
- Stateless y CERO invención de metadatos.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/importacion
node tests/unit/importacion.test.js
# esperado: importacion: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/importacion`; en este repo, el
> test se ejecuta desde `modules/importacion`.

## Notas de implementación

- Clase `ImportacionReflejo extends ModuloHibridoReflejo`; `name = 'importacion'`,
  `version = 'reflejo-0.1.0'`.
- Puerto `LectorArchivo` ABIERTO: `this._lectores` (`Map` formato → función async
  `({ archivo }) => metadatos`), inyectable por `registrarLector(formato, fn)` o
  `opts.lectores`; solo acepta STL/3MF/GCODE.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'importacion.<accion>.response', fn)`.
- `_failed(input, motivo, mensaje)` publica `importacion.importar.failed` con `timestamp` ISO.
- DEP: `catalogo` (registro por RPC) y `adaptador-slicing` (reuso de `leer_3mf` como lector
  del `.3mf`, reutilizado no pieza).
