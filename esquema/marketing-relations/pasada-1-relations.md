# Pasada 1 — Prisma sobre "marketing-relations" (Relación con la audiencia)

## ¿Qué es?

La comunicación continuada entre el proyecto y su audiencia. No es unidireccional (publicar y olvidar) — incluye escuchar, responder y personalizar. Cada relación tiene un canal, una frecuencia y un nivel de personalización. El módulo gestiona listas, preferencias y el historial de interacción.

---

## [IDENTIDAD] — ¿Qué es la relación?

- **Suscriptores** — las personas que han dado permiso para recibir comunicación directa. Cada suscriptor tiene un canal preferido, segmentos y estado (activo/pausado/dado_de_baja). → SPAWN (tiene estructura interna)
- **Interacciones** — el historial de comunicaciones enviadas y recibidas con cada suscriptor. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita la relación?

- **REF** Audiencia → marketing-audience (los suscriptores pertenecen a segmentos)
- **REF** Canales → marketing-channels (las comunicaciones se envían por canales)
- **REF** Contenido → marketing-content (las comunicaciones usan piezas de contenido)
- **REF** Automatización → marketing-automation (flujos automáticos disparan comunicaciones)

## [CONTRATO] — ¿Qué promete el módulo?

- **Consentimiento explícito** — todo suscriptor tiene un registro de cuándo y cómo dio su permiso. → ATÓMICO
- **Preferencias respetadas** — la frecuencia y canal elegidos por el suscriptor se cumplen. → ATÓMICO
- **Historial inmutable** — cada interacción queda registrada y no se borra. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No produce el contenido** — eso es de marketing-content
- **No ejecuta el envío** — eso es del canal (frontera → puertos de envío)
- **No segmenta la audiencia** — eso es de marketing-audience
- **No decide la frecuencia global** — eso es de marketing-calendar

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Gestión de bounces y quejas?
- ¿Score de engagement por suscriptor?
- ¿Preferencias de idioma?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 2 | Suscriptores, Interacciones |
| REF | 4 | marketing-audience, marketing-channels, marketing-content, marketing-automation |
| ATÓMICO | 3 | Consentimiento explícito, Preferencias respetadas, Historial inmutable |
| [ABIERTO] | 1 | 3 preguntas |
