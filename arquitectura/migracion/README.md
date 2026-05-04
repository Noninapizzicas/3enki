# Migración de los 73 módulos al canon

Plataforma operativa para reescribir cada módulo del repo cumpliendo los 24 contratos transversales. Producto de la fase transversal previa (todos los contratos cerrados al ancho canónico).

## Qué hay aquí

- **`_outputs/modulos-roadmap.json`** — inventario priorizado de los 73 módulos. Cada entry lleva: `slug`, `path`, `layer` (core/infra/dominio/tooling), `loc`, `drifts` (heurística contra baseline), `dependencies` upstream, `events_publishes`, `events_subscribes`, `tools`, `agents`, `language`, `version`, `orden_migracion`. Generado por `scripts/inventario.js`. Regenerable cuando los módulos cambien.
- **`_outputs/PROGRESO.md`** — panel de control humano-legible: estado global, % por capa, tabla de módulos migrados (con commit + drifts antes/después), tabla de próximos en la cola, lecciones operativas, próximo módulo recomendado. Generado por `scripts/progreso.js`. **Regenerar tras cada migración**.
- **`scripts/inventario.js`** — scanner que descubre módulos, los clasifica y prioriza. Reglas de clasificación inline (sets `CORE_SLUGS`, `INFRA_SLUGS`, `TOOLING_SLUGS`; el resto es dominio).
- **`scripts/progreso.js`** — detecta automáticamente qué módulos están migrados (criterio: `tests/unit/<slug>.test.js` existe AND drifts actuales ≤ 30% del valor del roadmap). Cruza con `git log` para extraer commit hash + fecha. Genera PROGRESO.md.
- **`README.md`** — este archivo.

Y fuera de `arquitectura/migracion/`:

- **`modules/_template/`** — módulo plantilla canónico. NO se carga en runtime (prefijo `_`). Cumple los 24 contratos. Punto de partida para cada migración.
- **`tests/_template/_template.test.js`** — plantilla de test unitario con setup AJV strict + mocks canónicos (eventBus, logger, metrics, dbStore in-memory).

## Cómo migrar un módulo

Pasos canónicos para cada uno de los 73:

1. **Leer su entrada en el roadmap**: `node -e "console.log(JSON.parse(require('fs').readFileSync('arquitectura/migracion/_outputs/modulos-roadmap.json')).modulos.find(m => m.slug === 'X'))"`. Saca capa, drifts, dependencies, LOC.

2. **Leer su auditoría completa**: `arquitectura/auditoria/_outputs/modulo-completo/<slug>.json`. Si no existe, generarla primero.

3. **Crear módulo nuevo a partir de la plantilla**:
   ```bash
   cp -r modules/_template modules/<nombre-real>
   cd modules/<nombre-real>
   # renombrar referencias: _template -> <nombre-real> en module.json e index.js
   # quitar prefijo '_' del directorio si era plantilla nueva
   ```

4. **Rellenar la lógica del dominio** dentro del esqueleto canónico:
   - `module.json`: declarar events publicados/consumidos reales, tools del dominio, ui_handlers, dependencies, observability counters específicos.
   - `index.js`: handlers reales (mantener patrón try/catch con `return { status, error }`, propagación de `correlation_id`, `db.query.request` para persistencia, sin `moduleLoader.getModule`).

5. **Crear tests**: `cp tests/_template/_template.test.js tests/unit/<nombre>.test.js`. Renombrar referencias. Añadir tests por handler real. Cada test cubre: shape canónico de retorno, error paths para cada `errores_conocidos`, validación defensiva, no acceso directo a otros módulos.

6. **Wire en CI**:
   - `package.json` añadir `"test:<nombre>": "node tests/unit/<nombre>.test.js"`.
   - `.github/workflows/validate.yml` añadir step `Run <nombre> tests`.

7. **Verificar contratos**:
   ```bash
   npm run validate:ci          # 24 validators PASS sin drift nuevo vs baseline
   npm run test:<nombre>        # tests del módulo verdes
   ```

8. **Commit + push**:
   ```bash
   git commit -m "<modulo>: migracion canonica (POC2-style)"
   git push origin claude/...
   ```

9. **Regenerar roadmap + progreso** tras la migración:
   ```bash
   node arquitectura/migracion/scripts/inventario.js   # roadmap.json fresco
   node arquitectura/migracion/scripts/progreso.js     # PROGRESO.md actualizado
   git add arquitectura/migracion/_outputs/ && git commit -m "<modulo>: actualizar roadmap + PROGRESO tras migracion"
   ```

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
