# Pasada 1 — Módulo "marketing-competitors" (Competencia de Marketing por Proyecto)

Sujeto: la gestión de competencia de marketing de un proyecto.
Método: prisma de 5 huecos sobre el sujeto crudo.

---

## [IDENTIDAD] — ¿Qué es la competencia de un proyecto?

El **mapa de quiénes compiten con el proyecto** y qué los diferencia. Tres ejes: el registro de competidores (quién es, qué ofrece, dónde opera), la vigilancia de lo que hacen (señales que cambian con el tiempo) y la posición relativa del proyecto frente a ellos (lo que el proyecto hace distinto).

El módulo NO investiga — registra lo que el dueño sabe y vigila lo que cambia. La inteligencia competitiva activa (rastrear webs, analizar precios, monitorizar redes) es trabajo de skills o herramientas externas que alimentan al módulo.

### Sub-productos

| # | Sub-producto | Tipo | Razón |
|---|---|---|---|
| 1 | **Registro de competidores** | SPAWN | El catálogo: quién compite con el proyecto, con datos tipados. |
| 2 | **Monitorización** | SPAWN | La vigilancia: señales observadas sobre cada competidor que cambian con el tiempo. |
| 3 | **Benchmarking** | SPAWN | La comparación: mis datos vs los suyos, transformados en comparativa accionable. |
| 4 | **Diferenciación** | ATÓMICO | Lo que el proyecto hace distinto — se destila del posicionamiento y del mapa de competencia. |
| 5 | **Mapa competitivo** | ATÓMICO | Vista consolidada: todos los competidores con posición relativa y diferenciadores. |

## [RESTRICCIONES] — ¿Qué limita el análisis de competencia?

| # | Restricción | Tipo | Razón |
|---|---|---|---|
| 1 | **Posicionamiento propio** | REF → marketing-strategy | La diferenciación se ancla en el posicionamiento del proyecto. |
| 2 | **Territorio** | REF → marketing-strategy.posicionamiento.territorio | La categoría y vecinos definen quiénes son competidores directos. |
| 3 | **Información accesible** | ATÓMICO | Solo se puede monitorizar lo que se puede ver — la calidad del análisis depende de la accesibilidad de datos. |
| 4 | **Canales donde competimos** | REF → marketing-channels | Los canales activos filtran dónde se observa la competencia. |

## [CONTRATO] — ¿Qué promete el módulo de competencia?

| # | Promesa | Tipo | Razón |
|---|---|---|---|
| 1 | **Registro completo** | ATÓMICO | Cada competidor tiene nombre, tipo, fortalezas, debilidades. |
| 2 | **Vigilancia viva** | ATÓMICO | Las observaciones de monitorización se acumulan con fecha — el historial importa. |
| 3 | **Comparativa actualizable** | ATÓMICO | El benchmarking se puede recalcular con datos frescos. |
| 4 | **Diferenciación trazable** | ATÓMICO | Lo que nos diferencia está vinculado al posicionamiento. |

## [NO-OBJETIVOS] — ¿Qué NO es el módulo de competencia?

| # | Frontera | Tipo | Razón |
|---|---|---|---|
| 1 | **No investiga activamente** | frontera → skills/herramientas externas | El módulo registra y vigila; la recopilación activa (scraping, monitorización de redes) es de herramientas externas. |
| 2 | **No define la estrategia** | frontera → marketing-strategy | Saber quién compite no decide qué hacer — eso es estrategia. |
| 3 | **No mide nuestro rendimiento** | frontera → marketing-analytics | Comparar es de competencia; medir lo nuestro es de analytics. |

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Competidores directos e indirectos en el mismo registro o separados?
- ¿Se alimenta automáticamente desde skills de investigación?
- ¿El benchmarking tiene dimensiones fijas o las define el dueño?
- ¿Hay competidores "aspiracionales" (no compiten hoy, pero marcan el rumbo)?
