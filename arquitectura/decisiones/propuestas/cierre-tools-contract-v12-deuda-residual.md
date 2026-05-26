# Cierre tools.contract v1.2 — deuda residual de la migración

> **Documento de retomar.** Captura el plan para cerrar los **356 drifts
> residuales** en sección `tools|` del `drift-baseline.json`. Sombras de
> la migración a `tools.contract v1.2` que quedaron congelados en
> baseline porque la migración cerró "formalmente al 100%" (los 58
> módulos declaran tools[] en el shape canónico) pero quedó coja en lo
> profundo (handlers que devuelven valor pelado + `ui_handlers[]`
> residuales con shape antiguo de dispatch).

Fecha: 2026-05-25.
Documentos hermanos en `propuestas/`:
- `capa-unica-tools-via-plugins.md` ✅ cerrado (motivó v1.2).
- `cajones-context-partitioning.md` ✅ cerrado.
- `migracion-agentes-blueprint.md` 📝 pendiente.
- `migracion-menu-generator-blueprint.md` 📝 pendiente.

---

## 1 · Por qué existe este documento

`tools.contract v1.2` (mergeado en main hace semanas) elevó `tools[]` a
**única fuente de declaración** y delegó al loader el auto-wire a tres
destinos:

- `toolsRegistry` (ai-gateway/LLM).
- Bus event `<toolName>` (auto-suscripción ya canónica desde v1.1).
- `uiHandler` (clave derivada del name).

Todos los 58 módulos del repo que declaran tools tienen el shape
canónico en `module.json`. El sistema funciona. Pero el baseline tiene
**356 entradas en sección `tools|`** que representan deuda residual de
la migración:

| Tipo de drift | Cuántos | Módulos afectados |
|---|---|---|
| `drift_ui_handlers_con_shape_de_dispatch` | **334** | 43 módulos |
| `drift_tool_handler_que_devuelve_valor_pelado` | **22** | 10 módulos |

**No rompen CI** (están congelados en baseline). **No rompen runtime**
(los consumers tolerantes los procesan, los estrictos los ignoran).
Pero **rompen el contrato canónico** y crean ruido en el baseline que
contamina cualquier auditoría posterior.

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Lee `arquitectura/decisiones/_contratos/tools.contract.json` v1.2.1
   (~10 min, lee `supersedes_nota` para entender qué cambió).
3. Sigue el guion en `_arranque-cierre-tools-contract-v12.md`.

---

## 2 · Estado actual (con números reales)

### Los 22 "valor pelado" — handlers que NO devuelven `{status, data|error}`

Distribución por módulo:

| Módulo | Tools afectadas | Esfuerzo |
|---|---|---|
| `pizzepos/cuentas-canales` | 4 (`mesa.list`, `mesa.renombrar`, `telefono.contactos`, `whatsapp.conversaciones`) | 30 min |
| `pizzepos/cocina` | 4 (`cocina.get`, `cocina.mark-ready`, `cocina.prepare-item`, `cocina.register-device`) | 30 min |
| `scheduler` | 2 | 15 min |
| `pizzepos/productos` | 2 (`productos.ingredientes`, `productos.list`) | 15 min |
| `mercadona-api` | 2 (`mercadona.categorias.listar`, `mercadona.producto.obtener`) | 15 min |
| `filesystem` | 2 (`fs.list`, `fs.stats`) | 15 min |
| `facturas` | 2 (`facturas.estadisticas`, `facturas.listar`) | 15 min |
| `code-executor` | 2 (`shell.exec`, `shell.script`) | 15 min |
| `pdf-viewer` | 1 (`pdf.create`) | 10 min |
| `facturacion/asesoria` | 1 (`asesoria.historial`) | 10 min |

Cada tool requiere envolver el `return` actual en `{ status: 'ok', data: <lo de antes> }`
o `{ status: 'error', error: { code, message } }`. Consumers tolerantes
ya lo procesan; consumers estrictos lo agradecen.

