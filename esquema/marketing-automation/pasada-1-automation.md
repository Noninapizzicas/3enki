# Pasada 1 — Prisma sobre "marketing-automation" (Automatización de marketing)

## ¿Qué es?

Flujos que se ejecutan sin intervención humana una vez configurados. Responden a un evento (un registro, un abandono de carrito, un aniversario) con una secuencia de acciones predefinida. Cada flujo es un grafo de pasos con condiciones de bifurcación.

---

## [IDENTIDAD] — ¿Qué es la automatización?

- **Flujos** — las secuencias automatizadas del proyecto. Cada flujo tiene un trigger, pasos y reglas. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita la automatización?

- **REF** Canales → marketing-channels (las acciones se ejecutan en canales)
- **REF** Audiencia → marketing-audience (los flujos se dirigen a segmentos)
- **REF** Contenido → marketing-content (los pasos usan piezas de contenido)

## [CONTRATO] — ¿Qué promete el módulo?

- **Flujo completo** — todo flujo tiene trigger, al menos un paso y estado. → ATÓMICO
- **Trigger definido** — todo trigger nombra el evento que escucha. → ATÓMICO
- **Ejecución trazable** — cada ejecución registra qué pasó (historial). → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No produce contenido** — eso es de marketing-content
- **No ejecuta el envío físico** — eso es del canal (frontera → puertos de envío)
- **No decide qué automatizar** — eso es del dueño (frontera → strategy)

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Pasos complejos (bifurcación, wait, loops)?
- ¿Límite de ejecuciones concurrentes?
- ¿Flujos inter-proyecto?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 1 | Flujos |
| REF | 3 | marketing-channels, marketing-audience, marketing-content |
| ATÓMICO | 3 | Flujo completo, Trigger definido, Ejecución trazable |
| [ABIERTO] | 1 | 3 preguntas |
