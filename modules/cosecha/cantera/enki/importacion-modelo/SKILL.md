---
name: importacion-modelo
description: Skill FULL del módulo importacion-modelo (PUENTE) del proyecto 3D — taller personal de impresión 3D. Importa modelos 3D desde repositorios externos (Printables, MakerWorld, Cults3D, Thingiverse) o desde un diseño propio del dueño, los descarga, detecta el formato, lee el .3mf y los registra en el catálogo. Delega la búsqueda a busqueda-repositorios. Úsala para operar, depurar o extender este puente.
when-to-use: Cuando necesites entender, invocar, depurar o modificar el módulo importacion-modelo del proyecto 3D; cuando quieras importar un modelo 3D al catálogo; cuando un flujo de importación falle y haya que diagnosticar el par de fallo.
tags: [enki, modulo, puente, 3d, importacion, modelo, catalogo, reflejo]
---

# importacion-modelo — PUENTE de importación de modelos 3D

> **Proyecto**: 3d (taller personal de impresión 3D, impresora SPARKX i7)
> **Forma**: PUENTE (transporta, no decide, no persiste)
> **Versión**: reflejo-0.1.0 (2026-09-06)
> **Ruta real**: `/opt/enki/modules/importacion-modelo/` (`module.json` + `index.js` + `tests/unit/`)
> **Plan**: `plan-construccion.md` sección 6.7 (hoja CONSTRUIR)

## Qué hace el módulo

`importacion-modelo` es el **puente de entrada de modelos 3D al sistema**. Importa
un modelo desde un repositorio externo (Printables, MakerWorld, Cults3D,
Thingiverse) o desde un diseño propio del dueño, y lo registra en el catálogo
(`catalogo-modelos`).

Es **PUENTE**: sin store, escucha y delega. No persiste estado (sin
PosPersistencia, sin `project.activated`). Toda la lógica de negocio es
transporte y orquestación de RPCs hacia otros módulos.

**Flujo A del plan** (registro de modelo):
```
dueño busca → busqueda-repositorios.buscar → dueño elige
→ importacion-modelo.importar → adaptador-slicing.leer_3mf
→ catalogo-modelos.registrar → catalogo.modelo_registrado
```

## Contrato de eventos (module.json real)

### Subscribes (RPC request)
| Evento | Handler | Descripción |
|---|---|---|
| `importacion.importar.request` | `onImportarRequest` | Reflejo JS: importa un modelo (descarga, lee el .3mf y lo registra en el catálogo). |

### Publishes
| Evento | Descripción |
|---|---|
| `importacion.importada` | Se emite al completar la importación y registrar el modelo en el catálogo. |
| `importacion.importar.failed` | **Par de fallo**: la importación no se completó (input inválido, descarga fallida, .3mf ausente o registro fallido). |

> **Regla de cierre de círculo**: todo flujo cierra su círculo con un par de
> resultado canónico (`*.failed` / `ok:false`). Nadie da por hecho un registro
> sin `ok:true` explícito del proveedor (honestidad M11).

## Cómo se usa (RPCs)

### `importacion.importar.request` — importar un modelo

Payload:
```json
{
  "project_id": "e57a318a-...",
  "url": "https://printables.com/m/1",
  "nombre": "Pieza",
  "origen": "printables",
  "categoria": "sin_categoria",
  "correlation_id": "opcional"
}
```

Respuesta `importacion.importar.response`:
- `201` → `{ modelo, importada: true }` (éxito, modelo registrado)
- `400` → `INVALID_INPUT` (url o project_id requeridos)
- `422` → `FALTA_3MF` (el origen es .stl; el slicer necesita .3mf)
- `502` → `DESCARGA_FALLIDA` / `ARCHIVO_VACIO` / `REGISTRO_FALLIDO`
- `503` → `DESCARGADOR_NO_CONFIGURADO` (no hay descargador cableado)

### `_buscar(query)` — delegar búsqueda (helper interno)

Delega a `busqueda-repositorios` por el puerto `buscar(query) -> [resultados]`.
El dueño busca en todos los repositorios a la vez. No es un RPC propio del
module.json; es una proyección interna que usa `busqueda.buscar.request`.

## Reglas de negocio

1. **Importar desde repositorios o diseño propio** — el origen puede ser un
   repositorio externo o un diseño del dueño. El dueño elige o busca en todos a
   la vez (delega la búsqueda a `busqueda-repositorios`).