### Los 334 `ui_handlers[]` residuales — top 15 módulos

| Módulo | Drifts | Notas |
|---|---|---|
| `composition-manager` | 16 | |
| `staff-manager` | 15 | |
| `project-manager` | 15 | |
| `filesystem` | 14 | |
| `prompt-manager` | 13 | |
| `pizzepos/productos` | 13 | Consumer frontend confirmado |
| `pizzepos/persistencia-comandero` | 12 | |
| `pizzepos/cocina` | 12 | Consumer frontend confirmado (`cocina.ts` store) |
| `esp32-flasher` | 12 | |
| `certificate-authority` | 12 | |
| `admin-panel` | 12 | |
| `pizzepos/pedidos` | 11 | |
| `firmware-manager` | 10 | |
| `pizzepos/ingredientes` | 9 | |
| `pizzepos/cuentas` | 9 | Consumer frontend confirmado (`cuentas.ts` store) |
| ... 28 módulos más | hasta 334 | |

**Total: 43 módulos afectados, 334 entradas.**

### Consumers frontend identificados (auditoría inicial)

Grep `ui_handlers|uiHandler` en `frontend/src/lib/`:

- `frontend/src/lib/modules/menu-pdf2img/Pdf2ImgPanel.svelte` (PDF→imagen).
- `frontend/src/lib/stores/recetas.ts` (lecturas de recetas — atención).
- `frontend/src/lib/stores/cuentas.ts` (cuentas-canales — atención).
- `frontend/src/lib/stores/cocina.ts` (cocina — atención).

**Esto significa que PR2 NO es solo "borrar y ya"**. Hay frontend
dependiendo del shape viejo en al menos 4 puntos. Auditoría exhaustiva
de consumers es Fase 0 de PR2.

---

## 3 · Plan: 2 PRs separados (no uno solo)

Los dos tipos de drift tienen **perfiles de riesgo distintos**, por
eso se separan.

### PR1 — Valor pelado (22 drifts, 10 módulos)

**Esfuerzo**: 1-1.5h.
**Riesgo**: bajo. El shape canónico `{status, data|error}` es más estricto
que el valor pelado actual. Consumers tolerantes ya lo procesan;
consumers estrictos pasan a funcionar correctamente.

**Plan operativo**:
1. Por cada uno de los 22 handlers: envolver `return X` → `return { status: 'ok', data: X }`. Si el handler ya tiene paths de error, asegurarse que devuelven `{ status: 'error', error: { code: '<CANONICO>', message: '...' } }`.
2. Si el handler tiene tests POC2 (`tests/unit/<modulo>.test.js`), actualizar las aserciones para esperar el shape canónico.
3. Regenerar baseline (los 22 drifts cierran automáticamente).
4. `npm run validate:ci` PASS verde.
5. Commit + PR + merge.

### PR2 — `ui_handlers[]` residuales (334 drifts, 43 módulos)

**Esfuerzo**: 2-3.5h.
**Riesgo**: medio en frontend. El `ui_handlers[]` con shape de dispatch
era el mecanismo manual previo a v1.2. Algunos consumers Svelte podrían
estar leyendo de él directamente. Antes de tocar nada, hay que auditar.

**Plan operativo** (en este orden):

1. **Auditoría exhaustiva de consumers frontend** (45 min). Grep todos
   los archivos frontend que usan: `ui_handlers`, `uiHandler.register`,
   `mqttRequest('<domain>'`, `mqttRequest("<domain>"`. Listar qué
   `domain.action` invoca cada componente. Cruzar con el shape derivado
   de `tools[]` (domain = primer segmento del tool name, action = resto).
2. **Verificar invocaciones**: para cada consumer frontend identificado,
   confirmar que el mismo `domain.action` está auto-wireado desde el
   `tools[]` del módulo (lo está si el name del tool sigue el shape
   canónico).
