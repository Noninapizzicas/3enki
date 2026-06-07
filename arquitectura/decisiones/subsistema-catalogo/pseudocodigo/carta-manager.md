# `carta-manager` — pseudocódigo (aggregate root del diseño)

> **Naturaleza:** módulo **blueprint-driven** (aggregate root). El LLM ejecuta las operaciones vía
> `bus.publish` / `bus.publishAndWait`. Persistencia **JSON por proyecto** (decisión cerrada), vía
> el módulo `filesystem` (`fs.read/write.request`).
>
> **Lo que NO hace (D1):** no le aplica lógica de ingredientes ni de variaciones. Es dueño del
> **conjunto** de la carta (productos + categorías + qué ingredientes lleva cada producto), no de
> `precio_extra` (ingredientes) ni de la vista por familia (variaciones).

## Rol y contrato

```
ROL: AGGREGATE ROOT. Custodio del dato canónico de cada carta del proyecto.
     CRUD + versionado + manipulación estructurada (productos / categorías / precio_base).
     Personalización por canal (D2): clonar una carta + manipularla por instrucciones del LLM.
     Otros módulos del subsistema LEEN cartas vía carta-manager; NUNCA escriben al store directamente.

ÚNICO ESCRITOR del store de cartas. Enlace producto↔ingrediente SIEMPRE por id (schema v2).
```

## Estado persistente (JSON, multi-tenant)

```
data/projects/<project_id>/storage/pizzepos/cartas/<carta_id>.json          # carta actual (shape carta-pizzepos.v2)
data/projects/<project_id>/storage/pizzepos/cartas/.versions/<carta_id>/<ts>.json   # snapshots
# path virtual que el LLM usa en el blueprint: /pizzepos/cartas/<carta_id>.json (fs lo scopea por proyecto)
# SANEADO vs hoy: una sola convención de ruta, bajo /pizzepos, per-project (sin globales).
```

## Operaciones (pseudocódigo)

### Entrada del origen — `_on_carta_creada`
```
on _on_carta_creada(event):              # event: { project_id, carta(v2), correlation_id }  ← de menu-generator
  await save({ project_id: event.project_id, carta: event.carta, correlation_id: event.correlation_id })
```

### `save` — persistir con versionado (el patrón clave)
```
async save(input):                       # { project_id, carta(v2), correlation_id?, motivo? }
  if !input.project_id:                  return INVALID_INPUT { field:'project_id' }
  if !input.carta?.meta?.nombre:         return INVALID_INPUT { field:'carta.meta.nombre' }
  if !valida(input.carta,'carta-pizzepos.v2'): return INVALID_INPUT { detalle: errores }

  carta_id ← input.carta.meta.id ?? ('carta_'+slug(input.carta.meta.nombre))
  path     ← '/pizzepos/cartas/'+carta_id+'.json'

  prev ← await publishAndWait('fs.read.request', { project_id, path })       # req/resp por bus
  if prev.status == 200:                                                     # ya existía → snapshot ANTES de sobrescribir
     ts ← nowISO_safe()
     await publishAndWait('fs.write.request', { project_id,
            path:'/pizzepos/cartas/.versions/'+carta_id+'/'+ts+'.json', content: prev.content })
     input.carta.meta.version ← (parse(prev.content).meta.version ?? 0) + 1
  else:
     input.carta.meta.version ← 1
  input.carta.meta.updated_at ← nowISO()

  await publishAndWait('fs.write.request', { project_id, path, content: JSON.stringify(input.carta) })
  publish('carta.actualizada', { project_id, carta: input.carta, correlation_id })   # los hermanos reaccionan
  return { status:'ok', data:{ carta_id, version: input.carta.meta.version } }
```

### Lectura — `get` / `list`
```
async get(input):    # { project_id, carta_id }   → fuente canónica de la carta para todos
  r ← await publishAndWait('fs.read.request', { project_id, path:'/pizzepos/cartas/'+carta_id+'.json' })
  if r.status==404:  return RESOURCE_NOT_FOUND { entity:'carta', id: carta_id }
  return { status:'ok', data:{ carta: parse(r.content) } }

async list(input):   # { project_id }  → lista cartas del proyecto (meta de cada *.json en /pizzepos/cartas/)
```

