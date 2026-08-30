# Pasada 1 — Módulo "marketing-channels" (Canales de Marketing por Proyecto)

Sujeto: la gestión de canales de marketing de un proyecto.
Método: prisma de 5 huecos sobre el sujeto crudo.

---

## [IDENTIDAD] — ¿Qué son los canales de marketing de un proyecto?

El **catálogo vivo** de todos los puntos de contacto por los que el proyecto alcanza a su audiencia. Un canal es un conducto con dueño, estado y rendimiento — no una acción ni un contenido. La función del módulo es SABER dónde está presente el proyecto, vigilar que cada presencia esté activa y sana, y dar al resto del ecosistema el mapa de canales disponibles para ejecutar.

### Sub-productos

| # | Sub-producto | Tipo | Razón |
|---|---|---|---|
| 1 | **Canales Propios** | SPAWN | Los que el proyecto controla: web, app, email list, blog, tienda física. Tienen inventario de activos y estado operativo. |
| 2 | **Canales Ganados** | SPAWN | Los que el proyecto gana sin pagar: SEO orgánico, menciones, reseñas, PR, boca a boca. Tienen fuente y frecuencia. |
| 3 | **Canales Pagados** | SPAWN | Los que cuestan dinero: ads (Google, Meta, TikTok), sponsorships, influencers pagados. Tienen presupuesto asignado y ROI. |
| 4 | **Canales Compartidos** | SPAWN | Los que se comparten con la audiencia: redes sociales, comunidades, foros, marketplaces. Tienen presencia y engagement. |
| 5 | **Mapa de Canales** | ATÓMICO | La vista consolidada: todos los canales del proyecto con su clasificación, estado y prioridad. El producto de consulta del módulo. |

## [RESTRICCIONES] — ¿Qué limita los canales?

| # | Restricción | Tipo | Razón |
|---|---|---|---|
| 1 | **Recursos finitos** | REF → marketing-budget | No se pueden activar todos los canales a la vez — el presupuesto los limita. |
| 2 | **Coherencia de marca** | REF → marca-cliente.voz | Cada canal debe respetar la voz de marca del proyecto. |
| 3 | **Capacidad operativa** | ATÓMICO | El equipo del proyecto tiene un ancho de banda finito — cada canal activo exige mantenimiento. |
| 4 | **Audiencia alcanzable** | REF → marketing-audience | Un canal solo sirve si la audiencia del proyecto está ahí. |

## [CONTRATO] — ¿Qué promete el módulo de canales?

| # | Promesa | Tipo | Razón |
|---|---|---|---|
| 1 | **Inventario completo** | ATÓMICO | En todo momento se puede consultar el mapa completo de canales del proyecto. |
| 2 | **Estado vivo** | ATÓMICO | Cada canal tiene un estado operativo (activo / pausado / en_setup / retirado) verificable. |
| 3 | **Priorización** | ATÓMICO | Los canales tienen orden de prioridad — el proyecto sabe cuáles son su apuesta principal. |

## [NO-OBJETIVOS] — ¿Qué NO es el módulo de canales?

| # | Frontera | Tipo | Razón |
|---|---|---|---|
| 1 | **No ejecuta en el canal** | frontera → marketing-campaigns, publicador | El módulo sabe QUE el canal existe y su estado; ejecutar contenido en él es de campañas/publicador. |
| 2 | **No mide rendimiento** | frontera → marketing-analytics | El módulo puede tener un ROI declarado por el dueño, pero la medición real es de analytics. |
| 3 | **No gestiona cuentas/credenciales** | frontera → credential-manager | Las API keys, tokens y accesos de cada canal viven en credential-manager. |

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Se auto-detectan canales desde la presencia digital (marca-cliente.presencia)?
- ¿Un canal puede pertenecer a más de una clasificación (propio + compartido)?
- ¿Hay canales "heredados" del tipo de negocio (arquetipos)?
- ¿La frecuencia de publicación es del canal o de la campaña que usa el canal?
