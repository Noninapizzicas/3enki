# Reescritura del CIMIENTO de agentes — ai-agent-framework v3

> Guión de diseño de la reescritura del sistema de ejecución de agentes (ai-agent-framework
> + el bucle de tools del ai-gateway) para que sea un cimiento SÓLIDO: hoy y para el
> crecimiento futuro. Nace de un diagnóstico con datos (22/22 ejecuciones "success" sin
> entregable verificado) y de la decisión del dueño: el framework actual NO es un aliado
> fiable como base — certifica humo.
>
> Medio nativo: OOP + pseudocódigo + JSON. Prosa, la justa.

---

## 0 · El diagnóstico que OBLIGA la reescritura (evidencia, no opinión)

```
HISTORIAL REAL (agent_executions, proyectos b y c):
  b: 15 ejecuciones — 15 "success" (100%) — 0 módulos sobrevivieron (humo / sin commit)
  c:  7 ejecuciones —  7 "success" (100%) — 1 módulo de 23, 0 skills (la skill 18: "success" 97s, inexistente en todo el disco)

CAUSA RAÍZ: el framework certifica "el LLM terminó su bucle" como SUCCESS.
  No verifica el ENTREGABLE. No mira disco. No exige el 201. No sabe si la tarea existe.
  En 50K chars de framework: 1 sola aparición de "validar".

FRENOS REALES:
  · max_tokens 16k default → tareas largas (skill FULL, esquema completo) CORTADAS A MITAD
  · timeout 10 min default → esquematizador murió varias veces (registrado "success" igual)
  · maxIterations 15 (original) → cortaba TODO; subido a 500 (#117) pero el problema de fondo sigue
  · sin checkpoints → un fallo a mitad = trabajo perdido, sin reanudación
```

**Lo que SÍ funciona (y hay que INTERNALIZAR en el cimiento):** el gate externo
(proceso-negocio) que cuenta en disco, exige API real y devuelve 409 FASE_INCOMPLETA
cuando el agente miente. El cimiento nuevo nace con esa garantía DENTRO, no fuera.

---

## 1 · Principios del cimiento (innegociables)

```
P1 · SUCCESS = ENTREGABLE VERIFICADO
      El agente declara su entregable en el manifest. El sistema lo verifica
      (disco / API / evento) ANTES de emitir success. Si no verifica → response
      con verificado:false — el invocador decide. NUNCA "success" sin prueba.

P2 · CERO CORTES SILENCIOSOS
      Presupuesto (tokens/timeout/iteraciones) POR TAREA, no defaults que mutilan.
      Un trabajo que no cabe NO termina "success": termina "failed" honesto,
      o se reanuda desde el checkpoint.

P3 · EL AGENTE EJECUTA, EL SISTEMA JUZGA  (perspectiva-C, la filosofía Enki)
      El LLM produce. El reflejo verifica y persiste. El LLM jamás certifica su
      propio trabajo.

P4 · CHECKPOINT POR PASO
      Cada tool_call registrado y persistido. Timeout o fallo → reanudación
      desde el último paso hecho (nunca desde cero, nunca fingir).

P5 · CONTRATOS EXTERNOS ESTABLES
      Los 4 eventos canónicos se CONSERVAN (el frontend agente-progreso y
      cupula-eventos dependen): agent.execute.request / .response / .failed / .progress.
      Se AÑADEN campos (verificado, entregable, pasos) — no se rompe la forma.
```

---

## 2 · Arquitectura del cimiento

```
┌────────────────────────────────────────────────────────────┐
│  CONTRATO EXTERNO (estable)                                │
│  agent.execute.request → agent.execute.progress* →         │
│  agent.execute.response { status, verificado, entregable } │
│  agent.execute.failed { reason }                           │
└──────────────┬─────────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────┐
│  ORQUESTADOR DE AGENTE (nuevo núcleo, reemplaza al actual) │
│  · valida manifest v2 (schema)                             │
│  · bucle de ejecución con PRESUPUESTO dinámico             │
│  · checkpoint por tool_call                                │
│  · GATE DE ENTREGABLE al cerrar (P1)                       │
└──────┬──────────────────────────┬──────────────────────────┘
       ▼                          ▼
┌──────────────┐          ┌──────────────────┐
│ LLM-FLOW     │          │ REFLEJO VERIFICA │
│ (ai-gateway) │          │ fs/existencia ·  │
│ tools loop   │          │ API real · evento│
└──────────────┘          └──────────────────┘
```

El LLM-FLOW (ai-gateway) NO se reescribe entero: se le pasa el control del bucle al
orquestador (presupuesto + checkpoints + gate), o se le inyectan los límites por tarea.
Decisión F2, probada con el smoke antes de tocar nada más.

---

## 3 · Manifest v2 del agente (el contrato que hace el gate posible)

