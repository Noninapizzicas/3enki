# Aislamiento del store de recetas — refactor pendiente de escandallo (y otros)

> **Documento de retomar.** Captura una deuda detectada durante el audit
> de Fase 5 bis de cajones-context-partitioning (2026-05-23, runtime real
> contra el VPS con `escandallo` ya activado con `cajones_enabled: true`).
> NO se implementa ahora — el cierre requiere una sesion dedicada que
> tocara `escandallo.blueprint.json`, posiblemente `recetas.blueprint.json`,
> y muy probablemente otros blueprints del subsistema que comparten el
> mismo patron.

Fecha: 2026-05-23.

---

## 1 · El sintoma

Durante el audit runtime, con `escandallo` en `cajones_enabled: true` y
una conversacion en `page=escandallo`, el LLM:

1. Abria el cajon `calcular` correctamente (`cajon.abrir({nombre:'calcular'})`).
2. Recibia el pseudocodigo del cajon — que **literalmente le decia**
   `await publishAndWait('fs.read.request', { path: '/recetas.json' })`.
3. Ejecutaba lo que el pseudocodigo decia → leia `/recetas.json` directo
   con `fs.read.request`.
4. La response del LLM mencionaba "no encuentro el archivo `/recetas.json`",
   filtrando un detalle de implementacion al usuario.

El LLM **no se invento nada** — siguio el pseudocodigo al pie de la letra.
El anti-patron vive en el propio blueprint, no en el LLM. La disciplina
`pseudocodigo_es_ley` de `llm-runtime-discipline.contract.json` se cumple
de manera ironicamente perfecta: el LLM ejecuta exactamente lo que el
blueprint le manda hacer mal.

---

## 2 · El anti-patron formal

`llm-runtime-discipline.contract.json` v1.0.0 lista entre sus 10 principios:

> **`no_explorar_estado_ajeno`**: El LLM accede SOLO al `estado_persistente`
> declarado en SU blueprint hijo. Si necesita datos de otro modulo, publica
> `<otro-modulo>.<operacion>.request` al bus y espera su response. NUNCA
> hace `fs.read` directo a archivos que pertenecen a otro modulo.
>
> **anti_patron**: Leer `/recetas.json` desde el blueprint de escandallo.
> Lo correcto es `publishAndWait('recetas.obtener.request', ...)`.

Es decir, **el propio contrato ya cita textualmente el caso que escandallo
viola hoy**. El anti-patron esta bien documentado a nivel transversal — lo
que falta es que los blueprints concretos respeten la regla.

---

## 3 · Las 3 ocurrencias en escandallo

Escaneo del 2026-05-23 sobre `modules/pizzepos/escandallo/escandallo.blueprint.json`
v2.0.0:

| # | Operacion | Linea | Codigo | Severidad |
|---|---|---|---|---|
| 1 | `calcular` | paso 16 | `await publishAndWait('fs.read.request', { path: '/recetas.json' })` para obtener UNA receta por `receta_id` | violacion lectura |
| 2 | `calcular` | paso 114 | `await publishAndWait('fs.read.request', { path: '/recetas.json' })` para releer el store antes de escribir | violacion lectura |
| 3 | `calcular` | paso 126-129 | `await publishAndWait('fs.write.request', { path: '/recetas.json', content: JSON.stringify(store_latest, ...) })` que ESCRIBE el store entero modificado con los campos de coste | **violacion grave** — escritura cruzada |
| 4 | `recalcular_todas` | paso 4 | `await publishAndWait('fs.read.request', { path: '/recetas.json' })` para listar todas las recetas | violacion lectura |

(El escaneo dio "3 anti-patrones" porque agrupo las 2 lecturas de
`calcular` como un caso unico operativamente — son la misma logica
repetida; en realidad son **4 ocurrencias** distintas si se cuenta cada
`publishAndWait` con su numero de linea.)

---

## 4 · Por que el refactor cierra mas alla de escandallo

Cuando estaba a punto de refactorizar escandallo, encontre que el
**bloqueo no estaba solo en escandallo**:

`recetas.actualizar` (operacion canonica de `recetas.blueprint.json`) tiene
un whitelist de campos modificables — quote textual del pseudocodigo
(linea 19-31):

```
switch (campo) {
  case 'nombre':        ...
  case 'descripcion':   ...
  case 'porciones':     ...
  case 'tiempo_min':    ...
  case 'dificultad':    ...
  case 'notas':         ...
  case 'fuente':        ...
  case 'ingredientes':  ...
  case 'instrucciones': ...
  case 'categorias':    ...
  case 'etiquetas':     ...
  default: <ignorar>
}
```

