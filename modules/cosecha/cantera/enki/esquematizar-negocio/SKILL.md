---
name: esquematizar-negocio
description: >-
  FASE 2 del proceso de un proyecto (la arranca el orquestador proceso-negocio
  tras negocio.identificado): esquematiza el NEGOCIO ya declarado en la
  identidad (qué_es, qué_vende, cómo_lo_elabora de project-profile) con el
  método del esquematizador. MANDATO MECÁNICO: pasa el prisma de 5 huecos PUNTO
  A PUNTO, RONDA A RONDA hasta quedarse seco, escribiendo cada pasada en
  <proyecto>/esquemas/pasada-N-<punto>.md y el árbol maestro en
  <proyecto>/esquemas/esquema.md (el entregable que el gate verifica). El
  propósito es descubrir las PIEZAS que el negocio necesita (cada una su
  parcela). Entrada directa: el sujeto se lee de la identidad, NO se pregunta,
  NO se ofrecen opciones — se EJECUTA. Al terminar: proceso-negocio.completar_fase
  { fase: 'esquematizado' } → empuja la FASE 3.
fuente: enki
dominio: metodo
lente_dominio: prisma
lente_tarea: esquematizar
tags: [fase2, negocio, esquema, identidad, prisma, diseccionador, proceso, agnosticismo]
---

# Esquematizar el Negocio — FASE 2 del proceso de proyecto

> **Qué es.** La skill que esquematiza el NEGOCIO de un proyecto cuando ya tiene
> identidad. Entra encadenada (la empuja `proceso-negocio` tras
> `negocio.identificado`) — no a mano. El sujeto está DECLARADO: se lee de la
> identidad, no se pregunta desde cero.
>
> Código: fase 2 de proceso · habilita `negocio.esquematizado`

---

## 1 · ENTRADA — lee el sujeto de la identidad (no preguntes)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador** (empujón de `proceso-negocio`), el proceso YA decidió: toca
esquematizar. **NO ofrezcas opciones** — nada de "¿la activo como lente o la
aplico ya?", nada de caminos A/B/C, nada de pedir permiso. **EJECUTA.** La única
pregunta legítima al dueño es si la identidad está incompleta (ver abajo).

Antes de esquematizar, lee la identidad del negocio:

```
project-profile.get.request { project_id }
  → perfil.identidad = {
      que_es,           // "un observatorio de tendencias musicales"
      que_vende,        // "newsletter pública + panel visual"
      como_lo_elabora,  // "rastreo de fuentes trinchera + aceleración + umbrales"
      tipo_derivado,    // "servicio" | "elaborado+pieza" | "de_reventa" | ...
      preguntas_abiertas
    }
```

**Regla**: el sujeto es `que_es + que_vende + como_lo_elabora` — NUNCA el
contenedor técnico, NUNCA una lista de tipos. Si la identidad está incompleta
(estado `sin_identidad` o campos vacíos) → NO inventes: pide completar la
FASE 0 (identidad-negocio) antes de seguir.

## 2 · EL MÉTODO — el esquematizador aplicado al negocio

Sigue el método de la skill `esquematizador` (cárgala para el detalle), pero el
sujeto ya está fijado:

**Fase 1 · Prisma recursivo** — pasa el NEGOCIO por los 5 huecos
(IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS).
De sus huecos salen sub-productos (las PIEZAS del negocio: qué hace falta para
que venda, elabore y entregue lo declarado); pasa cada uno por el prisma otra
vez hasta seco. Escribe cada ronda en `pasada-N-<pieza>.md`.

**Fase 2 · Esquema** — ensambla en `esquema.md` el árbol maestro completo:
las piezas del negocio, sus relaciones, y lo que cada una necesita (puertos
abiertos — agnosticismo, cero tecnologías).

**Fase 3 · Disección** — cada hoja atómica pasa por el diseccionador y sus
preguntas → FORMA (reflejo · custodio · conversor · puente…). Anota la forma
en `esquema.md`.

**El propósito afilado** (lo que diferencia esta skill del esquematizador
genérico): el esquema debe responder **"¿qué piezas necesita este negocio
para hacer lo que declara?"** — cada pieza es una PARCELA (un futuro módulo
con su lógica). No es un ejercicio abstracto: es el plano de construcción.

## 3 · DÓNDE SE PERSISTE — rutas EXACTAS (no negociable)

El esquema del negocio vive en el proyecto, en estas rutas CONCRETAS:

