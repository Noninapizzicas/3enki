---
name: fase-0-marketing
description: >-
  Entrevista interactiva al dueño para rellenar los 12 módulos de marketing de un
  proyecto. Se basa en el archivo F0 de identidad (fase0-identidad-negocio.json)
  y pregunta módulo por módulo con PREGUNTAS INCISIVAS que abren posibilidades.
  DOS PRINCIPIOS TRANSVERSALES en TODA la entrevista: (1) la visión JEFE vs
  CLIENTE se mantiene clara en cada módulo — si se pierde, el resultado final
  cambia; (2) los FRENOS SUMAN — donde el dueño no sabe o algo se bloquea, se
  convierte en una oportunidad que aporta, nunca se resta. Usa TODAS las skills
  de la cantera como herramienta para generar un buen producto. Entregable:
  fm0.md (Fundamento de Marketing). ES CONVERSACIONAL — se ejecuta en el chat,
  no como pipeline del registro.
when-to-use: >-
  El dueño dice "rellena el marketing", "haz la fase de marketing", "entrevístame
  para el marketing", o un proyecto ya pasó la FASE 0 (tiene
  fase0-identidad-negocio.json) y toca montar su estrategia de marketing.
source: hermes
tags: [enki, marketing, fase0, entrevista, interactivo, onboarding, fm0, jefe, cliente, frenos]
---

# Fase 0 de Marketing — entrevista para rellenar los 12 módulos

> **Naturaleza**: CONVERSACIONAL. Se ejecuta en el chat de Enki (como la F0 de
> identidad de proceso-negocio), NO como pipeline del registro. El chat NO puede
> invocarla con `invoke_agent` porque no está en
> `modules/agentes/registro/store/` — es una skill que guía la entrevista.

## Condición previa (GATE)

Solo arranca si el proyecto tiene el F0 de identidad:
`storage/proceso-negocio/fase0-identidad-negocio.json` (con `resumen.que_es`,
`que_vende`, `como_lo_elabora`). Sin él, primero debe hacerse la FASE 0 de
proceso-negocio. Si falta, decirlo y NO inventar el negocio.

## Los DOS principios transversales (presentes en CADA módulo)

### 1. Visión JEFE vs CLIENTE — siempre clara

- **JEFE** = el dueño del negocio. Declara las REGLAS: qué vende, a qué precio,
  qué descuento, qué presupuesto, qué canales, qué margen. Es quien decide.
- **CLIENTE** = el consumidor final. ELIGE, compra, repite. Es quien decide si
  el marketing funciona.

**Regla**: en cada módulo, distingue SIEMPRE qué es decisión del JEFE y qué es
necesidad del CLIENTE. Si se confunden (p. ej. asumir que lo que el dueño quiere
es lo que el cliente necesita), el resultado final cambia. Pregunta por ambos
lados: "¿qué decides tú (jefe)?" y "¿qué necesita el cliente?".

### 2. Los frenos SUMAN (nunca restan)

Donde el dueño **no sabe**, algo **se bloquea**, o una respuesta es **genérica**,
NO lo dejes como carencia ni te conformes. Ese freno es una **oportunidad**:
- Reformula la pregunta de otra forma para abrir la respuesta.
- Propón 2-3 opciones para que el dueño valide (más fácil que responder en blanco).
- Si sigue sin saber, márcalo `pregunta_abierta` PERO con una propuesta de cómo
  resolverlo (qué skill de la cantera usar, qué dato buscar, qué probar).

**Regla de oro**: "si nos conformamos con lo que tiene todo el mundo, somos
pobres." Cada respuesta genérica es un freno → conviértela en una oportunidad de
diferenciación. No aceptes "como los demás" — pregunta qué hace el negocio
DISTINTO, qué puede ofrecer que nadie más ofrece.

## Cómo empezar

1. `fs.read` de `storage/proceso-negocio/fase0-identidad-negocio.json` (F0).
2. Presenta en 2-3 líneas lo que entiendes del negocio (valida con el dueño).
3. Explica brevemente que vas a entrevistarle módulo por módulo, y que en cada
   uno distinguirás lo que él decide (JEFE) de lo que el cliente necesita
   (CLIENTE), y que donde no sepa, le propondrás opciones.
4. Entrevista módulo por módulo en orden (de cimientos a ejecución).

## ORDEN de entrevista (de cimientos a ejecución)

