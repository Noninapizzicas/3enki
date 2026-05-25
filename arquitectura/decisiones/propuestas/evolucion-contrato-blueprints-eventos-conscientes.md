# Evolución del contrato de blueprints — eventos conscientes en el diseño

> **Documento de retomar.** Captura una evolución de los contratos de
> blueprints para que **el catálogo de eventos del bus se vuelva
> material consciente del diseño**, no algo que aparece tarde por
> dolor de runtime. Origen: insight del usuario tras cerrar las
> Críticas 1 y 2 derivadas del audit cross-blueprint del 2026-05-25
> (handoff `carta.creada` roto + salmorejo perdido). Ambos bugs habrían
> sido detectables en revisión si los blueprints declaran al diseñarse
> qué eventos publican que requieren consumer y qué eventos pueden
> escuchar.

Fecha: 2026-05-25.
Documentos hermanos en `propuestas/`:
- `cajones-context-partitioning.md` ✅ cerrado.
- `migracion-menu-generator-blueprint.md` ✅ cerrado (en main).
- `blueprint-subscribers-asincronos.md` ✅ patrón canonizado.
- `migracion-agentes-blueprint.md` 📝 pendiente.
- `vertical-tienda-pwa-sin-datos.md` 📝 pendiente.
- `cierre-tools-contract-v12-deuda-residual.md` 📝 pendiente.

---

## 1 · Por qué existe este documento

Citando al usuario (literal):

> *"Valoremos tocar contratos de blueprints aclarar y sumar, valoremos
> cuando se cree o refactorice blueprints qué eventos pueden ser
> candidatos a ser escuchados."*

El insight aterriza después de dos bugs reales:

| Bug | Fallo del audit | Cierre |
|---|---|---|
| Handoff `carta.creada` no llegaba a `carta-manager` | Fallo A | PR #207 (Crítica 2) |
| Salmorejo perdido por read-modify-write frágil | Fallo B | PR #208 (Crítica 1) |

**Ambos bugs habrían sido detectables en revisión** si los blueprints
declaran al diseñarse:

- **Qué eventos publica que requieren consumer**: `menu-generator`
  publicaba `carta.creada` "esperando que alguien la persistiera". Sin
  análisis explícito, nadie verificó que el consumer existía y se
  registraba.
- **Qué eventos puede escuchar**: el catálogo de eventos del sistema
  es material disperso. El diseñador del blueprint no tiene una vista
  curada de "qué señales del bus son candidatas a moldear mi
  comportamiento". Sin esa vista, no se valora.

Este documento propone elevar el análisis de eventos a **parte
canónica del diseño** del blueprint, con artefactos concretos
(secciones nuevas en contratos, validators cross-module, checklist en
el blueprint padre).

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Lee los 3 documentos antecedentes citados (eventos contract,
   blueprint-subscribers-asincronos, modulos-blueprint-driven contract).
3. Sigue el guion en `_arranque-evolucion-contrato-blueprints-eventos.md`.

---

## 2 · Estado actual (qué hay y qué falta)

### Lo que YA está en main

