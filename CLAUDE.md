# Paradigma del sistema — Event-Core

## La regla que no se rompe

**Emite evento. Quien sabe, hace. Tú no sabes cómo.**

Cada módulo conoce exactamente una cosa: su dominio. Nada más.

### Un módulo NO:
- Llama directamente a otro módulo
- Instancia servicios de persistencia propios
- Espera respuesta de lo que emitió
- Mezcla dominio con infraestructura (SQLite, HTTP, filesystem)
- Controla el flujo después de emitir

### Un módulo SÍ:
- Emite eventos con datos de dominio
- Escucha eventos que le corresponden
- Actúa dentro de su responsabilidad
- Devuelve resultados a quien le llamó

El emisor sabe **qué**. El receptor sabe **cómo**.

## Granularidad

**Un módulo = una responsabilidad acotada. El nombre del directorio describe exactamente qué hace.**

- `carta-design` diseña la apariencia visual
- `carta-impresion` genera la carta para imprimir
- `carta-scheduler` decide qué carta está activa por franja
- `device-registry` / `device-shadow` / `device-health` son 3 responsabilidades, no un mega `device-manager`

No fusionar en mega-módulos "manager". La claridad inmediata del nombre vale más que el ahorro de archivos. Si dos módulos comparten 80% de su lógica, se valora fusionar como excepción razonada, no como regla.

---

# Cómo trabajo en este repo

Este `CLAUDE.md` es un **índice**. La información estructurada vive en JSONs validados contra schemas. Antes de cualquier tarea, leo los archivos que apliquen.

## Convenciones (cómo se nombra y se estructura todo)

- **`arquitectura/convenciones/_outputs/naming.json`**
  Convención de naming: idioma por módulo (`module.json.language` ∈ {es, en}), forma de los eventos (`<module-prefix>.<entity>.<verb>`), verbos canónicos por idioma, restricciones léxicas (ASCII puro, kebab-case, sin tildes ni ñ).

- **`arquitectura/convenciones/_outputs/glossary.json`**
  Glosario cross-módulo: una sola forma canónica por concepto por idioma. Sinónimos prohibidos. Si un concepto aparece aquí, su nombre canónico es el único permitido. Solo entran términos que cruzan dos o más módulos.

- **`arquitectura/convenciones/_contratos/{naming,glossary}.contract.json`**
  El "por qué": principios, scope, criterios de inclusión, validaciones cruzadas. Lectura recomendada cuando hay dudas sobre la regla.

## Auditoría del sistema (estado real de cada módulo)

- **`arquitectura/auditoria/_outputs/manifest-completo/<modulo>.json`**
  Lo declarado por el módulo (extraído de su `module.json`).

- **`arquitectura/auditoria/_outputs/modulo-completo/<modulo>.json`**
  Lo real (extraído del código + cruzado con el manifest). Incluye eventos publicados con archivo:línea, subscribes, tools, ui_handlers, apis_http, estado, lifecycle, dependencias, modos de fallo, observabilidad, outliers y quirks. **Es el documento autoritativo del módulo: si tienes que reescribirlo, lees ESTO antes que el código viejo.**

- **`arquitectura/auditoria/_contratos/modulo-completo.contract.json`**
  Define qué campos tiene cada auditoría y por qué.

## Validators

Todos los outputs (convenciones y auditorías) son validables mecánicamente. Antes de proponer cambios estructurales:

```bash
node arquitectura/convenciones/_validators/naming.validate.js
node arquitectura/convenciones/_validators/naming.validate.js --check-system
node arquitectura/convenciones/_validators/glossary.validate.js
node arquitectura/convenciones/_validators/glossary.validate.js --check-system
node arquitectura/auditoria/_validators/modulo-completo.validate.js <slug>
```

Para correr los 9 validators juntos contra el sistema completo (lo que corre CI):

```bash
npm run validate:ci                  # falla si hay drift NUEVO vs drift-baseline.json
npm run validate:baseline:update     # regenera baseline tras cierre legítimo de drift
```

