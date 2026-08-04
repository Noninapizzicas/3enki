---
name: identidad-negocio
description: >-
  FASE 0 de todo proyecto nuevo: descubrir la IDENTIDAD del negocio del dueño
  con preguntas ABIERTAS anti-sesgo (qué construye, qué vende, cómo lo elabora,
  qué pretende) — el tipo se DERIVA del sujeto, nunca se elige de una lista.
  Convierte el negocio recién alojado en una declaración { qué_es, qué_vende,
  cómo_lo_elabora, propósito } + preguntas_abiertas, y emite negocio.identificado.
  Usa el esquematizador (5 huecos) sobre el SUJETO REAL, no sobre el contenedor.
fuente: enki
dominio: metodo
tags: [identidad, negocio, proyecto, fase0, onboarding, anti-sesgo, esquematizador, proposito]
---

# Identidad del Negocio — FASE 0 de todo proyecto nuevo

> **Qué es.** El proceso que se acciona cuando nace un proyecto: descubrir la
> identidad del NEGOCIO del dueño — no del contenedor técnico. Se esquematiza el
> sujeto real (la idea, el taller, el negocio) con el prisma de 5 huecos, se
> declara el mínimo vital, y el tipo se deriva de lo declarado (emergente).
>
> Código: proceso de proyecto · habilita `negocio.identificado`

---

## 1 · LÓGICA — qué es dar identidad

### El sujeto NUNCA es el contenedor

Un proyecto en el sistema es solo el **embalaje técnico** (directorios, storage).
La identidad pertenece al **negocio del dueño**: lo que construye, lo que vende,
cómo lo elabora. El contenedor se adapta a la idea — la idea nunca se adapta al
contenedor.

### La ley anti-sesgo (gobierna TODAS las preguntas)

```
UNA PREGUNTA ES SESGADA SI SOLO TIENE SENTIDO DENTRO DE UN NEGOCIO CONOCIDO.
  ✗ "¿Qué tipo de proyecto es: pizzepos, prisma o tienda?"   ← cerrada al catálogo
  ✗ "¿Qué es este PROYECTO?"                                  ← asume el embalaje técnico
  ✓ "¿Qué estás construyendo?"                                ← abierta, la responde el dueño
REGLAS:
  1. El sujeto es el NEGOCIO, nunca el contenedor.
  2. El TIPO se deriva de lo declarado (emergente) — jamás se elige de una lista.
  3. Lo que el dueño no dice → pregunta_abierta (nunca se asume ni se inventa).
  4. El contenedor técnico se adapta a la idea; la idea nunca se adapta al contenedor.
```

### El mínimo vital de la declaración

```jsonc
{
  "qué_es":           "un taller de lámparas de hierro",   // qué construye
  "qué_vende":        "lámparas de mesa y de suelo",       // qué ofrece
  "cómo_lo_elabora":  "compramos cable y piezas, cortamos y soldamos", // o: "las compramos hechas"
  "propósito":        "que la gente cocine con fuego vivo sin humo en casa",
  "preguntas_abiertas": []                                  // lo que el dueño no sabe
}
```

`cómo_lo_elabora` es la clave que decide la naturaleza `origen`
(elaborado → lleva recetario · de_reventa → no).

---

## 2 · EL CAMINO DE DESCUBRIMIENTO — las preguntas que abren el propósito

Hazlas EN ORDEN, una por una, esperando respuesta. Cada una abre una dimensión:

| # | Pregunta (abierta) | Dimensión que abre |
|---|---|---|
| 1 | "¿Qué estás construyendo?" | Identidad / sujeto |
| 2 | "¿Qué vendes o elaboras?" | Oferta |
| 3 | "¿Cómo funciona tu negocio?" (¿lo elaboras tú o lo compras hecho?) | Naturaleza origen |
| 4 | "¿Qué quieres conseguir con esto?" | Intención / objetivo |
| 5 | "¿Quién lo va a usar y en qué momento?" | Usuario + contexto |
| 6 | "¿Qué tiene que pasar al final para que digas 'esto funciona'?" | Criterio de éxito (el contrato real) |
| 7 | "¿Cómo lo imaginas en un día normal?" | Flujo de uso |
| 8 | "¿Qué NO quieres que sea, aunque sería fácil?" | Límites / no-objetivos |
| 9 | "¿Por qué esto y no otra cosa ya hecha?" | Motivación raíz (la que sostiene) |

**Regla**: si el dueño responde con una etiqueta ("es una pizzería"), profundiza:
*"¿y qué la hace tuya / distinta?"* — la etiqueta es superficie, el sujeto es la forma.

---

## 3 · FLUJO — la FASE 0 completa

```
Se aloja el negocio (directorios creados) → ESTADO: sin_identidad
  ↓
1. PREGUNTAR (las 9 del camino, en orden — abiertas, anti-sesgo)
  ↓
2. DECLARAR el mínimo vital: { qué_es, qué_vende, cómo_lo_elabora, propósito }
  ↓
3. DERIVAR el tipo EMERGENTE del sujeto (nunca de una lista):
     - elaborado + se transforma → recetario + stock + venta
     - de_reventa (compra hecho) → descripción + stock + venta
     - sirve a la gente en un lugar → servicio/agenda
     - se presta y vuelve → uso_temporal (retorno/fianza)
  ↓
4. Lo que el dueño NO sabe → preguntas_abiertas[] (marcar, NO inventar)
  ↓
5. EMITIR negocio.identificado { qué_es, qué_vende, cómo_lo_elabora, tipo_derivado }
  → se encienden los módulos del tipo derivado
  ↓
ESTADO: con_identidad → SIGUIENTE FASE: esquematizar el negocio completo
```

**Si el dueño no responde o dice "todavía no sé"** → sigue `sin_identidad`
honesto, con sus preguntas_abiertas. No se fuerza, no se asume.

---

## 4 · EVENTOS

| Evento | Dirección | Contrato |
|---|---|---|
| `negocio.identificado` | publica | `{ qué_es, qué_vende, cómo_lo_elabora, tipo_derivado, preguntas_abiertas[] }` — enciende los módulos del tipo |
| `negocio.identidad.solicitada` | publica | el sistema pide la identidad (el dueño aún no la dio) |

---

## 5 · Errores a evitar

- **Elegir el tipo de una lista** ("¿pizzepos, prisma o tienda?") — el tipo se deriva del sujeto, siempre.
- **Nombrar el contenedor** ("¿qué es este proyecto?") — el sujeto es el negocio.
- **Presuponer dominio** ("¿qué pizza vendes?") — pregunta abierta o nada.
- **Inventar lo que el dueño no dijo** — se marca pregunta_abierta.
- **Rellenar todo de golpe** — el mínimo vital basta; la profundidad (marca, coste, stock) viene después.
- **Aceptar la etiqueta como identidad** ("es una pizzería" sin más) — profundiza hasta el sujeto real.

---

## 6 · Verificación

- La declaración tiene los 3 campos del mínimo vital + propósito.
- CERO preguntas sesgadas en la conversación (revisa las que hiciste).
- El tipo derivado se justifica con la declaración (no con una lista).
- Las preguntas_abiertas nombran exactamente lo que el dueño no respondió.
- Al final: negocio.identificado emitido (o sin_identidad honesto si no hubo respuesta).
