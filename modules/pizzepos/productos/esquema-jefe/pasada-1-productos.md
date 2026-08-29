# Pasada 1 — Prisma sobre «productos» (lente ROL JEFE)

> Sujeto: la cara del **JEFE** del módulo productos — lo que el dueño del negocio ve y toca
> cuando gestiona su carta. Objetivo de diseño: ** Developers una interfaz ágil y productiva**:
> máxima cobertura con el mínimo de gestos por operación frecuente.
> Ley de agnosticismo: ninguna tecnología concreta en el análisis; todo entorno es puerto.

## Hueco 1 · IDENTIDAD

**Qué es (visto desde el jefe)**: el panel de CONTROL del catálogo — la vista de lo que
vende su negocio hoy: categorías, productos, precios, disponibilidad, composición.

**Qué vende**: dominio — "mi carta, mi precio, mi disponibilidad, a golpe de vista".

**Cómo lo elabora**: el módulo es un PROYECTOR sin estado (proyecta la carta activa);
el jefe VÉ el reflejo de su carta y opera sobre ella. Sus MUTACIONES (update/delete)
delegan al custodio (carta-manager).

Sub-productos:
1. **El catálogo visible** — lo que hay hoy, por categorías, con estados.
2. **El gesto de edición** — cambiar precio, activar/desactivar, corregir texto.
3. **El alta y la retirada** — productos nuevos, productos que salen.
4. **La vista analítica** — stats del catálogo (qué hay, en qué medida).

## Hueco 2 · RESTRICCIONES

- **No es la fuente**: todo cambio pasa por el custodio (la carta). El panel EDITA, no GUARDA.
- **La proyección tolera drift** (categoria/categoria_id, ingredientes/ingredientes_base):
  el jefe nunca ve un error interno — ve el catálogo funcionando.
- **id determinista**: mismo (categoría, nombre) = mismo producto SIEMPRE → el alta es
  idempotente, sin duplicados.
- **El canal resuelve la carta**: el jefe trabaja sobre LA carta activa del canal/proyecto,
  nunca elige ids internos de carta.
- **Versionado por mutación**: cada cambio crea snapshot — el jefe puedo mirar atrás.

## Hueco 3 · CONTRATO

- Entra: proyecto (o canal) + operación del jefe (editar/crear/retirar/consultar).
- Sale: catálogo proyectado (categorías + productos, forma POS completa: precio, disponibilidad,
  ingredientes base, alérgenos, variaciones) + dictamen de cada mutación.
- **Puertos abiertos**: `fuente_del_catalogo` (pura, sin estado) · `precios_de_extras` ·
  `agrupador_de_compra` — la cablea el sitio.

## Hueco 4 · NO-OBJETIVOS

- No DISEÑA la carta (categorías nuevas, estructura) → cara de otro módulo (carta-manager).
- No fija widgets de venta ni tarifas por canal → tarifas.
- No captura elecciones del cliente → comandero/POS.
- No garantiza stock físico: `disponible` es una AFFIRMACIÓN del jefe, no un inventario.

## Hueco 5 · PREGUNTAS_ABIERTAS

- ¿El alta de producto es parte del flujo del jefe aquí o vive en menu-generator? → ABIERTA
- ¿La edición de variaciones (reglas) se integra en este panel o queda en el módulo variaciones? → ABIERTA

**Productos para la ronda 2**: Catálogo visible · Gesto de edición · Alta/retirada · Vista analítica.