2. **Descargar** — usa el puerto 9 (descargador inyectado vía
   `registrarDescargador`). Si no hay descargador cableado (puente thin del PC
   del dueño), falla con `503 DESCARGADOR_NO_CONFIGURADO`.
3. **Detectar formato** — por extensión del archivo descargado (`.3mf` / `.stl`).
   Si el formato es desconocido, se trata como tal (no se inventa).
4. **`.stl` → falta_3mf** — el slicer necesita `.3mf`. Si el origen es `.stl`,
   se avisa que falta el `.3mf` (`422 FALTA_3MF`) y **no se inventa** el .3mf
   (invariante 5: dato ausente nombrado, nunca inventado).
5. **Leer metadatos** — vía `adaptador-slicing.leer_3mf.request` (conversor 10.2).
   Si falla, los metadatos quedan `null` y el nombre cae a `desconocido`.
6. **Registrar en catálogo** — vía `catalogo-modelos.registrar.request`. Si el
   catálogo rechaza (p.ej. `409 ALREADY_EXISTS`), falla con `502 REGISTRO_FALLIDO`.
7. **Buscar delegado a busqueda-repositorios** — `_buscar` no consulta
   repositorios directamente; delega por RPC. Si `busqueda-repositorios` no
   responde, devuelve `502 BUSQUEDA_FALLO`.
8. **Par de fallo siempre** — cada fallo publica `importacion.importar.failed`
   con un `motivo` tipado (`url_requerida`, `project_id_requerido`,
   `descarga_fallida`, `descargador_no_configurado`, `archivo_vacio`,
   `falta_3mf`, `registro_fallido`).

## Verificación (test unitario)

Test real: `/opt/enki/modules/importacion-modelo/tests/unit/importacion-modelo__importar.test.js`

Ejecutar:
```bash
cd /opt/enki/modules/importacion-modelo && node tests/unit/importacion-modelo__importar.test.js
```

Casos cubiertos (9):
- `importar .3mf` → descarga, lee metadatos y registra en el catálogo (201 + `importacion.importada`)
- `importar sin url` → 400 + `url_requerida`
- `importar sin descargador` → 503 + `descargador_no_configurado`
- `descargador lanza` → 502 + `descarga_fallida`
- `importar .stl` → 422 + `falta_3mf` (invariante 5)
- `catalogo rechaza` → 502 + `registro_fallido`
- `_buscar` delega a busqueda-repositorios y devuelve resultados (200)
- `_buscar sin query` → 400
- esqueleto: name/version/extends/handlers

El test usa un bus stub que simula RPC request/response: al publicar un
`.request` invoca el handler registrado y publica la `.response` correlada con
el mismo `request_id`; los eventos fire-and-forget se capturan en `emitidos`.

## Estructura del código

- `class ImportacionModeloReflejo extends ModuloHibridoReflejo` (de
  `_shared/modulo-hibrido-reflejo`).
- `this._descargador` — puerto inyectado `{ descargar(url) -> Promise<{archivo, formato}> }`.
- `registrarDescargador(descargador)` — cablea el descargador concreto (puente thin del PC).
- `onImportarRequest(e)` → `_atender(e, 'importar', 'importacion.importar.response', d => this._importar(d))`.
- `_importar(input)` — flujo completo (descarga → detecta formato → lee .3mf → registra).
- `_buscar(input)` — delega a `busqueda-repositorios`.
- `_detectarFormato(archivo)` — por extensión (`.3mf`/`.stl`/`desconocido`).
- `_publicarEvento(evento, data)` — publica en `this.eventBus` con timestamp.

## Pitfalls

- **No persiste nada** — es PUENTE. No esperes store ni `project.activated`.
- **El descargador es inyectado** — sin `registrarDescargador` cableado, toda
  importación falla con `503`. En tests se inyecta un stub.
- **`.stl` no se convierte** — el módulo NO convierte .stl a .3mf; solo avisa
  `falta_3mf`. La conversión es responsabilidad del dueño/slicer.
- **Nombre por defecto `desconocido`** — si no llega `nombre` ni metadatos, se
  registra como `desconocido` (invariante 5, nunca se inventa).
- **Categoría por defecto `sin_categoria`** — si no se pasa, se usa
  `sin_categoria`.