```json
{
  "name": "construir-modulos",
  "descripcion": "...",
  "tools": [],                              // vacío = todas (hoy)
  "provider": "auto",
  "presupuesto": {                          // P2 — por tarea, no defaults mutilantes
    "max_tokens": 64000,                    // alto: las skills full y esquemas caben
    "timeout_ms": 1800000,
    "max_iteraciones": 500,
    "sin_progreso_max": 5                   // N iteraciones sin tool nueva → failed honesto
  },
  "entregable": {                           // P1 — EL cambio de raíz
    "tipo": "fs",                           // fs | evento | rpc | ninguno
    "path": "modules/<slug>/index.js",      // plantilla con <slug> de la task
    "reglas": ["existe", "api_real", "en_repo"]  // verificables por el reflejo
  }
  // 'entregable: null' = el agente declara que su trabajo NO es verificable
  //   → el sistema emite success SOLO con verificado:false explícito (nadie lo confunde)
}
```

**Validación:** moduleLoader rechaza un manifest sin schema v2 válido (name, presupuesto,
entregable) — el cimiento no acepta agentes sin contrato de verificación.

---

## 4 · Fases de obra (cada una con entregable verificable — el gate manda)

### F0 · Congelar el contrato externo
**Entregable:** smoke test que los 4 eventos canónicos conservan su forma exacta
(publicar request → recibir progress/response/failed con los campos de hoy + nuevos).
Verde ANTES de tocar el núcleo. Proyecto "c" funcionando sin regresión.

### F1 · Manifest v2 + validador
**Entregable:** schema JSON + validador en el moduleLoader; los 4 agentes de proceso
(construir-modulos, escribir-skills, esquematizador-negocio, planificar-construccion)
migrados con su `entregable` declarado:
  · construir-modulos      → fs modules/<slug>/index.js + api_real + en_repo
  · escribir-skills        → fs modules/cosecha/cantera/enki/<slug>/SKILL.md + en_repo
  · esquematizador-negocio → fs esquemas/esquema.md + pasada-N-* + diseccion
  · planificar-construccion→ fs esquemas/plan-construccion.md

### F2 · Núcleo de ejecución con presupuesto y checkpoints
**Entregable:** el bucle de agentes ya no corta en silencio:
  · max_tokens por tarea (64k) — skills full sin truncar
  · checkpoint por tool_call persistido → agente.resume desde el último paso
  · sin_progreso_max → failed honesto en vez de success vacío
**Prueba:** el caso que hoy da timeout (esquematizador completo) termina sin cortes.

### F3 · Gate de entregable en el framework (P1 — el corazón)
**Entregable:** al cerrar el bucle, el reflejo verifica el entregable declarado y el
response lleva { verificado: true|false, entregable: {...} }.
  · verificado:true  → success con prueba
  · verificado:false → success NUNCA; el sistema responde failed (o success+verificado:false
    si el manifest declara entregable:null — el invocador decide)
**Prueba:** reproducir los 3 casos de humo históricos (módulo a medias, skill inexistente,
cierre prematuro) → el cimiento los pilla SIN el gate externo.

### F4 · Observabilidad y reanudación
**Entregable:** agent.execute.progress con pasos reales (id, tool, estado, duración) —
el marco del frontend muestra progreso verdadero; nueva op agent.execute.resume
(checkpoint → continuar).

### F5 · Migración completa y estrés
**Entregable:** los 22 casos históricos serían imposibles hoy:
  · ejecutar construir-modulos 1 en 1 con rail: success solo con módulo verificado
  · 3 ejecuciones concurrentes con correlation_id sin pisarse
  · tarea larga (>10 min) con checkpoint: interrumpir → resume → completa

---

## 5 · Qué NO se toca (los frenos que no movemos)

```
· Los 4 eventos canónicos agent.execute.* — forma conservada (frontend + cupula-eventos)
· La invocación desde chat/cron/cantera (agent.execute.request igual)
· El ai-gateway entero — solo el bucle de agentes pasa al orquestador (o se inyectan límites)
· El frontend agente-progreso — salvo AÑADIR campos nuevos al store
· El gate externo proceso-negocio — sigue como árbitro final del proceso de proyecto
```

---

## 6 · Criterio de COMPLETADO (el sistema lo verifica, no el LLM)

```
[ ] F0: smoke de contratos verde (los 4 eventos, forma exacta)
[ ] F1: 4 agentes de proceso con manifest v2 validado (schema)
[ ] F2: esquematizador completo sin cortes (el caso que daba timeout)
[ ] F3: 3 casos de humo históricos reproducidos y PILLADOS por el gate interno
[ ] F4: progress con pasos reales en el frontend + resume desde checkpoint
[ ] F5: 22/22 histórico-imposible · concurrencia 3 sin pisarse · resume tras interrupción
```

**La prueba de fuego:** un agente nuevo SIN gate externo (solo el cimiento) no puede
reportar "hecho" si el entregable no existe. El humo se vuelve estructuralmente imposible.

---

## 7 · Riesgos y mitigación

```
· Compatibilidad: agentes v1 sin 'entregable' → default entregable:null (verificado:false
  explícito) — no rompen, pero nadie confunde su success con trabajo hecho.
· Providers sin streaming: max_tokens alto (64k) en vez de streaming — mismo efecto.
· Coste: +1 RPC de verificación por ejecución (despreciable) vs. el coste real del humo.
· Alcance: el ai-gateway es 170K chars — NO se reescribe; solo se le quita el bucle de
  agentes (o se parametriza). El chat (llm-flow conversacional) no cambia.
```
