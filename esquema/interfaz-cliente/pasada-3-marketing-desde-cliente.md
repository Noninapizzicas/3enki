# Pasada 3 — Los 12 módulos de marketing desde el CLIENTE

Método: prisma sobre cada módulo preguntando **"¿qué de esto VE o CONSUME el cliente final?"**.
El esquematizador es la herramienta de clasificación: lo que sale ATÓMICO es dato-cliente;
lo que cae en NO-OBJETIVO es dato interno (jefe/operador).

---

## Criterio de corte

Cada campo del store se clasifica con UNA pregunta:

> **¿El cliente final necesita ver o consumir este dato para completar su intención?**
> - **SÍ** → CLIENTE (alimenta el ensamblador)
> - **NO** → INTERNO (backoffice / operador / jefe)
> - **PARCIAL** → el campo tiene sub-datos: unos salen al cliente, otros se quedan

---

## 1. marketing-strategy

**Store**: `{ posicionamiento, objetivos, alineacion_negocio, conocimiento_disponible, revisiones }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `posicionamiento.declaracion` | **SÍ** | Titular hero, tagline, about | #12 Contenido → #21 Inyección |
| `posicionamiento.propuesta_valor` | **SÍ** | Subtítulo hero, landing copy | #12 Contenido → #21 Inyección |
| `posicionamiento.atributos_deseados[]` | **SÍ** | Features, badges, puntos clave | #12 Contenido |
| `posicionamiento.territorio.categoria` | PARCIAL | Informa al arquetipo (#1), no se muestra literalmente | #1 Arquetipo (indirecto) |
| `posicionamiento.territorio.vecinos[]` | NO | Análisis competitivo interno | — |
| `posicionamiento.credibilidad.evidencias[]` | **SÍ** | Trust badges, "as seen in", cifras | #12 Contenido (trust cues) |
| `posicionamiento.consistencia.*` | NO | Control temporal interno | — |
| `objetivos[]` | NO | Metas internas del negocio | — |
| `alineacion_negocio[]` | NO | Mapeo interno estrategia-negocio | — |
| `conocimiento_disponible` | NO | Inventario interno de gaps | — |
| `revisiones` | NO | Agenda interna | — |

**Resumen**: 4 campos CLIENTE (declaración, propuesta_valor, atributos, evidencias). El resto es tablero de mando del jefe.

---

## 2. marketing-channels

**Store**: `{ canales[], capacidad_operativa, prioridades[] }`

Cada canal: `{ id, nombre, clasificacion, plataforma, estado, config, metricas, notas }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `canales[].nombre` | PARCIAL | El cliente NO ve "canales" — pero la presencia (#5) NACE de un canal activo | #5 Canal (indirecto) |
| `canales[].plataforma` | PARCIAL | Determina formato (#7) y links sociales (footer, contacto) | #7 Formato, #16 Navegación |
| `canales[].estado` | PARCIAL | Solo canales `activo` generan presencias visibles | #8 Estado presencia |
| `canales[].config` | NO | Configuración técnica interna (API keys, etc.) | — |
| `canales[].metricas` | NO | Analytics internos | — |
| `capacidad_operativa` | NO | Recurso interno del equipo | — |
| `prioridades[]` | NO | Decisión interna de foco | — |

**Resumen**: El canal no se muestra al cliente directamente — pero un canal activo GENERA una presencia visible. Los datos que fluyen son: nombre (para links sociales), plataforma (para formato), estado (para filtrar qué existe).

---

## 3. marketing-audience

**Store**: `{ segmentos[], personas[], datos_disponibles }`

Cada segmento: `{ id, nombre, descripcion, criterios, tamaño, prioridad }`
Cada persona: `{ id, nombre, descripcion, segmento_id, datos_demograficos, comportamiento, motivaciones, frustraciones, canales_preferidos }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `segmentos[]` | NO | Clasificación interna del público | — |
| `personas[].canales_preferidos` | PARCIAL | Informa qué presencias priorizar — no se muestra | #5 Canal (indirecto) |
| `personas[].motivaciones` | PARCIAL | Informa el tono del copy — no se muestra literalmente | #12 Contenido (indirecto) |
| `personas[].frustraciones` | PARCIAL | Informa las objeciones a responder — no se muestra | #12 Contenido (indirecto) |
| `datos_disponibles` | NO | Inventario interno | — |

**Resumen**: 0 campos directamente para el cliente. Los datos de audiencia informan CÓMO se escribe el contenido (el conversor #12 los usa como contexto), pero el cliente nunca ve "segmentos" ni "personas".

---

## 4. marketing-competitors

**Store**: `{ competidores[], observaciones[], dimensiones[], puntuaciones[], diferenciacion[], info_accesible }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `diferenciacion[]` | PARCIAL | Los puntos de diferenciación alimentan copy comparativo ("a diferencia de X, nosotros...") | #12 Contenido (indirecto) |
| `competidores[]` | NO | Radar interno | — |
| `observaciones[]` | NO | Notas internas del análisis | — |
| `dimensiones[]` | NO | Ejes de benchmark interno | — |
| `puntuaciones[]` | NO | Scoring interno | — |
| `info_accesible` | NO | Inventario de fuentes | — |

**Resumen**: 0 campos directos. La diferenciación puede nutrir copy de forma indirecta (el conversor la sintetiza en proposiciones de valor), pero el módulo completo es inteligencia competitiva interna.

---

## 5. marketing-budget

**Store**: `{ presupuesto: { cantidad, moneda, periodo }, partidas[], gastos[] }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| (todos) | NO | Nada. El presupuesto es 100% interno. | — |

**Resumen**: 0 campos para el cliente. El presupuesto no tiene cara pública.

---

## 6. marketing-calendar

**Store**: `{ entradas[], marcas[], cadencias[] }`

Cada entrada: `{ id, titulo, tipo, fecha, canal_id, estado, contenido_id, notas }`
Cada marca: `{ id, nombre, fecha_inicio, fecha_fin, tipo }`
Cada cadencia: `{ id, nombre, frecuencia, canal_id, tipo_contenido }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `entradas[].fecha` | PARCIAL | Si es un evento público (lanzamiento, promo): la fecha se publica | #12 Contenido (condicional) |
| `entradas[].titulo` | PARCIAL | Si es contenido publicado: el título aparece en blog/newsletter | #12 Contenido (condicional) |
| `marcas[]` | PARCIAL | Fechas estacionales pueden generar landing pages temáticas (Navidad, Black Friday) | #9 Tipo de página (landing temporal) |
| `cadencias[]` | NO | Ritmo interno de publicación | — |

**Resumen**: Mayoritariamente interno. Algunas entradas (tipo `evento` o `lanzamiento`) pueden tener cara pública; las marcas estacionales pueden disparar landings temporales. El conversor filtra: solo lo público sale.

---

## 7. marketing-content

**Store**: `{ piezas[] }`

Cada pieza: `{ id, titulo, formato, canal_id, etapa_funnel, descripcion, madre_id, estado, contenido }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `piezas[].titulo` | **SÍ** | Títulos de blog, newsletter, sección | #12 Contenido |
| `piezas[].contenido` | **SÍ** | Cuerpo del texto publicado | #12 Contenido → #21 Inyección |
| `piezas[].formato` | PARCIAL | Determina dónde se publica (blog post vs email vs social) | #7 Formato |
| `piezas[].canal_id` | PARCIAL | Indica en qué presencia aparece | #5 Canal |
| `piezas[].etapa_funnel` | NO | Clasificación interna | — |
| `piezas[].madre_id` | NO | Estructura de fragmentación interna | — |
| `piezas[].estado` | PARCIAL | Solo `publicada` sale al cliente | filtro del conversor |
| `piezas[].descripcion` | PARCIAL | Meta description o resumen en listado | #13 SEO, #12 Contenido |

**Resumen**: El módulo MÁS orientado al cliente. Las piezas publicadas SON el contenido que el cliente consume. El conversor (#12) filtra por estado=publicada y mapea título+contenido a secciones.

---

## 8. marketing-analytics

**Store**: `{ metricas[], experimentos[] }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| (todos) | NO | Nada. Analytics es medición interna de rendimiento. | — |

**Resumen**: 0 campos para el cliente. Las métricas y experimentos son para el equipo de marketing.

---

## 9. marketing-funnel

**Store**: `{ etapas[], flujos[] }`

Cada etapa: `{ id, nombre, orden, descripcion, metrica_principal, acciones[], volumen }`
Cada flujo: `{ id, etapa_origen, etapa_destino, tasa, fecha }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `etapas[].nombre` | PARCIAL | La etapa informa el tipo de contenido a mostrar (awareness=hero, conversion=CTA+pricing) | #20 Selección estructura (indirecto) |
| `etapas[].acciones[]` | PARCIAL | Las acciones de conversión pueden ser CTAs para el cliente | #17 CTAs (indirecto) |
| `flujos[]` | NO | Tasas de conversión internas | — |
| `etapas[].volumen` | NO | Métricas internas | — |

**Resumen**: 0 campos directos. El funnel informa la ESTRATEGIA de qué mostrar a cada nivel de compromiso (#4), pero el cliente nunca ve "etapa awareness" ni "tasa de conversión".

---

## 10. marketing-campaigns

**Store**: `{ campañas[] }`

Cada campaña: `{ id, nombre, tipo, objetivo, canales[], publico_objetivo, presupuesto, fechas, estado, contenidos[], resultados }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `campañas[].contenidos[]` | PARCIAL | Los contenidos de una campaña activa pueden generar landing pages | #9 Tipo de página (landing campaña) |
| `campañas[].fechas` | PARCIAL | Si la campaña tiene oferta temporal, la fecha se muestra | #12 Contenido (urgency) |
| `campañas[].nombre` | PARCIAL | Puede ser el título de la landing de campaña | #12 Contenido |
| `campañas[].estado` | PARCIAL | Solo `activa` tiene cara pública | filtro del conversor |
| `campañas[].objetivo` | NO | Meta interna | — |
| `campañas[].presupuesto` | NO | Inversión interna | — |
| `campañas[].resultados` | NO | Métricas internas | — |
| `campañas[].publico_objetivo` | NO | Segmentación interna | — |

**Resumen**: Campañas activas generan presencias temporales (landing pages de campaña). El conversor extrae: nombre, contenidos, fechas de la campaña activa para montar la landing.

---

## 11. marketing-automation

**Store**: `{ flujos[] }`

Cada flujo: `{ id, nombre, trigger, pasos[], estado, ejecuciones }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| (todos) | NO | Nada directo. Los flujos de automatización son maquinaria interna (enviar email al 3er día, re-engagement). El cliente RECIBE los emails que la automatización genera, pero no ve "flujos" ni "triggers". | — |

**Resumen**: 0 campos directos. La automatización es el motor invisible — sus SALIDAS (emails, notificaciones) llegan al cliente a través del renderizado (#23) y la publicación (#24), pero el flujo es interno.

---

## 12. marketing-relations

**Store**: `{ suscriptores[], interacciones[] }`

Cada suscriptor: `{ id, nombre, email, canal, estado, fecha_alta, tags[], preferencias }`
Cada interacción: `{ id, suscriptor_id, tipo, fecha, canal, detalle }`

| Campo | ¿Cliente? | Destino en la interfaz | Pieza esquema |
|---|---|---|---|
| `suscriptores[].preferencias` | PARCIAL | Las preferencias del suscriptor pueden personalizar qué contenido ve | #4 Nivel de compromiso (indirecto) |
| `suscriptores[].estado` | PARCIAL | Un suscriptor `activo` recibe newsletters | filtro de publicación |
| `interacciones[]` | NO | Historial interno de contactos | — |
| `suscriptores[].tags[]` | NO | Clasificación interna | — |

**Resumen**: 0 campos directos visibles. Las preferencias del suscriptor pueden influir en la personalización futura, pero el cliente no ve su "ficha de suscriptor". Lo que ve es el FORMULARIO DE SUSCRIPCIÓN (#28 Captura de entrada) y los EMAILS que recibe (#23 Renderizado → #24 Publicación).

---

## Mapa resumen — Datos que fluyen al cliente

```
                    MÓDULOS CON DATOS PARA EL CLIENTE
                    ═══════════════════════════════════

 ██████████  marketing-content ······ piezas publicadas (título, contenido, formato)
                                       → EL PROVEEDOR PRINCIPAL de contenido-cliente

 ████░░░░░░  marketing-strategy ····· declaración, propuesta_valor, atributos, evidencias
                                       → hero, tagline, about, trust badges

 ██░░░░░░░░  marketing-campaigns ···· campañas activas (nombre, contenidos, fechas)
                                       → landings temporales, ofertas

 █░░░░░░░░░  marketing-calendar ····· entradas públicas, marcas estacionales
                                       → eventos, landings temporales

 ░░░░░░░░░░  marketing-channels ····· canales activos (nombre, plataforma)
                                       → genera presencias, links sociales


                    MÓDULOS QUE INFORMAN AL CONVERSOR (indirectos)
                    ═══════════════════════════════════════════════

 ▒▒▒▒▒▒▒▒▒▒  marketing-audience ····· personas (motivaciones, frustraciones)
                                        → tono del copy, objeciones a responder

 ▒▒▒▒▒▒▒▒▒▒  marketing-funnel ······· etapas + acciones
                                        → qué mostrar según nivel de compromiso

 ▒▒▒▒▒▒▒▒▒▒  marketing-competitors ·· diferenciación
                                        → copy comparativo

 ▒▒▒▒▒▒▒▒▒▒  marketing-relations ···· preferencias del suscriptor
                                        → personalización futura


                    MÓDULOS 100% INTERNOS (0 datos al cliente)
                    ════════════════════════════════════════════

 ░░░░░░░░░░  marketing-budget ······· presupuesto, partidas, gastos
 ░░░░░░░░░░  marketing-analytics ···· métricas, experimentos
 ░░░░░░░░░░  marketing-automation ··· flujos, triggers, ejecuciones
```

---

## Conclusiones para el ensamblador

### 1. Tres capas de datos

El conversor (#12 / #21 Inyección de datos) tiene tres capas de inputs:

| Capa | Módulos | Naturaleza | Cómo fluye |
|---|---|---|---|
| **DIRECTA** | content, strategy | Datos que SE MUESTRAN al cliente tal cual | `pieza.titulo` → hero.headline; `propuesta_valor` → hero.subheading |
| **GENERATIVA** | campaigns, calendar | Datos que GENERAN presencias temporales | campaña activa → landing page; marca estacional → landing temporal |
| **CONTEXTUAL** | audience, funnel, competitors, relations | Datos que INFORMAN al conversor de cómo escribir | persona.frustraciones → objeciones FAQ; funnel.etapa → selección de estructura |

### 2. El conversor necesita un protocolo de resolución

```
PARA CADA sección de la página:
  1. BUSCAR datos DIRECTOS (content.piezas, strategy.posicionamiento)
  2. SI faltan datos directos Y hay campaña activa → USAR datos generativos
  3. ENRIQUECER con datos contextuales (tono por persona, CTAs por funnel)
  4. SI sigue vacío → MARCAR como hueco (el micro-agente #20 decide si la sección se omite)
```

### 3. Módulos por pieza del esquema (mapa de alimentación)

```
#1  Arquetipo        ← project-profile (fuente primaria), strategy.territorio.categoria
#2  Intención        ← project-profile, audience.personas[].motivaciones
#4  Compromiso       ← funnel.etapas (mapeo), relations.suscriptores[].estado
#5  Canal            ← channels.canales[] (activos)
#9  Tipo de página   ← arquetipo (#1) + campaigns (landings) + calendar (temporales)
#12 Contenido        ← content.piezas[] (DIRECTA) + strategy.posicionamiento (DIRECTA)
                       + competitors.diferenciacion (CONTEXTUAL) + audience.personas (CONTEXTUAL)
#13 SEO              ← strategy.propuesta_valor, content.piezas[].descripcion
#17 CTAs             ← funnel.etapas[].acciones, strategy.objetivos[].meta (adaptado)
#20 Selección        ← arquetipo (#1), funnel.etapas (qué secciones por etapa)
#21 Inyección        ← TODOS los directos + generativos
#25 Sincronización   ← ESCUCHA eventos de: content, strategy, campaigns, calendar, channels
```

### 4. Lo que NO toca al conversor

Tres módulos enteros (budget, analytics, automation) NO tienen dato que fluya al cliente.
Pero automation tiene un efecto LATERAL: sus flujos disparan envíos que el renderizado (#23) procesa.
Budget y analytics son 100% tablero del jefe.

---

## Siguiente paso

El prisma sobre los módulos desde el cliente está completo. La pasada dice:
- **QUÉ campos** alimentan la interfaz del cliente
- **POR QUÉ pieza** del esquema entran
- **EN QUÉ capa** operan (directa / generativa / contextual)

Lo que falta: construir el CONVERSOR (#12 / #21) que materializa estos mapeos.
Ese conversor es el corazón del agente que el usuario quiere: lee un módulo, sabe qué campos
son para el cliente (esta pasada se lo dice), y genera los componentes que los presentan.
