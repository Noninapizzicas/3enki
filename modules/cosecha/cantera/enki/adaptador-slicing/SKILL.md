---
name: adaptador-slicing
description: Puente al slicer externo (CrealityPrint CLI en el PC del dueño) del proyecto 3D. Slicear .3mf -> gcode y leer metadatos del .3mf. PUENTE stateless: sin store, escucha y delega.
when-to-use: Cuando necesites operar, depurar o extender el módulo adaptador-slicing del proyecto 3D (taller personal de impresión 3D, impresora SPARKX i7). También cuando el ciclo de impresión necesite generar gcode a partir de un .3mf o extraer metadatos de un .3mf en el flujo de importación.
tags: [enki, modulo, puente, 3d, slicing, gcode, crealityprint, 3mf, proyecto-3d]
---

# adaptador-slicing — PUENTE (F5)

Módulo **PUENTE** del proyecto 3D (`e57a318a-b93a-46d9-8ae6-fd5bd0384964`). Traduce la
orden de slicear a una invocación del slicer externo (**CrealityPrint CLI**) que corre en
el **PC del dueño** (bastante RAM), **NUNCA en el VPS**. El puente thin del PC ejecuta la CLI.

- **Forma**: PUENTE (transporta, no decide, no persiste).
- **Input**: archivo `.3mf` (no STL suelto).
- **Output**: `gcode`.
- **Origen**: `plan-construccion.md` §6.9 (FASE 4 construir-modulos), piezas 10.1 (slicear) y 10.2 (leer .3mf).

## Qué hace el módulo

Es un puente stateless hacia el slicer. Recibe la orden de slicear, invoca el slicer por un
puerto inyectado (`slicear(.3mf, perfil) -> gcode`), **valida que el gcode no esté vacío** y lo
entrega para que `cupula-gcode` lo guarde **POR MODELO** (una vez sliceado se reutiliza sin
reslicear). También expone `leer_3mf` (conversor 10.2) para extraer metadatos del `.3mf` en el
flujo de importación.

**No tiene store**: sin PosPersistencia, sin `project.activated`, sin estado. Escucha y delega.

## Contrato de eventos (module.json real)

### Subscribes
| Evento | Handler | Descripción |
|---|---|---|
| `adaptador-slicing.slicear.request` | `onSlicearRequest` | Orden de slicear un `.3mf` con un perfil; invoca el slicer, valida el gcode y lo entrega para guardar en la cúpula. |
| `adaptador-slicing.leer_3mf.request` | `onLeer3mfRequest` | Lee metadatos de un `.3mf` (conversor 10.2); huecos como `desconocido`. |

### Publishes
| Evento | Descripción |
|---|---|
| `adaptador-slicing.slicear.response` | Respuesta correlada del RPC slicear: gcode validado listo para guardar en la cúpula. |
| `adaptador-slicing.leer_3mf.response` | Respuesta correlada del RPC leer_3mf: metadatos del `.3mf`. |
| `adaptador-slicing.slicear.failed` | Par de fallo: el slicer falló, el `.3mf` no existe o el gcode salió vacío/corrupto. |

### RPCs (quién llama)
- `adaptador-slicing.slicear.request` → lo llama **`ciclo-impresion`** (enrutamiento cúpula/slicer).
- `adaptador-slicing.leer_3mf.request` → lo llama **`importacion-modelo`** (flujo de importación).

## Cómo se usa (RPCs)

### `slicear` — generar gcode desde un .3mf
Request: `{ project_id, modelo_id, archivo3mf, perfil }`
- `archivo3mf` (string, obligatorio, no vacío).
- `perfil` (string, opcional; por defecto `'desconocido'`).

Respuesta `200`:
```json
{ "modelo_id": "m1", "archivo3mf": "pieza.3mf", "perfil": "sparkx_i7",
  "gcode": ";GCODE\nG28\nG1 X10 Y10\n", "bytes": 24, "listo_para_cupula": true }
```

### `leer_3mf` — extraer metadatos del .3mf
Request: `{ project_id, archivo }`
Respuesta `200`:
```json
{ "archivo": "pieza.3mf", "metadatos": { "nombre": "Pieza", "autor": "yo",
  "licencia": "desconocido", "material": "PLA", "dimensiones": null } }
```

