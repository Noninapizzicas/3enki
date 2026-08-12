# Visión del Motor de Agentes (replanteo Paco — 2026-08-06)

Contexto de la sesión: tras el día del cimiento (PRs #140–#143), Paco paró la
reescritura del framework: "esto no funciona, está carcomido el árbol, lo cortamos
y plantamos uno nuevo". Al oír "reescribir el agente framework" se le ponen pelos
largos porque **reescribir con la misma visión = repetir el error**.

## La visión (palabras de Paco)

> "Para mí un agente en Enki: un proceso casi todo determinista con la parte fuzzy."

Regla operativa del agente:
- **Reflejos (deterministas) ejecutan**: leer plan/rail, resolver contrato, validar
  manifest, escribir archivo, JEFE verifica, cerrar fase, bitácora, eventos.
- **El LLM (fuzzy) solo GENERA** en los pasos declarados fuzzy del pipeline. Nunca
  ejecuta tools de efecto ni decide el flujo completo.
- **Checkpoint tras cada paso fuzzy**: la salida se valida antes de continuar.
- Reintento quirúrgico: si el paso fuzzy produce basura, se reintenta SOLO ese paso.
- El JEFE verifica el entregable final (reglas existe/api_real/en_repo/contenido_min).

## Contraste con el estándar (lo que Paco preguntó: "¿cómo funcionan los agentes
en el resto de sistemas?")

| Sistema | Patrón | Lección |
|---|---|---|
| Claude Code / Codex | LLM + tools; cada tool devuelve la SALIDA REAL y el LLM reacciona a ella; humano en el bucle | El agente VE el mundo real — el nuestro trabajaba a ciegas (chat sin modules/, escritura en storage distinto) |
| LangGraph / CrewAI | Grafo de estado: nodos = LLM *o* funciones; el LLM es UN nodo más | El LLM es pieza acotada, no el centro |
| Deep Research | Pipeline planificar→buscar→leer→sintetizar→verificar, pasos deterministas | Bucle acotado, no abierto |
| NEXUS (doc de prompts) | Roles + Dev↔QA loop + PASS/FAIL + 3 reintentos + "evidence over claims" | Valida el patrón del JEFE; pero sin mecanismo (tools/mundo real) es teatro de roles |

## Pipeline ejemplo (construir-modulos, como se diseñará)

```
1. [REFLEJO]  leer plan + rail (estados.*)          → qué hoja toca
2. [REFLEJO]  resolver slug + forma (CUSTODIO/REFLEJO) + template
3. [FUZZY]    GENERAR el código del módulo           ← único punto LLM
4. [REFLEJO]  validar manifest (validateManifest)    → si NO → reintentar SOLO paso 3
5. [REFLEJO]  escribir archivo en modules/ (fs real)
6. [REFLEJO]  JEFE: verificar en disco (existe + api_real + en_repo)
7. [REFLEJO]  rail: estado → siguiente + bitácora + evento (vitrina/marco)
```

Manifest v3 (declara el pipeline, no solo prompt_file):

```json
{
  "name": "construir-modulos",
  "pipeline": [
    { "paso": "leer_plan_y_rail",  "tipo": "reflejo" },
    { "paso": "resolver_contrato", "tipo": "reflejo" },
    { "paso": "generar_codigo",    "tipo": "fuzzy", "valida": ["manifest", "tamano_min"] },
    { "paso": "escribir_modulo",   "tipo": "reflejo" },
    { "paso": "verificar_jefe",    "tipo": "reflejo", "reglas": ["existe", "api_real", "en_repo"] },
    { "paso": "cerrar_fase",       "tipo": "reflejo" }
  ]
}
```

El framework nuevo = **motor de pipelines** (ejecuta pasos deterministas + puerto
para pasos fuzzy), no un orquestador de bucle LLM. Presupuesto pequeño (el LLM
solo genera).

## Estado del replanteo (dónde quedó)

- Rama `hermes/framework-v3` en ~/3enki: solo estructura creada
  (`modules/conversacion/ai-agent-framework-v3/` con cimiento.js copiado +
  agents/prompts) — SIN código del motor (Paco pidió parar).
- Proyecto `motor` creado por `ui/request/project/create` (dir
  `/opt/enki/data/projects/motor`, www-data).
- Identidad escrita vía `ui/request/fs/write` → `storage/identidad.md` (el core
  escribe; Hermes no puede sin sudo).

## El desenlace de la sesión (lo que demuestra el replanteo)

**El esquematizador-agente falló 3 veces seguidas — y el JEFE lo pilló las 3**
(bitácora `fallida` + `entregable_no_verificado`). Los 3 intentos tienen el mismo
perfil de bitácora: `pasos: ['started','final']` = **el LLM respondió UNA vez sin
invocar NINGUNA tool**.

Diagnóstico definitivo del humo de fondo (matiz crítico):
1. El fix "tools vacío → TODAS las tools" (comentario `LUZ (sombra corregida)`,
   ~línea 804 de ai-agent-framework/index.js) **YA está en prod y en repo** — el
   agente NO es manco: recibe las tools del registro.
2. Aun así el LLM del esquematizador (deepseek-v4-flash) respondió sin tool_calls
   **con identidad en el storage Y herramientas disponibles**.
3. Conclusión: **no se puede confiar en que el LLM "decida trabajar"** — por eso el
   motor nuevo es pipeline determinista: los reflejos se ejecutan sí o sí, y el LLM
   solo genera donde está declarado. La bitácora `started→final` sin tool_calls es
   la firma de "el LLM no trabajó", distinta de "no recibió tools" (bug viejo).

**El esquema del motor se generó aplicando el MÉTODO del esquematizador
manualmente** (prisma de 5 huecos + disección por formas — el mismo que validó el
cimiento) cuando el agente falló: 9 piezas, 5 principios, puertos agnósticos.
Escrito vía `ui/request/fs/write` (ojo: el filesystem no resolvió el proyecto nuevo
y lo escribió en `projects/c/storage/motor/esquemas/esquema.md` — fallback del
filesystem, ver skill enki-filesystem-tools).

## El ESQUEMA del motor (generado — es el diseño para construir en F4)

Las 9 piezas del motor (prisma punto a punto + disección):

| # | Pieza | FORMA | Qué hace |
|---|---|---|---|
| 1 | Ejecutor de pipelines | REFLEJO | recorre los pasos declarados: reflejo → ejecuta; fuzzy → abre el puerto LLM |
| 2 | Registro de pipelines | CUSTODIO | la definición de cada agente: pasos, cuáles fuzzy, validaciones, entregable + reglas |
| 3 | Validador de salidas fuzzy | REFLEJO | checkpoint DETERMINISTA tras cada paso fuzzy — si falla, reintenta SOLO ese paso |
| 4 | Verificador de entregable (JEFE) | REFLEJO | reglas contra el mundo real — nadie declara éxito sin pasar |
| 5 | Puerto LLM (el FUZZY) | MICRO-AGENTE | el único punto no determinista: GENERAR. Contrato entrada/salida. NUNCA ejecuta |
| 6 | Bitácora | CUSTODIO | cada paso de cada ejecución queda ESCRITO |
| 7 | Rail de estados | CUSTODIO | checkpoints entre fases |
| 8 | Vitrina | PUENTE | proyecta progreso/veredicto — no escribe |
| 9 | Reanudador | REFLEJO+CUSTODIO | retoma pausadas/fallidas desde la bitácora con el veredicto como corrección |

Los 5 principios: (1) el LLM nunca ejecuta ni decide el flujo — solo genera en
pasos fuzzy declarados; (2) cada salida fuzzy se valida antes de continuar;
(3) el éxito se gana contra el mundo real (JEFE); (4) todo paso queda escrito
(bitácora); (5) lo determinista no miente (90% reflejo, fuzzy acotado).

Puertos (cero tecnologías): `leer(proyecto,ruta)` · `escribir(proyecto,ruta,contenido)`
· `generar(instruccion,contexto)->salida` · `verificar(reglas,mundo)->veredicto` ·
`persistir(paso)` · `avanzar(estado)` · `observar(progreso)`.

## Lecciones de comportamiento con Paco

- Cuando parchear falla en bucle, Paco prefiere **cortar y replantar** — no ofrecer
  más parches ni "una reescritura más" con la misma visión.
- Si la visión es lo que está mal, ayudarle a articularla (comparación con la
  industria: "¿cómo funcionan en el resto de sistemas?") en vez de defender lo hecho.
- Ejecutar la visión: esquematizar el concepto ANTES de construir (el esquematizador
  valida el diseño — 7 reflejo/2 custodio/1 micro-agente/1 puente).
