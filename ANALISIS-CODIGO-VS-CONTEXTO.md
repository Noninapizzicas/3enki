# Enki / Event-Core: Analisis Honesto - Codigo vs Contexto

**Fecha:** 2026-03-16
**Metodo:** Lectura exhaustiva de todo el codigo fuente y todos los documentos de contexto/
**Principio:** El codigo es la realidad. contexto/ es la vision. Este documento compara ambos.

---

## 1. VEREDICTO GENERAL

| Dimension | Nota | Comentario |
|-----------|------|------------|
| Arquitectura | 8/10 | Genuinamente buena. IoC, event-driven, auto-wiring, desacoplamiento real |
| Implementacion | 6/10 | Funciona, pero tiene bugs latentes, codigo muerto, y edge cases sin cubrir |
| Documentacion (contexto/) | 7/10 | Muy completa en vision y patrones. Metricas infladas. Algunos datos desactualizados |
| Testing | 2/10 | 10 archivos de test, solo ~4 pasan. 0 tests frontend. Riesgo alto de regresiones |
| Seguridad | 3/10 | Sin autenticacion HTTP/MQTT, code-executor sin sandbox, credenciales en texto plano |
| Production-readiness | 2/10 | Necesita hardening significativo antes de produccion real |
| Alineacion codigo-contexto | 85% | La estructura modular es fiel. Los detalles divergen |

---

## 2. LO QUE ESTA BIEN (de verdad)

### 2.1 Arquitectura Modular
- **55 modulos** con `module.json` + `index.js` — todos existen, ninguno es stub
- El ModuleLoader (1,292 lineas) es la pieza mas madura del sistema
- Auto-wiring declarativo de eventos y UI handlers desde module.json
- 28/28 modulos core migrados al patron declarativo
- Scanning recursivo de subdirectorios (pizzepos/, facturacion/)

### 2.2 Event-Driven Real
- EventBus hibrido: EventEmitter local + MQTT pub/sub
- Patron request/response sobre MQTT (UIRequestHandler)
- Desacoplamiento real entre modulos — se comunican solo via eventos
- Credential cascade automatica (GLOBAL > PROJECT > CLIENT > CUSTOM)

### 2.3 Frontend Consistente
- 196 archivos, 90+ componentes Svelte, 22 stores
- 21 rutas reales (todas las documentadas existen)
- page-context.ts implementado y funcional
- Sistema de modulos UI con auto-discovery via import.meta.glob
- MQTT-first: el frontend habla directo con el backend via WebSocket

### 2.4 Verticales con Profundidad
- **PizzePOS**: 15 modulos reales con logica de negocio (cuentas, pedidos, cobros, cocina, comandero, etc.)
- **Facturacion**: Pipeline OCR + IA funcional (Google Vision + DeepSeek)
- **Negocio alimentario**: recetas, escandallo, viabilidad — modulos implementados

### 2.5 AI Gateway
- 6 providers reales: DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama
- Tool calling unificado que funciona con todos los providers
- 88 tools registrados desde modulos

---

## 3. LO QUE EL CONTEXTO DICE PERO EL CODIGO NO CUMPLE

### 3.1 Flow Engine: Documentado como feature, muerto en codigo
- `contexto/flow-engine.json` describe un motor completo con registry, agent, capabilities
- `core/flow/engine.js` existe (448 lineas) pero:
  - `registry.resolve()` NO esta definido — crashearia si se llama
  - No hay deteccion de ciclos en grafos de flujo
  - No esta integrado en la secuencia de startup
  - Solo hay 1 flow real (`flows/factura.json`)
- **Veredicto**: Feature fantasma. Existe como codigo pero no funciona end-to-end

### 3.2 Discovery Multi-Core: Implementado pero desconectado
- `core/discovery/` existe con `index.js` y `core-status.js`
- Nunca se conecta al startup sequence real
- La vision multi-core (Core A + Core B) documentada en Docker README no tiene compose files
- **Veredicto**: Prototipo abandonado

