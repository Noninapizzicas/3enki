# Disección — Concepto "Marketing por Proyecto"

Formas conceptuales (no técnicas) asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

| # | Pieza | Origen | Forma | Razón |
|---|---|---|---|---|
| 1 | Posicionamiento | 2.1 Estrategia | **reflejo** | Una declaración que un test afirma: "¿puedo decir en una frase qué soy y por qué me eligen?" Invariante fundacional. |
| 2 | Objetivos | 2.1 Estrategia | **reflejo** | Lista de metas medibles — cada una tiene métrica y umbral; un test afirma que cada objetivo es cuantificable. |
| 3 | Publicación | 2.2 Ejecución | **puente** | Conecta la pieza de contenido con el canal: `publicar(pieza, canal)`. No tiene store propio — escucha y delega. |
| 4 | Métricas | 2.3 Medición | **reflejo** | Catálogo tipado de KPIs (impresiones, clicks, conversiones, coste, ROI). Determinista: cada métrica tiene tipo, fuente, fórmula. |
| 5 | Atribución | 2.3 Medición | **micro-agente** | Asignar qué acción causó qué resultado requiere juicio — el modelo de atribución (last-touch, multi-touch, decay) interpreta, no calcula. |
| 6 | Reporting | 2.3 Medición | **conversor** | Transforma datos crudos en formato legible para decidir: `visualizar(datos, formato)`. Sin estado, sin juicio — pura transformación. |
| 7 | Experimentación | 2.3 Medición | **micro-agente** | El ciclo hipótesis → variante → dato → veredicto necesita juicio: formular la hipótesis, interpretar la significancia, emitir veredicto. |
| 8 | Monitorización | 2.4 Competencia | **custodio** | Vigila el estado del competidor a lo largo del tiempo: `observar(competidor, señal)`. Único dueño de su registro de observaciones. |
| 9 | Benchmarking | 2.4 Competencia | **conversor** | Transforma: mis datos + datos de referencia → comparativa. Función pura, sin estado propio. |
| 10 | Diferenciación | 2.4 Competencia | **reflejo** | Se destila del posicionamiento — invariante: lo que el proyecto hace distinto. Un test lo afirma contra el mapa de competencia. |
| 11 | Segmentos | 2.5 Audiencia | **reflejo** | Cada segmento es un registro tipado (quién, qué necesita, dónde está, cómo decide). Determinista: un test afirma completitud de campos. |
| 12 | Personas | 2.5 Audiencia | **micro-agente** | Crear perfiles-arquetipo (nombre ficticio, necesidad, barrera, canal preferido) requiere juicio para sintetizar datos en narrativa accionable. |
| 13 | Propios | 2.6 Canales | **custodio** | Activos del proyecto (web, blog, email, app) — el proyecto es dueño, los mantiene, vigila su estado. |
| 14 | Ganados | 2.6 Canales | **custodio** | Reputación y autoridad (SEO orgánico, PR, reviews) — se acumula, se vigila, se protege. Único dueño de su registro. |
| 15 | Pagados | 2.6 Canales | **custodio** | Inversión por resultado — cada gasto se registra y vigila contra su retorno. Dueño de su contabilidad de inversión. |
| 16 | Compartidos | 2.6 Canales | **custodio** | Presencia prestada en plataformas de terceros — se mantiene, se vigila, se adapta a cambios de la plataforma. |
| 17 | Asignación | 2.7 Presupuesto | **reflejo** | Un reparto: porcentaje o cantidad por canal. Determinista, un test afirma que la suma cuadra y cada canal tiene su peso. |
| 18 | Control | 2.7 Presupuesto | **custodio** | Vigila el gasto vs lo asignado: `registrar(gasto, canal, fecha)`. Único dueño de su libro de gastos. |
| 19 | Planificación | 2.8 Calendario | **custodio** | La agenda (pieza × canal × fecha × responsable) — fuente de verdad del cuándo. Único dueño de su store. |
| 20 | Estacionalidad | 2.8 Calendario | **reflejo** | Marcas invariantes en el calendario: festividades, temporadas, lanzamientos. Un test afirma que cada marca tiene fecha y tipo. |
| 21 | Cadencia | 2.8 Calendario | **reflejo** | Regla determinista: "blog 2/semana, newsletter 1/semana, social 5/semana". Un test afirma la frecuencia por canal. |
| 22 | Awareness | 2.9 Funnel | **reflejo** | El proyecto es visible — estado binario, testable. La etapa tiene su métrica (alcance, impresiones) y sus acciones definidas. |
| 23 | Consideration | 2.9 Funnel | **micro-agente** | Evaluar si el proyecto es relevante para un segmento requiere juicio: interpretar señales de interés, adaptar el mensaje. |
| 24 | Conversion | 2.9 Funnel | **puente** | El punto de handoff: conecta marketing con la acción (comprar, registrar, contactar). Escucha y delega — no decide por el usuario. |
| 25 | Retention | 2.9 Funnel | **custodio** | Vigila y nutre la relación con quien ya actuó. Dueño de su registro de retención (frecuencia, churn, satisfacción). |
| 26 | Advocacy | 2.9 Funnel | **puente** | El cliente se convierte en canal — conecta al cliente satisfecho con la nueva audiencia. Sin store propio, facilita. |
| 27 | Tipos de pieza | 2.10 Contenido | **reflejo** | Catálogo de formatos (artículo, vídeo, infografía, landing...) con sus restricciones por canal. Determinista, tipado. |
| 28 | Ciclo de vida | 2.10 Contenido | **reflejo** | Estados de una pieza: idea → borrador → revisión → publicación → medición → actualización/retiro. Máquina de estados, testable. |
| 29 | Reutilización | 2.10 Contenido | **conversor** | Transforma pieza madre → hijas por canal (un artículo → 5 posts + 1 email + 1 infografía). Conversión pura de formato. |
| 30 | Email/Newsletter | 2.11 Relación | **puente** | Conecta el proyecto con la audiencia directamente (lista + segmento + pieza + frecuencia). Sin store propio — orquesta piezas existentes. |
| 31 | Comunidad | 2.11 Relación | **custodio** | Espacios donde la audiencia interactúa — el proyecto facilita, no controla. Vigila la salud de la comunidad, dueño de su estado. |
| 32 | Soporte como marketing | 2.11 Relación | **puente** | La experiencia post-venta retroalimenta la reputación — conecta el soporte con el marketing ganado. Escucha y delega. |
| 33 | Personalización | 2.11 Relación | **conversor** | Transforma: `adaptar(mensaje, perfil)`. Función pura — recibe mensaje genérico + datos del perfil, produce mensaje adaptado. |
| 34 | Briefing | 2.12 Campañas | **reflejo** | Documento tipado (objetivo, audiencia, canales, presupuesto, fechas, KPIs). Un test afirma completitud de cada campo obligatorio. |
| 35 | Lanzamiento | 2.12 Campañas | **puente** | Coordina la publicación de los assets de la campaña — conecta todas las piezas con sus canales en secuencia o simultáneo. |
| 36 | Cierre | 2.12 Campañas | **micro-agente** | Evaluar resultados vs objetivos requiere juicio: ¿funcionó? ¿qué se repite? ¿qué se cambia? Interpreta datos, emite veredicto. |
| 37 | Trigger | 2.13 Automatización | **reflejo** | El evento que dispara el flujo: `cuando(evento)`. Matching determinista — un test afirma que el evento correcto dispara el flujo correcto. |
| 38 | Secuencia | 2.13 Automatización | **reflejo** | Grafo de pasos con condiciones (enviar, esperar, evaluar, bifurcar). Máquina de estados determinista, testable paso a paso. |
| 39 | Reglas | 2.13 Automatización | **reflejo** | Predicados sobre el perfil/comportamiento que deciden el camino. Deterministas: dado un perfil, la regla siempre produce el mismo camino. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 15 | Posicionamiento, Objetivos, Métricas, Diferenciación, Segmentos, Asignación, Estacionalidad, Cadencia, Awareness, Tipos de pieza, Ciclo de vida, Briefing, Trigger, Secuencia, Reglas |
| **micro-agente** | 5 | Atribución, Experimentación, Personas, Consideration, Cierre |
| **custodio** | 9 | Monitorización, Propios, Ganados, Pagados, Compartidos, Control, Planificación, Retention, Comunidad |
| **conversor** | 4 | Reporting, Benchmarking, Reutilización, Personalización |
| **puente** | 6 | Publicación, Conversion, Advocacy, Email/Newsletter, Soporte como marketing, Lanzamiento |
| **TOTAL** | **39** | |

## Lectura del reparto

- **Reflejo domina (15/39 = 38%)** — coherente: el marketing de un proyecto es mayoritariamente catálogos tipados, reglas deterministas y máquinas de estados. Lo que un test afirma.
- **Custodio segundo (9/39 = 23%)** — los canales y presupuestos son activos que se vigilan: cada uno tiene un estado que proteger y un único dueño.
- **Puente tercero (6/39 = 15%)** — el marketing es por naturaleza conector: conecta contenido con canales, proyecto con audiencia, soporte con reputación.
- **Micro-agente bajo (5/39 = 13%)** — solo donde hay juicio irreducible: interpretar causas, sintetizar perfiles, evaluar resultados, formular hipótesis.
- **Conversor mínimo (4/39 = 10%)** — las conversiones de formato son pocas pero críticas: datos → reporte, pieza madre → hijas, mensaje → mensaje adaptado.

La distribución confirma que el marketing, pese a su apariencia creativa, es mayoritariamente **estructura determinista** (reflejo + custodio = 61%) con juicio concentrado en puntos específicos (micro-agente = 13%). Los puentes y conversores cierran las fronteras.
