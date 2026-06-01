# Refactor viabilidad — la guia del comerciante

> **🍳 Documento de cocina ABIERTO (2026-06-01).** Captura una sesion `ana`
> con el usuario sobre el refactor del modulo `viabilidad`. El diseno esta
> cocinado y dado por bueno; NO esta implementado. La parte de juicio del LLM
> (la brujula) queda deliberadamente abierta — no se cierra en taxonomia.
>
> **Origen**: cocina `ana` 2026-06-01, hilo del `mapa-piezas-comercio.md`
> (inventario factual del comercio, 2026-05-31). El usuario partio de "refactor
> de viabilidad" y la sesion convergio en redefinir QUE es el modulo antes de
> tocar codigo.
>
> **Modulo afectado**: `modules/pizzepos/viabilidad` (blueprint-driven v1.1.0)
> + su estancia frontend `frontend/src/lib/modules/viabilidad/`.
>
> **No toca** (parqueado explicito): la generalizacion padre/hijo a otras
> verticales de comercio (renombre conceptual recetas→producto-a-estudio,
> escandallo→costes-de-producto). Es real y buena pero es OTRO horizonte.

---

## 1. El giro: de veredicto a brujula

Hoy `viabilidad` da un **veredicto seco**: coge coste (de `escandallo`) + PVP,
calcula food cost %, dispara una etiqueta del enum
(`viable` / `no_viable_economicamente` / ...). Es un **si/no**.

El refactor lo sube de **veredicto** a **guia**. La frase del usuario:

> "hacer un pequeño estudio y que te proyecte si el camino puede ser
> interesante o no" — dirigido **al pequeño comerciante**, como **herramienta
> de ayuda, no de trabajo**.

Es un **hacia donde**, no un si/no. Y el detalle que reordeno el diagnostico:
las recomendaciones que el frontend ya pintaba (`subir_precio`/`bajar_coste`/
`reformular`/`eliminar`) **no eran basura del rewrite — eran justo la brujula
que el rewrite a blueprint dejo por el camino**.

---

## 2. Naturaleza del modulo (los limites que lo definen)

- **Es una guia al comienzo.** Orienta ANTES de lanzarte. Foto del momento.
- **Datos estimados/orientativos, nunca reales.** El usuario lo fijo desde el
  primer minuto: "no trabajamos con datos reales". `escandallo` tampoco.
- **No es seguimiento.** El seguimiento de verdad (compras vs ventas,
  actualizado) es **otra maquinaria y otro lugar** — el lado real/operativo.
  Traerlo aqui rompe las dos estancias. La frontera es la misma linea
  estimado-vs-real que define al modulo.
- **Vive como estancia visible.** Metafora del usuario: "si no haces estancias,
  el user se pierde porque no sabe donde ir; pero si ve 'Viabilidad', entra y
  prueba". La puerta con nombre ES lo que hace que la herramienta exista para
  el comerciante. No se disuelve en "el LLM ya te ayuda desde el chat".

---

## 3. La estancia v1 (alcance cerrado)

> Entras → metes un producto → la guia te da **el hecho** (coste/margen,
> determinista) + **el juicio** (el LLM lee el dato) + **unos caminos como
> tarjetas**. Cada tarjeta = una direccion + un prompt que inyecta al chat los
> datos del expediente y la consulta de *ese* camino. Tocas → el chat se llena
> → desarrollas hablando. Se guarda el expediente. Puedes repasar lo que
> evaluaste antes.

Sin seguimiento, sin datos reales, sin historico de rendimiento.

---

## 4. Las tres capas de la guia

1. **El hecho** (determinista, ya existe). Coste, PVP, margen, food cost. El
   suelo firme. No lo razona el LLM — se calcula via `escandallo`. Es el dato.

2. **El juicio** (LLM). *¿Esto interesa?* — con matiz, no la etiqueta seca de
   hoy. No "no_viable_economicamente", sino "a este PVP no sale; el coste se
   come casi la mitad". La lectura humana del hecho.

3. **La orientacion / los caminos** (LLM, lo que de verdad guia). *¿Por donde
   se abre?* Las palancas. **Generados por el LLM segun el caso** — distintos
   por producto, NO un set fijo. **Esto NO se cierra en taxonomia** (decision
   explicita del usuario: "el LLM puede aportar segun el caso").

---

## 5. La pieza clave: caminos como tarjetas que activan el chat

Idea del usuario (resulto ser el patron canonico del repo):

> "habra caminos, tarjetas con recomendaciones y prompt que se activan en el
> chat con los datos y la consulta"

Cada **camino** es una tarjeta = `{ recomendacion visible + prompt }`. Al
tocarla, **inyecta en el input del chat** un prompt precargado con los datos
del expediente + la consulta de ese camino. El comerciante revisa y envia; el
LLM desarrolla ESE camino conversacional, con todo el contexto, segun el caso.

Esto **disuelve la tension** "¿te habla o te deja cartas?": son **las dos**.
La tarjeta es el vistazo accionable; el chat es el taller donde se abre. El
enum sigue abierto (el LLM propone y desarrolla); el comerciante tiene puntos
de entrada concretos.

