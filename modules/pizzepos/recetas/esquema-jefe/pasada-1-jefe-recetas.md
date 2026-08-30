# PASADA 1 — la cara del JEFE de `recetas` (el RECETARIO, origen del coste)

> Método esquematizador-jefe, lente de ROL JEFE (fase 1 del ciclo v2). Fuente de
> verdad del ciclo: `modules/pizzepos/recetas/index.js` (reflejo-1.3.0, leído
> completo) + `module.json` v2.2.0 + `receta.schema.json` (el FRENO) +
> `recetas.blueprint.json` agéntico v2.9.0 (la cara FUZZY viva en el chat) +
> relación con escandallo (`escandallo.coste.calculado` entra, `recetas.listar
> {incluir_lineas:true}` alimenta su cola).
>
> Ley de agnosticismo: cero tecnología de sistema ambiente. La utilización
> (POS/PWA eligen receta al vender; cocina la ejecuta) queda FUERA, anotada.

## 0. El árbitro (regla antes que veredictos)

```
¿la op decide el FUTURO del dominio (qué existe, cómo se hace cada pizza)?
        → JEFE
¿la op EJECUTA algo ahora (calcular, disparar, vender)? → UTILIZACION
¿solo lee / informa?                                    → NEUTRO
```

Aplicación op por op (todas las del reflejo verificado; el blueprint agéntico
declara 15, el reflejo materializa 5 + 1 subscriber — las demás son del LLM):

| op reflejada | canal | veredicto | por qué |
|---|---|---|---|
| `crear` | `recetas.crear.request` (ui_handler, index.js L186-282) | **jefe** | ES la definición del negocio: da de alta CÓMO se hace cada pizza (líneas ingrediente×cantidad). Existe reflejo con ui.Handler → jefe AQUÍ, en el reflejo (el blueprint fuzzy normaliza lenguaje natural y DELEGA el guardar aquí — v2.7). |
| `validar` | `recetas.validar.request` (L112-129) | **jefe** | EL FRENO del propio crear: juzga la forma contra `receta.schema.json` (AJV, función pura). El jefe lo opera directamente para saber si su borrador cumple el contrato antes de guardar. |
| `listar` | `recetas.listar.request` (L37-65) | neutro | lectura (proyección) que alimenta decisions propias y a escandallo. |
| `ingredientes` | `recetas.ingredientes.request` (L67-74) | neutro | catálogo para resolver `ref` de líneas (lectura). |
| `obtener` | `recetas.obtener.request` (L76-95) | neutro | ficha completa 1 receta ( Lectura; sin history). |

Los que NO tienen reflejo y NO entran en esta cara: `buscar`, `historial`,
`revertir`, `eliminar`, `cambiar_estado`, `estadisticas`, `actualizar_precio`
(cajon:false → walled en escandallo, v2.2), `analizar` (idem), `investigar_receta`
(fuzzy de páginas hermanas), `_aplicar_coste_calculado` (interna) — sin op real
del reflejo detrás HOY: suscribirlos o dotarlos de forma sería inventar [ABIERTO
cara editar/actualizar — ver huecos].

## 1. Quién es el jefe y qué decide

Dueño del RECETARIO: la definición de cómo se hace cada cosa que se elabora.
Una receta es { nombre, tipo, rinde, lineas[] } donde cada línea es
ingrediente × cantidad exacta con unidad canónica (g|ml|ud). Decide:

- **D1 — CREAR receta** (la pieza nueva: la Margherita, la masa nonina, la
  salsa Victorino): da nombre, tipo y las líneas con sus cantidades → `crear`.
  `ref` puede apuntar a ingrediente del catálogo O a otra receta (sub-receta:
  la pizza referencia la masa — un solo mecanismo).
- **D2 — VALIDAR la forma** (el FRENO antes de creer que guardó): comprobar el
  borrador contra el contrato (`receta.schema.json`, AJV) — mata la línea hueca
  (cantidad 0, nombre vacío, unidad no canónica) SIN prohibir el borrador → `validar`.

Lo que NO decide:
- **el COSTE** — lo deriva escandallo (`escandallo.coste.calculado` entra aquí
  como persist write; `coste_unidad`/`lineas_detalle` son campos ESCRITOS por
  escandallo, la UI los MUESTRA pero el jefe no los edita aquí).
- **actualizar/editar una receta existente** — la op existe en el blueprint
  agéntico (L469-496: fs.edit + history bump + freno) pero NO tiene reflejo ni
  ui_handler hoy [ABIERTO: cara editar].
- consumir recetas en la venta (POS) ni ejecutarlas en cocina (utilización).
- el catálogo de ingredientes que alimenta el `ref` (módulo `ingredientes`).

## 2. Lo que alimenta (por esto el recetario es el ORIGEN del coste)

- `listar {incluir_lineas:true}` → lo consume **escandallo** para costear
  (cola reanudable) — recetas `{incompleta, coste_unidad}` es literalmente su
  cola de trabajo.
- `crear`/`escandallo.coste.calculado` → publican señales que re-ordenan esa
  cola (`receta.creada` nace incompleta; `receta.actualizada` confirma coste
  aplicado con `campos_actualizados`).
- El `rinde` conecta coste_total ↔ coste_unidad (coste por unidad = lo que
  después mira viabilidad para el margen).

## 3. Primer inventario de gestos y formas

| Gesto del jefe | Forma candidata | op | señal |
|---|---|---|---|
| elegir la receta de trabajo | ref-select (de listar) | — | — |
| ver el RECETARIO (tabla de líneas) | tabla línea×cantidad (leer) | listar | — |
| alta de receta | editor-bloque (líneas editables) | crear | receta.creada |
| freno de forma | informe/dictamen | validar | respuesta del propio RPC (función pura, SIN señal) |
| pulso de costes de escandallo | cinta-estado | listar | receta.actualizada |

Siguiente pasada: disecar cada forma a gesto atómico (pasada-2).