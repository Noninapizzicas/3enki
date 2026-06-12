---
name: blueprint-coherente
description: Estándar para escribir o reconvertir un blueprint de módulo en pseudocódigo + OOP, SIN agentes. Cada operación sigue el mismo espinazo de 5 fases — CONTRATO → LEER → PENSAR → GUARDAR → EMITIR — donde LEER/GUARDAR los hace el REFLEJO (JS determinista) y PENSAR lo hace el LLM de PÁGINA (lo fuzzy, que ya tiene el hilo de la conversación). El blueprint cumple la función que los agentes no cumplían. Referencia: carta-marketing.
when-to-use: Reconvertir un blueprint que invocaba agentes (agent.execute) para que el LLM de página haga lo fuzzy + el reflejo persista; o escribir un blueprint nuevo. NO toca la capa de agentes (aparcada). Da forma coherente e idéntica a todas las operaciones de los blueprints del sistema.
---

# blueprint-coherente

> Un blueprint es una CLASE. Cada operación es un MÉTODO con el mismo espinazo:
> **CONTRATO → LEER → PENSAR → GUARDAR → EMITIR.**
> LEER/GUARDAR = reflejo (JS determinista). PENSAR = LLM de página (fuzzy). Sin agentes.

## Principio

El trabajo siempre fue del LLM; los agentes eran una capa rota o opcional en medio. Se quitan del flujo. Quedan dos capas, y el blueprint las orquesta en pseudocódigo coherente:

```
LLM de PÁGINA (este blueprint)  → PIENSA: redacta, decide, interpreta, entrevista   [fuzzy]
REFLEJO (index.js)              → LEE y GUARDA: lecturas/CRUD/persistencia            [determinista]
```

El reflejo es lo fiable (siempre corre cuando llega su evento). El LLM de página es el único cerebro del turno y ya tiene el hilo. Nada discrecional en medio.

## El espinazo (las 5 fases, SIEMPRE)

```
METODO <op>(input): SalidaTipada {
  // 1. CONTRATO — input tipado + precondiciones duras
  SI !input.<requerido>: RETORNA INVALID_INPUT { field: '<campo>' }

  // 2. LEER — hidratar del reflejo (determinista). NUNCA el LLM lee ficheros a mano.
  datos ← await publishAndWait('<mod>.<lectura>.request', { project_id, ... })

  // 3. PENSAR — lo FUZZY, lo hace el LLM de página AQUÍ (no un agente):
  //    redacta el copy / decide qué persistir / interpreta la intención / entrevista.
  //    Reglas duras del PENSAR: PROHIBIDO INVENTAR lo que no esté en 'datos'.
  obra ← <razonamiento del LLM sobre 'datos'>

  // 4. GUARDAR — persistir SIEMPRE por el reflejo (determinista). NUNCA el LLM escribe a mano.
  await publishAndWait('<mod>.<persist>.request', { project_id, ...obra })

  // 5. EMITIR / RETORNAR — el evento de dominio + la salida tipada
  // (el evento lo publica el reflejo al persistir; el blueprint retorna la salida)
  RETORNA { ...salida }
  // errores canónicos: INVALID_INPUT · UPSTREAM_TIMEOUT · UPSTREAM_UNREACHABLE
}
```

Variantes del espinazo (sin romperlo):
- **Sólo lectura** (get/listar): CONTRATO → LEER → RETORNA. (lo sirve el reflejo directo; el cajón delega).
- **Sólo escritura** (guardar lo que el LLM ya pensó): CONTRATO → GUARDAR → EMITIR.
- **Interactivo** (entrevista): cada turno = CONTRATO → LEER → PENSAR(una pregunta + qué persistir) → GUARDAR(update) → siguiente. El LLM de página conduce el bucle; el reflejo persiste cada respuesta.

## OOP — el blueprint como clase

```
CLASE <Modulo>Blueprint {
  estado_persistente : { paths }            // qué stores toca (los ESCRIBE el reflejo)
  reflejo            : Array<op_JS>         // lecturas/persistencias que sirve index.js
  operaciones        : Map<nombre, Metodo>  // cada una con el espinazo de 5 fases

  // INVARIANTES
  //  - LEER y GUARDAR -> SIEMPRE reflejo (publishAndWait <mod>.<op>.request). Determinista.
  //  - PENSAR -> SIEMPRE el LLM de página. Nunca un agente (agent.execute prohibido aquí).
  //  - el LLM NUNCA toca fs directamente; entra por la puerta del reflejo.
  //  - PROHIBIDO INVENTAR: el PENSAR solo usa lo que LEER trajo.
}
```

## Receta — reconvertir un blueprint que usaba agentes

```
1. Localiza las operaciones que hacían publishAndWait('agent.execute.request', ...).
2. Por cada una, identifica las 3 piezas:
     LEER    -> qué datos necesitaba (ya hay un <mod>.<lectura>.request en el reflejo, o créalo).
     PENSAR  -> qué hacía el agente (redactar/decidir/interpretar) -> ahora lo hace el LLM de página, inline en el pseudocódigo.
     GUARDAR -> dónde aterriza -> un <mod>.<persist>.request del reflejo (créalo si no existe; el reflejo SOLO persiste).
3. Reescribe la operación con el espinazo de 5 fases. Quita el agent.execute.
4. Reflejo (index.js): añade los handlers de LEER/GUARDAR que falten (proyecciones deterministas).
5. module.json: subscribes para los nuevos <mod>.<op>.request. Sube version.
6. blueprint: sube version + changelog. Quita referencias a agentes del _doc/rol/garantiza.
7. GATE: node scripts/validate-hibridos.js  -> PASS.
8. (al desplegar) verificar como humano por el chat: la función se cumple y PERSISTE de verdad.
```

## Reglas de redacción del pseudocódigo (la "forma coherente")

- Una operación = un método con las 5 fases EN ORDEN y rotuladas (`// 1. CONTRATO`, `// 2. LEER`...).
- Tipar input y salida. Precondiciones explícitas.
- LEER/GUARDAR como `publishAndWait('<mod>.<op>.request', {...})` — visible que va al reflejo.
- El PENSAR descrito como lo que el LLM produce, con sus reglas duras (PROHIBIDO INVENTAR).
- Errores canónicos al final. Sin métricas vanity, sin prosa de relleno.

## Referencia

```
carta-marketing (blueprint 1.8.0 · module 2.4.0 · reflejo 2.0.0) — SIN agentes {
  completar_onboarding : CONTRATO→LEER(get_perfil)→PENSAR(entrevista, 1 pregunta/turno)→GUARDAR(update_perfil)→cierre
  generar_copy         : CONTRATO→LEER(get_perfil)→PENSAR(redacta copy en voz de marca)→GUARDAR(guardar_copy)→EMITIR
  get_perfil/update_perfil/guardar_copy : reflejo (determinista)
}
```

## Lo que NO es

- **NO** toca la capa de agentes (aparcada, enabled:false). Si un agente hiciera falta de verdad para algo, esa es otra decisión aparte.
- **NO** mete al LLM a tocar ficheros: LEER/GUARDAR siempre por el reflejo.
- **NO** es para ops deterministas puras sin nada de fuzzy → ésas son reflejo directo, sin PENSAR.
