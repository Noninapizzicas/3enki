# Anatomía de productos — mapeada al ROL JEFE (eventos + elementos)

> Qué ES el módulo: PROYECTOR SIN ESTADO sobre la carta (carta-manager = única fuente).
> Sus elementos son LECTURAS proyectadas; sus mutaciones DELEGAN al custodio.
> Aquí NO se diseña interfaz — se mapea cada evento y cada elemento del módulo
> a la necesidad real del jefe que satisface.

## ANATOMÍA · EVENTOS

### Publica (el módulo habla al bus)

| Evento | Necesidad del jefe que sirve |
|---|---|
| `catalogo.actualizado` | **"¿Mi cambio ya está en todas partes?"** — la señal de que el catálogo cambió (tras update/delete/refresh). Es la que sincroniza POS, carta digital, comandero. El jefe cambia un precio y SABE que POS/digital/comandero se enteraron. |
| `carta.update_product.request` | **"Corrijo un dato"** — el gesto de edición del jefe (precio, disponible, descripción...) viaja al custodio por aquí. |
| `carta.remove_product.request` | **"Retiro un producto"** — retirada del catálogo vía custodio. |
| `carta.get.request` / `carta.list.request` | (internos) cómo el proyector pide la carta — invisible para el jefe. |
| `project.get.request` / `tarifas.config.solicitada` | internos de resolución de canal/carta — invisible. |

### Escucha

| Evento | Qué hace el jefe al oírlo |
|---|---|
| `carta.actualizada` / `carta.editada` | **"Mi carta cambió"** — la vista se refresca sola (save/restore/clonar del custodio o edición desde cualquier cara) |
| `carta.borrada` | el catálogo se vacía/coherente sin acción manual |
| `tarifas.config.actualizada` | **¿qué carta serve cada canal?** — el jefe decide canal→carta; el proyector obedece |
| `project.activated` | arranque: el catálogo se puebla solo (warm) |

### LOS HUECOS DE EVENTOS (lo que el jefe necesita y el bus NO emite)

1. **`producto.creado` NO lo emite nadie** (fue retirado; hoy el alta solo existe vía carta.add_product → carta.editada). El alta rápida del jefe no tiene señal propia — se infiere de carta.editada a lo bruto (todo el catálogo refresca en vez de saber QUÉ producto nació).
2. **Sin señal de disponibilidad**: cuando el jefe apaga `disponible`, POS/carta-digital se enteran por carta.editada (evento GRUESO, sin granularidad). No existe `producto.disponibilidad.cambiada` — el jefe no puede saber "mi apagón de 3 productos ya está vivo en la carta digital".
3. **Sin dictamen nombrado de mutación**: el update delega y devuelve la respuesta RPC, pero no hay evento `producto.actualizado` con el delta (precio antes→después) — el jefe no tiene rastro auditable de SUS cambios salvo versiones de carta.

## ANATOMÍA · ELEMENTOS (los 13 handlers, mapeados a necesidades)

| Elemento del módulo | Necesidad del jefe | Rol |
|---|---|---|
| `productos.list` | "¿Qué vendo hoy?" — el catálogo completo con estados | lectura |
| `productos.categorias` | "¿Cómo está organizado?" + contador por categoría (cobertura) | neutro |
| `productos.get` | "Detalle de este producto" (ficha completa) | neutro |
| `productos.search` | "¿Dónde está X?" — hallar sin navegar | neutro |
| `productos.stats` | "¿En qué medida está cubierto mi catálogo?" (totales, por categoría, alérgenos declarados) | neutro |
| `productos.update` | "Corrijo precio / disponibilidad / ficha" — LA EDICIÓN (delega al custodio) | **jefe** |
| `productos.delete` | "Retiro un producto del catálogo" | **jefe** |
| `productos.carta_completa` | visión completa en 1 golpe (categorías+productos+ingredientes) — arranque de panel | neutro |
| `productos.load_carta` | recarga explícita desde disco — recuperación/manual | neutro |
| `productos.pizzas` | vista filtrada del núcleo del negocio | neutro |
| `productos.ingredientes` | delega a ingredientes (compat) — no es del jefe | — |
| `productos.health` / `metrics` | estado del sistema, no del negocio | — |

**El dato clave para el jefe (lo que YA existe vs lo que NO):**

- ✅ Lectura completa del catálogo (list/get/categorias/carta_completa/stats/search)
- ✅ Edición puntual (update por campos → custodio)
- ❌ **No existe "alta" en productos** (solo vía carta.update/add_product directo — el jefe no puede dar de alta desde SU cara sin ir a menu-generator o al chat)
- ❌ **No hay eventos de negocio granulares** (producto.creado/actualizado/disponibilidad) — solo el evento grueso de la carta; el jefe no recibe "QUÉ cambió", solo "algo cambió"
- ❌ **No hay historial para el jefe** (los snapshots de la carta existen pero no hay cara de "ver qué cambió ayer a las 8")

## La necesidad del jefe, en una tabla

| Necesidad | Elemento que la sirve | Estado |
|---|---|---|
| Ver mi carta de hoy | list + categorias + carta_completa | ✅ |
| Hallar un producto | search | ✅ |
| Cambiar un precio | update | ✅ (falta captura ágil, es UI) |
| Poner/desactivar disponibilidad | update | ✅ (falta toggle, es UI) |
| Corregir ficha | update | ✅ (falta editor, es UI) |
| Retirar | delete | ✅ (falta confirmación, es UI) |
| **Dar de alta** | —— | ❌ HUECO REAL: no hay tool de alta en el módulo |
| **Saber qué cambió y cuándo** | —— | ❌ HUECO REAL: sin evento granular de mutación |
| Ver salud del catálogo | stats | ✅ |