### 3.3 MQTT Connection Pool: Existe pero cuestionable
- `core/mqtt/pool.js` (615 lineas) — implementacion completa
- Race condition en inicializacion (pool se marca ready antes de estar listo)
- Health checks pueden exceder max capacity
- No se usa activamente en la mayoria de paths
- **Veredicto**: Over-engineering sin validacion de que mejora rendimiento

### 3.4 Metricas Infladas en SYSTEM-ANALYSIS.md
- El propio SYSTEM-ANALYSIS.md reconoce que metricas previas estaban infladas ~30x
- Ejemplo: start.sh documentado como 10,906 lineas, realidad 324 lineas
- Las cifras actuales del SYSTEM-ANALYSIS parecen mas realistas pero no las he verificado linea a linea

### 3.5 Versiones Inconsistentes
- `config.json`: v0.1.0
- `contexto/index.json`: v0.5.0
- Varios module.json: v1.0.0, v2.0.0, v3.0.0
- No hay un unico source of truth para la version del sistema

---

## 4. BUGS Y PROBLEMAS REALES EN EL CODIGO

### 4.1 Criticos (crashearian en runtime)

| Archivo | Linea | Problema |
|---------|-------|----------|
| `core/flow/engine.js` | ~274 | `registry.resolve()` no definido — crash si se usa |
| `core/gateway/http.js` | ~644 | Acceso a variable no definida en path de error |
| `core/handler-loader.js` | ~432 | HandlerStore importado pero nunca instanciado |
| `core/mqtt/client.js` | ~110 | Race condition: isConnected=true antes de pool ready |

### 4.2 Medio (comportamiento incorrecto silencioso)

| Archivo | Problema |
|---------|----------|
| `core/modules/loader.js` | `toolRequiresConfirmation()` chequea flag pero nunca se enforza en execute() |
| `core/events/bus.js` | 6+ llamadas a metrics marcadas "REMOVED" — codigo muerto disperso |
| `core/providers/loader.js` | OAuth hardcodeado solo para 'local.gmail' |
| `core/observability/metrics.js` | gauge() sobreescribe counters — API confusa |
| `core/mqtt/pool.js` | Health check puede crear conexiones mas alla del max |
| `core/gateway/http.js` | Blueprint endpoints usan `fs.readFileSync` — bloquea el event loop |

### 4.3 Bajo (deuda tecnica)

- Logger publica a MQTT pero nunca se await — puede perder logs en shutdown
- Publish timer de metricas nunca se detiene en shutdown
- Cache de config de handlers nunca se invalida al borrar proyecto
- No hay rate limiting en logging — potencial auto-DoS
- Template variable replacement no escapa llaves literales

---

## 5. SEGURIDAD — SIN RODEOS

| Problema | Severidad | Estado |
|----------|-----------|--------|
| Sin autenticacion HTTP | CRITICO | Cualquiera con acceso a red puede operar el sistema |
| Sin autenticacion MQTT | CRITICO | Los mensajes viajan sin cifrar ni autenticar |
| code-executor con shell access | CRITICO | Solo 11 comandos en blocklist — trivial de evadir |
| `new Function()` en scheduler | CRITICO | Inyeccion de codigo arbitrario via jobs |
| Credenciales en .env sin cifrar | ALTO | AES-256 referenciado en docs pero no implementado |
| certificate-authority funcional | POSITIVO | mTLS implementado pero no obligatorio |

**Conclusion**: El sistema NO es seguro para produccion con usuarios no confiables. Valido para uso interno/desarrollo.

---

## 6. CONTEXTO/ — QUE ESTA ACTUALIZADO Y QUE NO

### Actualizados (fieles al codigo)

