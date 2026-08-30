# ESQUEMA — cara del JEFE del módulo `escandallo` (pizzepos, v2.3.0)

> Árbol maestro consolidado (pasadas 1-3). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE — la utilización (POS/venta) quedó fuera. Módulo atípico:
> NO EScribe reglas — el jefe LEE el coste (dictamen del motor) y DISPARA costeos.

## 1. Quién es el jefe y qué decide

Dueño de la lectura del food-cost. Su primera decisión es de INFORMACIÓN, no de
escritura: "¿cuánto me cuesta esta pizza y me deja margen?". Decide:
- **D1** disparar el costeo (lote, siguiente, uno) para regenerar el dictamen —
  `recalcular_lote`, `recalcular_siguiente`, `costear`
- **D2** leer y juzgar: coste por porción, desglose línea a línea, honestidad
  (sin precio / dictamen de validez) — `recetas.listar/obtener` + `validar`
- **D3** derivar el coste a otro diámetro (masa×diámetro, resto×área) — `escalar`

Lo que NO decide aquí: precios de venta, margen objetivo (no existen — [ABIERTO]),
precios del catálogo (`ingredientes`), cantidades (`recetas`), la venta (POS).

## 2. Invariantes (restricciones honestas)

- INV1 — **el coste es un DICTAMEN del motor, no de la UI**: la UI lo muestra,
  jamás lo calcula (salvo % de presentación por fila, ver pasada-3 H5).
- INV2 — **moneda EUROS**: `coste_total` € 2dec; `coste_unidad` € a 6 dec
  (precisión de sub-recetas). La UI muestra €, sin céntimos.
- INV3 — **sin op de escritura**: los 5 ui_handlers son lecturas/computo
  (`costear`, `escalar`, `recalcular_siguiente`, `recalcular_lote`, `validar`);
  el único evento publicado es `escandallo.coste.calculado` (al persistir).
- INV4 — **la persistencia vive en la receta** (coste_total, coste_unidad,
  lineas_detalle, lineas_sin_precio, fuentes_precios) — el escandallo no tiene
  store propio; la UI lee por el reflejo de `recetas`.
- INV5 — **el escalado NO persiste**: derivación transitoria; confirmación =
  la propia respuesta RPC (única hoja sin señal — nombrado).
- INV6 — **freno de evidencia**: `validar` juzga procedencia (precio inventado ≠
  coste) + aritmética; es función PURA (dictamen en la respuesta).
- INV7 — **honestidad**: `lineas_sin_precio` ≠ error: es el costeo diciendo qué
  ingrediente no tiene precio en catálogo (se reta en `ingredientes`, aquí no).

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal | Granularidad |
|---|---|---|
| `costear {receta_id, persistir}` | `escandallo.coste.calculado` | 1× |
| `recalcular_siguiente` | `escandallo.coste.calculado` | 1× |
| `recalcular_lote` | `escandallo.coste.calculado` | **N× (1 por receta)** |
| `escalar` | — (no persiste) | respuesta = confirmación |
| costeo externo (otra ventana/agente) | `escandallo.coste.calculado` | re-lee igual |

### ANATOMÍA DE EVENTOS Y ELEMENTOS (fuente: module.json + index.js completos)

