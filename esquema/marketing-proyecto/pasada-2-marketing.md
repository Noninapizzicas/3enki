# Pasada 2 — Prisma sobre los sub-productos de Pasada 1

Los SPAWN de la pasada 1 se expanden aquí. Los REF y ATÓMICOS no se tocan.

---

## 2.1 Estrategia

**¿Qué es?** El plan que decide a quién, con qué mensaje, por qué canal, en qué momento y con qué presupuesto actúa el marketing del proyecto. Es el cerebro antes de las manos.

- **Posicionamiento** — qué espacio ocupa el proyecto en la mente de su audiencia → ATÓMICO (una declaración, un test la afirma: "¿puedo decir en una frase qué soy y por qué me eligen?")
- **Objetivos** — qué quiere conseguir el marketing (tráfico, leads, ventas, awareness...) → ATÓMICO (lista de metas medibles)
- **Segmentación** — cómo se parte la audiencia en grupos accionables → se funde con Audiencia (ver 2.5)
- **Mix de canales** — qué canales se priorizan y con qué peso → se funde con Canales (ver 2.6)
- **Presupuesto** — cuánto se asigna a cada canal/acción → se funde con Presupuesto de marketing (ver 2.7)

Sub-productos: Posicionamiento ATÓMICO, Objetivos ATÓMICO. El resto converge en otros SPAWNs.

## 2.2 Ejecución

**¿Qué es?** La producción y publicación de las piezas y acciones que materializan la estrategia. Las manos después del cerebro.

- **Producción de contenido** — crear las piezas (textos, imágenes, vídeos, landing pages...) → se funde con Contenido (ver 2.10)
- **Publicación** — poner las piezas en los canales → ATÓMICO (acto de llevar la pieza al canal: el puerto `publicar(pieza, canal)`)
- **Campañas** — acciones coordinadas con inicio, fin y objetivo específico → SPAWN
- **Automatización** — flujos que se ejecutan sin intervención humana (email sequences, retargeting...) → SPAWN
- **Calendario** — cuándo se hace qué → se funde con Calendario editorial (ver 2.8)

Sub-productos: Publicación ATÓMICO, Campañas SPAWN, Automatización SPAWN.

## 2.3 Medición

**¿Qué es?** El sistema nervioso del marketing — captura datos de cada acción, los transforma en información y retroalimenta la estrategia. Sin medición, el marketing es ciego.

- **Métricas** — los números que se rastrean (impresiones, clicks, conversiones, coste, ROI...) → ATÓMICO (un catálogo de KPIs tipados)
- **Atribución** — asignar qué acción causó qué resultado → ATÓMICO (modelo de atribución elegido)
- **Reporting** — presentar los datos de forma legible para decidir → ATÓMICO (el puerto `visualizar(datos, formato)`)
- **Experimentación** — A/B testing, variantes, hipótesis → ATÓMICO (un ciclo: hipótesis → variante → dato → veredicto)

Sub-productos: todos ATÓMICOS.

## 2.4 Competencia

**¿Qué es?** Los otros que compiten por la misma atención de la misma audiencia. No necesariamente competidores directos de negocio — cualquiera que ocupe el espacio mental o el canal que el proyecto necesita.

- **Monitorización** — saber qué hacen, dónde publican, qué posicionan → ATÓMICO (el puerto `observar(competidor, señal)`)
- **Benchmarking** — comparar las métricas propias con las del sector → ATÓMICO (la comparativa: mis datos vs referencia)
- **Diferenciación** — lo que el proyecto hace distinto o mejor → ATÓMICO (se destila del posicionamiento)

Sub-productos: todos ATÓMICOS.

## 2.5 Audiencia

**¿Qué es?** El conjunto de personas a las que el proyecto quiere llegar. No es "todo el mundo" — es un grupo definido con características, necesidades y comportamientos que el proyecto puede servir.

