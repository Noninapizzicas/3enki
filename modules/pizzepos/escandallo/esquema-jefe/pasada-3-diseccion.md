# PASADA 3 — disección: forma UI de cada hoja-jefe

> Las hojas de pasada-2 ya son atómicas. Se les asigna su FORMA de captura
> (esquematizador-jefe) y su señal pareada. Una hoja sin señal o sin RPC no sale.

| Hoja | Forma UI | RPC (contrato real, verificado) | Señal |
|---|---|---|---|
| H1 costear lote | inline-gesture (botón en cinta) | `recalcular_lote {}` → {costeadas[], sin_precio[], terminado} | N× `escandallo.coste.calculado` → debounce |
| H2 costear siguiente | inline-gesture (botón en cinta) | `recalcular_siguiente {}` → {costeada, faltan, terminado} | 1× `escandallo.coste.calculado` |
| H3 costear una | inline-gesture sobre fila (regenerar) | `costear {receta_id, persistir:true}` → dictamen + persiste | 1× `escandallo.coste.calculado` |
| H4 ref-select de receta + cinta | ref-select + cinta-estado | `recetas.listar {estado:'en_servicio'}` → ítems con coste_unidad | re-lee en `escandallo.coste.calculado` (debounce 60ms) |
| H5 **tabla-cálculo** (FORMA CLAVE) | tabla-cálculo legible | `recetas.obtener {receta_id}` → lineas[] + lineas_detalle[] + costes | `escandallo.coste.calculado` (misma receta = re-render) |
| H6 sin precio | cinta-estado secundaria (badge) | (viene en obtener/list: `lineas_sin_precio[]`) | — (parte del dictamen) |
| H7 validar dictamen | confirmador-nombrado | `validar {receta_id}` → {valid, errors[], precios_estimados[]} | — (dictamen en respuesta) |
| H8 escalar | editor-bloque (pequeño) | `escalar {receta_id, diametro_origen, diametro_destino}` → factores + coste derivado | — (no persiste: la respuesta ES la confirmación) |

## Detalle de la FORMA CLAVE — H5 tabla-cálculo

Una fila por línea de la receta (orden del costeo: masa/salsa/base → pizza):

```
┌──────────────────────────────────────────────────────────────────────┐
│ NOMBRE                                   CANT   €/UD      COSTE  PESO │
│ masa madre (sub_receta)                  820 g   0,0063 €  5,17 €  48% │
│ tomate San Marzano (catálogo)            400 g   0,0045 €  1,80 €  17% │
│ mozzarella (catálogo)                    250 g   0,0120 €  3,00 €  28% │
│ albahaca (SIN PRECIO)                    10 g      —         —      —   │
├──────────────────────────────────────────────────────────────────────┤
│ COSTE TOTAL pizza                                9,97 €   (rinde 2)  │
│ COSTE POR PORCIÓN                                4,98 €               │
└──────────────────────────────────────────────────────────────────────┘
```

- cada fila rescata: `nombre · {cantidad}{unidad} · {precio_unitario} € ·
  {valor_calculado} € · {fuente} · % = valor/coste_total`
- el % SE MUESTRA en fila (viene del dictamen `valor_calculado` y del total —
  el porcentaje es presentación de datos del dictamen, no un cálculo de negocio)
- nota de límite: el porcentaje por línea es aritmética de PRESENTACIÓN
  (dividir para comparar filas); toda cifra de coste viene del dictamen.
- si el peso % se quisiera ya en el shape, es mejora de módulo, no del panel.

## Elementos → necesidades del jefe (anatomía resumida)

- pulso del lote → cinta-estado (H4-cinta)
- elegir receta → ref-select (H4)
- disparar costeo → inline-gestures H1/H2/H3 (+ señal de dictamen)
- leer la aritmética → tabla-cálculo H5 + cinta sin-precio H6
- fiar el número → confirmador-nombrado H7
- comparar tamaños → editor-bloque H8

## Fuera del árbol del jefe (sacadas por el árbitro, no calladas)

- util-consumo del coste en la venta (POS/tarifas) — UTILIZACIÓN
- edición de precios del catálogo (`ingredientes`) — JEFE de otro módulo
- edición de recetas/cantidades (`recetas`) — JEFE de otro módulo