```
PUBLICA: escandallo.coste.calculado — {project_id, receta_id, coste_total,
  coste_unidad (6dec), coste_actualizado_at, fuentes_precios, lineas_detalle,
  lineas_sin_precio, correlation_id, timestamp}. Lo emiten _persistir (después de
  recalcular_siguiente/recalcular_lote/costear-con-receta). ESCALAR NO EMITE.

ESCUCHA (subscribes): escandallo.costear.request · escandallo.escalar.request ·
  escandallo.recalcular_siguiente.request · escandallo.recalcular_lote.request ·
  escandallo.validar.request  (los 5 reflejo JS; ningún .request llega a LLM)

SHAPES DE RESPUESTA (verificados):
  costear  {receta_id?|lineas+rinde, persistir?} → 200 {coste_total, coste_unidad,
           rinde, lineas_detalle[{ref,nombre,cantidad,unidad,precio_unitario,
           valor_calculado,fuente}], lineas_sin_precio[], fuentes_precios[]}
  escalar  {receta_id?|lineas, diametro_origen=33, diametro_destino} → 200
           {diametro_origen, diametro_destino, factor_masa, factor_area,
           lineas_escaladas[{ref,nombre,cantidad,unidad,es_masa}], rinde,
           coste_total, coste_unidad, lineas_sin_precio, fuentes_precios}
  recalcular_siguiente {solo_pendientes?=true} → 200 {terminado, faltan,
           costeada{receta_id,nombre,coste_unidad,lineas_sin_precio}, siguiente}
  recalcular_lote {solo_pendientes?=true} → 200 {costeadas[], total_costeadas,
           sin_precio[], terminado}
  validar  {costeo|resultado} → 200 {valid, errors[{code,path,message}],
           precios_estimados[], lineas_costeadas}
  errores canónicos: 400 INVALID_INPUT · 404 RESOURCE_NOT_FOUND · 500 UNKNOWN

FUENTE DE RECETAS (reflejo recetas, ui_handlers verificados):
  recetas.listar  {estado='en_servicio', limit=50, incluir_lineas?} →
                  {total, recetas[{receta_id, nombre, tipo, rinde, lineas_count,
                  incompleta, estado_operativo, updated_at, [lineas, coste_unidad]}]}
  recetas.obtener {receta_id|nombre} → receta COMPLETA (≈ todos los campos):
                  id, nombre, tipo, rinde, lineas[{ref,nombre,cantidad,unidad}],
                  coste_total, coste_unidad, lineas_detalle[], lineas_sin_precio,
                  fuentes_precios, coste_actualizado_at, estado_operativo...
  (¡NO trae precio_venta ni margen — no existen en el shape!)
```

## 4. Composición de la vista del jefe

```
1. SELECCIONAR  ref-select receta (de recetas.listar estado en_servicio, incluir_lineas)
2. INFORMARSE   cinta-estado (n recetas · n escandalizadas · coste medio/porción
                · n líneas sin precio) + LA TABLA-CÁLCULO (H5) de la receta elegida
3. DECLARAR     costear: inline-gestures (lote H1 · siguiente H2 · regenerar H3)
                derivar: editor-bloque escalar H8 · fiar: validar H7
```

+ principios: frecuencia→jerarquía (lectura diario, costear por épocas, validar/
escalar raros) · la señal manda (`escandallo.coste.calculado` re-lee, debounce
absorbe el tándem N×1 del lote; nunca recarga) · el informe distingue origen
(fuente de cada línea: catálogo/sub_receta/sin precio; dictamen ≠ estimación).

## 5. Huecos [ABIERTO] (decisiones del dueño — nombradas, no suplidas)

- [ABIERTO] **margen objetivo** (por receta o global): NO existe en ningún shape
  (verificado en recetas/escandallo). El panel del jefe muestra el coste y su
  desglose; cualquier "% sobre objetivo" es hoy NO calculable sin inventar.
- [ABIERTO] **umbral de food-cost sano** (25-33% es heurística del panel viejo,
  no regla del dominio).
- [ABIERTO] **precio de venta de referencia** por receta (vive fuera — carta/
  tarifas; puente por definir).
- [ABIERTO] política de caducidad del coste (¿re-costear cuándo?).

## 6. Fuera del árbol del jefe

Venta y precios de venta (POS/tarifas — UTILIZACIÓN) · edición de ingredientes
(panel propio del JEFE en `ingredientes`) · edición de recetas (`recetas`) ·
módulo entero como "cara POS" (aquí no existe).

## 7. Nota para el panel (lo que la UI NO debe inventar)

El margen (€ o %) y el "% sobre objetivo" NO vienen en ningún shape real
(recetas.listar/obtener no traen precio_venta; escandallo no lo calcula sin
precio de venta). La cinta se compone SOLO de lo que hay: recetas ·
escandalizadas · coste medio. Si el jefe quiere margen, la vía honesta es la
[ABIERTO] de negocio, no un número inventado en cliente.