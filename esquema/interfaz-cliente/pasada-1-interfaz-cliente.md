# Pasada 1 — Prisma sobre "Interfaz Cliente"

**Sujeto:** El sistema completo que presenta un proyecto a sus clientes finales. Conecta los datos de marketing, la identidad visual del proyecto, las herramientas de generación y la publicación — para que el cliente reciba una experiencia coherente, adaptada al tipo de proyecto.

---

## [IDENTIDAD] — ¿Qué es la interfaz cliente?

Es el **punto de contacto** entre el proyecto y su cliente final. Todo lo que el cliente ve, toca, lee, navega — la cara pública del proyecto. No es un solo canal ni una sola tecnología: es un sistema que ensambla datos (qué decir), identidad visual (cómo verse), estructura (cómo organizarse) y salida (dónde publicarse).

La interfaz varía radicalmente según el tipo de proyecto (restaurante → carta digital; e-commerce → catálogo y checkout; servicios → landing de captación; app → pantallas de uso). Pero la anatomía subyacente es la misma: alguien definió una estrategia, tiene contenido, tiene una audiencia, tiene una marca — y todo eso se materializa en una experiencia que el cliente consume.

Sub-productos:

- **Perfil de cliente** — quién es el destinatario de esta interfaz. El tipo de cliente (comprador, comensal, visitante, usuario) condiciona TODO lo demás. → SPAWN (tiene estructura interna: tipo, necesidades, contexto de uso, dispositivo, momento)

- **Presencia** — los lugares donde el proyecto se hace visible al cliente. Cada presencia es un canal con sus reglas (web, app, carta física, redes, marketplace, email). → SPAWN (tiene estructura: canal, formato, restricciones, estado)

- **Experiencia** — el viaje que el cliente recorre desde que descubre el proyecto hasta que interactúa con él (y vuelve). No es el funnel de marketing (eso mide conversiones) — es la experiencia vivida. → SPAWN (tiene estructura: etapas, puntos de contacto, emociones, fricciones)

- **Ensamblador** — el motor que toma los datos de marketing, la piel del proyecto, el tipo de presencia y genera la interfaz concreta. Es la pieza convergente donde se cruzan todas las dimensiones. → SPAWN (es el corazón del sistema — toma N inputs y produce la salida)

## [RESTRICCIONES] — ¿Qué limita la interfaz cliente?

- **REF** Estrategia de marketing → marketing-strategy (qué decir y a quién)
- **REF** Audiencia → marketing-audience (segmentos y perfiles)
- **REF** Canales → marketing-channels (por dónde llegar)
- **REF** Contenido → marketing-content (piezas de contenido)
- **REF** Identidad visual → piel del proyecto / marca-cliente (cómo verse)
- **REF** Perfil del proyecto → project-profile (qué es el negocio)
- **REF** Publicación → publicador (dónde y cómo se sirve al público)

## [CONTRATO] — ¿Qué promete el sistema?

- **Coherencia cross-canal** — la misma identidad en web, email, redes, carta, app. El cliente reconoce al proyecto donde lo encuentre. → ATÓMICO
- **Adaptación al tipo** — la interfaz se ajusta al tipo de proyecto/cliente sin código específico por vertical. El tipo es input, no hardcode. → ATÓMICO
- **Dato vivo** — la interfaz refleja el estado actual del marketing (si cambia el contenido, la landing cambia; si cambia la piel, el look cambia). No es estática. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO es la interfaz cliente?

- **No es el backoffice** — eso es la cara TRABAJO del proyecto (comandero, cocina, admin). Frontera clara: rutas distintas, pieles distintas.
- **No es el CMS** — no edita contenido. El contenido viene de marketing-content. La interfaz lo PRESENTA, no lo crea.
- **No es el motor de marketing** — no ejecuta campañas, no calcula analytics, no mueve el funnel. Esos son los 12 módulos. La interfaz es la SALIDA visible de lo que esos módulos producen.
- **No es el diseñador** — no decide la marca ni la tipografía. La piel viene del proyecto. La interfaz la APLICA.

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿La interfaz soporta interactividad bidireccional (formularios, checkout, chat) o es solo presentación?
- ¿Qué pasa con la internacionalización (i18n)?
- ¿El cliente puede personalizar su experiencia (preferencias, idioma, modo oscuro)?
- ¿Cómo se versiona una interfaz publicada (A/B testing, staging vs producción)?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 4 | Perfil de cliente, Presencia, Experiencia, Ensamblador |
| REF | 7 | marketing-strategy, marketing-audience, marketing-channels, marketing-content, piel, project-profile, publicador |
| ATÓMICO | 3 | Coherencia cross-canal, Adaptación al tipo, Dato vivo |
| [ABIERTO] | 1 | 4 preguntas |
