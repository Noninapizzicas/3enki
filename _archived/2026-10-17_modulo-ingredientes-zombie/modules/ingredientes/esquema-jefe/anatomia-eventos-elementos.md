ANATOMÍA DE EVENTOS Y ELEMENTOS — módulo ingredientes (pizzepos v5.0.0)
Fuente: modules/pizzepos/ingredientes/module.json + index.js (leídos completos).

EVENTOS PUBLICA:
  ingrediente.creado     → desde sync (carta.actualizada / producto.creado). NO lo emite ninguna op del jefe.
  ingrediente.actualizado → lo emiten update (1×) y update_precios (N×, 1 por ingrediente dentro del for). Es LA señal del jefe.

EVENTOS ESCUCHA:
  project.activated            → carga catálogo desde disco.
  carta.actualizada            → siembra/sincroniza catálogo (externa).
  producto.creado              → registra ingredientes del producto (externa).
  ingrediente.actualizado      → loop-safe externo (compara valores); el módulo se escucha a sí mismo.

UI HANDLERS (9) — shape real verificado en index.js:
  list            {grupo?, tipo?, alergeno?}          → {ingredientes[], total}  · ficha COMPLETA en cada ítem (precio_extra, es_alergeno, alergenos[], grupos[], tipo, disponible) · sort: tipo asc, nombre asc
  get             {id}                                 → ingrediente | 404
  get_precio      {ingrediente_id}                     → {ingrediente_id, precio_extra, disponible}  · NO trae "consumido por N productos"
  search          {q, grupo?}                          → {resultados[], total, query}
  alergenos       {}                                   → {alergenos[], total, por_tipo{tipo:[{id,nombre,emoji}]}}
  update          {id, ...updates}                     → 200 {ingrediente} + 1× ingrediente.actualizado con cambios{k:{anterior,nuevo}}  · acepta cualquier campo del ingrediente (nombre, familia, es_alergeno, alergenos, precio_extra, ...)
  update_precios  {id|tipo|grupo? , precio_extra|porcentaje} → 200 {actualizados[]{id,nombre,anterior,nuevo}, total} + N× ingrediente.actualizado (1 por afectado)  · NO acepta [{id,precio}...]  · porcentaje COMPUESTO sobre vigente (Math.round(x*(1+p/100)*100)/100 → EUROS float 2dec)
  health          {}                                   → {status, module, version, catalogo:{total, alergenos, por_tipo, por_grupo}}
  metrics         {}                                   → {gauges:{total, alergenos}, por_tipo, por_grupo}

ERRORES CANÓNICOS:
  400 INVALID_INPUT (falta id / precio_extra|porcentaje / q) · 404 RESOURCE_NOT_FOUND (id no existe / filtro sin matches) · 500 UNKNOWN_ERROR.

ELEMENTOS → NECESIDADES DEL JEFE:
  precio_extra por ingrediente → GESTO DIARIO → inline-gesture (H1)
  nombre/familia/alérgenos     → CORRECCIÓN RARITA → editor-bloque (H2)
  retar costes en bloque       → OPERATIVA EPISÓDICA GRUESA → editor de LOTE (H3)
  alcance grupo/todo           → ref-select (H4)
  pulso del catálogo           → cinta-estado (H5/H7)
  confirmación de declaración  → señal-refresh pareada (ingrediente.actualizado, N× en lote → debounce)

CARAS AL MÓDULO QUE NO SON DE ESTE PANEL:
  motor-opciones consume precios en la venta (utilización, fuera)
  carta-manager/menu-generator siembran el catálogo (sistema, fuera)