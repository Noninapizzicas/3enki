# Pasada 1 — prisma de 5 huecos con LENTE JEFE · sujeto: la cara del JEFE de `ingredientes`

> SUJETO (no el módulo entero): **"la capacidad del módulo ingredientes de servir las
> DECISIONES de su rol JEFE: qué puede declarar, de qué necesita informarse y qué
> señales sostienen esas decisiones."**
> Alimento verificado: `modules/pizzepos/ingredientes/module.json` (v5.0.0) +
> `index.js` (695 líneas) leídos hoja a hoja. Cero tecnología de sistema ambiente.
> Vertical: pizzepos. El módulo NO está en subdirectorio de bug: la ruta objetivo
> del blueprint es `modules/pizzepos/ingredientes/ingredientes.blueprint.json`.

## El JEFE de este módulo (quién es)

El dueño del catálogo de ingredientes y de SUS PRECIOS. No el cocinero que elige
ingredientes al componer (eso es el motor-opciones en el POS, cara de UTILIZACIÓN),
ni el carta-manager que siembra el catálogo (cara sincronizadora, no decisión).
El jefe entra aquí cuando: (a) un extra quedó sin precio declarado en variaciones
y cayó en este catálogo como fuente única (`precio_extra`), (b) suben los costes
de proveedor y hay que retar precios de un tirón, (c) hay que corregir ficha
(nombre, alérgenos) — dato de cumplimiento frente al cliente.

## Hueco 1 · IDENTIDAD — ¿qué DECIDE el jefe aquí?

| # | Decisión | Evidencia de código |
|---|----------|---------------------|
| D1 | Corregir/retocar la FICHA de un ingrediente: nombre, familia, alérgenos, precio suelto | `handleUpdateIngrediente(data)` → `{ id, ...updates }`; diff campo a campo `{anterior, nuevo}` |
| D2 | PONER PRECIO A UN LOTE cuando suben los costes: todo un grupo, todo un tipo, o todo el catálogo (con precio fijo o porcentaje) | `handleUpdatePrecios(data)` → filtro `{ id \| tipo \| grupo }` + `{ precio_extra \| porcentaje }` |
| D3 | Declarar que un ingrediente ES alérgeno o dejar de serlo | mismo `update` (`es_alergeno`, `alergenos[]`) — dato de seguridad alimentaria, no cosmética |

Lo que el jefe NO decide aquí: crear ingredientes de la nada (llegan sembrados por
`carta.actualizada` / `producto.creado` — el catálogo nace del menú del proveedor),
ni retirarlos (no hay handler de delete en las 9 ops), ni consumirlos al elegir
productos (eso es motor-opciones, cara utilización).

## Hueco 2 · RESTRICCIONES — ¿qué NO depende de él?

- **El catálogo lo SIEMBRAN otros**: `carta.actualizada` (menu-generator) y
  `producto.creado` registran ingredientes solos. El jefe pule lo que otros traen.
- **El precio editado aquí es FUENTE ÚNICA** (`precio_extra`): los extras que
  `variaciones.configurar` declara sin precio caen aquí; el motor-opciones LEE
  este valor al vender. Editar mal este precio no rompe la vista: rompe la venta.
- **`update_precios` con `porcentaje` es de efecto compuesto si se repite**:
  multiplica sobre el valor vigente de CADA ingrediente (index.js L472:
  `anterior * (1 + porcentaje/100)`). Un % repetido sin querer es un alza doble.
- **Moneda**: el motor persiste EUROS como float redondeado a 2 decimales
  (L472 redondea ×100/100). La UI edita en € y persiste € — sin céntimos.
- **`grupos` es ARRAY multi-pertenencia**: un ingrediente puede vivir en varios
  grupos a la vez (`onCartaActualizada` fusiona con Set). El filtro `grupo` de
  list/update_precios usa `grupos?.includes(grupo)` — puede aparecer dos veces
  en dos grupos, no es duplicado defectuoso.
- **Loop-safe**: el módulo se escucha a sí mismo (`onIngredienteActualizadoExterno`)
  comparando valores; la UI no debe re-publicar lo que ya leyó.

## Hueco 3 · CONTRATO — ¿qué VER antes de decidir y qué SEÑAL confirma?

**Ver antes de decidir (lecturas):**
| Lectura | Payload | Da |
|---------|---------|-----|
| `list` | `{grupo?, tipo?, alergeno?}` | `{ingredientes[], total}` — cada ingrediente ya trae `precio_extra`, `es_alergeno`, `alergenos[]`, `grupos[]`, `disponible`, `tipo` — la ficha completa viene EN la lista (no hace falta get por cada tarjeta) |
| `get` | `{id}` | el ingrediente entero |
| `get_precio` | `{ingrediente_id}` | `{ingrediente_id, precio_extra, disponible}` — ping puntual |
| `search` | `{q, grupo?}` | `{resultados[], total, query}` |
| `alergenos` | — | `{alergenos[], total, por_tipo}` |
| `health` | — | `catalogo: {total, alergenos, por_tipo, por_grupo}` — DERIVADO, ideal para cinta |

**Señales que confirman (pareadas):**
- `update → ingrediente.actualizado` — **1 evento por ingrediente**, diff `{anterior, nuevo}` por campo.
- `update_precios → ingrediente.actualizado` — **N eventos, UNO POR INGREDIENTE afectado**
  (index.js L480: publica dentro del `for`). Un lote de 30 ingredientes = 30 señales
  en tándem + `actualizados[]` con `{id, nombre, anterior, nuevo}` en la respuesta RPC.
  El editor de lote NO puede esperar "la" señal del lote: debounca y re-lee.
- `carta.actualizada` (externa) re-puebla el catálogo — si el jefe tiene la vista
  abierta cuando el proveedor actualiza la carta, la vista late.

## Hueco 4 · NO-OBJETIVOS — ¿qué caras NO son del jefe?

- **UTILIZACIÓN (fuera de este panel)**: el POS elige ingredientes al configurar
  producto (motor-opciones) y lee `get_precio` al vuelo. Aquí no hay ninguna op
  de selección del cliente → utilizacion = **vacío** (el árbitro: ninguna op se
  ejecuta "en el momento de la venta").
- **Sistema/sincronización**: `onCartaActualizada`, `onProductoCreado`,
  `onIngredienteActualizadoExterno` son entrañas, no cara del jefe.
- **Neutras que ALIMENTAN la vista del jefe**: list, get, get_precio, search,
  alergenos, health, metrics (lecturas y agregados).

## Hueco 5 · PREGUNTAS_ABIERTAS — decisiones SUYAS pendientes [ABIERTO]

- [ABIERTO] ¿Política de alza por lote: fija o porcentual? El módulo soporta ambas
  (`precio_extra` | `porcentaje`); EL DUEÑO decide cuándo cada una.
- [ABIERTO] ¿Qué grupo/tipo se encarece primero? (negocio: margen por grupo).
- [ABIERTO] ¿Umbral de "precio razonable" por tipo de ingrediente? (nada en código).
- [ABIERTO] ¿Cuándo marcar un ingrediente como alérgeno nuevo si llega sin
  etiquetar de la carta? (cumplimiento: decisión humana, no heurística).

Todos quedan NOMBRADOS para el dueño — ni el módulo ni la UI los suplen.