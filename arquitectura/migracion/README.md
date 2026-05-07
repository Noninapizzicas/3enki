# Migración de los 73 módulos al canon

Plataforma operativa para reescribir cada módulo del repo cumpliendo los 24 contratos transversales. Producto de la fase transversal previa (todos los contratos cerrados al ancho canónico).

## Qué hay aquí

- **`_outputs/modulos-roadmap.json`** — inventario priorizado de los 73 módulos. Cada entry lleva: `slug`, `path`, `layer` (core/infra/dominio/tooling), `loc`, `drifts` (heurística contra baseline), `dependencies` upstream, `events_publishes`, `events_subscribes`, `tools`, `agents`, `language`, `version`, `orden_migracion`. Generado por `scripts/inventario.js`. Regenerable cuando los módulos cambien.
- **`_outputs/PROGRESO.md`** — panel de control humano-legible: estado global, % por capa, tabla de módulos migrados (con commit + drifts antes/después), tabla de próximos en la cola, lecciones operativas, próximo módulo recomendado. Generado por `scripts/progreso.js`. **Regenerar tras cada migración**.
- **`scripts/inventario.js`** — scanner que descubre módulos, los clasifica y prioriza. Reglas de clasificación inline (sets `CORE_SLUGS`, `INFRA_SLUGS`, `TOOLING_SLUGS`; el resto es dominio).
- **`scripts/progreso.js`** — detecta automáticamente qué módulos están migrados (criterio: `tests/unit/<slug>.test.js` existe AND drifts actuales ≤ 50% del valor del roadmap). Cruza con `git log` para extraer commit hash + fecha. Genera PROGRESO.md.
- **`scripts/scaffold-rewrite.js <slug>`** — automatiza la apertura de cada migración (~40% del trabajo mecánico). Archiva monolito en `_legacy/`, genera `notas/<slug>-mapa.md` pre-rellenado (identidad, eventos del audit, drift breakdown, secciones `<TODO>` para decisiones de dominio), genera `tests/unit/<slug>.test.js` skeleton (Group 1 Lifecycle + Group 7 Helpers POC2 listos), wirea `package.json` y `.github/workflows/validate.yml`.
- **`scripts/finish-rewrite.js <slug> [--commit]`** — automatiza el cierre. Verifica tests verde, regenera baseline, valida CI, regenera inventario+PROGRESO, opcionalmente commitea con mensaje templateado leído del mapa. NO hace push.
- **`README.md`** — este archivo.

Y fuera de `arquitectura/migracion/`:

- **`modules/_template/`** — módulo plantilla canónico. NO se carga en runtime (prefijo `_`). Cumple los 24 contratos. Punto de partida para cada migración.
- **`tests/_template/_template.test.js`** — plantilla de test unitario con setup AJV strict + mocks canónicos (eventBus, logger, metrics, dbStore in-memory).

## Cómo migrar un módulo

Pasos canónicos para cada uno de los 73:

### Paso 0 (CRÍTICO) — Mapa exhaustivo del módulo monolítico ANTES de codear

