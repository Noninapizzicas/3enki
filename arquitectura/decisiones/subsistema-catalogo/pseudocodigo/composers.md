# `composers` — pseudocódigo (frontend; autocontenidos; tasan contra la carta del canal)

> **Naturaleza:** frontend (componentes). D3: cada composer es **autocontenido** (su lógica + su regla
> de precio + su capa de imagen). Tira de `carta_efectiva(canal)` y **tasa contra ella** → emite
> `item.compuesto` con `precio_final`. **Puerta abierta:** un tipo nuevo = un composer nuevo, sin tocar
> el núcleo. comandero confía (no re-tasa).

## Contrato común

```
INTERFACE Composer:
  async cargar(canal):                       # LA CLAVE de la correctitud: pull de la carta del canal activo
     carta_id ← await mqttRequest('tarifas','resolverCarta',{ project_id, canal })
     this.carta ← (await mqttRequest('carta-manager','get',{ project_id, carta_id })).carta
  componer(elecciones) → emit item.compuesto # aplica SU regla sobre this.carta + pinta capa_imagen

# emite: item.compuesto { project_id, cuenta_id, canal, tipo, regla_precio, componentes, precio_final, capa_imagen }
# REGLA TRANSVERSAL: el precio SIEMPRE sale de this.carta (la del canal). Cero precio_override ciego.
#                    Mesa y delivery dan el MISMO número correcto por construcción.
```

## Composer base — `ProductoBtn` (entero / partido)

```
CLASS ProductoBtn implements Composer:
  layout ← (producto.tiene_variaciones ?? (producto.ingredientes.length > 0)) ? 'partido' : 'entero'
  ▸ entero (tap en todo el botón):
       precio_final ← this.carta.producto[id].precio_base        # del CANAL (no del catálogo general)
       emit { tipo:'entero', regla_precio:'producto', componentes:{ producto_ids:[id] }, precio_final }
  ▸ partido (doble zona): izquierda 'íntegro' = entero ; derecha '+/-' = handoff → VariacionesComposer(producto)
```

## `VariacionesComposer` — la unidad "partido" reutilizable

> Es la lógica del botón **partido** aislada como composer reutilizable: carga un producto de la
> carta del canal, deja quitar/añadir contra el catálogo por familia, y resuelve `base + Σ extras`.
> Lo usan: el `ProductoBtn` partido (handoff +/-) **y** `MitadMitad` (una por mitad).

```
CLASS VariacionesComposer implements Composer:
  →deps: { carta(del canal), producto_id }
  ▸ getPanel():                              # lo que pinta el panel de variaciones
      prod ← this.carta.producto[producto_id]
      v ← await mqttRequest('variaciones','getVariacionesProducto',{ project_id, producto:prod, canal })
      return { quitables:prod.ingredientes, anadibles_por_familia:v.anadibles_por_familia, max_extras:v.max_extras }
  ▸ resolver():                              # estado configurado de ESTA pizza/mitad
      base  ← this.carta.producto[producto_id].precio_base                 # del CANAL
      extra ← Σ this.carta.precio_extra[ing_id]  para ing_id EN this.extras
      return { producto_id, quitados:this.quitados, extras:this.extras, base, extra_total:extra }
  ▸ componer():                              # cuando se usa SOLO (partido de un producto)
      h ← resolver()
      emit { tipo:'variado', regla_precio:'base_mas_extras', componentes:{ producto_ids:[h.producto_id], quitados:h.quitados, extras:h.extras },
             precio_final: h.base + h.extra_total }
```

## `MitadMitadComposer` — COMPOSITE de dos mitades partido

> No reimplementa nada: **compone dos `VariacionesComposer`** (una por mitad). Cada mitad es una
> pizza configurable con toda la lógica del partido (quitar/añadir). Reuso puro (mantenimiento en un sitio).

```
CLASS MitadMitadComposer implements Composer:
  state: { half_izq: VariacionesComposer, half_der: VariacionesComposer }   # ambas sobre this.carta (canal)

  ▸ elegirMitad(lado, producto_id):          # abre el flujo partido de esa mitad
      this['half_'+lado] ← new VariacionesComposer(this.carta, producto_id)  # MISMA lógica del botón partido

  ▸ componer():
      hi ← half_izq.resolver()    # { producto_id, quitados, extras, base, extra_total }   ← variaciones REUSADO
      hd ← half_der.resolver()
      # ── REGLA 'mitad_max_configurada' (DECIDIDA) ──
      #   · medio precio_extra por topping (es media pizza)
      #   · la pizza vale la mitad CONFIGURADA más cara (max de las dos, ya con sus extras)
      half_total(h) ← h.base + Σ( this.carta.precio_extra[ing] / 2  para ing EN h.extras )   # medio extra en media pizza
      precio_final  ← max( half_total(hi), half_total(hd) )
      precio_final  ← redondear_cents(precio_final)                                          # /2 puede dar medio céntimo
      emit { tipo:'mitad', regla_precio:'mitad_max_configurada',
             componentes:{ mitades:{ izquierda: hi, derecha: hd } },   # cada mitad CONFIGURADA (producto+quitados+extras)
             precio_final, capa_imagen:{ nombre_compuesto:'½ '+nombre(hi)+' + ½ '+nombre(hd) } }
```

## `AlGustoComposer`

```
CLASS AlGustoComposer implements Composer:
  ▸ componer({ base_id, extras:[ing_id] }):
      base  ← this.carta.producto[base_id].precio_base                  # del CANAL (NO 8.00 hardcodeado)
      extra ← Σ this.carta.precio_extra[ing_id]   (o mqttRequest('ingredientes','catalogo'))
      precio_final ← base + extra                                       # regla 'base_mas_extras'
      emit { tipo:'al_gusto', regla_precio:'base_mas_extras', componentes:{ producto_ids:[base_id], extras }, precio_final }
```

## `PorcionesComposer`

```
CLASS PorcionesComposer implements Composer:
  ▸ componer({ cantidad }):
      precio_final ← regla_porciones(cantidad, this.carta.config_porciones)   # cada 4 = media; sueltas = 3 — desde config del CANAL, no hardcode
      emit { tipo:'porcion', regla_precio:'porciones', componentes:{ cantidad }, precio_final }
```

## Encaje · aterrizaje

```
encaje: D3 — composer autocontenido que tasa contra la carta del canal. Emite item.compuesto (schema canónico).
        comandero lo recibe pre-tasado y confía. ProductoBtn = composer base (entero/partido).
aterrizaje vs hoy: los Panels (MitadMitadPanel/AlGustoPanel/ProductoBtn/porciones-inline) tiran de `productos`
        general y mandan precio_override; el back re-tasa por canal → bug en delivery.
        v2: tiran de carta_efectiva(canal), tasan ahí, emiten item.compuesto.
        Sale el hardcode (max, 8.00, 10.50/3) a favor de la carta + config del canal.
        Añadir un composer nuevo = una clase nueva que implementa Composer, cero cambio de núcleo.
```