`drift-baseline.json` congela los warnings/info conocidos. CI bloquea cuando aparece drift nuevo, no cuando hay warnings. Si bajas warnings legítimamente (porque cerraste deuda) regeneras baseline.

## Decisiones cross-módulo (subsistemas y políticas)

Vive en `arquitectura/decisiones/` como contratos JSON con schemas + validators. Cada uno fija UNA política observable across-modules.

- **`_contratos/companero-viaje.contract.json`** — visión maestra del subsistema chat/LLM/agentes. Define las 4 capacidades del compañero (memoria sostenida, especialización por contexto, acceso al sistema, modularidad infinita), los 5 tipos canónicos de extensión (canal, tool, agente, memoria, integración), los 13 eventos canónicos del subsistema, los 8 campos canónicos del payload y las 10 garantías observables. Documento autoritativo: cualquier sub-contrato del subsistema (chat-flow, agent-flow, etc.) deriva de aquí.

- **`_contratos/chat-flow.contract.json`** + **`_schemas/chat-flow/*.json`** — sub-contrato derivado: 5 eventos canónicos del flujo del chat (`chat.message.saved`, `chat.context.enriched`, `chat.prompt.ready`, `ai.chat.response`, `ai.chat.failed`). Schemas estrictos AJV `additionalProperties:false`.

- **Otros contratos transversales:** `events`, `lifecycle`, `observability`, `errors`, `persistence`, `http`. Cada uno con su validator en `_validators/<n>.validate.js` y su sección en `drift-baseline.json`.

Todos los validators corren juntos via `npm run validate:ci`. Para añadir un sub-contrato nuevo: contrato JSON → schemas estrictos → validator → registrar en `scripts/validate-all.js` → npm script.

## Patrón de migración cross-módulo

Cuando hay drift estructural en un subsistema (varios módulos hablan shapes inconsistentes para los mismos eventos), la disciplina es la misma que se aplicó en chat-flow:

1. **Contrato primero** — `<subsistema>.contract.json` lista los eventos canónicos, los principios, los drifts cerrados, las validaciones cross que el validator deberá hacer. Sin contrato no se toca código.
2. **Schemas estrictos** — un JSON Schema 2020-12 `additionalProperties:false` por evento + `_common.schema.json` con $defs compartidos. Validables con AJV strict.
3. **Validator** — script Node que detecta drifts estructurales en `module.json` y en código fuente (heurísticas regex sobre publishers conocidos). Registrar en `scripts/validate-all.js` y en npm scripts.
4. **Migrar handlers** — uno por uno, cada módulo del subsistema. Compat transitoria autorizada: aceptar shape legacy con `logger.warn('<modulo>.<handler>.shape_legacy', ...)` durante la migración. La compat NO se mezcla con código canónico — vive en una rama defensiva al inicio del handler que normaliza al shape canónico.
5. **Tests por handler** — uno por handler migrado. Cubre shape canónico + validación contra el JSON Schema oficial (cargado con AJV) + edge cases de error. Wirear a `package.json` (`test:<modulo>`) y `.github/workflows/validate.yml`.
6. **Cierre legacy** — eliminar las ramas `shape_legacy` cuando todos los emisores estén migrados. El warn era red de seguridad; sin emisores legacy, sobra y solo confunde. Borrar también los tests del shape legacy.

Después de los pasos 1-3 main puede mergear sin migración (validator solo añade warnings al baseline). Después del 4-5 el subsistema acepta ambos shapes. Después del 6 solo canónico — futuros publish con shape antiguo fallarán contra schema en lugar de pasar con warn.

## Garantías obligatorias en payloads

Estas reglas las enforce el conjunto de validators + schemas. Si las rompes en un publish nuevo, CI te corta.

