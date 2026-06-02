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

Tambien resuelve el "¿hace falta un agente?": en v1 **no** (ver seccion 5bis,
fork resuelto). El handoff estancia→chat ya es el taller.

---

## 5bis. Fork del agente — RESUELTO: sin agente, solo blueprint

La revision completa del blueprint (2026-06-01) desenterro que la "brujula" que
cocinamos **ya existia diseñada como agente legacy**:
`modules/conversacion/ai-agent-framework/agents/viabilidad-receta-analyzer.json`
(`enabled: true`, dispara en `viabilidad.evaluacion.completada`, produce
`{analisis, riesgos, recomendaciones}`). Pero estaba **dormido**
(`executions: 0`) y **desincronizado** del blueprint (esperaba `nombre_idea` /
`coste_por_porcion` / `coste_es_real`, que el blueprint no enviaba — drift
cerrado en v1.1.1, ver seccion 6).

**Decision cocinada con el usuario (2026-06-01): no se usa el agente. La brujula
vive solo en el blueprint.**

Por que encaja:
- El modulo blueprint **ya tiene al LLM como runtime** — generar los caminos al
  evaluar es "gratis": sin segunda llamada al LLM, sin segundo evento, sin
  enriquecimiento asincrono, sin prompt aparte.
- El agente nunca corrio. No se pierde nada vivo.
- La profundidad cualitativa **sigue en el chat** (al tocar la tarjeta) — donde
  el contrato ya la pone. El blueprint solo genera los *stubs* ligeros de los
  caminos. El agente (analisis pesado como evento aparte) es **redundante** con
  el handoff tarjeta→chat.

Matiz de contrato (honesto): hoy `subsistema-recetario` y los 2 schemas dicen
*"viabilidad NO toma decisiones cualitativas"*. "Solo blueprint" no contradice
eso — lo **precisa**: viabilidad genera puntos de entrada ligeros; el desarrollo
cualitativo vive en el chat (LLM principal). Eso exige tocar el contrato (ver
seccion 9).

**Footprint de jubilar el agente — limpio (verificado en disco):**
- Sus eventos de salida (`viabilidad.analisis.cualitativo.completado/fallido`):
  **sin schema, sin consumidor**. Quitarlos no rompe nada.
- Se va con su prompt (`prompts/viabilidad-receta-analyzer.json`).
- Referencias restantes: auditorias auto-generadas (se regeneran) + espejo en
  `conversacion-ref/` + posible entrada en `drift-baseline.json`. Nada estructural.

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

> **Nota — drift de eventos ya cerrado (v1.1.1, 2026-06-01).** La revision
> completa encontro que los 2 eventos de dominio publicaban un payload no
> conforme a su schema oficial (faltaban `user_id`/`nombre_idea`/`coste_es_real`,
> nombres `nombre`/`coste_porcion` en vez de `nombre_idea`/`coste_por_porcion`,
> sobraban `receta_id`/`pvp_efectivo`/`margen_porcion` contra
> `additionalProperties:false`). Alineados al schema canonico en el commit
> `7f7435b`. Tambien se cerro el hueco del `nombre_idea` al evaluar por
> `receta_id` (ahora via `recetas.obtener.request`, antes placeholder que
> invitaba a inventarlo). Esto es independiente del refactor — era correccion de
> conformidad — pero queda anotado porque el campo `caminos[]` se añade sobre
> ese expediente ya saneado.

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

## 8. Hilos abiertos menores → RESUELTOS (ver seccion 10)

- **¿Como se inicia una evaluacion desde la estancia?** Postura B dice que las
  mutaciones van via prefill al chat. Evaluar crea un expediente (mutacion).
  ¿La estancia tiene un form ligero (nombre + PVP + componentes) o es tambien
  un `prefillChatInput("evalua [producto] a PVP [x]")`? Decidir al implementar.
- **Umbrales de food cost por proyecto** — ya estaba en `trabajo_pendiente` del
  blueprint. Ortogonal a este refactor, no se abre aqui.

---

## 9. Proximo paso

Esto es horizonte grande. Antes de codigo, esta propuesta es el deposito de lo
cocinado. Cuando se arranque la implementacion (sesion `fede` o equivalente),
respetando la disciplina contrato-primero del repo:

0. **Contrato primero**: precisar el ROL de viabilidad en
   `subsistema-recetario.contract.json` — pasa de "puramente determinista" a
   "determinista + genera caminos ligeros (puntos de entrada accionables);
   profundidad cualitativa en el chat". **Retirar el agente** legacy
   `viabilidad-receta-analyzer.json` + su prompt (footprint limpio, seccion 5bis).
   Los 2 schemas de evento **NO se tocan** (ver seccion 10: los caminos viven en
   el expediente, no en el evento; el evento sigue canonico tras v1.1.1).
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

## 10. Specs de ejecucion (cubos A+B cerrados, 2026-06-01)

Bajada de lo cocinado a specs concretas, para que el ejecutor (cubo C) no re-decida.