## Reglas de negocio

1. **Slicing en el PC del dueño, NUNCA en el VPS** — el slicer (CrealityPrint CLI) corre en el
   PC del dueño (bastante RAM). El puente thin del PC ejecuta la CLI. En el VPS no hay slicer real.
2. **Input `.3mf`, no STL suelto** — el slicer necesita `.3mf` (pregunta abierta 13 del plan).
3. **Output `gcode`** — se entrega para que `cupula-gcode` lo guarde **por (modelo, material)**;
   una vez sliceado se reutiliza sin reslicear (invariante 3).
4. **Validar gcode no vacío** — gcode vacío/corrupto no se entrega (invariante 7: el ciclo no
   avanza sin gcode). Motivo de fallo `gcode_vacio`.
5. **Leer metadatos del .3mf** — huecos como `desconocido`, nunca inventados (invariante 5).
6. **Cierre de círculo** — todo fallo publica `adaptador-slicing.slicear.failed` con `motivo`;
   nadie da por hecho un slicing sin `ok:true`/`status:200` (honestidad M11).

### Códigos de error de `slicear`
| status | error | motivo | Cuándo |
|---|---|---|---|
| 400 | `INVALID_INPUT` | `archivo_3mf_requerido` | `archivo3mf` ausente o vacío |
| 503 | `SLICER_NO_CONFIGURADO` | `slicer_no_configurado` | no hay slicer cableado (puente thin del PC) |
| 502 | `SLICER_FALLO` | `slicer_fallo` | el slicer lanzó excepción |
| 502 | `GCODE_VACIO` | `gcode_vacio` | el slicer devolvió gcode vacío/corrupto |

## Puerto inyectado (cableado del puente thin del PC)

El slicer concreto se inyecta con `registrarSlicer(slicer)`:
```js
mod.registrarSlicer({
  slicear: async (archivo3mf, perfil) => ({ gcode: '...' }),   // obligatorio
  leer3mf: async (archivo) => ({ metadatos: { ... } })          // opcional
});
```
- `slicear(archivo3mf, perfil) -> Promise<{gcode}>` — obligatorio.
- `leer3mf(archivo) -> Promise<{metadatos}>` — opcional; si no está, `_leer3mf` devuelve
  metadatos con huecos `desconocido`.

## Verificación (test unitario)

Test: `tests/unit/adaptador-slicing__slicear.test.js` (10 casos, runner propio con `assert`).

```bash
cd /opt/enki/modules/adaptador-slicing
node tests/unit/adaptador-slicing__slicear.test.js
# esperado: adaptador-slicing: 10/10 OK
```

Casos cubiertos:
1. `slicear` devuelve gcode validado listo para la cúpula (200, `listo_para_cupula: true`).
2. `slicear` sin `archivo3mf` → 400 + par de fallo `archivo_3mf_requerido`.
3. `slicear` sin slicer cableado → 503 + par de fallo `slicer_no_configurado`.
4. slicer lanza → 502 + par de fallo `slicer_fallo`.
5. gcode vacío → 502 + par de fallo `gcode_vacio` (invariante 7).
6. `leer_3mf` con lector → metadatos del `.3mf`.
7. `leer_3mf` sin lector → metadatos `desconocido` (invariante 5).
8. `leer_3mf` sin archivo → 400.
9. esqueleto: `name`/`version`/`extends`/handlers.

## Pitfalls

- **No escribir en `/opt/enki/`** — los archivos del módulo son `600` propiedad de `www-data`;
  para leerlos usa `sudo cat`. Nunca modifiques el módulo real desde una skill.
- **No hay slicer en el VPS** — si `_slicer` es `null`, `slicear` responde 503. Es el estado
  esperado salvo que el puente thin del PC esté cableado.
- **El gcode vacío es un fallo, no un éxito** — validar siempre `gcode.trim().length > 0`.
- **`leer_3mf` no falla por falta de lector** — devuelve 200 con metadatos `desconocido`
  (no inventa datos).