1. **strategy** — posicionamiento, propuesta de valor, objetivos
2. **audience** — segmentos, personas, necesidades
3. **competitors** — quiénes son, qué hacen, dónde flaquean
4. **channels** — canales activos, potenciales, priorización
5. **budget** — presupuesto disponible, distribución
6. **content** — voz de marca, tipos de contenido, frecuencia
7. **funnel** — etapas del embudo, conversiones actuales
8. **campaigns** — campañas activas o planeadas
9. **calendar** — hitos, temporadas, frecuencia de publicación
10. **analytics** — métricas actuales, herramientas, KPIs
11. **automation** — flujos automáticos existentes o deseados
12. **relations** — alianzas, colaboraciones, relaciones públicas

## Preguntas incisivas por módulo (abren posibilidades, no son escasas)

> Cada módulo tiene preguntas que van MÁS ALLÁ de lo obvio. Usa las skills de la
> cantera (email-marketing, content-marketing, google-ads, branding, seo-*, etc.)
> como referencia para saber QUÉ preguntar y QUÉ proponer. No te conformes con la
> primera respuesta: profundiza.

### 1. strategy (JEFE decide)
- ¿Qué te hace DISTINTO de cualquier otro que venda lo mismo? (si dice "nada", es un freno → propón diferenciadores: calidad, origen, servicio, conveniencia, historia)
- ¿Cuál es tu propuesta de valor en UNA frase? (si no sale, ayúdale a construirla)
- ¿Qué quieres conseguir en 3 meses? ¿Y en un año? (objetivos medibles)
- ¿A quién NO quieres vender? (define el foco, no todo el mundo)

### 2. audience (CLIENTE necesita)
- ¿Quién es tu cliente ideal? (no "todo el mundo" — segmenta: edad, zona, estilo de vida)
- ¿Qué problema le resuelves? ¿Qué dolor tiene que tú alivias?
- ¿Dónde está ese cliente? ¿Dónde pasa el tiempo (físico y digital)?
- ¿Qué le haría volver a comprarte? (recurrencia — la palanca del negocio)

### 3. competitors (JEFE observa, CLIENTE elige)
- ¿Quiénes son tus competidores directos? (nombres, no "otros")
- ¿Qué hacen bien? ¿Qué hacen mal? (huecos)
- ¿Qué ofrece la competencia que tú no? ¿Y qué ofreces tú que ellos no?
- ¿Por qué un cliente te elegiría a ti y no a ellos? (diferenciador real, no "la app")

### 4. channels (JEFE decide dónde, CLIENTE está)
- ¿Dónde está tu cliente? (canal donde vive, no donde te gustaría)
- ¿Qué canales usas hoy? ¿Cuáles funcionan y cuáles no?
- ¿Qué canal podrías probar que no usas? (WhatsApp, Instagram, email, SEO local)
- ¿Cómo llega hoy un cliente nuevo a ti? (boca a boca, calle, web, redes)

### 5. budget (JEFE decide)
- ¿Cuánto puedes invertir? (si "0€", es un freno → propón distribución de TIEMPO y esfuerzo, no solo dinero)
- ¿Qué parte de tu tiempo puedes dedicar al marketing a la semana?
- ¿Qué acción daría más retorno con menos coste? (prioriza)
- ¿Qué estás dispuesto a probar aunque no sepas si funciona? (experimentación)

### 6. content (JEFE define voz, CLIENTE consume)
- ¿Qué historia tiene tu negocio? (origen, por qué existe — el contenido más potente)
- ¿Qué contenido le sirve a tu cliente? (recetas, consejos, detrás de cámaras, ofertas)
- ¿Con qué frecuencia puedes publicar de forma realista? (no prometas más de lo que cumples)
- ¿Qué contenido haría que alguien te siguiera y te comprara?

### 7. funnel (CLIENTE recorre)
- ¿Cómo descubre alguien tu negocio hoy? (primer contacto)
- ¿Qué le hace decidir comprar? (motivación)
- ¿Dónde se pierde gente? (freno → propón cómo recuperarla)
- ¿Qué harías para que quien compra una vez, repita? (recurrencia)

### 8. campaigns (JEFE lanza, CLIENTE responde)
- ¿Qué campaña podrías lanzar esta semana con lo que tienes? (acción inmediata)
- ¿Qué oferta atraería a un cliente nuevo? ¿Y a uno que ya compró?
- ¿Qué temporada o evento puedes aprovechar? (navidad, verano, fiestas locales)
- ¿Cómo medirías si la campaña funcionó? (no lanzar a ciegas)

