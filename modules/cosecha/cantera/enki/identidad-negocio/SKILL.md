---
name: identidad-negocio
description: >-
  FASE 0 de todo proyecto nuevo: descubrir la IDENTIDAD del negocio del dueño con
  10 preguntas ABIERTAS anti-sesgo (qué construye, qué vende, cómo lo elabora, qué
  pretende, quiénes tocan el negocio) — el tipo se DERIVA del sujeto, nunca se
  elige de una lista. Escribe { que_es, que_vende, como_lo_elabora, tipo_derivado,
  interlocutores, preguntas_abiertas } + proposito hermano en el perfil del
  proyecto (project-profile) con UN SOLO update, y esa transición emite
  negocio.identificado. El sujeto es el NEGOCIO, jamás el contenedor técnico.
  La anatomía completa con el prisma de 5 huecos es la FASE SIGUIENTE
  (esquematizar-negocio), que arranca con ese mismo evento.
when-to-use: >-
  Cuando un proyecto acaba de nacer (project.created) y el negocio del dueño aún
  no tiene identidad declarada — el orquestador proceso-negocio empuja esta skill
  como FASE 0. También para completar un proyecto que quedó en estado
  sin_identidad, o para revisar que lo declarado nombra el sujeto real y no el
  embalaje técnico. Para esquematizar el negocio YA identificado, usa
  esquematizar-negocio.
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
  "interlocutores": [                                       // TODOS los que tocan el negocio
    { "rol": "cliente particular", "canal": "mostrador", "relacion": "compra pan del día" },
    { "rol": "proveedor harina",  "canal": "pedido periódico", "relacion": "suministro materia prima" }
  ],
  "preguntas_abiertas": []                                  // lo que el dueño no sabe
}
```

`interlocutores` es la lista CERRADA de todos los actores que tocan el negocio.
Se mapea ANTES de que la FASE 2 cruce actores en la matriz de pares — cada actor
que emerge después invalida pares ya cerrados (coste cuadrático). La lista se
cierra aquí; la FASE 2 la consume sin descubrir actores nuevos.

`propósito` viaja como campo **`proposito`, HERMANO de `identidad`** en el perfil
(no vive dentro del bloque identidad) — mismo update, misma llamada. Es el norte
que la FASE SIGUIENTE lee para arrancar con objetivo nítido.

`cómo_lo_elabora` es la clave que decide la naturaleza `origen`
(elaborado → lleva recetario · de_reventa → no).

### DÓNDE SE PERSISTE (el store oficial)

La declaración se guarda en el **perfil del proyecto** — módulo `project-profile`
(reflejo, persiste por proyecto en `state/project_profile.json`), campo `identidad`:

```jsonc
// project-profile.update.request → .response   (merge parcial)
// UNA SOLA llamada con el bloque COMPLETO — ver "La llamada única" más abajo.
{
  "project_id": "<id>",
  "proposito": "que la gente cocine con fuego vivo sin humo en casa",  // ← HERMANO de identidad
  "identidad": {
    "que_es": "un taller de lámparas de hierro",
    "que_vende": "lámparas de mesa y de suelo",
    "como_lo_elabora": "compramos cable y piezas, cortamos y soldamos",
    "tipo_derivado": "elaborado+pieza",      // emergente del sujeto
    "interlocutores": [                      // TODOS los que tocan el negocio
      { "rol": "cliente particular", "canal": "mostrador", "relacion": "compra lámparas terminadas" },
      { "rol": "proveedor cable/piezas", "canal": "pedido periódico", "relacion": "suministro materia prima" },
      { "rol": "trabajador taller", "canal": "presencial", "relacion": "corta, suelda, monta" }
    ],
    "preguntas_abiertas": [                  // forma tipada del reflejo
      { "campo": "como_lo_elabora",
        "para": "decidir si el negocio lleva recetario",
        "porque": "el dueño no dijo si lo elabora o lo compra hecho",
        "respondida": false }
    ]
  }
}
```

El reflejo hace el resto: `que_es + que_vende` presentes → `estado: con_identidad`
+ sello `declarado_el` + **emite `negocio.identificado`** (la señal que enciende
los módulos del tipo derivado). Sin ellos → `estado: sin_identidad` (honesto).

### LA LLAMADA ÚNICA — el bloque entero en un solo update

`negocio.identificado` nace de la **transición** `sin_identidad → con_identidad`,
y esa transición ocurre UNA vez por proyecto. Entrega por tanto el bloque
`identidad` COMPLETO (con `tipo_derivado` y `preguntas_abiertas` ya dentro) más
`proposito`, todo en la misma llamada: así el evento viaja lleno y los módulos
del tipo se encienden con el tipo puesto.

```
DECLARAR(perfil, identidadCompleta, proposito):
    project-profile.update { project_id, proposito, identidad: identidadCompleta }
    // el reflejo sella declarado_el y emite negocio.identificado con TODO el payload
