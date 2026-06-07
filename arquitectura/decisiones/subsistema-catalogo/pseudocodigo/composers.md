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

## `MitadMitadComposer`

```
CLASS MitadMitadComposer implements Composer:
  ▸ componer({ izq, der }):
      pIzq ← this.carta.producto[izq].precio_base ; pDer ← this.carta.producto[der].precio_base   # del CANAL
      precio_final ← max(pIzq, pDer)                                                              # regla 'max' (la lógica del botón)
      emit { tipo:'mitad', regla_precio:'max', componentes:{ mitades:{ izquierda:izq, derecha:der } },
             precio_final, capa_imagen:{ nombre_compuesto:'½ '+nombre(izq)+' + ½ '+nombre(der) } }
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
