# `composers` — pseudocódigo (un solo motor: `VariacionesComposer`)

> **D3 + unificación.** Casi todos los composers son el **mismo motor** —
> `VariacionesComposer(carta, producto_id, fraccion)`— parametrizado. `entero` / `partido` /
> `al-gusto` / `mitad` son configuraciones de ese motor; **`Porciones` es el único distinto**.
> Todos **tasan contra la carta del canal** (de `cuenta.canal`) y emiten `item.compuesto`.
> comandero confía (no re-tasa). Puerta abierta: un tipo nuevo = una config del motor, sin tocar el núcleo.

## El canal (A3): explícito en la cuenta

```
· la cuenta se crea para un canal (TipoButton) → cuenta.canal = campo EXPLÍCITO (mesa, glovo, ...)
· NO se deduce por prefijo de cuenta_id (se deprecia _detectarCanalCuenta / la costura del string-parsing)
· el composer lee cuenta.canal y resuelve la carta del canal
```

## Contrato común

```
INTERFACE Composer:
  async cargar(canal):                       # carta del canal activo (la clave de la correctitud)
     carta_id ← await mqttRequest('tarifas','resolverCarta',{ project_id, canal })
     this.carta ← (await mqttRequest('carta-manager','get',{ project_id, carta_id })).carta
  componer() → emit item.compuesto           # tasa contra this.carta + pinta capa_imagen
# REGLA TRANSVERSAL: el precio SIEMPRE sale de this.carta (del canal). Mesa y delivery = mismo número correcto.
```

## EL MOTOR — `VariacionesComposer(carta, producto_id, fraccion=1)`

> Cubre **entero** (sin extras), **partido** (quitar/añadir) y **al-gusto** (base vacía + añadir).
> `fraccion`: 1 = pizza entera · 0.5 = media pizza (lo usa mitad/mitad).

```
CLASS VariacionesComposer implements Composer:
  →deps: { carta(del canal), producto_id, fraccion=1 }
  state: { quitados:[], extras:[] }

  ▸ getPanel():                              # lo que pinta el panel de variaciones
      prod ← this.carta.producto[producto_id]
      v ← await mqttRequest('variaciones','getVariacionesProducto',{ project_id, producto:prod, canal })
      return { quitables: prod.ingredientes, anadibles_por_familia: v.anadibles_por_familia, max_extras: v.max_extras }

  ▸ resolver():                              # estado configurado (pizza o media)
      base  ← this.carta.producto[producto_id].precio_base
      extra ← Σ ( this.carta.precio_extra[ing] * this.fraccion )  para ing EN this.extras   # fraccion=1 entera · 0.5 media
      return { producto_id, quitados:this.quitados, extras:this.extras, base, extra_total: extra }

  ▸ componer():                              # cuando se usa SOLO (partido / al-gusto)
      h ← resolver()
      emit { tipo: this.tipo ?? 'variado', regla_precio:'base_mas_extras',
             componentes:{ producto_ids:[h.producto_id], quitados:h.quitados, extras:h.extras },
             precio_final: redondear_cents(h.base + h.extra_total) }
```

## `ProductoBtn` — la entrada (entero / partido)

```
CLASS ProductoBtn:
  layout ← (producto.tiene_variaciones ?? (producto.ingredientes.length > 0)) ? 'partido' : 'entero'
  ▸ entero (tap):     # sin panel; precio = precio_base del CANAL
      emit item.compuesto { tipo:'entero', regla_precio:'producto',
            componentes:{ producto_ids:[id] }, precio_final: this.carta.producto[id].precio_base }
  ▸ partido (+/-):    abre VariacionesComposer(this.carta, id, fraccion=1)   # quitar/añadir
```

## AL GUSTO (A1) — **NO es un composer aparte**

```
"Pizza Al Gusto" = un PRODUCTO de la carta con ingredientes base VACÍOS + tiene_variaciones=true.
  → el flujo PARTIDO (VariacionesComposer, fraccion=1) lo cubre tal cual:
      base (p.ej. 8.00€, del canal) + añadir ingredientes de las familias.
  → CERO código nuevo. Lo único "al gusto" es el DATO (producto con base sin ingredientes).
  → si al-gusto necesita reglas propias (ej. mínimo 1 salsa) = reglas de variaciones por producto (variaciones).
```

## `MitadMitadComposer` — COMPOSITE de dos mitades (fraccion=0.5)

```
CLASS MitadMitadComposer implements Composer:
  state: { half_izq: VariacionesComposer, half_der: VariacionesComposer }   # ambas sobre this.carta, fraccion=0.5

  ▸ elegirMitad(lado, producto_id):
      this['half_'+lado] ← new VariacionesComposer(this.carta, producto_id, fraccion=0.5)   # MISMA lógica del partido

  ▸ componer():
      hi ← half_izq.resolver() ; hd ← half_der.resolver()    # cada h.extra_total ya va a MEDIO precio (fraccion=0.5)
      # REGLA 'mitad_max_configurada': max de las dos mitades YA configuradas
      half_total(h) ← h.base + h.extra_total
      precio_final  ← redondear_cents( max( half_total(hi), half_total(hd) ) )
      emit { tipo:'mitad', regla_precio:'mitad_max_configurada',
             componentes:{ mitades:{ izquierda: hi, derecha: hd } },
             precio_final, capa_imagen:{ nombre_compuesto:'½ '+nombre(hi)+' + ½ '+nombre(hd) } }
```

## `PorcionesComposer` (A2) — el único motor distinto

> Venta por porciones con bundle. La config vive en la **carta** (per-canal, porque canal = carta).

```
CLASS PorcionesComposer implements Composer:
  ▸ componer({ cantidad }):
      cfg ← this.carta.config_porciones      # { precio_suelta:3.00, bundle:{ cada:4, precio:10.50 } }  (carta-level, per-canal)
      precio_final ← aplicar_bundle(cantidad, cfg)   # nº bundles*precio + resto*precio_suelta
      emit { tipo:'porcion', regla_precio:'porciones', componentes:{ cantidad }, precio_final }
```

## Encaje · aterrizaje

```
encaje: D3 + unificación. Motor único VariacionesComposer(carta, producto, fraccion) para entero/partido/al-gusto/mitad.
        Porciones aparte. Todos tasan contra carta del canal → item.compuesto. comandero confía.
aterrizaje vs hoy:
  · MitadMitadPanel / AlGustoPanel / ProductoBtn / porciones-inline → un solo motor + Porciones.
  · AlGustoPanel desaparece como componente especial: "Pizza Al Gusto" pasa a ser un producto con base vacía.
  · sale el hardcode (max, 8.00, 10.50/3) a favor de la carta + config del canal.
  · canal: de prefijo de cuenta_id → cuenta.canal explícito.
  · añadir un composer nuevo = una config del motor (o una clase si es realmente distinto, como Porciones).
```