- **Segmentos** — grupos dentro de la audiencia con comportamiento distinto → ATÓMICO (cada segmento tiene: quién es, qué necesita, dónde está, cómo decide)
- **Personas/Perfiles** — arquetipos representativos de cada segmento → ATÓMICO (un perfil tipado: nombre ficticio, necesidad, barrera, canal preferido)
- **Journey** — el camino que recorre desde que no sabe del proyecto hasta que es cliente fiel → se funde con Funnel (ver 2.9)

Sub-productos: Segmentos ATÓMICO, Personas ATÓMICO.

## 2.6 Canales

**¿Qué es?** Los medios por los que el marketing llega a su audiencia. Cada canal tiene reglas, formatos, costes y audiencias propias. El proyecto elige un subconjunto según su estrategia.

Se agrupa por naturaleza:

- **Propios** — lo que el proyecto controla: web, blog, email, app → ATÓMICO (activos del proyecto)
- **Ganados** — atención que se gana sin pagar: SEO, PR, boca a boca, reviews → ATÓMICO (reputación y autoridad)
- **Pagados** — atención que se compra: ads, sponsorships, influencers → ATÓMICO (inversión por resultado)
- **Compartidos** — presencia en plataformas de terceros: redes sociales, marketplaces, directorios → ATÓMICO (presencia prestada)

Sub-productos: todos ATÓMICOS (cada tipo de canal es una categoría con sus reglas).

## 2.7 Presupuesto de marketing

**¿Qué es?** Los recursos (dinero y tiempo) asignados al marketing del proyecto. Finito, competitivo entre canales, justificable por ROI.

- **Asignación por canal** — cuánto va a cada canal → ATÓMICO (un reparto)
- **Control de gasto** — tracking de lo gastado vs lo asignado → ATÓMICO (el puerto `registrar(gasto, canal, fecha)`)
- **ROI por canal** — retorno de cada euro/hora invertida → se funde con Medición.Atribución

Sub-productos: Asignación ATÓMICO, Control ATÓMICO.

## 2.8 Calendario editorial

**¿Qué es?** La agenda de cuándo se produce y publica cada pieza. Es el reloj del marketing — coordina contenido, campañas, estacionalidad y capacidad del equipo.

- **Planificación** — qué se publica, cuándo, en qué canal, quién lo produce → ATÓMICO (entrada tipada: pieza × canal × fecha × responsable)
- **Estacionalidad** — eventos recurrentes que afectan al calendario (festividades, temporadas, lanzamientos) → ATÓMICO (marcas en el calendario)
- **Cadencia** — la frecuencia de publicación por canal → ATÓMICO (regla: "blog 2/semana, newsletter 1/semana, social 5/semana")

Sub-productos: todos ATÓMICOS.

## 2.9 Funnel

**¿Qué es?** El embudo que modela el camino del desconocido al cliente fiel. Cada etapa tiene una acción del marketing y una métrica asociada.

Etapas universales:
- **Awareness** — saber que existe → ATÓMICO (el proyecto es visible)
- **Consideration** — evaluar si sirve → ATÓMICO (el proyecto es relevante)
- **Conversion** — actuar (comprar, registrar, contactar) → ATÓMICO (el proyecto es elegible)
- **Retention** — volver → ATÓMICO (el proyecto cumple y fideliza)
- **Advocacy** — recomendar → ATÓMICO (el cliente se convierte en canal)

Sub-productos: todos ATÓMICOS (cada etapa es una pieza con su métrica y sus acciones).

## 2.10 Contenido

**¿Qué es?** Las piezas que el marketing produce para atraer, informar, convencer y fidelizar. Cada pieza tiene un formato, un canal de destino y una etapa del funnel a la que sirve.