Los 7 campos que escandallo necesita escribir — `coste_total`, `coste_porcion`,
`coste_actualizado_at`, `postcode_usado`, `fuentes_precios`,
`ingredientes_detalle`, `ingredientes_sin_precio` — **NO estan en el
whitelist**. Si escandallo manda `cambios: { coste_total: 12.3 }` a
`recetas.actualizar`, recetas los ignora silenciosamente y devuelve
`INVALID_INPUT { field: 'cambios', message: 'ningun campo conocido' }`.

Por tanto:
- **Cambiar las 2 lecturas** es trivial (las operaciones canonicas
  `recetas.obtener` y `recetas.listar` ya existen y sirven el caso).
- **Cambiar la escritura** requiere que recetas ofrezca una via canonica
  para los campos de coste. Hay dos formas:
  - **Opcion A — operacion nueva**: `recetas.actualizar_coste(receta_id, coste_total, coste_porcion, ingredientes_detalle, ...)`. Mas limpio semanticamente: el modulo expone una operacion especifica de su dominio. Bumpea `recetas.blueprint.json` v1.0.0 → v1.1.0.
  - **Opcion B — ampliar whitelist**: anyadir los 7 campos al switch existente de `actualizar`. Menos limpio (mezcla actualizaciones editoriales con derivadas de calculo). Pero mas pequeno.

Recomendacion: **opcion A** — refleja la separacion conceptual entre
"editar una receta" y "actualizar el coste calculado de una receta"
(esta ultima la dispara escandallo, no el usuario).

---

## 5 · Otros blueprints probablemente afectados

El escaneo del 2026-05-23 detecto el anti-patron SOLO en escandallo entre
los 10 blueprints actuales. Concretamente, este comando se aplico a todos
los `.blueprint.json` y filtro `fs.read.request '/<file>.json'` donde
`<file>` no coincide con el nombre del modulo ni empieza por `<modulo>-`:

```
* escandallo (3 anti-patrones):
  - calcular -> fs.read.request /recetas.json
  - calcular -> fs.read.request /recetas.json
  - recalcular_todas -> fs.read.request /recetas.json
```

Pero el usuario indica que **probablemente otros blueprints comparten el
mismo patron** — quizas no detectado por la heuristica de mi escaneo. Casos
plausibles:

- **`viabilidad.blueprint.json`** — invoca a `escandallo` y posiblemente
  tambien lee directamente algun archivo de otro modulo.
- **`carta-*` (manager, scheduler, digital, design, impresion, marketing)**
  — operaciones cross-dominio (consumen `recetas`, `escandallo`,
  `tecnicas` o se referencian entre si). El acoplamiento puede haber
  filtrado a `fs.read/fs.write` directos en algunas ops puntuales.
- **`tecnicas.blueprint.json`** — operaciones que listen/actualicen
  tecnicas pueden estar leyendo el store directamente.

**Antes del refactor sesion-dedicada, hacer un escaneo mas exhaustivo**:
no solo `fs.read.request '/recetas.json'`, sino cualquier `fs.read|fs.write`
con paths que no son propios del modulo (incluyendo paths sin prefijo o
con prefijos compartidos como `/projects/`, `/data/`, `/storage/`).

---

## 6 · El plan de refactor (cuando se aborde)

### Fase 1 — Escaneo exhaustivo (30 min)

Mejorar la heuristica del escaneo para detectar:
- `fs.read.request '/<X>.json'` donde `<X>` NO es propio del modulo.
- `fs.write.request '/<X>.json'` donde `<X>` NO es propio del modulo.
- `fs.read|fs.write` con paths que apuntan a `estado_persistente` de otros
  modulos (cruzar con la seccion `estado_persistente` de cada blueprint).

Ejecutar contra los 10 blueprints + cualquier blueprint nuevo que se
hubiera anyadido. Listar TODOS los casos. Documentar.

### Fase 2 — Operaciones canonicas faltantes (variable)

Para cada par (modulo_A, modulo_B) detectado:
- Si modulo_A solo LEE el store de modulo_B → verificar que modulo_B
  tiene una operacion `obtener`/`listar`/`buscar` que sirve el caso.
  Si no, **anyadirla** a `modulo_B.blueprint.json`.