| Archivo | Ultima actualizacion | Fidelidad |
|---------|---------------------|-----------|
| `index.json` | 2026-03-09 | Alta — patrones y quick_reference correctos |
| `system.json` | 2026-02-16 | Alta — startup sequence, conventions, patrones recientes correctos |
| `modules.json` | 2026-03-10 | Alta — conteo 55 modulos correcto, active/disabled correcto |
| `handlers.json` | — | Alta — patron envelope, services.call, store API fieles al codigo |
| `credentials.json` | — | Alta — cascade 4 niveles, OAuth2 flow correcto |
| `ai-gateway.json` | — | Alta — 6 providers, tool calling cycle correcto |
| `bot-agent-architecture.json` | — | Alta — separacion 3 modulos fiel al codigo |

### Parcialmente Actualizados

| Archivo | Problema |
|---------|----------|
| `pizzepos.json` | Lista 12 modulos pero el codigo tiene 15 (falta carta-digital, carta-impresion, persistencia-comandero en el conteo principal) |
| `flow-engine.json` | Documenta features que no funcionan en runtime (registry.resolve, agent decisions) |
| `mejoras-pendientes.json` | Buena lista pero algunas items "pendientes" llevan meses sin progreso |
| `catalogo-servicios.json` | Muy grande (51KB), dificil de mantener sincronizado |
| `SYSTEM-ANALYSIS.md` | Autocritico y honesto pero las metricas podrian estar desactualizadas |

### Desactualizados o Aspiracionales

| Archivo | Situacion |
|---------|-----------|
| `pantallas-cocina.json` | Plan detallado con ESP32-P4 — no hay evidencia de hardware code |
| `certificate-authority.json` | Documenta nginx-config y download-p12 — el modulo existe pero no se usa en produccion |
| `project-composition.json` | Sistemas/links/dependencies implementados en PM pero sin uso real visible |

---

## 7. LO QUE FALTA SEGUN EL CONTEXTO (BACKLOG REAL)

### P0 — Necesario para produccion

1. **Autenticacion HTTP y MQTT** — no existe, imprescindible
2. **Sandbox para code-executor** — actualmente es un RCE abierto
3. **Cifrado de credenciales** — .env en texto plano
4. **Tests** — 10 archivos, ~4 pasan, 0 frontend tests
5. **CI/CD** — no existe pipeline

### P1 — Necesario para el producto

1. **Streaming nativo** — actualmente post-hoc (el LLM genera todo y luego se "simula" streaming)
2. **Anthropic prompt caching** — 90% ahorro de tokens potencial
3. **Portal cliente PWA** — facturacion auto-servicio para clientes
4. **Impresion multi-destino con ESP32** — documentado, no implementado
5. **Integrar Discovery en startup** — para multi-core real

### P2 — Mejoras de calidad

1. **Eliminar codigo muerto** (flow-engine dead paths, metrics REMOVED, discovery desconectado)
2. **Unificar version del sistema** (v0.1.0 vs v0.5.0)
3. **Evaluar modulos deshabilitados** — decidir: reactivar, eliminar, o archivar
4. **Fix blueprint endpoint** — no usar readFileSync en gateway HTTP
5. **Sincronizar metricas de documentacion** con realidad

---

## 8. ESTRUCTURA REAL DEL SISTEMA (MAPA)

