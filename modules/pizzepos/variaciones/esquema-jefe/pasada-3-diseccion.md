# Pasada 3 — Disección (FORMA de cada pieza)

El prisma tocó suelo en la pasada 2. Cada hoja atómica pasa por el diseccionador
(reflejo · micro-agente fuzzy · custodio · conversor · puente) y recibe su FORMA.

---

## Órgano 1 — Editor de opciones (declaración, modo JEFE)

**Preguntas del diseccionador:**
- ¿Es determinista? NO — decidir precios extra y límites es decisión del dueño.
- ¿Es persistente? SÍ — lo declarado sobrevive (es configuración de negocio).
- ¿Traduce entre mundos? NO.
- ¿Vigila y aplica? NO.

**FORMA: CUSTODIO (con cara de edición).**
Guarda la declaración de opciones por producto (fuente cuando existe, gana a lo derivado).
Su UI es un panel de edición: por producto, marcar quitables, añadir extras con precio,
fijar límite. Hoy la declaración vive dentro de la carta (campo `opciones` del producto);
el editor NO es un módulo nuevo — es la cara de edición de la carta sobre ese campo.
→ **Puerto**: la carta es el custodio; este módulo solo la LEE.

## Órgano 2 — Vista de reglas vigentes

**FORMA: REFLEJO PUERO (proyección).**
Leer configuraciones y renderizarlas. Un test lo afirma: dado producto con opciones,
la vista muestra exactamente quitables/extras/límite/derivación. Sin estado, sin decisión.
Candidato natural a una op de lectura ya existente (`get`) — solo falta la cara UI que
la pinte completa (hoy el blueprint la expone como form genérico, no como vista de reglas).

## Órgano 3 — Derivador de opciones

**FORMA: REFLEJO PURO (ya existe).** `derivar-opciones` — puro, determinista, probado.
REF. No se construye nada.

## Órgano 4 — Motor de opciones

**FORMA: REFLEJO PURO (ya existe).** `motor-opciones` — Strategy por modo, puro, probado.
REF. El módulo lo invoca en `evaluar` (server-side, la verdad del precio).

## Órgano 5 — Hoja de elección (captura, modo UTILIZACIÓN)

**Preguntas del diseccionador:**
- ¿Decide? No — solo recoge la selección (la decisión es del cliente en el momento).
- ¿Guarda? No — la selección vive mientras se elige y viaja con el add.
- ¿Es determinista? La RENDERIZACIÓN sí (control por modo); el contenido es el producto.

**FORMA: CONVERSOR (selección del mundo → contrato del motor).**
Ya existe como `OpcionesSheet` en el POS: dibuja control por modo (radio/check/chips/libre),
recoge `selecciones`, muestra hint de precio, entrega al carrito que llama a `evaluar`.
REF en su núcleo + 1 pieza atómica nueva: que la MISMA hoja sea reutilizable fuera del POS
(cualquier canal de utilización) — extraer el componente a un sitio neutro si hay un segundo
consumidor. HOY: REF (un solo consumidor, no duplicar).

## Órgano 6 — Emisión de dictámenes

**FORMA: REFLEJO PUERO (señal de vida).**
Ya existe: `variacion.validada` / `variacion.rechazada` con motivo, correlación y desglose.
La doble verificación (captura → buffer) ya está cableada: el comandero agrega, el módulo
escucha `comandero.item_agregado` y re-valida. REF. Solo falta 1 ATÓMICO: la UI del
rechazo nombrado en el punto de venta (toast/banner con el motivo del rechazo) — HOY el
carrito ya muestra error nombrado en 409/502, cubierto. REF total.

## Resumen de formas

| Pieza | Forma | Estado |
|---|---|---|
| Editor de opciones (JEFE) | Custodio (la carta) + cara de edición | **HUECO** — la cara de edición no existe como UI |
| Vista de reglas vigentes | Reflejo (proyección) | **HUECO** — op `get` existe, cara UI no |
| Derivador | Reflejo puro | ✅ existe |
| Motor | Reflejo puro | ✅ existe |
| Hoja de elección (UTILIZACIÓN) | Conversor (OpcionesSheet) | ✅ existe en POS |
| Emisión de dictámenes | Reflejo (señales) | ✅ existe + doble verificación |

**Los 2 únicos huecos son de UI y ambos del ROL JEFE.** El rol UTILIZACIÓN está completo de punta a punta.