### Manipulación (D2 — el LLM las invoca en lenguaje natural)
```
# "quita estos productos" / "pon esto" / "este producto a 12€"
async add_product(input):     { project_id, carta_id, producto(v2) }       → carga, push, save
async remove_product(input):  { project_id, carta_id, producto_id }        → carga, filtra, save
async update_product(input):  { project_id, carta_id, producto_id, cambios } → carga, merge, save

# "la familia tal sube precio a X" / "este producto a Y" — opera sobre precio_base (lo que carta-manager posee)
async update_prices(input):   # { project_id, carta_id, target, operacion }
  carta ← get(...).carta
  target:    { categoria? | producto_id? | todos }      # 'familia' aquí = categoría de producto
  operacion: { factor? | delta? | precio_fijo? }
  PARA prod EN carta.productos donde casa(prod, target):
     prod.precio_base ← aplicar(prod.precio_base, operacion)   # *factor | +delta | =precio_fijo
  await save({ project_id, carta })
  # NOTA: precio_extra de ingredientes NO se toca aquí — es de ingredientes (D1).
```

### Derivar carta de canal (D2 — canal = carta independiente)
```
async clonar(input):          # { project_id, carta_base_id, nuevo_nombre }
  base ← get({ project_id, carta_id: carta_base_id }).carta
  nueva ← deepcopy(base) ; nueva.meta.id ← 'carta_'+slug(nuevo_nombre) ; nueva.meta.nombre ← nuevo_nombre
  await save({ project_id, carta: nueva })
  return { status:'ok', data:{ carta_id: nueva.meta.id } }

# Flujo "carta de Glovo": el LLM en page=carta-manager hace
#   clonar(base) → update_prices(/add/remove sobre la clonada) según instrucciones NL
#   La ASIGNACIÓN carta↔canal NO es de aquí: la hace tarifas (pieza siguiente). carta-manager solo PRODUCE la carta.
```

### Versionado — `versions` / `restore` / `delete`
```
async versions(input):  # { project_id, carta_id } → lista .versions/<carta_id>/*.json
async restore(input):   # { project_id, carta_id, ts } → lee snapshot, save() (genera nueva versión)
async delete(input):    # { project_id, carta_id } → fs borra carta + emite carta.eliminada
```

## Eventos

```
PUBLICA:  carta.actualizada { project_id, carta }   (tras cada mutación → hermanos reaccionan)
          carta.eliminada { project_id, carta_id }
          fs.read.request / fs.write.request          (publishAndWait, persistencia)
ESCUCHA:  carta.creada (de menu-generator) → _on_carta_creada
```

## Edge cases

```
· carta.meta.nombre ausente            → INVALID_INPUT
· carta no valida contra schema v2     → INVALID_INPUT; NO se persiste
· save sobre carta existente           → snapshot a .versions ANTES de sobrescribir (nunca se pierde la previa)
· version: monotónica (+1 por save sobre existente; 1 si nueva)
· get de carta inexistente             → RESOURCE_NOT_FOUND
· clonar de base inexistente           → RESOURCE_NOT_FOUND
· dos saves concurrentes (POS + agente)→ JSON: riesgo de carrera (gatillo nombrado para SQLite; hoy: escritura atómica fs tmp+rename mitiga)
· update_prices con target vacío       → no-op seguro (no muta nada)
```

## Encaje

- **Entrada:** `carta.creada` (menu-generator) · **Almacén:** `carta-pizzepos.v2` en JSON per-project.
- **Salida:** `carta.actualizada` → la consumen `ingredientes` (deriva catálogo por id), `variaciones`
  (vista por familia) y los lectores (comandero/composers leen vía `get`).
- **Frontera con tarifas:** carta-manager **produce/manipula** cartas; tarifas **asigna** canal→carta_id.
- **Decisiones:** D1 (dueño del diseño, enlace por id) · D2 (manipulación por LLM, canal = carta independiente) · persistencia JSON.

## Nota de aterrizaje (vs código actual)

`carta-manager` v1.2 ya es aggregate root con 14 ops y el patrón save+versionado. Cambios v2:
1. **Schema v2** (ingredientes con `id`+`familia`; valida contra `carta-pizzepos.v2`).
2. **Rutas saneadas** a una sola convención `/pizzepos/cartas/...` per-project (quita la mezcla `/pizzepos` vs `/storage/pizzepos`).
3. **`update_prices` por categoría/producto** y **`clonar`** explícitos como mecanismo de personalización por canal (D2), en lugar de los agentes `tarifas-creator/tarifas-sync` clonando cartas por fuera.