### Decisiones (cubo A, cerradas)
- **Iniciacion = Postura B (prefill→chat).** Boton "Evaluar un producto" en la
  estancia que hace `prefillChatInput` con un arranque; el comerciante describe
  el producto hablando, el LLM lo estructura. Atajo: desde una receta existente,
  boton que prefilla con su `receta_id`. NO formulario (el input es
  conversacional, no denso — Postura B del contrato `ui-frontend-blueprint`).
- **Regla de caminos = cuando hay palanca real, 0–3, sin inventar.** El veredicto
  y el juicio salen siempre; los caminos salen cuando aportan. Producto redondo
  → `caminos = []`. Tope blando 2–3 (estancia de un vistazo). Contenido abierto
  (LLM por caso); solo la *regla* esta cerrada.

### Shape de `caminos[]` (cubo B) — en el expediente, NO en el evento
Campo nuevo en el `estado_persistente` del expediente:
```
"caminos": [
  { "titulo": "string — recomendacion visible en la tarjeta (ej. 'Subir el PVP a 9€')",
    "prompt": "string — lo que se inyecta al chat al tocar la tarjeta: incluye los datos
               del expediente (nombre_idea, coste_por_porcion, pvp) + la consulta del
               camino. Lo redacta el LLM entero al evaluar; el frontend solo lo inyecta." }
]
```
Sin `tipo`/`prioridad`/`impacto` — eso seria recerrar el enum que el usuario abrio.

### Paso nuevo del pseudocodigo de `evaluar` (cubo B)
Entre el veredicto (paso 4) y la construccion del expediente (paso 5):
```
"  // 4b. Generar caminos (la brujula). Stubs ligeros, NO analisis pesado.",
"  //     Regla: 0-3. Si hay palanca que merezca la pena para ESTE caso, proponla.",
"  //     Si sale redondo y no hay nada que tocar, caminos = [] (NO inventar).",
"  //     El desarrollo cualitativo NO se hace aqui — vive en el chat al tocar la tarjeta.",
"  caminos = <TU propones 0-3 caminos segun veredicto, food_cost_pct, margen y advertencias;",
"             cada uno { titulo, prompt }, con el prompt incluyendo nombre_idea,",
"             coste_por_porcion, pvp_efectivo y la consulta del camino>"
```
Y en el paso 5 (construir expediente): anadir `caminos: caminos`.

### Contrato-primero (cubo B) — footprint MENOR de lo anunciado
- **`subsistema-recetario.contract.json`**: precisar el ROL de viabilidad —
  "determinista + genera caminos ligeros (puntos de entrada); profundidad
  cualitativa en el chat". Retirar el agente `viabilidad-receta-analyzer`.
- **Los 2 schemas de evento: NO se tocan.** Refinamiento honesto sobre lo dicho
  en turnos previos: los caminos viven en el EXPEDIENTE persistido, NO en el
  evento. El evento sigue determinista (canonico tras v1.1.1) y la frase de los
  schemas "lo cualitativo lo decide el LLM principal" SIGUE siendo cierta — la
  profundidad esta en el chat (= LLM principal). Contrato mas pequeno de tocar.

### Frontend (cubo B)
- **Panel** (`ViabilidadPanel`): ya lee `/viabilidad.json`. Anadir boton
  "Evaluar un producto" → `prefillChatInput(arranque)`.
- **Detail** (`ViabilidadDetail`): remapear al shape real del expediente —
  `nombre_idea` (era `receta_nombre`), `coste_por_porcion`, `pvp_efectivo` (era
  `precio_venta`), `margen_porcion` (era `margen_bruto`), `food_cost_pct` (era
  `food_cost_porcentaje`), `veredicto` (era `estado` VIABLE/...). **Quitar** la
  seccion "Comparacion Historica".
- **Recomendaciones** (`ViabilidadRecomendaciones`): cambiar props de
  recomendaciones-de-tipo-fijo a `caminos` (`{titulo, prompt}`); cada tarjeta =
  `prefillChatInput(camino.prompt)`. Fuera `prioridad`/`tipo`/`impacto`.

### Lo que queda (cubo C — el ejecutor)
**Cerrado**: `cierre-refactor-viabilidad-guia-del-comerciante.json` (hermano de
este doc). Plan ejecutable estilo `cierre-ui-*.json` que corre `fede`: 4 fases
(F0 contrato + retirar agente, F1 blueprint con caminos, F2 frontend, F3
runtime-case) con OK explicito entre cada una, archivos exactos, cross-checks y
prohibiciones absolutas. En blueprint-driven el runtime-case (F3) sustituye al
test-por-handler.

---

## Referencias

- `arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json` — Postura B + `prefillChatInput` (mecanismo canonico).
- `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` — viabilidad cumple las 4 condiciones blueprint.
- `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` — padre del que viabilidad hereda.
- `arquitectura/decisiones/propuestas/mapa-piezas-comercio.md` — inventario del comercio (marco de origen).
- `arquitectura/decisiones/propuestas/lecturas-frontend-via-fs-read.md` — patron que usa `ViabilidadPanel`.
- `modules/pizzepos/viabilidad/viabilidad.blueprint.json` — estado actual (v1.1.0).