**Mecanismo — ya existe y esta cableado** (no hay que construirlo):
- `frontend/src/lib/stores/chatInputDraft.ts` → `prefillChatInput(text)` + store `chatInputDraft`.
- `frontend/src/lib/components/layout/ChatInput.svelte:78` → `bind:value={$chatInputDraft}`.
- Es exactamente la **Postura B** de `ui-frontend-blueprint.contract.json`
  (UI de lectura + pre-relleno del chat para las acciones).

Tambien resuelve el "¿hace falta un agente?": en v1 **no**. El handoff
estancia→chat ya es el taller. Un agente es posible despues, no es la forma v1.

---

## 6. Implicacion de shape: los caminos se persisten en el expediente

Como los caminos los propone el LLM **al evaluar** (capa 3, por caso), se
**guardan dentro del expediente** junto al veredicto. El expediente actual
(blueprint v1.1.0) gana un campo nuevo, p.ej:

```
"caminos": [
  { "recomendacion": "string (lo que ve el comerciante en la tarjeta)",
    "prompt": "string (lo que se inyecta al chat: datos + consulta)" }
]
```

El resto del expediente (id, fecha_evaluacion, input snapshot, calculo,
veredicto, advertencias) se mantiene — es el "numero de habitacion" del audit
trail, y sobrevive: poder repasar "evalue X con PVP Y y no salia". Repasar
sesiones de guia pasadas ≠ seguir el rendimiento real (eso es la otra
maquinaria, fuera).

---

## 7. Que cambia en el frontend (la estancia)

El frontend ya bosquejo casi toda la experiencia. Estado real verificado:

- **`ViabilidadBrowser`** — al dia (lee el expediente con su shape real). Se queda.
- **`ViabilidadPanel`** — lee `/viabilidad.json` via `fs.read` directo
  (patron `lecturas-frontend-via-fs-read`). Hoy pasa `recomendaciones=[]` e
  `historico=[]` siempre (puertas muertas).
- **`ViabilidadDetail`** — **roto**: espera shape viejo plano (`receta_nombre`,
  `precio_venta`, `margen_bruto`, `margen_porcentaje`, `estado:
  VIABLE/ACEPTABLE/CRITICO/INVIABLE`) que el expediente actual NO tiene. Hay
  que reconectarlo al shape real (`input.nombre`, `pvp_efectivo`,
  `food_cost_pct`, `veredicto: viable/...`).
- **`ViabilidadRecomendaciones`** — pinta tarjetas de **tipo fijo** con
  prioridad CRITICA/ADVERTENCIA/INFO. El layout sirve; pero se rellena desde
  los `caminos` del expediente (LLM por caso) y la accion pasa a ser
  `prefillChatInput(camino.prompt)` en vez de un boton muerto.
- **Seccion "Comparacion Historica"** — **fuera**. Pertenece a la maquinaria
  compras-vs-ventas, no a viabilidad. Se quita sin pena.

---

## 8. Hilos abiertos menores (no bloquean el spec)

- **¿Como se inicia una evaluacion desde la estancia?** Postura B dice que las
  mutaciones van via prefill al chat. Evaluar crea un expediente (mutacion).
  ¿La estancia tiene un form ligero (nombre + PVP + componentes) o es tambien
  un `prefillChatInput("evalua [producto] a PVP [x]")`? Decidir al implementar.
- **Umbrales de food cost por proyecto** — ya estaba en `trabajo_pendiente` del
  blueprint. Ortogonal a este refactor, no se abre aqui.

---

## 9. Proximo paso

Esto es horizonte grande. Antes de codigo, esta propuesta es el deposito de lo
cocinado. Cuando se arranque la implementacion (sesion `fede` o equivalente):

1. **Blueprint** (`viabilidad.blueprint.json`): la operacion `evaluar` gana un
   paso donde el LLM-runtime, tras el calculo determinista, propone los
   `caminos` (capa 3) y los incluye en el expediente. El veredicto se mantiene
   pero su lectura se humaniza (capa 2). Persistencia: el expediente gana
   `caminos[]`.
2. **Frontend**: reconectar `ViabilidadDetail` al shape real, quitar la seccion
   historica, rellenar `ViabilidadRecomendaciones` desde `expediente.caminos`
   con accion `prefillChatInput`.
3. Evaluar si conviene un **plan ejecutable** `cierre-ui-viabilidad.json` al
   estilo de `cierre-ui-recetas.json` / `cierre-ui-escandallo.json` ya
   existentes (la familia de cierres UI por modulo blueprint).

---

## Referencias

- `arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json` — Postura B + `prefillChatInput` (mecanismo canonico).
- `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` — viabilidad cumple las 4 condiciones blueprint.
- `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` — padre del que viabilidad hereda.
- `arquitectura/decisiones/propuestas/mapa-piezas-comercio.md` — inventario del comercio (marco de origen).
- `arquitectura/decisiones/propuestas/lecturas-frontend-via-fs-read.md` — patron que usa `ViabilidadPanel`.
- `modules/pizzepos/viabilidad/viabilidad.blueprint.json` — estado actual (v1.1.0).