3. **Eliminar `ui_handlers[]` residual** por módulo. Pueden ocurrir
   dos casos:
   - **Caso A**: `ui_handlers[]` es **duplicación** del auto-wire (mismo
     domain.action). → Eliminar entrada de `ui_handlers[]` directamente.
   - **Caso B**: `ui_handlers[]` declara un handler que NO está en
     `tools[]`. → Migrar el handler a `tools[]` con el shape canónico
     (incluido `parameters`, `errores_conocidos`, retorno canónico).
     Eliminar entrada de `ui_handlers[]`.
4. **Regenerar baseline** módulo a módulo (no en bloque, para detectar
   regresiones temprano).
5. **Validar runtime** (audit de uno o dos módulos críticos: cuentas,
   cocina) antes de commitear todo el lote.
6. Commit + PR + merge.

---

## 4 · Decisiones AÚN abiertas

### 4.1 ¿Rama compartida o ramas separadas?

- **A**: Una sola rama (`claude/cierre-tools-contract-v12`) con 2
  commits separados (PR1 y PR2 en el mismo PR — squash merge). Más
  simple, pero PR2 bloqueado por revisión de PR1.
- **B**: Dos ramas independientes (`claude/cierre-tools-pr1-valor-pelado`
  y `claude/cierre-tools-pr2-ui-handlers`). PR1 mergea solo. Cuando
  está en main, se rebase PR2 y se mergea solo. Más PRs pero
  desacoplados.

Recomendación de partida: **B**. Permite mergear PR1 con confianza casi
inmediata (1h de trabajo, riesgo bajo) y dedicar más cuidado a PR2 sin
bloquearlo.

### 4.2 ¿Auditar también los 13 módulos sin drift?

13 de los 58 módulos con `tools[]` NO tienen entries en baseline para
`tools|`. Eso puede significar dos cosas:

- **A**: Esos módulos están al 100% canónicos (ningún drift detectable).
- **B**: Tienen drift pero el validator no lo detecta (falsos negativos
  del validator).

- **Opción A — Asumir A**: ahorrar tiempo, no auditar lo que ya pasa.
- **Opción B — Auditar manualmente** los 13 buscando los mismos
  patrones de drift que el validator detecta — quizá descubrir un
  agujero del validator.

Recomendación de partida: **A** (no auditar) para PR1+PR2. Si en el
futuro se actualiza el validator y aparecen drifts nuevos, se cierran
en otro horizontal.

### 4.3 ¿Hay módulos críticos donde NO debamos tocar `ui_handlers[]` sin OK explícito?

Identificados consumers frontend confirmados:

- `pizzepos/cocina` (afecta `cocina.ts` store de Svelte).
- `pizzepos/cuentas-canales` (afecta `cuentas.ts` store).
- `pizzepos/productos` (afecta UI principal del POS).

Posiblemente también `recetas` (vía `recetas.ts` store).

- **A**: Aplicar el patrón a todos los 43, incluyendo críticos —
  confianza en la auditoría de Fase 0 de PR2.
- **B**: Cocina, cuentas y productos van en **commits separados** con
  validación runtime entre cada uno. Permite rollback granular si algo
  rompe.
- **C**: Cocina, cuentas y productos se **excluyen de PR2** (quedan
  como deuda explícita) y se cierran en PR3 con auditoría dedicada por
  módulo.

Recomendación de partida: **B** (commits separados con validación entre
ellos, pero todo en el mismo PR2).

---

