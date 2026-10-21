# Pasada 4 — Consolidación con el método esquematizador-jefe (variantes v2)

> Ronda de CIERRE: el material de las pasadas 1-3 se revisa contra el método
> `esquematizador-jefe` (5 preguntas-jefe + lente-roles + formas UI canónicas +
> composición en 3 capas). No reescribe lo bueno: NOMBRA lo que faltaba y lo
> apunta a una forma. Suelo confirmado.

## Auditoría contra el método (qué ya estaba y qué faltaba)

| Pieza del método | Estado en pasadas 1-3 | Acción en esta pasada |
|---|---|---|
| RESTRICCIONES con custodios | ✅ pasada 1 (delega al custodio, no es la fuente) | confirmada |
| CONTRATO con señal pareada | ⚠️ la señal aparece suelta (carta.editada/catalogo.actualizado) pero sin parearla hoja a hoja | **pareada aquí abajo** |
| Formas UI canónicas | ⚠️ descritas con nombres libres ("captura inline", "confirmación nombrada") | **mapeadas a los nombres canónicos** |
| Composición seleccionar→informarse→declarar | ❌ implícita en VISTA VIVA/GESTOS/EDITOR | **expuesta como composición** |
| Veredicto del árbitro por op (13) | ⚠️ anatomía marca jefe/neutro/— a mano | **tabla completa 13/13** |
| Huecos [ABIERTO] | ✅ alta aquí vs menu-generator · lógico vs físico | **se añade el de eventos granulares** |

## Las 5 preguntas-jefe, verdicto final

1. **IDENTIDAD** — el jefe DECIDE el futuro del catálogo: precio, disponibilidad, ficha,
   alta y retirada de productos. El módulo entero es la cara de edición del custodio.
2. **RESTRICCIONES** — el custodio (carta-manager) es la ÚNICA fuente: toda escritura
   delega (update/delete → carta.update_product/remove_product); el alta ni siquiera
   está expuesta aquí (vive en carta.add_product del custodio). Sin estado propio.
3. **CONTRATO** — VER: catálogo proyectado siempre vivo (list/get/categorias/search/
   stats/carta_completa). SEÑAL de confirmación: `carta.editada` (gruesa, del custodio)
   + `catalogo.actualizado` (señal de refresco del propio módulo). Nunca recarga.
4. **NO-OBJETIVOS** — la UTILIZACIÓN (POS/comandero elige y vende) consume las lecturas
   de este módulo pero NO se captura aquí. El sistema (health/metrics) y el compat
   (ingredientes) informan, no deciden.
5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles) — 13/13 ops

Pregunta árbitro: ¿decide el FUTURO del catálogo (escribe en el custodio) → JEFE ·
¿sirve una decisión AHORA de venta → UTILIZACIÓN (POS, fuera) · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `update` | **JEFE** | LA EDICIÓN: precio/disponible/ficha → delega al custodio. Decide el futuro. |
| `delete` | **JEFE** | Retirada del catálogo → delega (carta.remove_product). |
| `list` | neutro | alimenta la vista viva |
| `categorias` | neutro | mosaico de navegación + contador |
| `get` | neutro | ficha que alimenta el gesto |
| `search` | neutro | hallar sin navegar |
| `stats` | neutro | cinta de estado (pulso del catálogo) |
| `carta_completa` | neutro | 1 golpe para arrancar el panel; es el REF del select |
| `pizzas` | neutro | vista filtrada del núcleo |
| `load_carta` | neutro | recuperación manual (operación, no decisión) |
| `ingredientes` | neutro (sistema) | delega a ingredientes por compat del comandero — fuera del flujo |
| `health` | neutro (sistema) | estado del módulo — fuera del flujo |
| `metrics` | neutro (sistema) | contadores — fuera del flujo |

**UTILIZACIÓN: NADA en este módulo.** Productos no vende: el POS consume el catálogo
proyectado con las ops de lectura. La cara del jefe ES el módulo entero (más las
lecturas que la alimentan). Es el caso inverso al POS: aquí ni hay hoja que sacar.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — la entidad sobre la que decide: ref-select a productos.carta_completa
                  (label nombre, value id) · la vista viva ES el selector: tocar la tarjeta
2. INFORMARSE   — lecturas que alimentan la decisión: list/get/categorias/search/stats/
                  carta_completa · cinta-estado (stats) da el pulso sin navegar
3. DECLARAR     — las ÚNICAS que escriben: update (precio, disponible, ficha) y delete,
                  SIEMPRE vía custodio · la señal confirma, la vista no se recarga
```

+ los principios transversales (ya en el esquema maestro): frecuencia → jerarquía ·
la señal manda · el informe distingue lo declarado de lo derivado.

## Formas UI canónicas (mapeo de la disección pasada-3)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cambio de precio EN VISTA (Órgano 4) | `inline-gesture` | toque→cifra→Enter; eco del valor viejo; validación nombrada en tarjeta |
| Toggle disponible (Órgano 5) | `inline-gesture` | interruptor en tarjeta; feedback óptico antes del dictamen |
| Select de producto/carta (Órganos 1-3) | `ref-select` | ref `productos.carta_completa` (nombre→id); la vista viva es el selector natural |
| Editar ficha (Órgano 5b) | `editor-bloque` | 1 modal con descripción/etiquetas/alérgenos/categoría — sin fases |
| Retirada (Órgano 8) | `confirmador-nombrado` | nombra producto/precio/impacto; default recomendado: desactivar |
| Mini-stats (Órgano 9) | `cinta-estado` | "42 productos · 6 categorías · 2 sin alérgenos" |
| TODAS las de declaración | `señal-refresh` | **pareada**: `carta.editada` (custodio) + `catalogo.actualizado` (módulo) |

Señales pareadas por hoja de declaración (regla: sin señal, hoja inmadura):

```
update {precio}          → carta.editada + catalogo.actualizado ✅
update {disponible}      → carta.editada + catalogo.actualizado ✅
update {ficha}           → carta.editada + catalogo.actualizado ✅
delete                   → carta.editada + catalogo.actualizado ✅
alta (carta.add_product) → carta.editada ✅ (gruesa: no sabe QUÉ producto nació)
```

## Huecos (los 5 de captura + los del sistema, sin cerrar)

1. **Captura inline de precio** — `inline-gesture` sobre la tarjeta
2. **Toggle disponible** — `inline-gesture` en tarjeta
3. **Alta rápida** — botón "+ producto" que delega `carta.add_product` (custodio)
4. **Editor de ficha** — `editor-bloque` (modal único)
5. **Modal de retirada** — `confirmador-nombrado` + default desactivar

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **El alta aquí vs menu-generator** — la tool no existe en productos (la vía es
  carta.add_product del custodio); quien la capture decide dónde vive el botón.
- (b) **Borrado lógico vs físico** — default recomendado lógico (disponible=false).
- (c) **Eventos granulares de producto** — `producto.creado/actualizado/disponibilidad`
  NO existen: solo `carta.editada` gruesa. El alta no tiene señal propia, el apagón de
  disponibilidad no es rastreable y no hay delta auditable del update. Cerrarlo es
  decisión de dueño + sub-contrato de eventos de la carta, no de esta cara.

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (13 claves, update/delete=jefe, resto neutro)
- `ui.flujo` jefe-PRIMERO: [jefe: update, delete] → [consulta: lecturas] → [utilidad: load_carta]
  (ingredientes/health/metrics fuera del flujo: sistema/compat)
- ref de selects de producto: `productos.carta_completa` (ref_label nombre, ref_value id)
- nota de update: precio=inline-gesture (frecuente 1), disponible=toggle (frecuente 2)