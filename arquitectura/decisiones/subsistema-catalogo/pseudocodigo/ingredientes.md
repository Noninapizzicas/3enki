# `ingredientes` — pseudocódigo (autoridad de precio_extra + catálogo derivado)

> **Naturaleza:** módulo JS (clase). Es la **primera pieza que deriva, no copia** (D1). Persiste
> SOLO su **enriquecimiento** (precio_extra + corrección de familia); el catálogo de ingredientes
> es la **unión por id** de los ingredientes de todas las cartas — derivado, nunca copiado a disco.

## Rol y contrato

```
ROL: autoridad del ingrediente — precio_extra (+ puede corregir familia).
     catálogo = UNIÓN deduplicada por id de todos los productos[].ingredientes (DERIVADO de la semilla).
NO HACE: vista por familia (variaciones) · precio_base (carta-manager) · copia del catálogo.
```

## Estado

```
CLASS IngredientesModule extends Module:
  state: {
    enriquecimiento: Map<ing_id, { precio_extra:number, familia_override?:string }>,  # ← ESTO posee y persiste (pequeño)
    _indice: Map<ing_id, { nombre, emoji, familia }>   # ← cache EFÍMERA en memoria, derivada (NO disco)
  }
  estado_persistente: /pizzepos/ingredientes-enriquecimiento.json   # SOLO {id → precio_extra, familia?}, NO la copia del catálogo
```

## Operaciones (pseudocódigo)

```
# DERIVAR el índice (no copiar): cada carta.actualizada une ingredientes por id EN MEMORIA
▸ onCartaActualizada(event):
    PARA prod EN event.carta.productos:
       PARA ing EN prod.ingredientes:
          _indice.set(ing.id, { nombre:ing.nombre, emoji:ing.emoji, familia:ing.familia })   # unión por id, dedupe natural
    # NO se escribe a disco — es derivación efímera. Si el core reinicia, se rehidrata leyendo cartas.

# CATÁLOGO (pull): índice ⊕ enriquecimiento  — lo que piden variaciones / composers
▸ catalogo(input):              # { project_id, familia? }
    lista ← PARA id EN _indice:
               e ← enriquecimiento.get(id)
               { id, nombre:_indice[id].nombre, emoji:_indice[id].emoji,
                 familia: e?.familia_override ?? _indice[id].familia,
                 precio_extra: e?.precio_extra ?? 0 }          # default 0 ('gratis', como las capturas)
    if input.familia: lista ← filtrar(lista, familia)
    return { status:'ok', data:{ ingredientes: lista } }

# precio_extra (lo que posee) — set/get
▸ setPrecioExtra(input):        # { project_id, ing_id, precio_extra }
    enriquecimiento.merge(ing_id, { precio_extra }); persist()
    publish('ingrediente.actualizado', { project_id, ing_id, precio_extra })

# corregir familia (la semilla la propuso; ingredientes es la autoridad)
▸ corregirFamilia(input):       # { project_id, ing_id, familia }
    enriquecimiento.merge(ing_id, { familia_override: familia }); persist()
    publish('ingrediente.actualizado', { project_id, ing_id, familia })
```

## Eventos · edge · encaje

```
PUBLICA: ingrediente.actualizado        ESCUCHA: carta.actualizada
edge: id nunca visto en carta → no aparece en catálogo hasta que una carta lo trae
      enriquecimiento huérfano (id ya no en ninguna carta) → se ignora en el pull (no rompe)
encaje: catálogo derivado por id (D1, enlace por id). precio_extra lo consume variaciones (y composers al tasar).
aterrizaje vs v5: DEJA de materializar ingredientes.json como copia del catálogo.
        Pasa a {_indice efímero derivado de carta.actualizada} + {enriquecimiento persistido, pequeño}.
```
