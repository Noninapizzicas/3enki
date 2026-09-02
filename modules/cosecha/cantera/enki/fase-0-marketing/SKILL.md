---
name: fase-0-marketing
description: >-
  Entrevista interactiva al dueño para rellenar los 12 módulos de marketing de un
  proyecto. Se basa en el archivo F0 de identidad (fase0-identidad-negocio.json)
  y pregunta módulo por módulo, una pregunta por turno. El dato de cada módulo
  SIEMPRE viene del dueño (F0 + respuestas), nunca se inventa. Entregable:
  fm0.md (Fundamento de Marketing). ES CONVERSACIONAL — se ejecuta en el chat,
  no como pipeline del registro.
when-to-use: >-
  El dueño dice "rellena el marketing", "haz la fase de marketing", "entrevístame
  para el marketing", o un proyecto ya pasó la FASE 0 (tiene
  fase0-identidad-negocio.json) y toca montar su estrategia de marketing.
source: hermes
tags: [enki, marketing, fase0, entrevista, interactivo, onboarding, fm0]
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

## Diferenciación CLAVE

- **Los 12 módulos (`marketing-*`) son el DESTINO** que se rellena — no una fuente.
- El contenido de cada módulo sale de **2 fuentes SOLO**: (1) el archivo **F0 de
  identidad** y (2) lo que el **dueño responde** a tus preguntas.
- **Apoyo**: para saber QUÉ preguntar y enriquecer el diagnóstico, usa TODO el
  sistema (cualquier skill de la cantera, cualquier pipeline del registro). Pero
  el dato de cada módulo SIEMPRE viene del dueño — nunca de una skill.
- Lo que el dueño no sabe → **pregunta_abierta**. Nunca inventar para llenar.

## Cómo empezar

1. `fs.read` de `storage/proceso-negocio/fase0-identidad-negocio.json` (F0).
2. Presenta en 2-3 líneas lo que entiendes del negocio (valida con el dueño).
3. Entrevista módulo por módulo en orden (de cimientos a ejecución).

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

## Reglas de la entrevista

- **Una pregunta por turno**, espera respuesta.
- Cada pregunta deriva del módulo en curso: qué le conviene saber al dueño para
  que ese módulo quede completo.
- Si el dueño responde algo que cambia datos de módulos ya vistos, anótalo para
  ajustar después.
- Al terminar cada módulo, **resume lo obtenido y confirma** antes de seguir.
- Lo que el dueño no sabe → márcalo `pregunta_abierta` (no lo adivines).

## Entregable: fm0.md (al terminar la entrevista)

Genera el Fundamento de Marketing y guárdalo en `storage/esquema/<project_slug>/fm0.md`.
Estructura (H2 por sección):

1. RESUMEN EJECUTIVO — el negocio, su posición, su oportunidad
2. IDENTIDAD DE MARCA — voz, valores, propuesta de valor (del negocio real)
3. AUDIENCIA — segmentos con persona, necesidad, canal preferido
4. COMPETENCIA — mapa competitivo, huecos, diferenciadores
5. ESTRATEGIA DE CANALES — canales priorizados con justificación
6. CONTENIDO — plan editorial básico: tipos, frecuencia, tono
7. EMBUDO — etapas, métricas objetivo, tácticas por etapa
8. PRESUPUESTO — distribución por canal/acción
9. CALENDARIO — hitos Q1-Q4, temporadas del negocio
10. AUTOMATIZACIÓN — flujos propuestos
11. RELACIONES — alianzas y PR
12. PREGUNTAS ABIERTAS — lo que falta por responder

Cada dato citado viene de la entrevista o se marca `[PENDIENTE]`. **PROHIBIDO**
inventar datos que el dueño no dio.
