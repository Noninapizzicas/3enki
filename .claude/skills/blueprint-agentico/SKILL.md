---
name: blueprint-agentico
description: Estándar para escribir un blueprint que el LLM ejecuta como AGENTE de fiar. El harness (ai-gateway) da gratis las 3 capas de agencia — MARCO (system prompt) + TOOLS (bus.publish/publishAndWait) + LOOP (iteraciones) — al cablear el manifest. Tú escribes la POLÍTICA: el pseudocódigo de 6 fases CONTRATO → LEER → PENSAR → VALIDAR → GUARDAR → EMITIR, donde LEER/VALIDAR/GUARDAR los hace el REFLEJO (determinista) y PENSAR el LLM (fuzzy), ATADO por un loop validate→corregir contra el contrato. Evolución de blueprint-coherente: añade la VALIDACIÓN como freno (el agente no puede mentir "lo hice") y nombra la elección de FORMA del agente. Referencia viva del fallo que motiva el freno: carta1 (nonina).
when-to-use: Cuando una operación de blueprint ORQUESTA varios pasos con I/O (leer → pensar → validar → guardar) y el LLM la ejecuta agénticamente sobre el bus; o cuando el PENSAR puede aislarse como transform puro (entonces ver agente-perspectiva-c). Para operaciones simples sin riesgo de salida rota, basta blueprint-coherente. NO toca la capa de agentes del framework (aparcada): el agente aquí es el LLM de página enmarcado por el blueprint.
---

# blueprint-agentico

> Un blueprint NO es un documento que el LLM lee: es el **programa de un agente**.
> ai-gateway es el **runtime universal de agentes** — te da MARCO + TOOLS + LOOP gratis.
> Tú escribes la política (6 fases) y la ATAS con una VALIDACIÓN contra el contrato.
> Sin el freno, el agente da forma rota y la canta como éxito (caso carta1). Con él: válido o fallo honesto.

## Principio: Agente = Modelo + Harness

```
Agente = Modelo + Harness
  MARCO  : el blueprint inyectado como system prompt ("eres el runtime de este módulo")  ← ai-gateway
  TOOLS  : bus.publish · bus.publishAndWait · cajon.abrir                                  ← ai-gateway
  LOOP   : el bucle de tool-calls (maxIterations) que ejecuta y realimenta                 ← ai-gateway
  POLÍTICA: el pseudocódigo de operaciones[] que el LLM sigue paso a paso                  ← LO ESCRIBES TÚ
```

El LLM no "sabe" que es un agente: lo es porque cada turno recibe ese marco, esas tools y ese loop. El blueprint es su política. **Tu trabajo es escribir la política y darle un espacio de acción que RESPONDA** (reflejos que contesten sus eventos).

## El harness lo da gratis (solo cablear el manifest)

```json
// module.json
{ "blueprint_driven": true, "blueprint_path": "...", "target_page_id": "...", "cajones_enabled": true }
```

`cajones_enabled: true` ⇒ en runtime el LLM ve SOLO el catálogo de operaciones + el cajón abierto (`pseudocodigo` + `reglas_clave` + `errores` + `input`). **La sustancia vive DENTRO de la operación**, no en prosa de nivel superior (esa no se inyecta).

## El espinazo — 6 fases (añade VALIDAR al de blueprint-coherente)

```
METODO <op>(in): SalidaTipada {
  // 1. CONTRATO — input tipado + precondiciones (guardas = cara de enforcement)
  SI !in.<requerido>: RETORNA INVALID_INPUT { field:'<campo>' }

  // 2. LEER — hidratar del reflejo (determinista). El LLM no lee fs a mano.
  datos ← await publishAndWait('<mod>.<lectura>.request', { project_id, ... })

  // 3. PENSAR — lo FUZZY: el LLM da forma / decide / interpreta sobre 'datos'.
  //    FIDELIDAD: solo lo que 'datos' o el usuario trajeron (nada inventado).
  obra ← <razonamiento del LLM sobre 'datos'>

  // 4. VALIDAR — el FRENO: el reflejo valida 'obra' contra el contrato (AJV).
  intento ← 0
  REPETIR:
    v ← await publishAndWait('<mod>.validar.request', { obra, schema:'<contrato>' })
    SI v.valid: SALIR
    intento++ ; obra ← <re-PENSAR corrigiendo SOLO v.errors[].path>   // reprompt con el error de campo
  MIENTRAS intento < 3
  SI !v.valid: RETORNA UPSTREAM_INVALID_RESPONSE { hint: v.errors }   // fallo HONESTO, nunca basura

  // 5. GUARDAR — persistir SIEMPRE por el reflejo (determinista, VERIFICADO).
  await publishAndWait('<mod>.<persist>.request', { project_id, ...obra })

  // 6. EMITIR — evento de dominio + salida tipada
  RETORNA { ...salida }
}
```

Variantes (sin romper el espinazo):
- **Determinista pura** (catálogo YA formado, leer, CRUD): salta PENSAR y VALIDAR → va directo al reflejo. Si no hay juicio, no hay agente.
- **Sólo lectura**: CONTRATO → LEER → RETORNA.
- **Interactivo** (entrevista): cada turno una vuelta del espinazo; el LLM conduce, el reflejo persiste.

## El reparto (la ley que lo hace de fiar)