| Pieza | Estado |
|---|---|
| `events.contract.json` v1.2.0 | Forma canónica de comunicación event-core, naming, retain, status |
| `blueprint-subscribers-asincronos.md` | Patrón `eventos_que_escucho` canonizado |
| `modulos-blueprint-driven.contract.json` v1.2.0 | Documento maestro del paradigma blueprint |
| `_wireBlueprintAsyncSubscribers` (ai-gateway) | Mecanismo runtime que registra los handlers declarados |
| Evento `core.modules.loaded.all` | Disparo determinístico del wiring (PR #207) |
| `expected_hash` + `safeUpdate` (PR #208) | Cierra clase de bugs read-modify-write |
| `events.validate.js` | Validator de naming, retain, generic verbs |
| Campo `eventos_que_escucho` declarado en los 11 blueprints actuales | Mecanismo disponible, en uso por recetas + carta-manager |

### Lo que FALTA (este horizonte)

| Pieza | Por qué falta |
|---|---|
| Campo canónico `eventos_publicados_que_requieren_consumer[]` en cada blueprint | Hoy un blueprint publica eventos "al aire" sin declarar si requieren consumer. Si no llega a nadie, falla silenciosamente |
| Cross-check del validator: cada `eventos_publicados_que_requieren_consumer[]` tiene al menos un subscriber declarado en otro blueprint o módulo JS del repo | Detecta huérfanos publishing-side |
| Cross-check del validator: cada entrada en `eventos_que_escucho[]` apunta a un evento que alguien publica | Detecta huérfanos subscribing-side (parcialmente ya existe en `llm-runtime-discipline.validate.js::eventos_que_escucho_apunta_a_evento_canonico`) |
| Sección en `modulos-blueprint-driven.contract.json` que documente "análisis de eventos" como parte del proceso de diseño/refactor de un blueprint | Hoy el contrato no exige análisis explícito |
| Checklist en el blueprint padre `subsistema-recetario.modulo-base.blueprint.json` que recuerde al diseñador (humano) hacer ese análisis | Sin checklist, se olvida |
| Doc de "catálogo de eventos del bus" auto-generado (o consultable) | Sin vista curada, el diseñador no sabe qué eventos existen para escuchar |

---

## 3 · La propuesta concreta

### 3.1 Campo nuevo en cada blueprint: `eventos_publicados_que_requieren_consumer[]`

Hoy un blueprint declara su `operaciones[]` con pseudocódigo que
publica eventos. No declara explícitamente cuáles de esos eventos son
**fire-and-forget que NECESITAN consumer** (vs eventos informativos
que pueden ir al vacío).

Propuesta:

```json
{
  "id": "menu-generator",
  "operaciones": { ... },
  "eventos_que_escucho": [
    { "evento": "carta.generar.solicitada", "handler": "_on_carta_generar_solicitada" }
  ],
  "eventos_publicados_que_requieren_consumer": [
    {
      "evento": "carta.creada",
      "requiere": "carta-manager (persistencia)",
      "publicado_en": "operaciones.generar.pseudocodigo:linea 24",
      "consecuencia_si_sin_consumer": "La carta generada se pierde silenciosamente."
    }
  ]
}
```

El validator nuevo `blueprint-eventos-conscientes.validate.js` cruza
este array contra `eventos_que_escucho[]` de todos los blueprints del
repo + `events.publishes[]` y `events.subscribes[]` de los module.json
de módulos JS. Si algún `eventos_publicados_que_requieren_consumer[]`
no tiene consumer registrado, drift de severidad error.

### 3.2 Sección "eventos_a_valorar" en el padre

El blueprint padre `subsistema-recetario.modulo-base.blueprint.json`
añade una sección operativa que el diseñador (humano) consulta cuando
crea o refactoriza un blueprint hijo. Algo así:

```json
"checklist_eventos_al_disenar_blueprint": {
  "_descripcion": "Antes de declarar operaciones[] terminadas, recorre esta lista para asegurar que el blueprint participa correctamente en el ecosistema event-core.",
  "preguntas": [
    "1. ¿Qué eventos del bus podrían moldear mi comportamiento? Consulta el catálogo de eventos publicados por otros módulos (output: events.json). Declara los relevantes en eventos_que_escucho[].",
    "2. ¿Qué eventos publica mi pseudocódigo que NECESITAN consumer? Para cada uno, declara entrada en eventos_publicados_que_requieren_consumer[] indicando quién es el consumer esperado y qué consecuencia tiene si nadie lo escucha.",
    "3. ¿Algún evento que publico es fire-and-forget sin consumer requerido? (telemetría, métricas, observabilidad). NO lo declares en eventos_publicados_que_requieren_consumer[] — pasaría como huérfano falso positivo.",
    "4. ¿Hay un evento canónico que ya existe y soluciona mi necesidad, en lugar de inventar uno nuevo? Revisa events.json antes de añadir nombres nuevos al espacio canónico.",
    "5. ¿Mis eventos publicados respetan naming.contract (prefijo del módulo, verbo canónico del idioma)?"
  ]
}
```

### 3.3 Validator nuevo `blueprint-eventos-conscientes.validate.js`

3 cross-checks:

| Cross-check | Severidad | Detecta |
|---|---|---|
| `evento_publicado_sin_consumer_declarado` | **error** | Blueprint declara `eventos_publicados_que_requieren_consumer[]` con un evento que ningún otro blueprint/módulo escucha |
| `evento_escuchado_sin_publisher_declarado` | warning | Blueprint declara `eventos_que_escucho[]` con un evento que ningún otro blueprint/módulo publica (ya parcialmente cubierto por `llm-runtime-discipline.validate.js`) |
| `evento_publicado_sin_declarar_requirement` | info | Blueprint publica un evento en su pseudocódigo (regex sobre publish/publishAndWait) que NO aparece ni en `eventos_publicados_que_requieren_consumer[]` ni está obviamente clasificado como fire-and-forget de observabilidad. Recordatorio para el diseñador |

Wireado a `validate-all.js` + npm script + workflow.

### 3.4 Sección nueva en `modulos-blueprint-driven.contract.json`

Bump v1.2.0 → v1.3.0. Añadir sección:

```json
"proceso_de_diseno_de_blueprint": {
  "_descripcion": "Al crear o refactorizar un blueprint, el análisis de eventos forma parte canónica del diseño, no opcional.",
  "checklist": [
    "Antes de declarar operaciones[] terminadas, recorre las 5 preguntas del checklist_eventos_al_disenar_blueprint del padre.",
    "Declara explícitamente eventos_publicados_que_requieren_consumer[] para cada evento fire-and-forget del pseudocódigo cuyo destino sea otro módulo del sistema.",
    "Para cada entrada, identifica al consumer esperado por nombre de módulo.",
    "Si el consumer no existe todavía, NO declares el evento como 'requiere_consumer' hasta crear primero el consumer (evita drift de huérfanos en baseline)."
  ],
  "validacion": "blueprint-eventos-conscientes.validate.js cruza declaraciones contra el catálogo real del repo."
}
```

### 3.5 Auto-generación de `events.json` (catálogo curado)

Output canónico nuevo: `arquitectura/decisiones/_outputs/events.json`
con la lista de eventos publicados/escuchados por **todos** los
módulos (JS + blueprints) del repo, indexado por:

- `<event_name>`: { publishers: [...], subscribers: [...] }

El validator `events.validate.js` (ya existente) puede extenderse para
generar este output. El diseñador consulta el output al diseñar un
blueprint nuevo.

---

## 4 · Decisiones tomadas (cerradas en sesión)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Origen: insight del usuario tras Críticas 1 y 2 del audit cross-blueprint | El patrón "diseño consciente de eventos" sale del propio dolor observado |
| 2 | Naming del campo nuevo | `eventos_publicados_que_requieren_consumer[]` (paralelo simétrico de `eventos_que_escucho[]`) |
| 3 | Severidad del cross-check publishing-side huérfano | **error** (bloquea CI). Si publicas algo que requiere consumer y no hay nadie, es bug latente |
| 4 | Sin reglas sobre eventos fire-and-forget de observabilidad | Quedan fuera de declaración explícita. Pasan al validator como info si emerge necesidad |
| 5 | Helper en el padre como checklist (no como tool) | El LLM-runtime no usa el checklist — es para el diseñador humano. Vive en sección distinta a `helpers_built_in_para_el_pseudocodigo` |

---

## 5 · Decisiones AÚN abiertas

### 5.1 ¿Auto-generar `events.json` ahora o más tarde?

- **A**: Implementar la auto-generación en este horizonte (extender `events.validate.js` para producir output canónico).
- **B**: Posponer. Mantener catálogo en cabezas + grep por ahora. Auto-generar cuando el catálogo crezca demasiado.

Recomendación: **A**. Sin catálogo curado el diseñador no tiene de
dónde elegir eventos para escuchar. El esfuerzo es pequeño (~1h).

### 5.2 ¿Migrar los 11 blueprints existentes ahora o en commits sucesivos?

Hoy ningún blueprint declara `eventos_publicados_que_requieren_consumer[]`.
Hay que añadirlo a todos.

- **A**: Migración masiva en un solo PR (~1-2h, mecánica).
- **B**: Migración perezosa por blueprint en commits separados a medida que se tocan.
- **C**: Migración masiva pero **opt-in v1**: el validator solo detecta drift donde se ha declarado el campo. Los blueprints sin el campo no se quejan. Esto permite migrar gradualmente sin romper CI.

Recomendación: **C**. Permite mergear el contrato + validator + padre
sin obligar a tocar los 11 blueprints en el mismo PR. Cada blueprint
se migra cuando se revise.

### 5.3 ¿Severidad del cross-check `evento_publicado_sin_declarar_requirement`?

Detecta blueprints que publican un evento en su pseudocódigo pero no
lo declaran como "requiere consumer" ni está obviamente clasificado.

- **A**: info (no bloquea, solo recordatorio para el diseñador).
- **B**: warning (visible en cada validate:ci, presiona migración).
- **C**: error (bloquea hasta que se clasifique).

Recomendación: **A**. Cerrar como info evita ruido. Si tras 2-4
semanas no se observa adopción real, evolucionar a warning.

### 5.4 ¿Aplica solo a blueprints o también a módulos JS POC2?

- **A**: Solo blueprints (los 11 actuales + futuros).
- **B**: También módulos JS POC2 — `module.json.events.publishes[]` añadiría campo `requires_consumer: true`.
- **C**: Empezar por blueprints. Extender a módulos JS POC2 si el patrón funciona.

Recomendación: **C**. El dolor observado fue en blueprints, no hay
evidencia de bug similar en JS POC2. Validar el patrón allí primero.

---

## 6 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | El validator nuevo necesita cruzar publishers/subscribers de blueprints (JSON) Y módulos JS (regex sobre código) | Media | Reusar primitivas de `events.validate.js` que ya hace el cruce parcial. Extender |
| 2 | Falsos positivos por eventos fire-and-forget de observabilidad (metrics, logs) | Media | Decisión 4: NO se declaran como `requires_consumer`. Validator info-level para detectar olvidos |
| 3 | Migrar 11 blueprints existentes manualmente | Baja | Decisión 5.2: opt-in. Cada blueprint se migra cuando se toque |
| 4 | El catálogo `events.json` puede crecer a 200+ eventos cuando el sistema escale | Baja inicial | Cuando emerja, indexar por dominio (`<modulo>.*`) o filtrar |
| 5 | El proceso de checklist depende de disciplina humana | Inherente | Lo cubre el validator cross-check publishing-side error. Si el diseñador olvida el checklist, CI lo detecta |

---

## 7 · Lo que NO se incluye en v1

- ❌ Migración masiva de los 11 blueprints (decisión 5.2: opt-in gradual).
- ❌ Aplicación a módulos JS POC2 (decisión 5.4: solo blueprints primero).
- ❌ Validador strict que bloquea si NO se declara `eventos_publicados_que_requieren_consumer` (decisión 5.3: solo info en v1).
- ❌ Auto-generación de diagramas de eventos (visualización gráfica del grafo publish/subscribe). Posible v2.
- ❌ Versionado semántico de eventos (`carta.creada.v1` vs `carta.creada.v2`). Otro horizonte.

---

## 8 · Camino propuesto para implementación

### Fase 0 — Cerrar las 4 decisiones abiertas (30 min, sin código)

Cerrar 5.1-5.4 con el usuario.

### Fase 1 — Bump `events.validate.js` con auto-generación de catálogo (1h)

Si decisión 5.1 = A:
- Extender `events.validate.js` para producir `_outputs/events.json` con `{event_name: {publishers, subscribers}}`.
- Wireado al validate-all si no lo está ya.

### Fase 2 — Schema + sección nueva en blueprint padre (30 min)

- Añadir `eventos_publicados_que_requieren_consumer[]` al schema del blueprint hijo (si existe schema AJV).
- Añadir sección `checklist_eventos_al_disenar_blueprint` al padre. Bump v0.5.0 → v0.6.0.

### Fase 3 — Actualizar `modulos-blueprint-driven.contract.json` (30 min)

- Añadir sección `proceso_de_diseno_de_blueprint` con checklist + referencia al validator.
- Bump v1.2.0 → v1.3.0.

### Fase 4 — Implementar `blueprint-eventos-conscientes.validate.js` (1-2h)

- 3 cross-checks declarados.
- Wireado a `validate-all.js` + npm script + workflow.
- Sección en `drift-baseline.json`.

### Fase 5 — Doc canónico del patrón (30 min)

- `arquitectura/decisiones/_contratos/blueprint-eventos-conscientes.contract.json` formaliza el patrón como contrato transversal independiente (o como sub-contrato del paradigma blueprint).

### Fase 6 — Audit retrospectivo (1h)

- Cruzar los 11 blueprints actuales contra el validator nuevo.
- Reportar qué eventos publican sin declarar consumer (con decisión 5.3=A, esto sale como info, no bloquea).
- Crear lista de eventos que **deberían** declararse para que cada blueprint migre cuando se toque.

### Fase 7 — Cierre

- Commit + push.
- Actualizar `CLAUDE.md` con el nuevo patrón si aplica.
- Cerrar este documento con cabecera ✅.

**Total estimado: 4-6h en 1-2 sesiones.**

---

## 9 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar la evolución del contrato de blueprints — eventos
> conscientes en el diseño. Lee
> `arquitectura/decisiones/propuestas/evolucion-contrato-blueprints-eventos-conscientes.md`
> entero. Sigue el guion en
> `_arranque-evolucion-contrato-blueprints-eventos.md`."*

El guion hace que la próxima sesión:
1. Verifique el estado actual (contratos, validators, blueprints).
2. Te haga las 4 decisiones abiertas en orden.
3. Para y pide tu OK antes de Fase 1.
4. Itera fase por fase pidiéndote OK entre cada una.

---

## 10 · Relación con otros contratos

| Contrato | Cómo se relaciona |
|---|---|
| `events.contract.json` v1.2.0 | Define naming + retain + status. Este horizonte añade la dimensión "consumer-awareness". |
| `modulos-blueprint-driven.contract.json` v1.2.0 | Documento maestro del paradigma. Bump v1.3.0 incluye `proceso_de_diseno_de_blueprint`. |
| `llm-runtime-discipline.contract.json` v2.0.0 | Sus 11 principios siguen vigentes. El cross-check `eventos_que_escucho_apunta_a_evento_canonico` se complementa con el nuevo publishing-side. |
| `blueprint-subscribers-asincronos.md` | Patrón subscribers ya canonizado. Este horizonte añade la simetría publishing-side. |
| `extensibilidad-modular.contract.json` | El nuevo cross-check refuerza "añadir módulo sin romper otros" — si un blueprint nuevo publica eventos huérfanos, lo bloquea. |
| `module-rewrite.contract.json` (POC2) | NO aplica directamente en v1. Si decisión 5.4 evoluciona a C+ en v2, se extiende. |
| `cajones-context-partitioning.contract.json` | Sin relación directa. |

---

## 11 · Referencias rápidas

| Qué | Dónde | Por qué |
|---|---|---|
| Origen del insight | Audit cross-blueprint `audit/cross-blueprint-20260525T095823/reporte.md` | Fallos A y B que motivan este horizonte |
| Cierre Fallo A | PR #207 (`fix-blueprint-async-wiring-clean`) | Wiring deterministico, ya en main |
| Cierre Fallo B | PR #208 (`fix-filesystem-cas-versionado-optimista`) | CAS, pendiente OK del usuario |
| Patrón subscribers actual | `arquitectura/decisiones/propuestas/blueprint-subscribers-asincronos.md` | Mecanismo `eventos_que_escucho` ya canónico |
| Validator de eventos actual | `arquitectura/decisiones/_validators/events.validate.js` | Punto de extensión para el nuevo cross-check |
| Blueprint padre actual | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` v0.5.0 | Donde añadir checklist |
| 11 blueprints candidatos | `modules/pizzepos/{recetas,escandallo,viabilidad,tecnicas,carta-design,carta-digital,carta-impresion,carta-manager,carta-marketing,carta-scheduler,menu-generator}/*.blueprint.json` | Audit retrospectivo Fase 6 |
| Contrato maestro paradigma | `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` v1.2.0 | Sección nueva `proceso_de_diseno_de_blueprint` |

---

## 12 · Frase resumen para retomar

**Evolución del contrato de blueprints: el catálogo de eventos del bus
se vuelve material consciente del diseño. Cada blueprint declara
explícitamente `eventos_publicados_que_requieren_consumer[]` (paralelo
simétrico a `eventos_que_escucho[]`). Validator nuevo
`blueprint-eventos-conscientes.validate.js` cruza ambos lados con el
catálogo real del repo y bloquea CI si hay publishers huérfanos.
Checklist en el blueprint padre recuerda al diseñador (humano) hacer
el análisis al crear/refactorizar. Auto-generación de
`_outputs/events.json` como catálogo curado. Migración opt-in (los 11
blueprints actuales se migran cuando se toquen). Cierra la clase de
bugs estilo handoff `carta.creada` y salmorejo perdido en el plano del
diseño, antes de que aparezcan en runtime. Total ~4-6h en 1-2
sesiones. 4 decisiones abiertas: auto-gen ya o después, migración
masiva o opt-in, severidad info/warning/error del cross-check
"publica sin declarar", aplicabilidad a módulos JS POC2.**