### 9. calendar (JEFE planifica)
- ¿Qué hitos tiene tu negocio al año? (temporadas, festivos, eventos)
- ¿Cuándo es tu temporada alta? ¿Y la baja? (qué hacer en cada una)
- ¿Qué cadencia de publicación puedes mantener? (semanal, quincenal)
- ¿Qué recordatorio o aviso recurrente puedes automatizar? (reenganche)

### 10. analytics (JEFE mide)
- ¿Qué métrica te importa de verdad? (ventas, repetición, pedidos — no vanidad)
- ¿Qué herramienta usas hoy para medir? (si ninguna, propón una simple)
- ¿Cuántos clientes nuevos tienes a la semana? ¿Cuántos repiten?
- ¿Qué dato te gustaría tener y no tienes? (freno → propón cómo obtenerlo)

### 11. automation (JEFE configura, CLIENTE recibe)
- ¿Qué proceso repites cada semana que podrías automatizar? (avisos, recordatorios, confirmaciones)
- ¿Qué mensaje automático le ahorraría tiempo al cliente? (confirmación, aviso de recogida)
- ¿Qué flujo de reenganche podrías montar? (quien no compra hace X tiempo)
- ¿Qué welcome le darías a un cliente nuevo? (primera impresión)

### 12. relations (JEFE cultiva, CLIENTE se fideliza)
- ¿Qué alianzas podrías hacer? (negocios complementarios, no competidores)
- ¿Qué colaboración te daría visibilidad? (influencers locales, eventos, prensa)
- ¿Cómo premias a tu cliente más fiel? (recurrencia, referidos)
- ¿Qué relación quieres tener con tu comunidad? (no solo vender, ser parte)

## Reglas de la entrevista

- **Una pregunta por turno**, espera respuesta.
- **Preguntas incisivas**: no te conformes con la primera respuesta. Si es
  genérica ("como los demás", "no sé", "todo el mundo"), es un freno → profundiza
  o propón opciones.
- **JEFE vs CLIENTE**: en cada módulo, distingue qué decide el dueño y qué
  necesita el cliente. Pregunta por ambos lados.
- **Frenos que suman**: donde no sepa, propón 2-3 opciones para validar. Nunca
  dejes un freno muerto.
- **Usa las skills de la cantera**: email-marketing, content-marketing, branding,
  google-ads, seo-*, etc. — como herramienta para saber qué preguntar y qué
  proponer. Tienes mucha herramienta de ayuda para generar un buen producto.
- **No conformarse**: "si nos conformamos con lo que tiene todo el mundo, somos
  pobres." Busca siempre la diferenciación.
- Al terminar cada módulo, **resume lo obtenido y confirma** antes de seguir.
- Lo que el dueño no sabe → `pregunta_abierta` con propuesta de resolución.

## Entregable: fm0.md (al terminar la entrevista)

Genera el Fundamento de Marketing y guárdalo en `storage/marketing/fm0.md`
(la ruta canónica del marketing del proyecto — NO en `storage/esquema/` ni con
`storage/` duplicado). Estructura (H2 por sección):

1. RESUMEN EJECUTIVO — el negocio, su posición, su oportunidad
2. IDENTIDAD DE MARCA — voz, valores, propuesta de valor (del negocio real)
3. AUDIENCIA — segmentos con persona, necesidad, canal preferido
4. COMPETENCIA — mapa competitivo, huecos, diferenciadores
5. ESTRATEGIA DE CANALES — canales priorizados con justificación
6. CONTENIDO — plan editorial básico: tipos, frecuencia, tono
7. EMBUDO — etapas, métricas objetivo, tácticas por etapa
8. PRESUPUESTO — distribución por canal/acción (dinero Y tiempo)
9. CALENDARIO — hitos Q1-Q4, temporadas del negocio
10. AUTOMATIZACIÓN — flujos propuestos
11. RELACIONES — alianzas y PR
12. PREGUNTAS ABIERTAS — lo que falta por responder, con propuesta de resolución

Cada dato citado viene de la entrevista o se marca `[PENDIENTE]`. **PROHIBIDO**
inventar datos que el dueño no dio. Pero cada sección debe tener la
**diferenciación** (qué hace este negocio distinto) — si una sección queda
genérica, es un freno sin resolver.