**Aprendido en project-manager (POC2 #3)**: si arrancas a reescribir guiándote por memoria/intuición, descubres funciones del monolito a posteriori (caso real: 3 funciones de features/blueprints olvidadas inicialmente). Ese descubrimiento tardío significa que la "reescritura desde cero" fue parcial.

Antes de tocar una sola línea de código, generar el mapa completo del módulo monolítico:

```bash
# Lista de TODOS los métodos públicos + privados:
grep -oE "async [a-zA-Z_]+\(" arquitectura/migracion/_legacy/<modulo>-monolito-pre-rewrite.js.bak | sort -u
grep -oE "^  [a-zA-Z_]+\([^)]*\) {" modules/<modulo>/index.js | sort -u  # síncronos

# Eventos publicados/consumidos en module.json:
jq '.events.publishes, .events.subscribes' modules/<modulo>/module.json

# Estado interno (Maps, Sets, timers en constructor):
sed -n '/constructor\(\)/,/^  }/p' modules/<modulo>/index.js
```

Construir un **inventario de responsabilidades** (texto en `arquitectura/migracion/notas/<modulo>-mapa.md` cuando el módulo sea complejo):

- **Lifecycle**: qué hace `onLoad`, `onUnload`. ¿Re-emite eventos al arrancar? ¿Crea timers/intervalos? ¿Carga datos de disco?
- **Bootstrap / setup**: ¿Crea recursos automáticos al arrancar? (Sistema, Mi Proyecto, schema DB, archivos de configuración).
- **CRUD del dominio**: cada método que crea/lee/actualiza/elimina. Listar uno por uno.
- **Handlers HTTP**: cada uno con su path + responsabilidad.
- **Handlers UI** (mqttRequest cross-módulo): cada uno con su domain.action + responsabilidad.
- **Handlers de eventos del bus**: cada subscribe + qué hace al recibirlo.
- **Tools del LLM**: cada `tool.name` + handler.
- **Side effects al cambiar estado**: ¿publica `<modulo>.state` tras cada mutación? ¿persiste? ¿notifica a otros módulos?
- **Cleanup**: timers, subscripciones, pendings que se limpian en `onUnload`.

**Validación del mapa**: una vez completado, verificar contra el código del monolito que NADA queda fuera. Solo después arrancar el rewrite.

### Pasos del flujo (después del mapa)

El workflow esta automatizado por dos scripts que reservan a Claude solo la
parte intelectual (decisiones de dominio + reescritura del index.js).

1. **Apertura — un comando**:
   ```bash
   node arquitectura/migracion/scripts/scaffold-rewrite.js <slug>
   ```
   Esto archiva el monolito en `_legacy/`, genera `notas/<slug>-mapa.md`
   pre-rellenado con identidad+eventos+drift breakdown+secciones `<TODO>`,
   genera `tests/unit/<slug>.test.js` con Group 1 (Lifecycle) y Group 7
   (5 tests de Helpers POC2 identicos a todos los modulos), wirea
   `package.json` y `.github/workflows/validate.yml`.

2. **Trabajo intelectual de Claude** (NO automatizable):
   - Completar las secciones `<TODO>` del mapa con decisiones de dominio
     (descomponer? extension points? backward-compat?).
   - Reescribir o patchear `modules/<slug>/index.js`:
     * Para modulos >70% canonicos: **patch quirurgico con `Edit`** sobre
       las 3-4 partes que faltan (anyadir 5 helpers POC2 + onUnload limpia
       + metrics en error paths).
     * Para modulos rotos: rewrite completo con `Write`.
   - Bump `module.json` a v2.0.0+ con `tracing.propaga_correlation_id=true`,
     observability completa, `errores_conocidos` en cada tool.
   - Completar Groups 2-6 de los tests con domain logic (validation,
     CRUD, bus handlers, eventos canonicos).

3. **Cierre — un comando**:
   ```bash
   node arquitectura/migracion/scripts/finish-rewrite.js <slug> --commit
   ```
   Esto corre `npm run test:<slug>` (FAIL si rojos), regenera baseline,
   valida CI (FAIL si drift nuevo no aceptado), regenera inventario+
   PROGRESO, lee la "Responsabilidad acotada" del mapa para construir el
   commit message, y commitea. NO hace push.

4. **Push** (manual, para revision previa):
   ```bash
   git push -u origin <branch>
   ```

### Reglas de eficiencia de la sesion

Aprendido tras 12 migraciones POC2: **el coste por modulo escala con el
modelo + tamano del rewrite + contexto acumulado**. Aplicar siempre:

- **Modelo**: `Sonnet 4.6` para migraciones rutinarias (pattern-matching
  repetitivo). Reservar `Opus 4.7` solo para modulos que requieren
  descomposicion o decisiones arquitectonicas no obvias. Ahorro
  estimado: 3-4x en tokens.
- **`/clear` entre modulos**: el scaffold/finish trabajan sobre disco,
  no sobre el contexto del LLM. Resetear contexto entre modulos no
  pierde nada y reduce ~50% de tokens en el siguiente.
- **`Edit` quirurgico vs `Write` total**: si el modulo ya esta 70%+
  canonico, los 4 cambios reales (anyadir helpers POC2 + limpiar
  onUnload + metricas en error paths + tracing en module.json) caben
  en 4-5 `Edit` calls. Reescribir el archivo entero con `Write` envia
  3000+ tokens innecesarios. Ahorro: 5-10x en ese modulo.
- **No iterar en bucle si un script falla**: si `finish-rewrite` falla
  en step `[4/8] validate:ci` con drifts inesperados (problema conocido
  de non-determinismo del frontend validator), reintentar el script
  directamente — 1 reintento suele estabilizarlo. No hace falta debuggear
  un fallo que el script ya corrige.

### Issues conocidos de los scripts

- **`finish-rewrite.js`**: el regex que detecta "migrado vs pendiente" en
  PROGRESO matchea ambas tablas con el mismo formato `| \`slug\` | …`,
  asi que a veces el script imprime "migrado" cuando tecnicamente esta
  pendiente por threshold de drifts. Confirmar siempre con
  `arquitectura/migracion/_outputs/PROGRESO.md` (tabla "Modulos migrados"
  vs "Proximos en la cola").
- **Drift counts en `[5/8]` antes/despues**: cuenta sobre signatures
  path-matching (estricto). PROGRESO usa otro count (broad-slug en
  `inventario.js` vs narrow-path en `progreso.js`). Los dos numeros son
  consistentes pero pueden diferir en magnitud — el veredicto
  "migrado/pendiente" siempre lo da PROGRESO.
- **Threshold del 50%**: modulos con muchos falsos positivos sistemicos
  (`.request/.response`, `publish_dominio_sin_project_id` cuando son
  modulos infra) pueden quedar en 51-60% drifts y no pasar el umbral
  aunque el rewrite sea 100% canonico. No es un bug del rewrite — es
  drift estructural del catalogo de validators que se cierra en otra
  fase.

## Orden recomendado

El roadmap los ordena por capa y dentro de cada capa por dependencies upstream + drifts. Los primeros del orden son los que más impacto cascada tienen al cerrarse:

- **Capa core (16 módulos)** — núcleo del subsistema chat/agentes + servicios críticos. Si están limpios, todo lo demás se enchufa correctamente al bus. Aquí están: `scheduler`, `ai-agent-framework`, `credential-manager`, `project-manager`, `database-manager`, `composition-manager`, `gateway-manager`, `plugin-manager`, `ai-gateway`, `agent-observer`, `chat-io`, `channel-manager`, `memory-user-profile`, `prompt-builder`, `memory-conversation-summary`, `memory-rag`. Los 4 últimos ya están migrados (drifts=0).

- **Capa infra (16 módulos)** — infraestructura compartida (filesystem, telegram, devices, security). Sin dependencies hacia dominio.

- **Capa dominio (38 módulos)** — lógica de negocio (pizzepos, facturas, recetas, viabilidad, escandallo, llevadoo, etc.). Cuerpo principal.

- **Capa tooling (3 módulos)** — admin/diseño/UI helpers. Reescribir al final, sin impacto operativo crítico.

## Cuántas sesiones costará

Estimación basada en complejidad por capa:

| Capa | Módulos | LOC promedio | Sesiones estimadas |
|------|---------|--------------|--------------------|
| core | 16 | ~700 | 16 (1 por módulo en sesiones dedicadas) |
| infra | 16 | ~600 | 12-14 (algunos comparten patrón) |
| dominio | 38 | ~600 | 25-30 (varios pizzepos siguen mismo patrón = batch) |
| tooling | 3 | ~400 | 2-3 |
| **Total** | **73** | — | **~55-65 sesiones** |

Tras los primeros 5-6 módulos migrados (1 por capa + 2 más complejos del core), el patrón se afina y los siguientes vuelan. La plantilla acelera de 4-6 horas/módulo a 2-3 horas/módulo.

## Reglas de cierre

Un módulo NO se considera migrado hasta que:

- [ ] `npm run validate:ci` PASS sin drift nuevo vs baseline.
- [ ] `npm run test:<nombre>` verde con cobertura por handler.
- [ ] `module.json` declara: `events.publishes`, `events.subscribes`, `tools`, `dependencies`, `config.persistence`, `observability.metrics`. Todas las secciones canónicas.
- [ ] El módulo NO usa `moduleLoader.getModule`. Toda comunicación cross-módulo via `eventBus.publish/subscribe` o `mqttRequest`.
- [ ] Errores devueltos como `{status, error: {code, message}}` con `error.code` del catálogo `errors.contract`.
- [ ] Métricas emitidas en handlers (success y errors).
- [ ] Si publica eventos canónicos del subsistema chat (chat-flow / agent-flow / llm-flow / embedding-flow), declara `request_schema_ref` / `response_schema_ref` apuntando a los schemas oficiales.
- [ ] Si declara tools, cada una cumple `tools.contract` (name kebab-case prefijado, parameters JSON Schema válido, handler async, errores_conocidos del catálogo).
- [ ] Si declara agents, cada uno cumple `agents-config.contract` (id/name/filename coincidiendo, prompt_file existe, tools del catálogo, sin stats persistido).
- [ ] Drifts del módulo en baseline bajan a 0 (o a un mínimo justificado documentado).
- [ ] Commit con mensaje canónico: `<modulo>: migracion canonica al ancho de los 24 contratos`.

## Referencia rápida de contratos

Los 24 contratos transversales aplicables a cada migración (orden alfabético):

- `agent-flow` — eventos de agentes (request/response/failed/progress)
- `agents-config` — shape de `agents/<n>.json` + `prompts/<n>-system.md`
- `bus-transport` — bus principal MQTT
- `chat-flow` — eventos del flujo de chat
- `companero-viaje` — documento maestro del subsistema chat/agentes
- `deployment` — modo de despliegue
- `documentation` — qué documentación va dónde (anti-design-docs)
- `embedding-flow` — eventos de embeddings (sin contrato dedicado, solo schemas)
- `errors` — catálogo cerrado de error codes
- `events` — disciplina del bus, no acceso directo
- `frontend` — frame canónico del frontend (sandwich del chat, panels, blocks inline)
- `glossary` — formas canónicas cross-módulo de las entidades
- `http` — http-client (timeouts, retries, redacción de secretos)
- `lifecycle` — onLoad/onUnload, gestión de estado en arranque/cierre
- `llm-flow` — eventos llm.complete.* (request/response/failed)
- `module-loading` — orden de carga, dependencies
- `multi-tenancy` — project_id obligatorio, aislamiento
- `naming` — convención de naming (kebab-case, idioma del módulo, verbos canónicos)
- `observability` — logger + metrics + correlation_id
- `persistence` — declaración de patterns (json-file-per-project, sqlite, in-memory)
- `resilience` — retry policy, backoff, circuit breakers
- `scheduling` — cron jobs canónicos
- `security` — credenciales en credential-manager
- `testing` — tests por handler con AJV strict
- `tools` — shape de `module.json.tools[]` y retorno canónico del handler
- `versionado` — semver del módulo (mayor/menor/patch)

Cada migración los cumple los 24 simultáneamente. La plantilla `modules/_template/` ya los respeta — es la referencia visual.