```
PENSAR (agéntico)             = lo que necesita ELEGIR / INTERPRETAR / DAR FORMA   → el LLM
LEER · VALIDAR · GUARDAR      = lo que tiene UNA respuesta correcta computable      → el REFLEJO (JS)
regla: el agente PIENSA; el reflejo EJECUTA. El LLM nunca toca fs ni persiste a mano.
```

## El contrato sirve a las dos caras

```
schema (JSON Schema real, p.ej. producto.schema.json) con:
  description en cada campo   → INSTRUYE al PENSAR (qué generar, rangos, ejemplos, semántica)
  type/enum/required/if-then  → es la LEY que ejecuta VALIDAR
un solo artefacto: enseña al fuzzy y ata al determinista.
```

`if/then` por discriminador (la "family" del producto) declara los atributos obligatorios por caso — no en prosa. few-shot (`ejemplos[]` por caso) como anclas.

## Dos FORMAS de agente — elige por la tarea

```
si la tarea es UN transform (datos → datos)   → AGENTE FUNCIÓN-PURA   (ver skill agente-perspectiva-c)
    tools:[] · el reflejo HIDRATA el contexto y PERSISTE la salida · el agente solo PIENSA
    → no toca el bus, no puede mentir "lo guardé", inmune al tool-use frágil. LO MÁS FIABLE.

si la tarea es ORQUESTAR (varios pasos con I/O)→ BLUEPRINT AGÉNTICO   (este skill)
    tiene tools (bus.*) · corre el loop · lee/piensa/valida/guarda
    → más potente, más frágil → ATARLO con el loop VALIDAR.
```

Regla: **si puedes, aísla el PENSAR como función-pura** (perspectiva-c) y deja la orquestación (LEER/VALIDAR/GUARDAR) al reflejo. Lo agéntico-con-tools se reserva para lo que de verdad orquesta.

## OOP — el blueprint como clase de agente

```
CLASE <Modulo>Blueprint IMPLEMENTA Agente {
  ATRIBUTOS {
    reflejo   : Reflejo       // LEE/VALIDA/GUARDA (determinista, index.js)
    validador : Validador     // AJV contra el contrato (Specification ejecutable)
    bus       : EventBus      // Observer (progreso/fallo)
  }
  METODOS { <op>(in): Salida ; clasificar(in): Estrategia (si hay rutas) }

  MANDATOS (Specification — una salida válida los satisface) {
    FIDELIDAD   : cada dato procede del material o del usuario.
    COMPLETITUD : la salida nace completa (el VALIDAR lo garantiza, no la confianza).
    VERIFICADO  : LEER/GUARDAR/VALIDAR por publishAndWait (la acción se confirma).
    DELEGADO    : el reflejo posee el store; el agente no toca fs.
  }
  PATRONES { Strategy (rutas) · Retry-with-feedback (loop VALIDAR) · Delegation · Observer · Specification (contrato) }
}
```

## Receta — atar un blueprint para que sea agente de fiar

```
1. Manifest: blueprint_driven + blueprint_path + target_page_id + cajones_enabled.
2. Contrato: un JSON Schema real con `description` (instruye) + constraints/if-then (valida). Few-shot.
3. Espacio de acción REAL: cada evento que el pseudocódigo invoca DEBE tener un reflejo que responda.
     - en concreto, crea el responder '<mod>.validar.request' (AJV contra el contrato) si no existe.
4. Operación: escribe el espinazo de 6 fases. PENSAR fuzzy; LEER/VALIDAR/GUARDAR al reflejo.
5. El FRENO: el loop VALIDAR (máx 3 intentos, reprompt con el error de campo) → válido o fallo honesto.
6. P0: declara las reglas como MANDATOS (estado deseado), no como prohibiciones.
7. GATE: node scripts/validate-hibridos.js → PASS. JSON válido.
8. (al desplegar) verifica como humano por el chat: la operación produce salida VÁLIDA y PERSISTE de verdad.
```

## El freno: por qué VALIDAR no es opcional

Evidencia viva (nonina, carta1): un agente sin freno estructuró 10 productos **sin ingredientes** y respondió "✅ creada". No falló — **mintió**. El loop VALIDAR le quita esa capacidad: la salida pasa por la ley del contrato antes de persistir; si no pasa, el agente reintenta con el error exacto, y si agota, **falla a la cara**. Convierte "potente pero dado" en "potente y de fiar".

## Reglas de redacción (forma coherente)

- Una operación = un método con las fases EN ORDEN y rotuladas (`// 1. CONTRATO`, `// 4. VALIDAR`…).
- Tipar input y salida; precondiciones explícitas.
- LEER/VALIDAR/GUARDAR como `publishAndWait('<mod>.<op>.request', {...})` — visible que va al reflejo.
- Errores canónicos ({code,message}) propagados (INVALID_INPUT · UPSTREAM_INVALID_RESPONSE · UPSTREAM_TIMEOUT · UPSTREAM_UNREACHABLE).
- P0: Mandatos, no prohibiciones. Las guardas del pseudocódigo son la cara de enforcement (permitido).

## Relación con los otros estándares

```
blueprint-coherente  → el espinazo base (5 fases) SIN validación. Para ops sin riesgo de salida rota.
blueprint-agentico   → ESTE: añade VALIDAR (freno) + trata el blueprint como agente. Para ops que orquestan y pueden romper.
agente-perspectiva-c → la FORMA función-pura del PENSAR (tools:[], reflejo hidrata/persiste). El PENSAR de un blueprint agéntico puede extraerse así.
```
