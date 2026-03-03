# Event-Core: Análisis Honesto del Sistema

**Fecha:** 2026-03-03
**Metodología:** Verificación línea por línea del código real contra documentación
**Versiones encontradas:** v0.1.0 (index.js, config.json) | v0.2.0 (package.json) | v0.5.0 (README)

---

## 0. VEREDICTO EJECUTIVO

Event-Core es un **framework ambicioso y arquitectónicamente sólido** con patrones de diseño genuinamente buenos (IoC, event-driven, auto-wiring declarativo). Sin embargo, presenta un **desajuste sistemático entre lo documentado y lo real**: cifras infladas, features "implementadas" que son código muerto, y una postura de seguridad que lo hace inapto para producción.

| Dimensión | Nota | Justificación |
|-----------|------|---------------|
| Arquitectura | 8/10 | Patrones sólidos, IoC real, event-driven puro |
| Implementación | 6/10 | Core funcional, pero código muerto y features no conectadas |
| Documentación | 4/10 | Cifras infladas 10-30x, discrepancias de versión, estados inventados |
| Testing | 2/10 | 8 archivos de test, 2 fallan por dependencias, 0 tests frontend |
| Seguridad | 3/10 | Sin auth HTTP ni MQTT, code-executor abierto, credentials en plaintext |
| Producción | 2/10 | No desplegable sin trabajo significativo de seguridad y estabilización |

---

## 1. DISCREPANCIAS DOCUMENTACIÓN vs CÓDIGO REAL

### 1.1 Cifras Masivamente Infladas en SYSTEM-ANALYSIS.md anterior

| Elemento | Documentado | Real | Factor de inflación |
|----------|------------|------|---------------------|
| `start.sh` | 10,906 líneas | **324 líneas** | 33x |
| `stop.sh` | 5,427 líneas | **197 líneas** | 27x |
| `dev.sh` | 8,011 líneas | **234 líneas** | 34x |
| `restart.sh` | 2,183 líneas | **76 líneas** | 28x |
| `install.sh` | 1,908 líneas | **54 líneas** | 35x |
| `plopfile.js` | 59,265 líneas | **1,653 líneas** | 35x |

**Estas cifras estaban infladas ~30x consistentemente.** Esto no es un error puntual — es un patrón sistémico.

### 1.2 Versiones Inconsistentes (3 verdades simultáneas)

| Fuente | Versión |
|--------|---------|
| `index.js` banner + `config.json` | v0.1.0 |
| `package.json` | v0.2.0 |
| `README.md` | v0.5.0 "Network" |

No hay una única fuente de verdad para la versión del sistema.

### 1.3 Conteo de Módulos Inconsistente

| Fuente | Core | PizzePOS | Total |
|--------|------|----------|-------|
| `index.json` | 30 | 15 | 45 |
| `modules.json` | 30 (24 active) | 13 | 43 discovered, 37 active |
| **Realidad (module.json)** | **32** | **15** | **47** |

Módulos reales no listados en docs: `security-p2p`, `staff-manager` (existen pero están disabled).
Módulos en `config.json` disabled pero no documentados como tal: `security-p2p`, `staff-manager`.
Módulos `composition-manager` y `context-manager` existen en filesystem pero **no aparecen en config.json** (ni enabled ni disabled).

### 1.4 Features "Implementadas" que son Código Muerto