## 5 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Frontend usa shape viejo de `ui_handlers[]` | Alta | Fase 0 de PR2: auditoría exhaustiva ANTES de tocar. Verificar cada `mqttRequest('<domain>')` del frontend mapea a un `tools[]` canónico equivalente. |
| 2 | Algunos módulos tienen 15+ `ui_handlers[]` (composition-manager, staff-manager, project-manager) — migrar uno por uno puede llevarse PR2 entero solo en 3 módulos | Media | Trabajar por lotes lógicos: cada commit migra un módulo entero, no medio módulo. |
| 3 | Tests POC2 esperan el valor pelado actual | Media | PR1 actualiza tests al shape canónico. Si algún test rompe, indica que el handler tenía path no cubierto — ganancia colateral. |
| 4 | Carrera con otros PRs en flight (frente 2.8 agentes, menu-generator) | Baja | Si esos PRs van primero, fácil rebase. Si este va primero, fácil rebase para ellos. Cero acoplamiento. |
| 5 | El validator marcó drift en módulos `_legacy/` archivados | Baja | Verificar en Fase 0 de PR1 que ningún drift apunta a `_legacy/` — si sí, ese drift se cierra eliminando o moviendo la regex del validator. |

---

## 6 · Lo que NO se incluye en este horizontal

- **NO se modifica `tools.contract.json` v1.2.1**. Solo se cumple en
  los módulos donde aún no se cumple.
- **NO se elimina el campo `ui_handlers[]` del schema** (sigue siendo
  válido, redefinido como "superficie del frame" desde v1.2 — solo se
  eliminan los que tienen shape de dispatch).
- **NO se tocan los 13 módulos sin drift** salvo que en Fase 0 emerja
  necesidad (decisión 4.2).
- **NO se reescriben handlers** más allá del shape de retorno y de
  mover lo necesario de `ui_handlers[]` a `tools[]`.
- **NO se introducen tools nuevas** ni se renombra ninguna existente
  (eso es trabajo de otro horizontal si emerge).

---

## 7 · Camino propuesto para implementación

### Fase 0 — Auditoría exhaustiva (45 min, sin código)

Antes de tocar nada:

1. Grep en `frontend/src/lib/` de:
   - `ui_handlers` (declaraciones).
   - `uiHandler.register` (registros manuales).
   - `mqttRequest\(['"]<domain>['"]` con cada uno de los 43 módulos.
2. Cruzar con el shape derivado del `tools[]` del módulo (domain =
   primer segmento, action = resto).
3. Reportar tabla `consumer frontend → módulo → tool → coincide/diverge`.
4. Si hay divergencia → decidir caso por caso (eliminar consumer, migrar
   consumer al shape nuevo, preservar `ui_handlers[]` por necesidad).

Output: tabla de consumers en notas del PR.

### Fase 1 — PR1: cerrar los 22 valor pelado (1-1.5h)

1. Por cada uno de los 22 handlers, envolver retorno en `{status, data}` o `{status: 'error', error}`.
2. Actualizar tests POC2 afectados.
3. `npm run validate:ci` PASS verde.
4. Regenerar baseline (entries de tools de "valor pelado" desaparecen).
5. Commit:
   `fix(tools): cierra 22 drifts de valor pelado — handlers devuelven shape canonico {status, data|error}`.
6. Push + PR + merge a main.

### Fase 2 — PR2: cerrar los 334 ui_handlers residuales (2-3.5h)

**Solo arrancar Fase 2 si Fase 0 y Fase 1 cerraron sin sorpresas.**

1. Por módulo (no por entry de drift), en orden:
   - Módulos críticos confirmados (cocina, cuentas, productos): commits
     separados con validación runtime entre cada uno.
   - Resto de 40 módulos: lotes de 3-5 módulos por commit.
2. Cada commit:
   - Elimina `ui_handlers[]` residuales (caso A: duplicado del tools[]).
   - Migra a `tools[]` los que aún no estaban (caso B).
   - Regenera baseline parcial.
3. `npm run validate:ci` PASS verde al final.
4. Validar runtime de cocina + cuentas + productos en una sesión audit.
5. Commit final + PR + merge.

### Fase 3 — Cierre (15 min)

- Actualizar `CLAUDE.md` si aplica (mencionar que tools.contract está
  100% real, no solo formal).
- Cerrar este documento de propuesta con cabecera de cierre (patrón
  cajones).
