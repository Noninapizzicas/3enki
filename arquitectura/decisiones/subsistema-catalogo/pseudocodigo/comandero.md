# `comandero` — pseudocódigo (buffer del ticket; YA NO tasa)

> **Naturaleza:** módulo JS (clase). D3: **ELIMINA `_resolverPrecioCanal`**. El composer ya tasó
> contra la carta del canal → comandero **confía** en `precio_final`. Solo registra el item, suma y
> persiste el ticket (su concern). Menos cache, menos costura, sin el bug de delivery.

## Rol y estado

```
ROL: buffer del pedido por cuenta. Recibe items YA tasados (item.compuesto), suma, persiste el ticket,
     envía a cocina. NO calcula precio (lo hizo el composer).

CLASS ComanderoModule extends Module:
  state: { pedidos: Map<cuenta_id, { items:[], total }> }   # SU dato (el ticket en curso) — persiste (transitorio atómico)
  # YA NO necesita productosCache ni cartasProductosCache para precio: el composer lo resolvió.
```

## Operaciones

```
▸ onItemCompuesto(input):       # = item-compuesto.schema  { project_id, cuenta_id, canal, tipo, componentes, precio_final, cantidad? }
    if input.precio_final == null: return INVALID_INPUT { field:'precio_final', hint:'el composer DEBE tasar' }
    item ← { id:uuid(), tipo:input.tipo, componentes:input.componentes,
             precio: input.precio_final, cantidad: input.cantidad ?? 1, canal: input.canal }
    pedido ← pedidos.get(cuenta_id) ?? { items:[], total:0 }
    pedido.items.push(item) ; pedido.total ← Σ(items.precio * items.cantidad)
    persistir_buffer()                                              # su dato, único escritor (atómico tmp+rename)
    publish('comandero.item_agregado', { cuenta_id, item_id:item.id, precio_unitario:item.precio,
            precio_total:item.precio*item.cantidad, pedido_total:pedido.total, tipo:item.tipo, canal:item.canal })
    # cuentas SUMA · cocina/pedidos reciben el item · cobros usa el total. TODOS confían en precio_final.

▸ removeItem / updateItem:      # recalcula total (suma simple), persiste, publica
▸ enviarCocina(input):          # { cuenta_id } → publish('comandero.enviar_cocina', { items, total }) → pedidos → cocina
```

## Eventos · edge · encaje

```
PUBLICA: comandero.{item_agregado, item_eliminado, item_actualizado, enviar_cocina}
ESCUCHA: item.compuesto, cuenta.*
edge: precio_final ausente → INVALID_INPUT (comandero NO inventa precio; el composer es el único que tasa)
      canal: viene en item.compuesto (lo supo el composer desde la cuenta) — comandero solo lo propaga, no lo re-detecta para precio
encaje: D3 — un solo punto tasa (el composer), comandero confía. Desaparece el split front/back y el bug en delivery.
aterrizaje vs v3.2: ELIMINA _resolverPrecioCanal + cartasProductosCache + la hidratación de N cartas para precio.
        Recibe item.compuesto pre-tasado; conserva solo el buffer del ticket. Mucho más simple.
```