| Feature | Documentado como | Realidad |
|---------|-----------------|----------|
| Discovery (`core/discovery/`) | "Multi-Machine Support COMPLETADO" (README) | **Nunca importado en index.js.** Código muerto. |
| Flow Engine (`core/flow/`) | Motor de flows completo | **Nunca importado en index.js.** Código muerto. |
| MQTT Connection Pooling | "Implementado" | **Deshabilitado en config.json** (`pool.enabled: false`) |
| Echo Module + File Watcher Module | Listados en README como completados | **No existen en modules/** |

### 1.5 Numeración de Arranque Caótica

El `index.js` usa una numeración que salta de `/7` a `/8` a mitad del arranque, usa pasos fraccionarios (5.5, 6.5, 6.7), y los comentarios del código no coinciden con la salida por consola.

---

## 2. ARQUITECTURA — Lo que SÍ funciona bien

### 2.1 Diseño del Core (genuinamente bueno)

```
Frontend (SvelteKit 5 + TypeScript)
    │ MQTT WebSocket (:9001)
    │
┌───┴─────────────────────────────────┐
│  HTTP Gateway (:3000) — Node.js nativo │
│  UI Request Handler (MQTT req/res)     │
│  Module Loader (auto-wiring)           │
│  EventBus (EventEmitter + MQTT)        │
│  MQTT Broker (Aedes embebido)          │
│  Observability (Logger, Tracer, Metrics)│
│               EVENT CORE               │
└────────────────────────────────────────┘
```

**Lo que está bien diseñado:**
- **IoC real:** Módulos declaran contratos en `module.json`; el loader los conecta automáticamente
- **Event-driven puro:** Todo fluye por eventos. Las APIs HTTP son fachadas
- **Auto-wiring verificado:** `wireEventSubscriptions()` (línea 768) y `wireUIHandlers()` (línea 842) en `loader.js` — **realmente existen y funcionan**
- **HTTP Gateway nativo:** Confirmado `const http = require('http')` — sin Express
- **EventBus híbrido:** Confirmado `class EventBus extends EventEmitter` con bridge MQTT

### 2.2 Module Loader — El componente más maduro (1,290 líneas)

- Auto-descubrimiento recursivo de `./modules/`
- Auto-wiring de: APIs HTTP, tools para AI, suscripciones de eventos, UI handlers
- Normalización de 3 formatos legacy de subscribes y UI handlers
- Hot-reload con `fs.watch`
- Cleanup automático en `unload()` — deshace TODAS las suscripciones
- Provider tools unificados con module tools en `toolsRegistry`

### 2.3 Sistema de Módulos PizzePOS (15 módulos, flujo completo)

El vertical POS es el caso de uso más maduro:
```
Comandero → comandero.enviar_cocina → Pedidos → pedido.enviado_cocina → Cocina
                                              → pedido.item_agregado → Cuentas
Cobros ← cobro.procesado ← cuenta.estado_cambiado ← Cuentas
```

- Ciclo de vida completo: pendiente → con_pedido → en_preparación → listo → para_cobrar → cobrado
- Strategy pattern para 5 canales de venta
- Event sourcing con persistencia
- Carta digital con export estático

---

## 3. FRONTEND — Evaluación Honesta

### Métricas Reales

| Métrica | Valor Real |
|---------|-----------|
| Componentes `.svelte` | 90 archivos |
| Archivos TypeScript | 63 archivos |
| Stores | 24 archivos (9,128 líneas) |
| Líneas totales frontend | ~41,000 |
| Tests frontend | **0** |
| Linting configurado | **No** |
| Framework CSS | **Ninguno** (CSS manual scoped) |
| Dependencias runtime | 3 (`highlight.js`, `marked`, `mqtt`) |

### Lo que está bien
- **Arquitectura MQTT-first:** Lazy loading, reconnexión automática, pending queue (100 msgs), reference counting de suscripciones
- **Patrón request/response sobre MQTT:** Bien implementado con timeout, tipos de error, convenience wrappers
- **Autodiscovery de módulos:** `import.meta.glob` para manifests — agregar módulo = 0 cambios en archivos centrales
- **Cleanup discipline:** Cada `init*Subscriptions()` retorna cleanup function. Sin leaks de suscripciones
- **3 dependencias runtime:** Footprint admirablemente mínimo

### Lo que está mal
- **0 tests** — el riesgo más grande del frontend
- **102 usos de `any`** en stores (42 en `cuentas.ts`, 32 en `comandero.ts`)
- **242 `console.log/warn/error`** sin sistema de log-levels — todo sale en producción
- **Sin linting ni formatting** (no hay eslint, prettier, svelte-check)
- **Código muerto:**
  - `getMqttClient()` en mqtt-request.ts — función vacía, nunca llamada
  - Registry legacy (300 líneas) — reemplazado por lazy-registry
  - Ruta `/1` — página de testing de 432 líneas en producción
  - Constante `WORKSPACES` duplicada en 2 archivos
  - 4 rutas legacy de redirect con CSS duplicado

### Tailwind — NO existe
La documentación anterior decía "migración a Tailwind incompleta." La realidad: **no hay Tailwind configurado.** No hay `tailwind.config.js`, ni en dependencias. El proyecto usa CSS scoped manual con custom properties para theming.

---

## 4. TESTING — Estado Crítico

### Backend

| Test File | Estado |
|-----------|--------|
| `tests/unit/hooks.test.js` | PASA |
| `tests/unit/observability.test.js` | PASA |
| `tests/unit/http-gateway.test.js` | **FALLA** (MODULE_NOT_FOUND: ajv) |
| `tests/unit/conversation-manager.test.js` | **FALLA** (0/24 tests pasan) |
| `tests/unit/cli.test.js` | **FALLA** (MODULE_NOT_FOUND: ajv) |
| `tests/unit/security-p2p.test.js` | No incluido en `npm test` |
| `tests/integration/full-stack.test.js` | **FALLA** (MODULE_NOT_FOUND: mqtt) |
| `tests/integration/port-management.test.js` | No incluido en scripts |

**`npm test` FALLA.** De 4 test suites que ejecuta, solo 2 pasan. Las otras fallan porque `node_modules/` no está instalado (no hay `ajv` ni `mqtt`).

El README clama "100+ tests" y "60+ unit tests + 18 integration tests." La realidad: **8 archivos de test totales, la mayoría rotos.**

**Cobertura de tests por módulo: 0/47 módulos tienen tests propios.**

### Frontend
- **0 archivos de test**
- No hay test runner configurado (ni vitest, ni playwright, ni jest)
- No hay script `check` en package.json para `svelte-check`

---

## 5. SEGURIDAD — Postura Crítica (3/10)

### Vulnerabilidades CRÍTICAS

| # | Vulnerabilidad | Impacto |
|---|---------------|---------|
| 1 | **Sin autenticación HTTP** | Todos los endpoints abiertos. Cualquier cliente puede llamar cualquier API |
| 2 | **Sin autenticación MQTT** | Broker Aedes sin `authenticate`, sin ACL. Cualquiera puede suscribirse a `#` y leer API keys transmitidas en eventos `credential.resolve.response` |
| 3 | **Code Executor: shell abierto** | `child_process.exec()` con solo un blocklist de 11 comandos. `env`, `printenv`, `cat .env`, `curl` para exfiltración — todo permitido |
| 4 | **`new Function()` en Scheduler** | Condiciones de triggers ejecutadas como JS sin sandbox. Inyección de código arbitrario |

### Riesgo ALTO

| # | Vulnerabilidad |
|---|---------------|
| 5 | Credentials en plaintext en `.env` + `process.env` (encryption AES-256 referenciada en config pero NO implementada) |
| 6 | Path traversal en endpoint `/blueprints/` — `blueprintName` sin sanitizar |

### Riesgo MEDIO

| # | Vulnerabilidad |
|---|---------------|
| 7 | Sin rate limiting en ningún endpoint |
| 8 | CORS `Access-Control-Allow-Origin: *` |
| 9 | Sin security headers (CSP, HSTS, X-Frame-Options, nosniff) |
| 10 | Argument injection en `handleToolScript` del code-executor |

### Buenas Prácticas Encontradas
- Docker: multi-stage build, usuario no-root, `dumb-init`, Alpine, health check
- Body size limit (1MB)
- Request timeout (30s)
- SQL queries usan prepared statements (parametrizadas)
- Path traversal protegido en `getProjectPath` del code-executor
- `.env` en `.gitignore` — sin secrets commiteados
- Framework de validación existe (aunque opcional, `requireSchemas: false`)

---

## 6. INFRAESTRUCTURA OPERACIONAL

### Scripts Operacionales
- `start.sh` (324 líneas) — Arranque con detección de plataforma
- `stop.sh` (197 líneas) — Shutdown
- `dev.sh` (234 líneas) — Modo desarrollo
- `restart.sh` (76 líneas) — Restart
- `install.sh` (54 líneas) — Instalador

### Docker
- `Dockerfile` bien configurado (multi-stage, non-root, Alpine)
- `docker-compose.yml` para 2 cores (core-a, core-b)
- Puertos expuestos: 3000 (HTTP), 1883 (MQTT TCP), 9001 (MQTT WS)

### CI/CD
- **No existe.** No hay GitHub Actions, no hay pipeline de validación.
- No hay `npm run lint`, no hay `npm run check`
- `npm test` falla en el entorno actual

### Código Muerto / Deuda Técnica
- `_archived/` — 2.9MB de código archivado
- `handlers/global/archived/` — 30+ handlers deprecated
- `modules/conversation-manager/` — disabled, reemplazado pero no eliminado
- `core/discovery/` — implementado, nunca conectado
- `core/flow/` — implementado, nunca conectado
- `modules/security-p2p/` — parcial, disabled
- `modules/staff-manager/` — disabled, no documentado

---

## 7. MÉTRICAS REALES DEL CODEBASE

| Métrica | Valor Verificado |
|---------|-----------------|
| Líneas backend (JS) | ~100,584 |
| Líneas frontend (Svelte + TS) | ~41,062 |
| Total estimado | ~141,646 |
| Archivos JS (backend) | 251 |
| Archivos Svelte | 90 (docs decía 68) |
| Archivos TS | 61 (docs decía 48) |
| Módulos con module.json | 47 |
| Módulos activos (config.json enabled) | 34 |
| Módulos disabled | 8 |
| Módulos sin listar en config | 5 |
| Archivos de test | 8 (4 rotos) |
| Stores frontend | 24 |
| node_modules instalado | No |

---

## 8. LO QUE REALMENTE FUNCIONA (verificado contra código)

1. **Core startup sequence** — index.js orquesta correctamente: Observability → Validation → MQTT → Hooks → EventBus → UIHandler → Providers → Modules → Handlers → ServiceRegistry → HTTP
2. **Module Loader auto-wiring** — `wireEventSubscriptions()` y `wireUIHandlers()` están implementados y son funcionales
3. **EventBus híbrido** — EventEmitter + MQTT bridge real
4. **HTTP Gateway nativo** — Node.js `http` module, sin Express
5. **MQTT broker embebido** — Aedes con fallback automático
6. **47 módulos** con auto-descubrimiento y hot-reload
7. **PizzePOS** — 15 módulos con flujo de eventos completo
8. **AI Gateway** — 6 providers LLM con function calling y streaming
9. **Tool system unificado** — module tools + provider tools en un solo registry
10. **Frontend MQTT-first** — Arquitectura genuinamente innovadora

---

## 9. PRIORIDADES PARA PRODUCCIÓN

| Prioridad | Issue | Esfuerzo Est. |
|-----------|-------|---------------|
| **P0** | Autenticación HTTP + MQTT | 1-2 semanas |
| **P0** | Sandboxing real de code-executor (o deshabilitarlo) | 2-3 días |
| **P0** | Eliminar `new Function()` del scheduler | 1 día |
| **P1** | Cifrar credentials at rest | 3-5 días |
| **P1** | CI/CD pipeline (lint, test, build) | 2-3 días |
| **P1** | Arreglar tests rotos + coverage básica | 1 semana |
| **P2** | Rate limiting + security headers | 2-3 días |
| **P2** | Eliminar código muerto (discovery, flow, archived) | 1-2 días |
| **P2** | Conectar Discovery y Flow al startup (o eliminarlos) | 2-3 días |
| **P3** | Unificar versión del sistema | 1 hora |
| **P3** | Corregir documentación inflada | 1-2 días |
| **P3** | Limpiar `any` types en frontend stores | 2-3 días |

---

## 10. CONCLUSIÓN HONESTA

Event-Core tiene una **arquitectura genuinamente bien diseñada**. Los patrones de IoC, event-driven, y auto-wiring declarativo son sólidos y maduros. El Module Loader es un componente de ingeniería seria. El frontend tiene una arquitectura MQTT-first que es innovadora.

Pero el sistema sufre de:
1. **Documentación inflada** — cifras multiplicadas x30, features inexistentes documentadas como completadas
2. **Seguridad inexistente** — no apto para producción en su estado actual
3. **Testing casi nulo** — 8 archivos de test backend (4 rotos), 0 frontend
4. **Código muerto significativo** — ~3 subsistemas implementados pero nunca conectados
5. **Deuda técnica acumulada** — módulos deprecated sin limpiar, handlers archivados

**Estado real:** entre v0.2.0 y v0.3.0. Un prototipo funcional con buena arquitectura que necesita trabajo serio de hardening, testing y limpieza antes de considerarse apto para producción.
