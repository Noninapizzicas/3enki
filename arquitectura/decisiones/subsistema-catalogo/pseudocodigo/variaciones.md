# `variaciones` — pseudocódigo (vista por familia + reglas; derivado puro)

> **Naturaleza:** módulo JS (clase). Estado = **solo reglas por producto**. NO almacena precios ni
> catálogo: **deriva** la vista pidiendo a `ingredientes` y **calcula el precio en vivo** (D2: no hay
> módulo precio nuevo — el cálculo base+extras vive aquí). Ya lo hace bien hoy; el cambio es la fuente.

## Rol y contrato

```
ROL: vista por familia (quitables + añadibles agrupados) + reglas por producto (max, familias permitidas).
     Calcula el precio de un item con variación (base + Σ precio_extra). Derivado puro.
NO HACE: poseer precio_extra (ingredientes) · poseer la carta (carta-manager).
```

## Estado y operaciones

```
CLASS VariacionesModule extends Module:
  state: { reglas: Map<producto_id, { max_extras, familias_permitidas?, quitables_bloqueados? }> }  # solo reglas

  # CONFIG de variación de un producto = lo que pinta el botón partido
  ▸ getVariacionesProducto(input):     # { project_id, producto, canal? }   (producto viene de la carta del canal)
      quitables ← producto.ingredientes                                  # los del propio producto (semilla, por id)
      cat ← await mqttRequest('ingredientes','catalogo',{ project_id })  # catálogo derivado
      r   ← reglas.get(producto.id)
      anadibles ← agrupar_por_familia(cat, r?.familias_permitidas)       # la vista "AÑADIR INGREDIENTES" por grupo
      return { status:'ok', data:{ quitables, anadibles_por_familia: anadibles, max_extras: r?.max_extras ?? DEFAULT } }

  # CALCULAR precio de un item compuesto (base + extras) — el "no hay módulo precio"
  ▸ calcularPrecio(input):             # { precio_base, extras:[ing_id], project_id }
      cat ← await mqttRequest('ingredientes','catalogo',{ project_id })
      return precio_base + Σ (cat[ing_id].precio_extra para ing_id EN extras)

  # VALIDAR una variación contra las reglas
  ▸ validar(input):                    # { producto_id, quitar:[id], anadir:[id] }
      r ← reglas.get(producto_id)
      if anadir.length > r.max_extras:                         publish('variacion.rechazada',{motivo:'max_extras'}); return
      if alguna(anadir).familia ∉ r.familias_permitidas:        publish('variacion.rechazada',{motivo:'familia'});   return
      publish('variacion.validada', { producto_id, quitar, anadir })
```

## Eventos · encaje

```
PUBLICA: variacion.validada / variacion.rechazada
ESCUCHA: producto.creado (carga reglas), comandero.item_agregado (auto-valida la comanda)
encaje: quitables = semilla del producto · añadibles = catálogo de ingredientes POR FAMILIA · precio = base + precio_extra.
        Es quien TASA el item compuesto con variaciones (D2: sin módulo precio nuevo).
aterrizaje vs v4: ya deriva en vivo (✅, no materializa). Cambio = consume el catálogo DERIVADO de ingredientes
        (por id), no el productos materializado. El enlace pasa a ser por id (robusto).
```