- **Tipos de pieza** — artículo, vídeo, infografía, landing, email, post social, podcast, caso de éxito, comparativa, guía, FAQ... → ATÓMICO (un catálogo de formatos con sus restricciones)
- **Ciclo de vida** — idea → borrador → revisión → publicación → medición → actualización/retiro → ATÓMICO (estados de una pieza)
- **Reutilización** — una pieza grande se fragmenta en piezas menores para distintos canales (un artículo → 5 posts sociales + 1 email + 1 infografía) → ATÓMICO (el conversor: pieza madre → hijas por canal)

Sub-productos: todos ATÓMICOS.

## 2.11 Relación

**¿Qué es?** La comunicación continuada entre el proyecto y su audiencia. No es unidireccional (publicar y olvidar) — incluye escuchar, responder y personalizar.

- **Email/Newsletter** — comunicación directa, permiso-based → ATÓMICO (lista + segmento + pieza + frecuencia)
- **Comunidad** — espacios donde la audiencia interactúa entre sí y con el proyecto → ATÓMICO (foro, grupo, canal: el proyecto facilita, no controla)
- **Soporte como marketing** — la experiencia post-venta retroalimenta la reputación → ATÓMICO (la frontera: resolver bien = marketing ganado)
- **Personalización** — adaptar el mensaje al individuo según sus datos → ATÓMICO (el puerto `adaptar(mensaje, perfil)`)

Sub-productos: todos ATÓMICOS.

## 2.12 Campañas (de 2.2 Ejecución)

**¿Qué es?** Una acción coordinada con inicio, fin y objetivo específico. Corta un trozo del funnel y lo trabaja con intensidad. Usa múltiples canales y piezas de contenido alineados.

- **Briefing** — el encargo: objetivo, audiencia, canales, presupuesto, fechas, KPIs → ATÓMICO (documento tipado)
- **Assets** — las piezas producidas para la campaña → REF (Contenido.Tipos de pieza)
- **Lanzamiento** — la coordinación de publicar todo a la vez o en secuencia → ATÓMICO (el acto de activar)
- **Seguimiento** — monitorizar en tiempo real y ajustar → REF (Medición)
- **Cierre** — evaluar resultados vs objetivos, aprender → ATÓMICO (veredicto: ¿funcionó? ¿qué se repite? ¿qué se cambia?)

Sub-productos: Briefing ATÓMICO, Lanzamiento ATÓMICO, Cierre ATÓMICO.

## 2.13 Automatización (de 2.2 Ejecución)

**¿Qué es?** Flujos que se ejecutan sin intervención humana una vez configurados. Responden a un evento (un registro, un abandono de carrito, un aniversario) con una acción predefinida.

- **Trigger** — el evento que dispara el flujo → ATÓMICO (el puerto `cuando(evento)`)
- **Secuencia** — los pasos que se ejecutan (enviar email, esperar, evaluar, bifurcar) → ATÓMICO (un grafo de pasos con condiciones)
- **Reglas** — las condiciones que deciden el camino dentro de la secuencia → ATÓMICO (predicados sobre el perfil/comportamiento)

Sub-productos: todos ATÓMICOS.

---

**Resumen de esta pasada:**

| Estado | Piezas |
|---|---|
| ATÓMICO | Posicionamiento, Objetivos, Publicación, Métricas, Atribución, Reporting, Experimentación, Monitorización, Benchmarking, Diferenciación, Segmentos, Personas, Propios, Ganados, Pagados, Compartidos, Asignación, Control, Planificación, Estacionalidad, Cadencia, Awareness, Consideration, Conversion, Retention, Advocacy, Tipos de pieza, Ciclo de vida, Reutilización, Email/Newsletter, Comunidad, Soporte como marketing, Personalización, Briefing, Lanzamiento, Cierre, Trigger, Secuencia, Reglas |
| REF | Identidad de marca, Directrices de marca, Presencia digital, Assets, Seguimiento |
| [ABIERTO] | PREGUNTAS_ABIERTAS de pasada 1 |
| SPAWN | 0 — todo tocó suelo |

**La pasada 2 agotó el prisma. Todo es atómico, referencia o abierto. Siguiente: disección.**