```
<storage del proyecto>/esquemas/esquema.md              ← el árbol maestro (OBLIGATORIO)
<storage del proyecto>/esquemas/pasada-1-<pieza>.md     ← ronda 1 del prisma (OBLIGATORIO)
<storage del proyecto>/esquemas/pasada-2-<pieza>.md     ← ronda 2
<storage del proyecto>/esquemas/pasada-N-<pieza>.md     ← …hasta seca
<storage del proyecto>/esquemas/pasada-N-diseccion.md   ← las formas de cada hoja atómica
```

**Rutas exactas** — usa estas, literalmente, con los nombres que salgan del
prisma. Si el directorio `esquemas/` no existe, créalo (fs.write lo crea).

**El archivo que la fase 2 debe generar SÍ o SÍ**: `esquemas/esquema.md` con
sus pasadas. Sin él, el gate del orquestador devuelve `FASE_INCOMPLETA` y el
proceso no avanza.

## 3b · EL MANDATO — prisma punto a punto hasta quedarse seco

**Procedimiento mecánico, en este orden, sin saltarte nada:**

1. Toma el negocio (qué_es + qué_vende + cómo_lo_elabora de la identidad).
2. Pásalo por el prisma de 5 huecos → escribe `pasada-1-<pieza>.md` con los 5 huecos y los sub-productos que salen.
3. **Cada sub-producto que salió es un PUNTO nuevo**: pásalo por el prisma OTRA VEZ → escribe `pasada-2-<punto>.md`.
4. Repite: cada punto que sale de cada pasada, al prisma, en su propio archivo — **PUNTO A PUNTO, RONDA A RONDA**.
5. **PARA cuando un punto es**: atómica (va a disección) · abierta (no se expande) · repetida (se referencia). Eso es "quedarse seco".
6. Solo cuando NINGÚN punto se parta más (seco) → ensambla TODO en `esquemas/esquema.md` (el árbol maestro con todo embebido, no punteros).
7. Disecciona cada hoja atómica → su FORMA → anótala en `esquema.md` → `pasada-N-diseccion.md`.
8. Cierra la fase: `proceso-negocio.completar_fase { fase: 'esquematizado' }`.

**NO pares a mitad**: si un punto todavía se parte, sigues. **NO resumas**: cada
pasada es un archivo real en disco. **NO te saltes el esquema.md**: es el
entregable que el gate verifica.

## 4 · SALIDA — señal de fase completada

Al terminar (esquema escrito), cierra la fase para que el orquestador encadene:

```
proceso-negocio.completar_fase.request {
  project_id,
  fase: 'esquematizado',
  resumen: { piezas: N, formas: N, archivo_esquema: 'esquemas/esquema.md' }
}
```

El orquestador (proceso-negocio) registra `negocio.esquematizado` y empuja la
FASE 3 (diseccionador / productor-modulos según el mapa de proceso).

**Si algo bloquea** (identidad incompleta, no se puede leer el perfil) → informa
con honestidad y NO inventes el esquema. La fase queda pendiente, no forzada.

---

## 5 · Errores a evitar

- **Ofrecer opciones A/B/C al entrar encadenada** — el proceso ya decidió: EJECUTA. (Visto en vivo: el LLM preguntó "¿la activo como lente o la aplico ya?" en vez de esquematizar.)
- **Pedir permiso de configuración** ("¿activo la skill?") — el orquestador ya la activó; no es tu decisión.
- **Preguntar el sujeto desde cero** — ya está declarado en la identidad; leerlo.
- **Esquematizar el contenedor** (el proyecto técnico) — el sujeto es el NEGOCIO.
- **Colar tecnologías** — agnosticismo: puertos abiertos, cero entorno (la ley del esquematizador).
- **Inventar piezas** — si el dueño no lo declaró, es pregunta abierta, no pieza.
- **Disecar antes de tocar suelo** — primero el prisma se agota, luego la FORMA.
- **Olvidar la señal de fase** — sin `proceso-negocio.completar_fase`, el proceso se detiene aquí.

## 6 · Verificación

- Leíste la identidad (project-profile.get) y el sujeto es el negocio declarado.
- CERO preguntas de sujeto al dueño (ya está respondido) — y CERO opciones A/B/C ofrecidas.
- **Cada punto del prisma tiene su pasada en disco** (`esquemas/pasada-N-<punto>.md`) — ronda a ronda hasta seca.
- **`esquemas/esquema.md` existe** con el árbol maestro (el gate lo comprueba).
- CERO tecnologías en el esquema (agnosticismo).
- `esquema.md` responde "qué piezas necesita este negocio" con su FORMA.
- Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'esquematizado' }` → 200 (no 409).
