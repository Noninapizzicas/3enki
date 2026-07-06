---
id: cupulas/estados
dominio: cupulas
resumen: El rail vivo: listas ordenadas con freno entre pasos, plantillas de proceso por arquetipo, el juez del rail (objetivo + blocker tipado) y el tiro automático.
fuentes:
  - modules/estados/**
  - modules/_shared/procesos-semilla.js
verificado: 2026-07-06
---

# CÚPULA DE ESTADOS — el RAIL VIVO (el estado es el timón · modules/estados · vivo 2026-07-05)

> Gemelo del cuenco de lentes, otra sustancia: el cuenco sirve CONOCIMIENTO (lentes); esta cúpula
> sirve ESTADO (listas ordenadas). Nace de un problema real: el chat DERIVABA —nada sostenía el
> rumbo entre turnos, el objetivo vivía en la memoria frágil del hilo—. La cura no es más prompt:
> es escribir el rumbo como ESTADO que el LLM ve cada turno. Un chef's list continuo: fichas
> entrando (falta) y saliendo (hecho); el timón lo lleva el propio estado, con una mano, por buen
> rumbo. Confirmado por Paperclip (plano de control = estado como verdad, trabajador sin estado).

## Un primitivo, muchas caras (contrato)

```json
{
  "esquema": "cupula-de-estados-v1",
  "tesis": "el estado ES el timón — mano ligera, el rail sostiene el rumbo entre turnos",
  "primitivo_unico": "ListaOrdenada { id, nombre, tipo, orden, pasos:[{ id, texto, pos, estado, freno? }], actual, estado }",
  "estado_paso": "pendiente | hecho | atascado | descartado",
  "orden": "libre | estricto  (NO es otra máquina, es un FLAG)",
  "caras": {
    "notas":       "lista sin orden fuerte — capturas sueltas",
    "chef_list":   "el rail de servicio — entra pedido, sale plato",
    "tareas":      "falta / hecho",
    "compras":     "pendiente → tachado",
    "orden_1_2_3": "orden ESTRICTO: el paso 2 no salta al 1",
    "proceso":     "un trabajo con proceso definido (instanciado desde plantilla de arquetipo)"
  },
  "freno_entre_pasos": "en orden ESTRICTO, avanzar valida el paso actual contra su freno.requiere (el VALIDAR de blueprint-agentico subido del turno al PASO). La entrega valida → el siguiente recoge; no valida → se ATASCA, no arrastra basura (no_silent_drops).",
  "custodio": "single-writer de /estados/listas.json por proyecto → el timón no tiembla (nadie más escribe; atomicidad = fs.write tmp+rename, sin lock)."
}
```

## HERENCIA universal — el patrón cuenco (nadie se cablea)

```json
{
  "no_es": "herencia de clase módulo-por-módulo (los skills son .md, las conversaciones no son módulos)",
  "es": "UNA cúpula que sirve + un nervio que inyecta + auto-descubrimiento de plantillas — la MISMA máquina de herencia-sin-cableado que el cuenco de lentes",
  "tres_vias": {
    "por_bus":          "cualquier módulo/skill llama estados.* por RPC — está en el bus, la tiene (como lentes.obtener)",
    "por_nervio":       "ai-gateway inyecta la LISTA ACTIVA en todo turno real con proyecto — cero cableado, como propiocepción (cada conversación la hereda gratis; NO exige blueprintCtx → universal)",
    "por_plantilla":    "se DEJA CAER una plantilla de proceso (un arquetipo PRISMA, un módulo) y la cúpula la instancia — como un pack de lentes se deja caer"
  },
  "la_ley": "no se hereda EXTENDIENDO una clase; se hereda ESTANDO en el bus bajo una cúpula que sirve y un nervio que inyecta. Construiste el patrón una vez (cuenco); esto es el mismo molde, otra sustancia (estados)."
}
```

## Pseudocódigo (reflejo custodio)

```
CLASE EstadosReflejo HEREDA ModuloHibridoReflejo {   // custodio single-writer
  STORE  /estados/listas.json  { activa, listas: { <id>: ListaOrdenada } }
  OPS (RPC estados.<op>.request → .response):
    crear(nombre, tipo?, orden?, pasos?, activar?)          // cualquier cara; 409 si el id existe
    instanciar(arquetipo, nombre?, activar?)                // desde procesos-semilla → PRISMA hereda
    anadir(lista_id, texto, freno?)                         // ítem/paso pendiente al final
    avanzar(lista_id, entrega?)                             // ESTRICTO: freno → hecho+siguiente, o atasco
    marcar(lista_id, paso_id, estado)                       // LIBRE: tacha/descarta por id
    estado(lista_id?)                                       // una lista, o la ACTIVA (lo que lee el nervio)
    listar · activar · borrar

  _validarPaso(paso, entrega):                              // EL FRENO (el VALIDAR subido al paso)
    SI !paso.freno.requiere: RETORNA { ok:true }
    faltan ← freno.requiere.filtrar(c → vacio(entrega[c]))   // vacío = undefined|null|''|false
    RETORNA { ok: faltan.vacío, faltan }

  _avanzar(lista):                                          // orden estricto
    paso ← lista.pasos[lista.actual]
    f ← _validarPaso(paso, entrega)
    SI !f.ok: paso.estado ← 'atascado' ; EMITE estados.paso.atascado ; RETORNA { atascado, faltan }
    paso.estado ← 'hecho' ; lista.actual++ ; EMITE estados.paso.avanzado ; RETORNA { siguiente, completa }
}

// NERVIO (ai-gateway, gemelo de _leerLente/propiocepción):
_leerRailActivo(project_id): RPC estados.estado {project_id} (2s best-effort) → la lista activa | null
_composeRailSection(lista): "# EL RAIL — lista activa «X» (orden) · contexto silencioso"
  // marca [x]hecho [ ]falta [!]atascado [-]descartado + Paso ACTUAL (estricto).
  // "llévalo de fondo, NO lo recites; refleja los avances con estados.marcar/avanzar —
  //  el estado es la verdad, no tu memoria del hilo."
// inyección: turno REAL con project_id (sin exigir blueprintCtx → universal). Sin lista activa → nada.
```

## PRISMA hereda — cada arquetipo = un proceso definido (plantilla)

```
_shared/procesos-semilla.js  (gemelo de arquetipos-semilla · PURO)
  arquetipo → plantilla de proceso (pasos ordenados, con freno donde el traspaso valida):
    comestible   recibe → prepara[freno:listo] → sirve → cobra[freno:pagado]
    servicio     recibe → realiza[freno:hecho] → entrega → cobra[freno:pagado]
    uso_temporal reserva → entrega → usa → devuelve[freno:estado_ok] → fianza
    pieza        localiza → prepara → entrega → cobra[freno:pagado]
  plantillaDe(arquetipo, extra) — custom con prioridad (ABIERTO, como los arquetipos)

PRISMA no cambia; SUELTA plantillas. estados.instanciar {arquetipo:'servicio'} → la lista de proceso
del servicio (4 pasos, freno en realiza/cobra, orden estricto). La cúpula de estados es el MOTOR DE
PROCESO que a PRISMA le faltaba: tiene órganos (cocina, agenda, cobro) y arquetipos, pero no QUÉ
SECUENCIA el trabajo. El arquetipo dice qué pasos y en qué orden; la lista los lleva vivos, con freno
en cada traspaso. (Wiring cuenta.crear → instanciar = follow-up en vivo; hoy la capacidad + las
plantillas + el test PRUEBAN la herencia.)
```

## Referencia — Paperclip (plano de control) VS Enki (federado)

```
LEY COMÚN  estado = fuente de verdad · trabajador SIN estado · nada en el aire.
  Enki YA la vive: reflejo = custodio del estado (single-writer) · blueprint (LLM) = trabajador sin
  estado (nunca toca fs, entra por el reflejo) · propiocepción = "nada en el aire" (el LLM solo afirma
  lo que el reflejo registró).
TOPOLOGÍA  Paperclip CENTRALIZA los doce subsistemas en un Postgres (catedral); Enki los REPARTE en
  ermitas conectadas por el bus (federado). Misma ley, geometría opuesta.
DOCE SUBSISTEMAS → Enki: identity(credential/security/cert) · agents(module-registry) · work(← los
  RAILS: cocina/pase-cocina/cuentas/destilador/facturas/conserje/ejecutor, federados) · heartbeat
  (scheduler+bus) · runtime(project-manager+filesystem) · governance(ejecutor/portal) · budget
  (conversation-export MIDE) · routines(scheduler) · plugins · secrets(credential, por proyecto) ·
  activity(propiocepción+bus) · portability(—).
DOS HUECOS REALES (el resto ya está, federado):
  1. portabilidad / vista única — precio de la federación (cosechar de N reflejos; PRISMA no la
     necesita —multi-tenant nativo—, Enki sí para "llevarse una empresa entera").
  2. ledger de presupuesto que FRENE — hoy se MIDE el coste (conversation-export) pero nadie lo
     GOBIERNA. Pieza limpia y aislada: un reflejo custodio, estado = el ledger, freno = la ley.
TRAMPA EVITADA  Paperclip presupone FLOTA (por eso su CLAIM atómico —UPDATE...WHERE— es central).
  Enki no la tiene: un core por dominio, single-writer. El CLAIM se obtiene GRATIS (no hay carrera
  entre workers). Copiar su lease sería importar la solución a un problema que el single-writer elimina.
```

## EL JUEZ DEL RAIL — objetivo + blocker tipado (v0.4.0 · cierra el lazo abierto)

> El rail sabía QUÉ pasos hay pero no SI el objetivo se cumplió — dependía de que el LLM se
> auto-declarara hecho (frágil, la deriva). El juez cierra ese lazo. Cosechado de DeerFlow
> (ver nota de referencia abajo): una lista gana un OBJETIVO y un juicio emite un BLOCKER TIPADO.
> El juicio es PURO (perspectiva-c): el nervio ya inyecta el rail (objetivo+pasos) cada turno, el
> LLM que VE la conversación juzga; el reflejo SOSTIENE lo determinista (fijar + freno + aplicar).

```
LISTA gana  objetivo?:String · ultima_evaluacion?:{satisfecho, blocker, razon, evidencia, ts}
BLOCKERS    none | missing_evidence | needs_user_input | run_failed | external_wait | goal_not_met_yet
tools       fijar_objetivo {objetivo} · evaluar_rail {veredicto:{satisfecho, blocker, razon, evidencia}}
            (en GLOBAL_TOOLS, universales como el resto del rail)

_aplicarVeredicto(lista, veredicto)  EL FRENO (PURO):
  satisfecho → blocker='none' · estado='completa'
  !satisfecho → EXIGE blocker tipado ≠ 'none' (si falta/inválido → 422 con la lista de blockers)
  → el rail queda con DIAGNÓSTICO FÉRTIL (qué falta, por qué), nunca un 'no' mudo (P0)
EMITE  estados.goal.evaluado · estados.goal.cumplido (si satisfecho)

REPARTO  el JUICIO = LLM (perspectiva-c, ve la conversación) · fijar/validar/aplicar = REFLEJO (determinista)
NERVIO   _composeRailSection inyecta objetivo + ultima_evaluacion + la instrucción de juzgar con blocker tipado

EL TIRO AUTOMÁTICO (ai-gateway 2.31.0 · como DeerFlow: evaluador post-run) {
  tras un turno REAL con proyecto, _executeLLM dispara _evaluarRailAuto DETACHED (fire-and-forget,
  sin await → no retrasa ni encarece la respuesta). Si el rail activo tiene objetivo (opt-in) y no
  está ya satisfecho: UNA llamada de juez (perspectiva-c, temp 0, ~400 tok, sin tools) → _parseVeredicto
  (tolera fences/texto) → aplica via estados.evaluar → el NEXT turno lee el veredicto en _composeRailSection.
  SAFETY CAPS (de DeerFlow, por conversación en _railEvalState): rail_eval_max=8 evals · rail_eval_max_no_progress=2
  (mismo blocker 2 veces seguidas → para; un blocker que CAMBIA resetea = hubo progreso). Best-effort absoluto:
  cualquier fallo se traga (nunca rompe el turno). El objetivo satisfecho detiene el ciclo.
}
```

## Referencia externa — DeerFlow 2.0 (bytedance/deer-flow · MIT) — plano de super-agent-harness

> ANALIZADO, no importado (como gstack/Paperclip). DeerFlow = "super agent harness" sobre LangGraph:
> sub-agentes + memoria + sandbox + SKILLS, batteries-included. Convergencia sorprendente con Enki
> (mismo patrón, geometría opuesta: DeerFlow CENTRALIZA en un runtime, Enki FEDERA sobre el bus).

```json
{
  "mapeo": {
    "SKILL.md + describe_skill diferido": "= cantera (buscar_skill→obtener) — mismo patrón índice-de-nombres + fetch-metadata-on-demand",
    "/skill activación de turno": "= cuenco de lentes (montar/promover)",
    "security_scanner de skill writes": "= freno anti-wipe cosecha.crear/patch",
    "sub-agentes contexto aislado": "= cúpula de agentes + agente-perspectiva-c",
    "session goal + blocker tipado + continuación": "= rail vivo + EL JUEZ (arriba) — cosechado de aquí",
    "host bash OFF por defecto": "= ejecutor (la reja nace OFF) — misma frase, misma razón",
    "memoria cross-sesión": "= propiocepción + memory",
    "npx skills / find-skills": "= feeder (skills.sh)"
  },
  "planos_cosechados": [
    "evaluador de goal con SAFETY CAPS (8 evals · para tras 2 no-progresos) → HECHO: EL TIRO AUTOMÁTICO (ai-gateway 2.31.0)"
  ],
  "planos_cosechables_pendientes": [
    "context engineering: offload de intermedios al FS + summarization por sub-tarea (Enki registra, no comprime el hilo largo)",
    "required_secrets inyectados como env por skill al activarse (credential-manager × skills)",
    "la pila de middlewares nombrada (loop_detection · tool_output_budget · dangling_tool_call recovery · read_before_write) como checklist de harness"
  ],
  "no_importable": "monolito Python/LangGraph vs JS federado sobre MQTT — se cosecha el DISEÑO, no el código"
}
```

## Topics / eventos · piezas · tests

```
estados.{crear,instanciar,anadir,avanzar,marcar,estado,listar,activar,borrar,fijar_objetivo,evaluar}.request → .response
estados.lista.creada · estados.lista.activada · estados.paso.avanzado · estados.paso.atascado
estados.objetivo.fijado · estados.goal.evaluado · estados.goal.cumplido   (EL JUEZ)
PIEZAS {
  modules/estados ({{version:modules/estados}} · reflejo 0.4.0)   la cúpula custodio (single-writer, freno entre pasos + EL JUEZ)
                                            + TOOLS del chat (crear·anadir·completar·ver·borrar·fijar_objetivo·evaluar_rail)
  modules/_shared/procesos-semilla.js       las plantillas de proceso por arquetipo (PRISMA hereda)
  ai-gateway ({{version:modules/conversacion/ai-gateway}})                      el nervio: _leerRailActivo + _composeRailSection (activa + objetivo + juez)
                                            + EL TIRO AUTOMÁTICO (_evaluarRailAuto post-turno, detached, safety caps)
}
LA MANO QUE ESCRIBE (v0.2.0)  el diseño decía "el LLM PROPONE · el reflejo SOSTIENE". v0.1 construyó el que
  SOSTIENE (custodio) y el que LEE (nervio), pero el LLM no tenía con qué PROPONER → la lista activa siempre
  vacía → el nervio no inyectaba nada (el rail nacía DORMIDO). El deploy lo destapó: estados solo se alcanzaba
  por bus (invisible desde el chat; sin puerta ui, y la inyección de eventos de bus desde fuera no se procesa).
  Cura: registrar las ops como TOOLS del chat (patrón cosecha buscar_skill/activar_skill). Cuatro verbos que el
  LLM de cualquier conversación invoca; los args llegan enriquecidos con project_id del contexto
  (ai-gateway._executeToolCall, ~L2131) → el LLM trabaja sobre la ACTIVA sin manejar UUIDs. Lazo cerrado:
  crear_lista escribe → el nervio la lee → el rumbo vive en la cúpula, no en la memoria del hilo.
UNIVERSALIDAD DE LAS TOOLS (ai-gateway 2.29.0)  verificado en vivo por el chat: una página blueprint (con
  cajones) NO recibía las tools de módulo (el LLM decía "NO TENGO crear_lista" e improvisaba con fs.write a
  /prueba-rail.json). _getTools filtra por page_id: blueprint → universales+cajones · página → GLOBAL_TOOLS+prefijos.
  Las tools de módulo quedaban fuera de TODA página real (solo entraban en el chat plano page_id:null). Cura:
  _railToolsFromRegistry() pulla las del toolsRegistry y las inyecta en las ramas blueprint; + añadidas a
  GLOBAL_TOOLS. El rail es universal por diseño → sus tools son globales como fs. Si estados no cargó → [] (no-op).
EL JUEZ (v0.4.0)  fijar_objetivo + evaluar_rail (blocker tipado) también en _railToolsFromRegistry + GLOBAL_TOOLS.
EL TIRO AUTOMÁTICO (ai-gateway 2.31.0)  post-turno, detached, safety caps — ver el bloque de arriba.
       ✓ VERIFICADO EN VIVO (1a): fijado un objetivo, un turno de PURO cotilleo ("¿mejor té o café?") disparó
       estados.goal.evaluado SOLO (blocker goal_not_met_yet) sin pedirlo — el juez se dispara post-turno sin
       intervención. Timing: ~14s tras la respuesta (turno + llamada de juez detached).
TESTS  estados__cupula (25) · ai-gateway__rail-juez-auto (10: _parseVeredicto plano/fenced/en-texto/rechaza ·
       _composeJuezInput objetivo+pasos+conv · sin-objetivo NO dispara · con-objetivo dispara+aplica+cuenta ·
       ya-satisfecho NO re-evalúa · cap 8 · no-progreso para tras 2 · cambio de blocker resetea · best-effort no propaga).
       Gate híbridos 11/0.
ESTADO ✓ VERIFICADO EN VIVO (Regalos, 3 conversaciones): crear_lista ESCRIBE → el nervio LEE en otra
       conversación sin historial ("tienes «Rumbo», 3 pendientes") → completar_paso TACHA. El rumbo vive en
       la cúpula, no en el hilo. El LLM es dueño del ciclo (crear·añadir·completar·ver·borrar). ◑ follow-up:
       wiring cuenta.crear → instanciar (hoy la capacidad basta) · verbos reorder/renombrar si hacen falta.
```

> **Trade-off vivo.** Un rail por conversación puede sonar a fricción (¿otra cosa que mantener?). Pero
> es lo contrario: el rumbo deja de vivir en la memoria frágil del hilo y pasa a la cúpula, escrito. El
> LLM no reconstruye el objetivo cada turno —lo LEE—. Mano ligera al timón porque el estado ya marca el
> norte. Y como es el patrón cuenco, no es infra nueva: es el molde probado con sustancia nueva.