```
Enki/
├── index.js                    # Entry point (689 lineas)
├── core/                       # Framework (~7,500 lineas)
│   ├── modules/loader.js       # 1,292 lineas — pieza central
│   ├── events/bus.js           # 523 lineas — hibrido local+MQTT
│   ├── gateway/http.js         # 1,144 lineas — servidor HTTP built-in
│   ├── mqtt/client.js          # 621 lineas — MQTT con broker embebido
│   ├── mqtt/pool.js            # 615 lineas — connection pool (cuestionable)
│   ├── ui/UIRequestHandler.js  # 437 lineas — request/response MQTT
│   ├── flow/engine.js          # 448 lineas — MUERTO en runtime
│   ├── handler-loader.js       # 600 lineas
│   ├── providers/              # ~900 lineas — loader + executor
│   ├── observability/          # ~600 lineas — logger + metrics
│   └── validation/             # ~460 lineas — AJV JSON Schema
│
├── modules/                    # 55 modulos (47 activos, 8 deshabilitados)
│   ├── ai-gateway/             # 1,868 lineas — 6 providers LLM
│   ├── project-manager/        # ~3,100 lineas (split en 12 archivos)
│   ├── chat-ai-bridge/         # Orquestador chat → AI
│   ├── chat-session/           # Persistencia SQLite
│   ├── credential-manager/     # 4 niveles de credenciales
│   ├── scheduler/              # 1,138 lineas — 6 tipos de trigger
│   ├── pizzepos/               # 15 sub-modulos POS
│   ├── facturacion/            # 2 sub-modulos (asesoria, fuentes)
│   └── ... (30+ modulos mas)
│
├── frontend/                   # SvelteKit 2 + Svelte 5
│   └── src/
│       ├── routes/             # 21 rutas (13 project-scoped + 8 globales)
│       ├── lib/stores/         # 22 stores (page-context.ts clave)
│       ├── lib/modules/        # 25 modulos UI
│       └── lib/components/     # 90+ componentes Svelte
│
├── services/providers/         # 40 providers (37 local + 3 external)
├── handlers/global/            # 3 activos + 39 archivados
├── flows/                      # 1 flow (factura.json)
├── contexto/                   # 30 archivos de documentacion AI
├── data/projects/              # 6 proyectos con datos runtime
└── tests/                      # 10 archivos de test
```

---

## 9. RECOMENDACIONES HONESTAS

### Lo que yo haria primero (opinion directa)

1. **No tocar features nuevas hasta tener tests.** El sistema tiene 55 modulos y 10 tests. Cada cambio es una ruleta rusa. Priorizar tests de integracion para los flows criticos: chat → AI, pedido → cocina → cobro, factura → OCR → CSV.

2. **Limpiar codigo muerto antes de documentar.** El flow-engine, discovery, y las metricas "REMOVED" confunden. Es mejor un sistema de 45 modulos que funcionan que 55 donde 10 son fantasmas.

3. **Seguridad basica antes de cualquier despliegue.** Auth JWT para HTTP, ACL basico para MQTT topics, sandbox real para code-executor. Sin esto, un deploy publico es un riesgo.

4. **Consolidar contexto/.** 30 archivos JSON/MD son dificiles de mantener. Los archivos que son "vision futura" (pantallas-cocina, portal-cliente) deberian ir en un directorio separado (`contexto/roadmap/`) para no confundir con documentacion de lo que existe.

5. **Fijar UNA version.** Elegir v0.5.0 o lo que sea, ponerla en package.json, y propagarla. La confusion de versiones es sintoma de falta de release process.

### Lo que NO haria

- No perderia tiempo con Docker/multi-core ahora. El sistema corre bien como monolito. Multi-core es optimizacion prematura sin tener tests.
- No refactorizaria el ai-gateway. Funciona con 6 providers y tool calling. Es de las piezas mas solidas.
- No tocaria el ModuleLoader. Es la pieza mas madura y estable del sistema.

---

## 10. CONCLUSION

Enki/event-core es un sistema con una **arquitectura genuinamente buena** y una **implementacion que funciona** pero con **deuda tecnica significativa** en testing, seguridad, y limpieza de codigo muerto.

La documentacion en `contexto/` es **valiosa como guia de vision** pero hay que leerla con ojo critico: algunas features estan documentadas como si funcionaran cuando en realidad son prototipos o codigo muerto.

El sistema tiene potencial real como plataforma multi-vertical (POS, facturacion, etc.), pero necesita pasar por una fase de consolidacion y hardening antes de escalar.

**En resumen: buena arquitectura, implementacion funcional, necesita disciplina de ingenieria.**