- **`correlation_id`** se genera en el originador (canal, cron, webhook) y se propaga sin modificar por toda la cadena de eventos. Sin él no hay traza causal y el debugging multi-módulo es ciego.
- **`no_silent_failures`** — todo evento de "cierre" tiene par success/failure separado. No inyectar errores como texto en el evento de éxito. Ejemplo: `ai.chat.response` (éxito) + `ai.chat.failed` (error con `error.code` canónico de `errors.contract.json`).
- **No incluir `stack` ni datos sensibles en `error.details`** publicados en el bus. El validator de errors flaggea `drift_respuesta_con_stack_trace` como ERROR (no warning).
- **Campos polisémicos prohibidos.** Un mismo nombre de campo no significa cosas distintas en eventos distintos. Ejemplo cerrado: `message` en chat era ambiguo (mensaje del usuario o del asistente) → reemplazado por `user_message` / `assistant_message`.

## Puntos de extensión modulares

Algunos eventos están diseñados como contratos abiertos a múltiples emisores plug-and-play, para que añadir piezas nuevas no requiera tocar el módulo consumer:

- **`chat.context.enriched`** — cualquier módulo de memoria (`memory-user-profile`, `memory-rag`, `memory-long-term`, `memory-project-knowledge`...) publica este evento con `priority` (0-99 contexto base, 100-499 perfil, 500-999 RAG, 1000+ especulativa) y `prompt-builder` lo agrega al system prompt ordenado por priority. Añadir una memoria nueva no toca prompt-builder.
- **`agent.execute.request`** (pendiente de canonización en agent-flow) — cualquier módulo del dominio puede invocar a un agente especialista emitiendo este evento. El agente reacciona y devuelve `agent.execute.response`.
- **`channel-*`** — cada canal (`channel-telegram`, `channel-voice`, etc.) recibe del exterior y publica `chat.message.saved` con su `channel` correspondiente. chat-io no conoce los canales.

Cuando diseñes un evento nuevo, pregúntate: ¿debería ser un punto de extensión? Si más de un módulo plausiblemente querrá publicarlo o consumirlo, sí — define el shape en un contrato y deja que cada implementación sea pluggable.

---

# Protocolo de trabajo

1. **Antes de tocar un módulo:** leo su auditoría completa (`_outputs/modulo-completo/<modulo>.json`). Si tengo que escribir código nuevo, leo también `naming.json` y `glossary.json`.

2. **Antes de añadir/renombrar un evento:** consulto `naming.json` (forma + verbo canónico del idioma del módulo) y `glossary.json` (si la entidad está, uso la forma canónica del idioma).

3. **Si una decisión rompe la convención:** paro y pido confirmación antes de proceder. Las convenciones son la regla, el legacy es drift que se migra.

4. **Antes de escribir código, me pregunto:**
   - ¿Este módulo está haciendo algo que no es su dominio?
   - ¿Podría resolver esto emitiendo un evento en lugar de llamar directamente?
   - ¿Quién debería escuchar esto? ¿Ese módulo ya existe?
   - ¿Estoy mezclando dominio con infraestructura?

   Si la respuesta a la 1 o la 4 es sí, paro. Refactorizo el diseño antes de escribir.

5. **Mapa de eventos antes del código.** Para cualquier módulo nuevo o a reescribir, primero respondo:
   - ¿Qué eventos emite?
   - ¿Qué eventos escucha?
   - ¿A qué reacciona cada subscribe?

   El mapa va en la auditoría del módulo. Sin mapa, no se toca el módulo.

6. **Tests por handler con validación de schema.** Cada handler de un módulo del subsistema chat (y cualquier sub-contrato similar a futuro) tiene su test unitario en `tests/unit/<modulo>.test.js`. Cubre: shape canónico de los eventos publicados + carga del JSON Schema oficial con AJV y validación del payload + edge cases de error. Wirear el test a `package.json` como `test:<modulo>` y al workflow `.github/workflows/validate.yml`. Sin tests, el commit no entra: la suite verde es parte del cierre, no opcional.
