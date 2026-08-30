# PASADA 2 — recursión: cada decisión-jefe baja hasta hoja con señal

> Sale de pasada-1 (5 preguntas). Cada decisión del jefe se baja hasta que la hoja se
> puede dibujar. Regla: una hoja sin señal pareada (o sin justificar su ausencia) no
> está madura. El árbitro separa: declarar-reglas/config → JEFE · ejecución en venta →
> UTILIZACIÓN (fuera) · solo lee → NEUTRO.

## D1 — ¿qué receta costea y cuándo?

```
D1 costeo
├─"disparar el costeo de TODO lo pendiente" (el gesto grueso: 1 toque, sin navegación)
│   → hoja H1: botón "costear lote" → recalcular_lote {} (batch: todas las pendientes)
│     SEÑAL: N× escandallo.coste.calculado (1 por receta) → re-lectura con debounce
│     RESPUESTA: {costeadas[]{receta_id,nombre,coste_unidad,lineas_sin_precio},
│                 total_costeadas, sin_precio[], terminado}
├─"ir costeando una a una" (control fino, estrecho)
│   → hoja H2: botón "costear la siguiente" → recalcular_siguiente {}
│     SEÑAL: 1× escandallo.coste.calculado
│     RESPUESTA: {costeada{...}, faltan, terminado, siguiente}
├─"costear UNA receta que me interesa ahora" (dirigida)
│   → hoja H3: gesto sobre una receta del listado → costear {receta_id, persistir:true}
│     SEÑAL: 1× escandallo.coste.calculado
│     (variante sin persistir: costear con {'lineas','rinde'} — propuesta no guardada;
│      existe en el contrato, no es flujo del panel del jefe hoy)
└─"regla de cuándo re-costear" (coste caducado, precios subidos)
    → sin op que lo soporte → [ABIERTO] política de caducidad del coste (pasada-1)
```

## D2 — ¿mi food-cost está sano?

```
D2 lectura de coste
├─"el pulso SIN navegar" (lo primero que mira al abrir)
│   → hoja H4: cinta-estado
│     FUENTE: recetas.listar {estado:'en_servicio', incluir_lineas:true} — SOLO con
│     incluir_lineas cada ítem trae coste_unidad (si ya fue costeada) → derivar local:
│     n recetas · n escandalizadas (coste_unidad>0) · coste medio por porción
│     (lineas viene también — costo menor). LO QUE NO VIENE: margen objetivo,
│     precio de venta, % sobre objetivo, lineas_sin_precio agregadas → [ABIERTO]
├─"LA TABLA-CÁLCULO de una receta: ingrediente × cantidad = coste"
│   → hoja H5 (LA FORMA CLAVE del módulo): tabla legible, una fila por línea:
│       nombre · cantidad unidad · precio unitario (€, ya convertido) ·
│       fuente (catálogo/sub_receta/sin precio) · coste de línea · peso % sobre total
│     FUENTE: recetas.obtener {receta_id} → receta COMPLETA con lineas[],
│       lineas_detalle[], coste_total, coste_unidad, lineas_sin_precio
│     (costear {receta_id, persistir:false} existe como refetch del dictamen fresco)
├─"las líneas que quedaron sin precio" (honestidad)
│   → hoja H6: cinta secundaria/badge en la tabla: lineas_sin_precio[] →
│     "falta precio de N ingredientes" (el señalamiento empuja a retar el precio
│     en el módulo de ingredientes, NO aquí)
└─"¿puedo fiar el número?" (el freno)
    → hoja H7: gesto "validar" → validar {receta_id (o costeo)} →
      RESPUESTA: {valid, errors[], precios_estimados[], lineas_costeadas}
      (op neutra-dictamen: JUZGA, no escribe)
```

## D3 — ¿qué pasa si cambio el tamaño?

```
D3 derivación por superficie (conversor puro, NO persiste → sin señal)
└─"escalar a otro diámetro para comparar"
    → hoja H8: editor-bloque pequeño (receta + diámetro origen/destino) →
      escalar {receta_id, diametro_origen, diametro_destino} →
      RESPUESTA: {factor_masa, factor_area, lineas_escaladas[], coste_total, coste_unidad}
      Confirmación = la propia respuesta (no hay señal porque no persiste —
      justificación nombrada en pasada-3)
```

## D4 — decisiones que NO son de este panel (árbitro las saca)

| Pieza tentadora | Veredicto del árbitro | Destino |
|---|---|---|
| retar precio de un ingrediente (baja el coste) | escribe reglas del catálogo → JEFE, pero de OTRO módulo | panel `ingredientes` (este panel solo muestra el efecto tras evitar/re-costear) |
| poner precio de venta / margen objetivo | no existe op (ni en este ni aún en carta/tarifas para receta) | [ABIERTO] pasadas-1 |
| vender la pizza (usar el coste) | UTILIZACIÓN | POS/tarifas — fuera del árbol |
| editar las cantidades de la receta | escribe la receta → módulo `recetas` | panel `recetas` |

## Consecuencia de frecuencia → jerarquía

- Diario: mirar cinta + tabla de una receta → vista, siempre visibles.
- Por épocas (suben precios): costear lote → gesto destacado.
- Raro: escalar, validar → modal/editor-bloque pequeño.
- NINGÚN gesto de declaración escribe reglas aquí: el módulo es un "sala de lectura
  del coste" — su única señal vive en el evento de dictamen.