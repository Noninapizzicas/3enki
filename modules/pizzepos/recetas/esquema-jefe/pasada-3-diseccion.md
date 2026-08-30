# PASADA 3 — disección fina (elementos, señales hoja a hoja, formas atómicas)

> Tercera pasada del esquematizador-jefe: de la lista de hojas (pasada-2) a la
> DISSECCIÓN — cada hoja se parte en elementos atómicos y cada gesto se pareo
> con su señal real. Es la contratista del blueprint-interfaz y del panel F7.

## Anatomía de eventos y elementos (hoja por hoja)

### H·CINTA — pulso del recetario (informe)

- forma: cinta-estado (siempre visible arriba).
- elementos: chips derivados de la ÚLTIMA lectura `listar` —
  `n recetas · n con coste · n incompletas` (+ estado de canal en vuelo).
- NO lleva RPC propio: es proyección de los datos ya leídos (R2: la cinta no
  asume, muestra lo leído).
- señal que la refresca: `receta.creada` (alta) + `receta.actualizada`
  (coste aplicado por escandallo) → re-lectura con debounce 60ms.

### H·SELECTOR — receta de trabajo (ref-select)

- elementos: select con las recetas del estado visible (borrador+en_servicio
  combinables o por estado) + chip de estado de cada una (`incompleta`,
  `sin coste`).
- al elegir → alimenta H·RECETARIO y H·FICHA (no es gesto de mutación).
- RPC: `recetas.listar` (re-lectura barata, include líneas).

### H·RECETARIO — la TABLA del recetario (informe)

- elementos: por receta seleccionada, tabla de líneas
  `nombre × cantidad + unidad` (+ notas) y cabecera `{tipo, rinde, version,
  estado_operativo}`; pie con `coste_unidad` si escandallo ya la costeó.
- RPC: `recetas.obtener {receta_id}` para la ficha; `listar` ya trae las
  líneas si se pidieron con `incluir_lineas:true`.
- señal: ninguna propia — el refresh llega por las señales del módulo.

### H·CREAR — editor-bloque de receta (la forma GRANDE)

- elementos:
  - inline: nombre (dedup por nombre activo → 409) + tipo (slug, datalist) +
    rinde (cantidad>0 + unidad ud|g|ml, opcional por tipo).
  - tabla de líneas dinámica: ref (ref-select del catálogo `recetas.ingredientes`),
    cantidad (>0), unidad (g|ml|ud), notas; botón añadir/quitar línea.
  - dictamen del FRENO en vivo: `recetas.validar` al editar →
    `valid`/`errors[].path` clicables en su fila (sin tocar el store).
- transición CREAR: `recetas.crear` → 201 dictamen
  `{receta_id, nombre, tipo, estado_operativo, incompleta, campos_pendientes,
  lineas_count}` · 409 ALREADY_EXISTS (nombre activo, `existing_id`) ·
  503 UPSTREAM_UNREACHABLE («NO guardada» — el reflejo NO emite `receta.creada`
  si no verificó el aterrizaje).
- señal pareada: `receta.creada {receta_id, nombre, version,
  estado_operativo, firma}` (L271 — solo se emite TRAS verificar aterrizaje:
  doble confirmación dictamen+señal, nunca optimismo).

### H·FRENO VALIDAR (informe bajo el editor)

- RPC: `recetas.validar {receta}` → SIEMPRE 200 `{valid, errors[]{path,
  keyword, message}}` (AJV contra receta.schema.json).
- SIN señal (función pura): el dictamen es la respuesta — no se fabrica pareo.
- uso en el panel: validación en vivo del editor + botón CREAR frena si
  `valid:false` (el error se muestra nombrado, no coaccionado).

## Señales del módulo (pareado hoja a hoja, verificadas en index.js)

| declaraciones | señal pareada | origen | granularidad |
|---|---|---|---|
| `crear` | **receta.creada** (1×) | index.js L271 tras verificar persistencia; trae `firma` de forma (masa/base/queso/toppings) | 1 evento |
| (coste de escandallo entra) | **receta.actualizada** (1×) | index.js L306 — `onCosteCalculado`, `campos_actualizados` y `origen:'escandallo.coste.calculado'` | 1 por coste aplicado |
| `listar/obtener/ingredientes` | — (lecturas) | — | — |
| `validar` | — (respuesta del RPC; función pura) | — | — |

- El panel también escucha `escandallo.coste.calculado` INDIRECTA: si el coste
  cambia por fuera (lote de escandallo), la tabla muestra el coste nuevo al
  re-leer. No fabrica confirmación: solo refresca lecturas.

## Composición final de la vista (3 capas)

```
1. INFORMARSE   cinta (n · con coste · incompletas) + selector + TABLA del
                recetario (líneas ingrediente×cantidad) con coste si existe
2. DECLARAR     CREAR receta: editor-bloque (nombre/tipo/rinde + líneas
                dinámicas) con el FRENO validar en vivo (errors[].path)
3. CONFIRMAR    dictamen de la respuesta (201/409/503 nombrados) + señal
                receta.creada que re-confirma (debounce 60ms, sin recarga)
```

## Huecos que quedan [ABIERTO] (del dueño, no suplidos)

- [ABIERTO] cara EDITAR receta existente (update tiene pseudocódigo en el
  blueprint agéntico L469-496 — history bump + freno — pero SIN reflejo ni
  ui_handler hoy). Si llega su reflejo, nueva pasada de disección.
- [ABIERTO] eliminar/archivar/cambiar_estado en UI (sin reflejo; hoy via chat).
- [ABIERTO] alta del catálogo de ingredientes desde este panel (el `ref` nuevo
  sin entrada hoy exige chat/ingredientes; el editor sugiere, no crea).
- [ABIERTO] instrucciones/notas/descripción del editor (el reflejo las guarda
  tal cual: array de pasos o string — forma aún sin decidir por el dueño).
- [ABIERTO] sub-recetas en el editor (crear la masa desde aquí vs ir a
  crear tipo=masa primero: hoy el editor referencia por ref existente).