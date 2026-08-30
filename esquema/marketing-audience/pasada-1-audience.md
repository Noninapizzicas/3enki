# Pasada 1 — Módulo "marketing-audience" (Audiencia de Marketing por Proyecto)

Sujeto: la gestión de audiencia de marketing de un proyecto.
Método: prisma de 5 huecos sobre el sujeto crudo.

---

## [IDENTIDAD] — ¿Qué es la audiencia de un proyecto?

El **mapa de a quién le habla el proyecto**. Dos ejes complementarios: los **segmentos** (grupos definidos por criterios objetivos — quién es, qué necesita, dónde está, cómo decide) y las **personas** (arquetipos narrativos que sintetizan un segmento en un perfil accionable con nombre, barrera, motivación y canal preferido).

Los segmentos son declarativos — el dueño los define. Las personas son interpretativas — se construyen sintetizando datos y patrones en un perfil humano.

### Sub-productos

| # | Sub-producto | Tipo | Razón |
|---|---|---|---|
| 1 | **Segmentos** | SPAWN | Grupos de audiencia tipados con criterios objetivos. Registro + validación determinista. |
| 2 | **Personas** | SPAWN | Arquetipos narrativos que dan cara a un segmento. Requieren síntesis (juicio) para construirse. |
| 3 | **Mapa de audiencia** | ATÓMICO | Vista consolidada: todos los segmentos con sus personas vinculadas. El producto de consulta del módulo. |

## [RESTRICCIONES] — ¿Qué limita la audiencia?

| # | Restricción | Tipo | Razón |
|---|---|---|---|
| 1 | **Identidad del negocio** | REF → project-profile | La audiencia se deriva de lo que el proyecto es y vende. |
| 2 | **Posicionamiento** | REF → marketing-strategy | El posicionamiento determina a quién le hablas. |
| 3 | **Datos disponibles** | ATÓMICO | Solo se segmenta con lo que se sabe — la calidad de los datos limita la granularidad. |
| 4 | **Presencia en canales** | REF → marketing-channels | Los canales donde está el proyecto filtran qué audiencia puede alcanzar. |

## [CONTRATO] — ¿Qué promete el módulo de audiencia?

| # | Promesa | Tipo | Razón |
|---|---|---|---|
| 1 | **Segmentos completos** | ATÓMICO | Cada segmento tiene todos sus campos obligatorios llenos. |
| 2 | **Personas accionables** | ATÓMICO | Cada persona tiene nombre, necesidad, barrera y canal — suficiente para actuar sobre ella. |
| 3 | **Trazabilidad** | ATÓMICO | Cada persona está vinculada a un segmento. No hay persona sin ancla. |

## [NO-OBJETIVOS] — ¿Qué NO es el módulo de audiencia?

| # | Frontera | Tipo | Razón |
|---|---|---|---|
| 1 | **No es CRM** | frontera → marca-cliente.clientes | El módulo define TIPOS de audiencia; los clientes individuales con datos de contacto son de marca-cliente. |
| 2 | **No mide comportamiento** | frontera → marketing-analytics | El módulo define quién es la audiencia; medir qué hacen es de analytics. |
| 3 | **No decide el mensaje** | frontera → marketing-content | El módulo dice A QUIÉN hablar; el QUÉ decir es de content. |

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Se auto-generan personas desde datos de clientes (marca-cliente)?
- ¿Cuántos segmentos puede tener un proyecto pequeño vs uno grande?
- ¿Las personas se validan contra datos reales o son hipótesis?
- ¿Un segmento puede tener 0 personas (solo criterios, sin arquetipo)?