```

Un update posterior sobre un perfil que YA está `con_identidad` refina el bloque
y emite `project-profile.actualizado` — el `negocio.identificado` de esa fase ya
viajó. Para enriquecer la identidad más tarde, escribe el campo y sigue el hilo
del proceso con `proceso-negocio.completar_fase`.

**Lectura**: `project-profile.get.request` → `{ perfil.identidad }` — el estado
de la identidad vive SIEMPRE aquí (fuente única).

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
| 6 | "¿Quiénes tocan tu negocio? — clientes, empleados, proveedores, colaboradores, repartidores, vecinos, administración... Nombra a TODOS los que intervienen, aunque sea de lejos." | **Mapa de interlocutores** (lista cerrada de actores) |
| 7 | "¿Qué tiene que pasar al final para que digas 'esto funciona'?" | Criterio de éxito (el contrato real) |
| 8 | "¿Cómo lo imaginas en un día normal?" | Flujo de uso |
| 9 | "¿Qué NO quieres que sea, aunque sería fácil?" | Límites / no-objetivos |
| 10 | "¿Por qué esto y no otra cosa ya hecha?" | Motivación raíz (la que sostiene) |

**Regla**: si el dueño responde con una etiqueta ("es una pizzería"), profundiza:
*"¿y qué la hace tuya / distinta?"* — la etiqueta es superficie, el sujeto es la forma.

**Regla de interlocutores (pregunta 6)**: la lista se CIERRA aquí. La FASE 2
(esquematizar-negocio) cruzará estos actores en la matriz de pares — cada actor
que aparezca después obliga a reabrir pares ya cerrados. Insiste hasta que el
dueño diga "no hay más". Cada interlocutor lleva `{ rol, canal, relacion }`.

---

## 3 · FLUJO — la FASE 0 completa

```
Se aloja el negocio (directorios creados) → ESTADO: sin_identidad
  ↓
1. PREGUNTAR (las 10 del camino, en orden — abiertas, anti-sesgo)
  ↓
2. DECLARAR el mínimo vital: { qué_es, qué_vende, cómo_lo_elabora, propósito }
  ↓
3. CERRAR EL MAPA DE INTERLOCUTORES: interlocutores[] con { rol, canal, relacion }
   Insistir hasta que el dueño diga "no hay más". La FASE 2 consume esta lista
   para cruzar actores en la matriz de pares — actores descubiertos después
   obligan a reabrir pares (coste cuadrático que se paga aquí una sola vez).
  ↓
4. DERIVAR el tipo EMERGENTE del sujeto (nunca de una lista):
     - elaborado + se transforma → recetario + stock + venta
     - de_reventa (compra hecho) → descripción + stock + venta
     - sirve a la gente en un lugar → servicio/agenda
     - se presta y vuelve → uso_temporal (retorno/fianza)
  ↓
5. Lo que el dueño NO sabe → preguntas_abiertas[] tipado (marcar, NO inventar)
  ↓
6. ESCRIBIR con UN SOLO project-profile.update:
     { project_id, proposito, identidad: { que_es, que_vende, como_lo_elabora,
                                           tipo_derivado, interlocutores,
                                           preguntas_abiertas } }
  ↓
7. El reflejo EMITE negocio.identificado
     { project_id, que_es, que_vende, como_lo_elabora, tipo_derivado,
       interlocutores[], preguntas_abiertas[] }
  → se encienden los módulos del tipo derivado y arranca la FASE SIGUIENTE
    (esquematizar-negocio: el prisma de 5 huecos sobre el negocio ya declarado,
     con el mapa de interlocutores CERRADO para la matriz de pares)
  ↓
ESTADO: con_identidad → SIGUIENTE FASE: esquematizar el negocio completo
```

**Si el dueño no responde o dice "todavía no sé"** → sigue `sin_identidad`
honesto, con sus preguntas_abiertas. No se fuerza, no se asume.

---

## 4 · EVENTOS

Los emite el **reflejo** `project-profile` al recibir el update — la skill no
publica al bus directamente.

| Evento | Dirección | Contrato |
|---|---|---|
| `negocio.identificado` | lo emite el reflejo | `{ project_id, que_es, que_vende, como_lo_elabora, tipo_derivado, interlocutores[], preguntas_abiertas[] }` — enciende los módulos del tipo y empuja la fase siguiente. Nace SOLO en la transición `sin_identidad → con_identidad`. |
| `project-profile.actualizado` | lo emite el reflejo | `{ project_id, campos_actualizados[] }` — en todo update, incluidos los que refinan una identidad ya declarada. |

**Entrada**: `project.created` → el orquestador `proceso-negocio` empuja esta
skill como FASE 0 (`MAPA_PROCESO['project.created']`).

---

## 5 · Errores a evitar

- **Elegir el tipo de una lista** ("¿pizzepos, prisma o tienda?") — el tipo se deriva del sujeto, siempre.
- **Nombrar el contenedor** ("¿qué es este proyecto?") — el sujeto es el negocio.
- **Presuponer dominio** ("¿qué pizza vendes?") — pregunta abierta o nada.
- **Inventar lo que el dueño no dijo** — se marca pregunta_abierta.
- **Partir la declaración en dos updates** — el primero dispara el evento con `tipo_derivado: null` y el segundo ya no re-emite: el bloque entra completo de una vez.
- **Dejar el propósito en el aire** — se escribe como campo `proposito`, hermano de `identidad`, en la misma llamada.
- **Rellenar todo de golpe** — el mínimo vital basta; la profundidad (marca, coste, stock) viene después.
- **Aceptar la etiqueta como identidad** ("es una pizzería" sin más) — profundiza hasta el sujeto real.

---

## 6 · Verificación

- La declaración tiene los 3 campos del mínimo vital + `proposito` escrito como hermano.
- `interlocutores[]` está presente con al menos 1 entrada `{ rol, canal, relacion }` — la lista se cerró con el dueño (pregunta 6).
- La escritura fue UNA sola llamada con el bloque `identidad` completo (incluido `interlocutores`).
- CERO preguntas sesgadas en la conversación (revisa las que hiciste).
- El tipo derivado se justifica con la declaración (no con una lista) y viaja en el evento.
- Las preguntas_abiertas nombran exactamente lo que el dueño no respondió, con su forma tipada `{ campo, para, porque, respondida }`.
- Relectura con `project-profile.get`: `identidad.estado === 'con_identidad'` y `declarado_el` sellado (o `sin_identidad` honesto si no hubo respuesta).