- Si modulo_A ESCRIBE en el store de modulo_B → **anyadir operacion
  nueva** a `modulo_B.blueprint.json` con semantica de dominio
  (`actualizar_coste`, `marcar_completa`, `archivar`, etc.). NO ampliar
  el whitelist de `actualizar` con campos derivados.

Bumpear `modulo_B.blueprint.json` v? → v(?+1).0 cuando hay operaciones
nuevas, y eventos canonicos de dominio adicionales (`receta.coste.actualizado`,
`receta.archivada`, ...).

### Fase 3 — Refactor de los consumers (variable)

Para cada modulo_A:
1. Reemplazar `fs.read.request '/<otro>.json'` por
   `<otro>.<operacion>.request`.
2. Reemplazar `fs.write.request '/<otro>.json'` por
   `<otro>.<operacion_nueva>.request`.
3. Bumpear `modulo_A.blueprint.json` mayor (v? → v(?+1).0 porque cambia
   el modelo de ejecucion).

### Fase 4 — Tests POC2

Cada blueprint refactorizado debe pasar:
- Validador `cajones-context-partitioning.validate.js`.
- Validador `llm-runtime-discipline.validate.js` (verifica que `no_explorar_estado_ajeno` ya no se viola).
- Audit runtime corto (3-4 mensajes contra el VPS) para confirmar que el
  LLM ejecuta el pseudocodigo refactorizado sin fallos y la nueva
  operacion canonica funciona end-to-end.

### Fase 5 — Cierre

- Anyadir a `llm-runtime-discipline.validate.js` un cross-check
  `drift_blueprint_fs_read_a_storage_ajeno` que escanee los blueprints
  buscando este anti-patron y falle si reaparece. Hoy el validator no
  hace ese check; deberia.
- Actualizar `CLAUDE.md` cerrando la deuda.
- Mover este documento a `propuestas/_cerradas/` o anyadirle cabecera de
  cierre (patron observado en `cajones-context-partitioning.md`).

---

## 7 · Por que se aparca a sesion dedicada

Este refactor NO es parte del scope de cajones. Cajones expone la deuda
(el LLM ahora SI ejecuta lo que el blueprint le manda, y el blueprint
hoy le manda mal) pero el refactor toca:

- Blueprints en runtime activo en el VPS.
- Operaciones canonicas de mas de un modulo (no solo escandallo —
  recetas mismo necesita extension, y posiblemente otros).
- Tests + audits runtime + actualizacion de contrato + validador.

Es una sesion entera por si sola. Si se mezcla con otro trabajo
estructural en curso, las decisiones colisionan.

El sistema **funciona hoy** con el anti-patron. El blueprint de escandallo
lee `/recetas.json` directo y devuelve resultados correctos (porque
filesystem es promiscuo: responde a cualquiera). El problema es de
disciplina, no de funcionalidad. **No urgente, importante.**

---

## 8 · Estado al cerrar este documento

- `escandallo.blueprint.json` v2.0.0 conserva las 4 ocurrencias del
  anti-patron documentadas en seccion 3.
- `cajones_enabled: true` sigue activo en escandallo y en los otros 9
  blueprints del sistema (commit `a3c57e0`, mergeado en PR #187).
- El audit runtime del 2026-05-23 documenta el caso testigo:
  `audit/escandallo-postdeploy-20260523-223558/chat-export.json`.
- `llm-runtime-discipline.validate.js` existe (commit `fead23b`) pero NO
  tiene cross-check para este anti-patron especifico. Solo valida la
  estructura del contrato y la coherencia padre↔contrato. **Anyadir el
  check forma parte de la Fase 5 del refactor.**

---

## 9 · Referencias rapidas

| Que | Donde |
|---|---|
| Contrato disciplina | `arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json` (principio `no_explorar_estado_ajeno`) |
| Escandallo afectado | `modules/pizzepos/escandallo/escandallo.blueprint.json` v2.0.0 |
| Recetas (whitelist limitado) | `modules/pizzepos/recetas/recetas.blueprint.json` v1.0.0 (operacion `actualizar`) |
| Audit testigo | `audit/escandallo-postdeploy-20260523-223558/chat-export.json` (turnos T2 y T3) |
| Contrato cajones | `arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json` (donde se documenta la observacion en deuda detectada durante el piloto) |
| Validator disciplina | `arquitectura/decisiones/_validators/llm-runtime-discipline.validate.js` (sin check para este anti-patron — pendiente Fase 5) |