- Bump `tools.contract.json` a v1.2.2 con `supersedes_nota` explicando
  que la migración v1.2 quedó cerrada al 100% el día tal.

**Total estimado**: 4-6h en 1-2 sesiones (PR1 cabe en una; PR2 en otra
o en la misma).

---

## 8 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a cerrar los 356 drifts residuales de tools.contract v1.2.
> Lee `arquitectura/decisiones/propuestas/cierre-tools-contract-v12-deuda-residual.md`
> entero. Sigue el guion en `_arranque-cierre-tools-contract-v12.md`."*

El guion del arranque hace que la próxima conversación:
1. Verifique el estado actual de los 356 drifts en `drift-baseline.json`.
2. Te haga las **3 preguntas operativas abiertas**.
3. Ejecute Fase 0 (auditoría de consumers) y reporte tabla.
4. Para y pide tu OK antes de PR1.
5. Tras OK de PR1 mergeado, te pide OK para arrancar PR2.

---

## 9 · Relación con otros contratos del sistema

| Contrato | Cómo se relaciona |
|---|---|
| `tools.contract.json` v1.2.1 | Fuente de verdad. Este horizontal lo cumple en lo profundo, no solo formalmente. Bump a v1.2.2 al cerrar. |
| `errors.contract.json` | El shape canónico `{status, error: {code, message}}` referencia el catálogo cerrado de errores. |
| `frontend.contract.json` v1.2 (si existe) | Redefinió `ui_handlers[]` como "superficie del frame". Este horizontal cumple esa redefinición. |
| `events.contract.json` | Auto-suscripción de tools al evento `<toolName>` ya canónica desde v1.1. No cambia. |
| `extensibilidad-modular.contract.json` | El patrón "1 módulo, 1 contrato, 1 shape" se refuerza. |
| `module-rewrite.contract.json` (POC2) | Los módulos POC2 ya canonizan retorno `{status, data|error}` desde su origen. Los drifts son módulos que pre-existían POC2 o migraciones incompletas. |

---

## 10 · Referencias rápidas

| Qué | Dónde | Por qué |
|---|---|---|
| Contrato canónico | `arquitectura/decisiones/_contratos/tools.contract.json` v1.2.1 | Shape que los handlers deben cumplir |
| Validator de tools | `arquitectura/decisiones/_validators/tools.validate.js` | Genera los drifts a cerrar |
| Baseline (sección tools) | `drift-baseline.json` líneas con `^    "tools|` | 356 entries a reducir a 0 |
| Loader (auto-wire) | `core/modules/loader.js::registerToolsForAI` | Wirea tools a los 3 destinos |
| Frente que motivó v1.2 | `arquitectura/decisiones/propuestas/capa-unica-tools-via-plugins.md` | Background de por qué v1.2 existe |
| Stores frontend afectados | `frontend/src/lib/stores/{cocina,cuentas,recetas}.ts` | Consumers críticos de Fase 0 |
| Tests por módulo | `tests/unit/<modulo>.test.js` | Se actualizan en PR1 |

---

## 11 · Frase resumen para retomar

**356 drifts en sección `tools|` de baseline son deuda residual de la
migración a `tools.contract v1.2`. Migración cerró formalmente al 100%
(58 módulos declaran tools[] en shape canónico, auto-wire funciona)
pero quedaron 22 handlers devolviendo valor pelado en 10 módulos +
334 `ui_handlers[]` con shape de dispatch antiguo en 43 módulos.
Plan: 2 PRs separados. PR1 (1-1.5h, riesgo bajo) cierra los 22 valor
pelado. PR2 (2-3.5h, riesgo medio en frontend) cierra los 334
ui_handlers tras auditoría exhaustiva de consumers. Total 4-6h en 1-2
sesiones. Decisiones abiertas: rama compartida vs separadas, auditar 13
módulos sin drift o no, módulos críticos en commits separados.
Resultado: cierre 100% real, no solo formal.**
