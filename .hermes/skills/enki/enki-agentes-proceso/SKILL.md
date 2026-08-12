---
name: enki-agentes-proceso
description: >-
  Diseño y operación de los agentes de proceso de Enki (el ciclo F0-F7 de un
  proyecto: identidad-negocio, esquematizar-negocio, planificar-construccion,
  construir-modulos, escribir-skills, decidir-interfaz, esquematizar-interfaz,
  construir-interfaz). El patrón en 3 pilares: el agente trabaja
  contra el RAIL de la cúpula de estados (lista de tareas, 1 en 1 por defecto,
  "a full" solo si el mandato lo pide), escribe entregables SOLO vía
  productor-modulos (fs scopeado al storage del proyecto), y el GATE del
  orquestador (proceso-negocio) verifica disco + API real + git ls-files antes
  de cerrar la fase. Úsala al revisar/depurar/modificar estos agentes o al
  diagnosticar "el agente reportó success pero el entregable no existe".
when-to-use: >-
  Revisar o modificar construir-modulos / escribir-skills / el orquestador
  proceso-negocio; diagnosticar agentes que reportan éxito sin entregable;
  operar el ciclo de PRs del repo 3enki (ramas, cherry-pick, limpieza).
tags: [enki, agentes, proceso, rail, orquestador, gate, productor, github]
---

# Agentes de proceso de Enki

## Quiénes son

- **F0** identidad-negocio · **F1/F2** esquematizar-negocio · **F3** planificar-construccion ·
  **F3b** adaptar-a-enki · **F4** construir-modulos · **F5** escribir-skills ·
  **F6** decidir-interfaz · **F6½** esquematizar-interfaz · **F7** construir-interfaz
- **F3 se replanteó en DOS mitades (2026-08, PR #167+#168)**: F3 · PLASMA
  (el LLM diseña en pseudocódigo OOP, SIN conocer Enki → `esquemas/diseno-oop.md`)
  y **F3b · ADAPTADOR X→Enki** (traduce el diseño al sistema real: rebanadas por
  tema + inventario → `esquemas/plan-construccion.md`). Detalle de las piezas
  del motor (`_buscarRebanadas`/`_inventarioModulos`, inyección
  `usa_rebanadas`/`usa_inventario`, filosofía separar PENSAR de TRADUCIR):
  skill `enki-agentes-cimiento`.
- **F4 tiene skill de cantera desde el PR #169** (antes el orquestador la
  empujaba sin existir): `construir-modulos/SKILL.md` consume el plano del
  adaptador (reutiliza·construye·adapta), UNA hoja a la vez, verifica en disco.
  Y su pipeline es MULTI-ARCHIVO desde el mismo PR: genera el par real
  `index.js` + `module.json` (`dir: "<slug>"` + `archivos`).
- F6 = skill cantera `decidir-interfaz` + script determinista `scripts/decidir-interfaz.js`
  (señales del module.json → tipo; sin LLM)
- Definición del pipeline (motor v3): `modules/agentes/registro/store/<nombre>.json` — el
  registro (`modules/agentes/registro/index.js`) los auto-descubre leyendo el storeDir, sin
  alta manual. El fuzzy lleva la `instruccion` INLINE en el JSON (no prompts separados).
  ESpejo del esquema: `arquitectura/esquema-motor-agentes/pipelines/<nombre>.json` (mismo
  contenido; el esquema del motor es la fuente de verdad de diseño).
- **La cúpula de `invoke_agent` se LEE del registro en vivo (fix 2026-08, PR #170)**: el
  enum de agent_name y la descripción salen de `pipeline.listar.request` (el mismo store/),
  NO de una lista hardcodeada. La lista vieja (4 pipelines) dejaba fuera al adaptador y a
  decidir/esquematizar/construir-interfaz — el chat NO podía invocarlos (el enum lo impide).
  Fallback a los 8 conocidos si el registro no responde. Si un pipeline nuevo "no se puede
  invocar desde el chat", comprobar que `_registrarTools` consulta el registro (o que el
  proceso se reinició: el enum se genera al ARRANCAR).
- Reglas de entregable del JEFE: viven en `modules/_shared/motor/verificador.js` (mapa
  REGLAS) — `existe` · `contenido_min` · `api_real` · `en_repo` + las custom que añada una
  fase (ej. `interfaz_decidida` de la F6). Tests en `modules/_shared/motor/test.js` con
  `mundoFalso` (DI del puerto mundo: existe/leer/enRepo).
- **`api_real` es regla de CÓDIGO — SOLO aplica a `.js`/`.mjs`/`.cjs` (fix 2026-08, PR
  #176)**: comprueba `require _shared` + `_atender` 4 args en el contenido. En un
  multi-archivo (F4: index.js + module.json) se aplicaba TAMBIÉN al module.json → "usa
  _shared: false" SIEMPRE → código válido escrito y commiteado declarado NO verificado. Un
  JSON/ts/svelte no puede pasar la regla: su presencia la cubre `existe`. Regresión: sigue
  exigente con .js sin patrón.
- **`en_repo` verifica COMMIT REAL, no staging (fix 2026-08, PR #165)**: usa
  `git log --oneline -1 -- <path>`, NO `git ls-files` (que ve el índice: `git add` sin
  identidad funcionaba y el commit fallaba → archivo en staging → ok:true con el commit
  roto). Un archivo en staging sin commit lo borra el deploy.
- **Pitfall path del entregable**: el resolver mapea `rel` contra modulesDir →
  `path: "<slug>/module.json"` (NO `modules/<slug>/module.json`, que duplicaría el prefijo
  a `modules/modules/`). Rutas `storage/...` van al storage del proyecto (sin chequeo en
  repo); el resto va a modules/.
- **Módulos ANIDADOS (pizzepos/, prisma/)**: el entregable `<slug>/module.json` debe
  resolver al dir donde el módulo REAL vive (`modules/pizzepos/pedidos/`), NO crear un
  duplicado en `modules/<slug>/`. El motor usa `_dirModuloExistente` (directo + 1 nivel de
  vertical) en `_resolverEntregable`; el orquestador usa `_buscarModulo`/`_buscarModuloRepo`
  en el gate. Verificado: pedidos → pizzepos/pedidos, sin duplicado.
- **Multi-archivo en el motor (F7 Y F4 desde el PR #169)**: entregable con `dir` + `archivos[]` →
  `_resolverEntregable` genera `paths[]` (sustituye `<slug>` y `<Slug>`), el paso 'escribir'
  los escribe todos, 'commitar' los commitea todos, y el JEFE verifica CADA path con
  veredicto `multi_archivo`. El multi-archivo NO es exclusivo de la F7: F4 (construir-modulos)
  lo usa para el par inseparable `index.js` + `module.json` — la justificación es la misma
  (el artefacto ES múltiple).
  **El reflejo acepta DOS formatos de salida del fuzzy (fix 2026-08, PR #173)**: (A)
  `{ archivos: { rel: contenido } }` (F7) y (B) objeto directo `{ index.js: '...',
  module.json: '...' }` (F4 — la instrucción se lo pide así al LLM). Antes solo entendía A:
  con B caía al else y serializaba el JSON contenedor ENTERO dentro de index.js sin escribir
  nunca module.json (el "index.js como JSON contenedor" de la bitácora). El lookup busca la
  clave por rel → sin prefijo frontend/ → sin prefijo storage/ → por BASENAME.
  **`tamano_min` del validador sobre objeto multi-archivo mide la SUMA de valores string**
  (no `Object.keys` — con 3 claves rechazaba "tamaño 3 < mínimo 200" código VÁLIDO de 4.964
  tokens). Regresión: string mide length, `{content}` mide content, objeto sin strings cuenta
  claves.
- **Smoke de un pipeline sin tocar prod**: instanciar el módulo ejecutor y SOBREESCRIBIR
  los puertos: `_pedir` (devuelve pipeline + bitácora ok), `_generar` (devuelve la salida
  del fuzzy), `_commitar` (NO hacer commit real en smoke — el paso commitar hace
  git add+commit+push REAL y ensucia la rama con commits "motor: ... generado por pipeline";
  mockearlo o limpiar después con reset --hard + force push).
  **Dos variantes según lo que quieras probar**: (a) el FLUJO del pipeline (pasos,
  escribir, JEFE) → mockear `_generar` directo basta; (b) la INYECCIÓN de contexto
  (`usa_rebanadas`/`usa_inventario` — qué task efectiva recibe el fuzzy) → NO sirve
  mockear `_generar` porque te saltas el punto de inyección: hay que pasar por
  `_publicar` capturando `llm.complete.request` y responder con
  `motor.onLlmCompleteResponse({data:{request_id, content, finish_reason:'end_turn'}})`.
  Script re-ejecutable con la variante (b) (probada con el adaptador, 2026-08):
  `scripts/smoke-pipeline-local.js` de la skill `enki-agentes-cimiento` — muestra la
  task inyectada (rebanadas base + tema, inventario, mandato) y verifica el entregable
  en /tmp, sin tocar prod ni el repo.
- **`_resolverSlug` (3 señales en orden, 2026-08)**: (1) SEÑAL 0 — el nombre ENTRE
  COMILLAS (`"adaptar-a-enki"`): el chat cita el nombre exacto, gana sobre todo; el regex
  acepta `/` y `_` y devuelve el BASENAME (`"newsletter/banco-ideas"` → `banco-ideas` —
  un proyecto nuevo NO crea verticales, los módulos viven en `modules/<slug>/` plano);
  (2) SEÑAL 0b — el campo declarado `Slug: <nombre>` de las hojas del plano del adaptador
  (mismo basename); (3) SEÑAL 1 — paréntesis ANCLADO al ID de hoja (`h-01 (config)`); un
  paréntesis suelto `(polivalente)` NUNCA debe ganar. Respaldo: token no-stopword más largo
  (con stop list ampliada; añadir palabras largas competidoras).
  **Lecciones en vivo**: la skill del adaptador se escribió en `polivalente/` (paréntesis
  suelto ganaba al nombre citado); la F4 escribió en `modules/name/` (el regex no aceptaba
  la barra de `"newsletter/banco-ideas"` y caía a señales débiles); y en
  `modules/plan-construccion/` (el token del archivo de referencia era más largo que
  `config`). La regla: subir la señal MÁS FIABLE, nunca ensanchar la heurística.
- Orquestador: `modules/proceso-negocio/index.js` — MAPA_PROCESO (evento de fase →
  skill siguiente), idempotente por `project_id::evento`, empuja vía conserje.empujon
- Sin whitelist de tools (`agent.tools` vacío) → el agente ve TODAS las tools del
  registro (`getToolsForAI()`) — no hace falta tocar el manifest para darle acceso a
  `estados.*`, `productor.*` o `fs.*`

## El patrón — 3 pilares

### 1. Rail como lista de tareas (el timón)
- **Paso 0 del mandato**: `estados.estado { project_id }` → la lista ACTIVA (pasos =
  etapas de `esquemas/plan-construccion.md`). Si no existe → `estados.crear` (tipo
  'proceso', orden 'estricto', un paso por etapa, `activar:true`).
- El paso actual (`actual`) dicta QUÉ construir — el agente no decide el orden.
- Al completar la unidad y quedar la etapa completa → `estados.marcar { lista_id, paso_id, estado:'hecho' }`.
  `marcar` funciona en listas estrictas (no valida orden); solo `avanzar` es de estricto (con frenos).
- **F4 y F5 comparten el MISMO rail** — se reutiliza, nunca se duplica.
- **Ritmo (decisión del dueño)**: 1 en 1 por defecto (una unidad por ejecución, verificada
  y marcada antes de la siguiente). "A full" (todas las pendientes en una ejecución) SOLO
  si el mandato lo pide explícitamente ("a full", "todas", "construye/escribe todas").
  Meterle muchas unidades seguidas es contraproducente: el agente se dispersa.
- Detalle del mecanismo: skill `rail-vivo`.

### 2. Productor como único writer de `modules/`
- `fs.*` del agente/chat está scopeado al storage del proyecto — escribir
  `modules/<slug>/...` con fs NO llega al sistema (lección: agente F5 reportó success
  96s y la skill no existía en ningún sitio).
- Vías reales: `productor.producir` (módulos, valida API real) · `productor.skill { nombre, markdown }`
  → 201 (skills en `cosecha/cantera/enki/`, valida frontmatter `name:` + ≥100 chars).
- Sin el **201** del productor el agente NO afirma "escrito/producido".
- Detalle: skill `enki-filesystem-tools` (scope, allowedRoot, systemMode).

### 3. Gate que verifica, no confía (orquestador)
- `proceso-negocio.completar_fase` valida ANTES de cerrar la fase:
  - entregable en disco del SISTEMA: módulo con API real (`require('../_shared/modulo-hibrido-reflejo')`
    + `_atender` 4 args + `this.name/version`) o skill en la cantera;
  - **commiteado en ~/3enki** (`git ls-files`) — el deploy `rsync --delete` borra lo no
    commiteado (lección repetida 3 veces: módulos de "b", planes-y-tiers ×2).
  - fallo → **409 FASE_INCOMPLETA** (nunca se fía del reporte del agente).
- `_verificarSistema` verifica **TODOS los slugs** del resumen (no solo el primero) —
  necesario para el modo "a full".
- `'completado'` solo se acepta si el plan está completo (cuenta en disco, no lo que reporta el LLM).

### 3b. FASE 2 — esquematizar-negocio: la articulación de Paco (ag-2026, PR #163)

Tres mandatos que el esquematizador de la F2 debe cumplir SIEMPRE (corregidos en vivo por
Paco con los proyectos panadería/f/a):

1. **BUSCA EL FOCO TÚ MISMO** — NO esperes a que el dueño señale la pieza crítica. Del flujo
   declarado en `cómo_lo_elabora`, identifica el ESLABÓN LIMITANTE (el cuello de botella:
   fermentación 24h, horno por hornada, amasado, espacio de fermentación, ventana de
   horneado, mano de obra) y EXPÁNDELO AL MÁXIMO (restricciones, alternativas de desacople:
   buffer de frío, tandas, lotes mixtos, encadenado; decisiones abiertas). El cuello de
   botella es el CORAZÓN del esquema, no una sección más. La corrección de Paco fue
   explícita: "no es cuestión de que yo le diga el foco... es cuestión de que él busque el
   foco y los cuellos de botella y los expanda al máximo".
2. **LEY DE CERO SUPUESTOS (innegociable)** — todo valor no declarado en la identidad ni
   en la task (capacidades, kilos por hornada, horas, precios, costes, consumos,
   rendimientos) se marca como PREGUNTA ABIERTA en su hueco. NUNCA se estima ni se inventa.
   Prohibido afirmar "se puede producir X kg/día" o "el horno Y es el óptimo" sin dato.
   **Un "no se puede" o un límite de capacidad NUNCA se afirma: se pregunta al dueño.**
   (Paco: "no puede tomar como valor que es imposible llegar hasta tal punto... si duda,
   que pregunte"). Las preguntas_abiertas del esquema son el GUION de la conversación.
3. **F2 ES UN CICLO, no un pase único** — pasada 1 (agente esquematizador con huecos) →
   el CHAT hace las preguntas abiertas al dueño, una a una → INVESTIGACIÓN web EXIGIDA de
   los puntos investigables (tipo de horno, consumos gas/eléctrico, casos reales de
   obradores, precios de mercado; "más vale que pegue a investigar algo a que no investigue
   nada") → replanteamiento → **pasada 2: volver a pasar el agente** con todo el contexto
   enriquecido → esquema definitivo. El ciclo termina cuando no quedan preguntas abiertas
   relevantes. División de roles: el AGENTE (turno sintético) marca huecos; el CHAT
   pregunta e investiga (el agente no conversa).

Aplicado en: skill cantera `esquematizar-negocio` (secciones 3b/3c/3d) + pipeline
`esquematizador-negocio` (instrucción del fuzzy con MANDATO DEL FOCO + LEY DE CERO
SUPUESTOS). Y en `modules/_shared/base.prompt.json` (la constitución del LLM del chat):
regla `decision_de_negocio_delega` (decisiones de negocio abiertas → invoke_agent
`esquematizador-negocio`, NO opinar en terreno pantanoso) + regla `muestrame_el_entregable`
("muéstramelo" = fs.read del storage + MOSTRAR el documento, no resumirlo).
Citas de Paco, tabla de los 5 puntos del diagnóstico y detalle de archivos:
`references/articulacion-fase2-pr163.md`.

### 4. FASE 6 — decidir-interfaz (el gate de SUPERFICIE)
- El ciclo por pieza ahora es: construir (F4) → skill (F5) → **interfaz (F6)** → siguiente hoja.
  El mapa encadena `negocio.skills` → `decidir-interfaz` → `negocio.interfaz` → `construir-modulos`.
- La decisión NO la toma el LLM: la toma el script `decidir-interfaz.js` por SEÑALES del
  module.json (tools lectura/escritura, eventos, rol). El LLM solo razona el contexto que el
  script no ve; si contradice al script, el ROL gana y se documenta.
- Gate de sistema: verifica en disco que el module.json tiene `ui_handlers` con
  `type` ∈ {workspace_module, chat_tool, inline_render, system_panel} + `zone` canónica,
  **o** `ui_decision.necesita === false` documentado (módulo sin interfaz). Sin eso → 409.
- El gate resuelve módulos ANIDADOS (`modules/pizzepos/<slug>/`) — `_buscarModulo`
  busca directo y luego 1 nivel de vertical (lección: pedidos/productos viven en pizzepos/).
- Los 4 tipos canónicos ya existían en frontend.contract + frontend.validate.js, pero NO
  había criterio que decidiera cuándo/cuál — esa era la FASE 6.

### 5. FASE 6½ — esquematizar-interfaz (la SPEC ANTES de construir)
- **Lección GRAVE en vivo (corrección de Paco)**: intentamos saltar de F6 (decidir el tipo)
  directo a F7 (construir el panel). Error: el generador habría improvisado el panel sin
  anatomía. El esquematizador se pasa a la IDEA de "la interfaz del módulo X de tipo Y" —
  prisma de 5 huecos (IDENTIDAD · RESTRICCIONES · CONTRATO · NO-OBJETIVOS ·
  PREGUNTAS_ABIERTAS) ronda a ronda hasta seco + disección con FORMA → la SPEC.
- El ciclo por pieza: F4 construir → F5 skill → F6 decidir → **F6½ espec** → F7 construir →
  siguiente hoja. El mapa: `negocio.interfaz` → `esquematizar-interfaz` →
  `negocio.interfaz_esquematizada` → `construir-interfaz` → `negocio.interfaz_construida`.
- **Patrón de rutas del repo (corrección de Paco)**: UN entregable = UN path (como
  `esquema.md` y `plan-construccion.md`). La SPEC de F6½ es UN archivo:
  `storage/esquemas/interfaz-<slug>.md` con prisma + disección + esquema maestro embebidos.
  NO directorios de pasadas (eso fue multi-archivo de más — me detuvo: "revisa, ya tenemos
  un patrón").
- Gate de F6½: verifica `esquemas/` tiene `interfaz-<slug>.md` (prefijo + .md). OJO: el dir
  del gate puede llevar `<slug>` y hay que sustituirlo con el slug del resumen antes de
  `fs.list` (bug corregido — listaba la carpeta literal `<slug>`).

### 6. FASE 7 — construir-interfaz (la ÚNICA excepción multi-archivo)
- Consume la SPEC de F6½ (`esquemas/interfaz-<slug>.md`) pieza por pieza; si no existe → NO
  construye (devuelve `{"error":"falta_espec_fase_65"}`). Cada vista/operación/dato/evento
  de la spec → su archivo; nada fuera de la spec.
- **Construye CONFORME a los estándares** (no inventa estilo): skill `ui-store-mqtt` (store),
  caso vivo `frontend/src/lib/modules/contenido/` (el trío), frontend.contract (zonas),
  CSS del frame. La spec manda sobre el CONTENIDO; el estándar manda sobre la FORMA.
- **Excepción documentada al patrón UN path**: el trío del frontend ES 3-4 archivos físicos
  inseparables (manifest.json + index.ts + <Slug>Panel.svelte + store) — el loader
  `import.meta.glob` los necesita así. Pipeline declara `dir` + `archivos[]` y el motor lo
  soporta con veredicto `multi_archivo` del JEFE. Cualquier fase futura multi-archivo debe
  justificar la excepción igual (el artefacto ES múltiple, no por comodidad).
- Naming del Panel: `<Slug>Panel.svelte` = primera letra del slug en MAYÚSCULA + el resto
  IGUAL (device-health → Device-healthPanel.svelte). Resolver Y verificador usan el mismo
  naming (si divergen, el JEFE nunca encuentra el archivo).
- Gate de F7: el trío existe en `frontend/src/lib/modules/<slug>/` + commiteado en el repo
  (git ls-files). Excepción legítima: `ui_decision.necesita=false` → fase aceptada sin
  archivos.

Detalle completo de rutas, casos testigo y errores corregidos: `references/fases-interfaz-f6-f7.md`.

## Diseñar una fase NUEVA del proceso (receta validada en F6)

Cuando Paco dice "la fase sería X" (o "¿tenemos material para la skill o el agente?"), el
orden que valida es DATOS → PATRÓN → PERSISTIR → CONSTRUIR. No al revés:

1. **Medir el repo primero** (nunca opinión): cuenta los módulos afectados con un script
   (ej. F6: 145 módulos, 400 handlers, 177 SIN_TIPO, 2 de 4 tipos en uso). Los números son
   el argumento.
2. **Coger 2 módulos del mismo tipo declarado** y pasarles el **esquematizador** con una
   pregunta afilada ("¿qué interfaz nos beneficia?"). El prisma de 5 huecos + disección
   sobre CADA uno. El contraste fino (fuente de verdad vs proyector; custodio vs observador)
   es lo que valida el patrón.
3. **Persistir los casos testigo como references** de la skill (pasadas del prisma + datos
   crudos) ANTES de escribir más código. "Persiste datos y seguimos" es el mandato.
4. **Solo entonces construir**: skill en cantera (patrón + script determinista sin LLM) →
   hook en proceso-negocio (MAPA_PROCESO + gate) → pipeline del motor (store/ + pipelines/
   espejo) → regla custom del JEFE + tests → PR.
5. Los "Para" de Paco marcan el punto donde te saltaste un paso (ej. construir antes de
   validar el patrón con casos reales) — para, re-encuadra, y sigue el orden.
6. **La secuencia F6→F6½→F7 es el orden sagrado de la interfaz**: decidir el tipo (F6),
   esquematizar la interfaz concreta → SPEC (F6½), construir consumiendo la spec (F7).
   NUNCA F6→F7 directo — es el error grave corregido en vivo. Y al construir, usa los
   estándares existentes (ui-store-mqtt, caso contenido, frontend.contract) — no inventes
   estilo.

El patrón de decisión F6 (para extender/revisar): señales del module.json (tools lectura/
escritura, eventos, rol) → puente interno/reflejo pasivo/observador de bus = SIN interfaz;
dominio con CRUD = workspace_module; gestión/sistema = system_panel; operación puntual del
chat = chat_tool; contenido en el chat = inline_render. El script decide, el LLM razona el
contexto de rol, y si contradice al script, el ROL gana (documentado).

## Lecciones en vivo

- **RESPALDAR ANTES DE MODIFICAR (directiva de Paco, ag-2026)**: cuando vayas a tocar una
  skill de cantera o un pipeline del registro, copia el estado ACTUAL a un directorio FUERA
  de la conversación y del repo, documentado, antes de editar — por si los cambios no son
  factibles se vuelve al anterior sin perder nada. Patrón validado:
  `/home/admin/hermes-backups/<fecha>-<tema>/` con `skills/` + `pipelines/` + `esquemas/`
  (trabajo real del proyecto como punto de comparación) + `MANIFIESTO.md` (qué es, de
  cuándo, SHA de main, comandos `cp` exactos para volver atrás) + `main-sha.txt`. El
  MANIFIESTO es la clave: documenta dónde está y cómo restaurar — "que sepas dónde está y
  no nos liemos". Este backup NO se toca; es el punto de retorno del experimento.
- **El reajuste de identidad (F0) YA es merge-preservante en el código** — no "arreglarlo":
  `project-profile/index.js` hace `{ ...perfil.identidad, ...(input.identidad||{}) }` en el
  update (conserva lo declarado, cambia solo lo nuevo). Un `.bak` en `.versions/` es la foto
  previa NORMAL del snapshot, NO una sobrescritura del trabajo. "Reajusta la identidad que no
  perdamos lo andado" funciona sin tocar nada.
- **Diagnóstico multi-punto: aplicar TODOS los puntos, no solo el primero** (corrección de
  Paco, ag-2026: "te hablé del punto 1 pero quedaron 4, ¿los has tenido en cuenta?"): cuando
  el usuario articula un diagnóstico en N puntos (ej. los 5 patrones de su articulación),
  CADA punto exige su cambio o su cierre documentado. Al terminar, presentar la tabla
  punto-por-punto (✅ aplicado / ya estaba en el código / absorbido por otro punto) para que
  él valide — un diagnóstico dejado a medias se lee como no escuchado.
- **"success" del agente ≠ entregable**: pasó 2 veces (módulo a medias sin `_atender`
  4 args; skill inexistente). El gate es la única verdad; verifica siempre en disco y git.
- **El motor v3 SÍ commitea (cambio 2026-08, PR #165)** — ya no es solo Hermes: el paso
  'commitar' del pipeline hace git add+commit+push con identidad EXPLÍCITA
  (`-c user.name="Enki Motor" -c user.email="motor@enki.local"`), porque www-data no tiene
  user.name/email configurados (config local del repo solo tenía safe.directory) y el commit
  fallaba con "Author identity unknown". El commit del motor deja basura "verificado" cuando
  el JEFE se equivoca — limpiar con `git rm --cached` (los archivos de www-data no se pueden
  borrar sin sudo) + el deploy `rsync --delete` los elimina de prod. El borrado FÍSICO de
  www-data siempre requiere sudo del usuario.
- **El chat NO miente cuando dice "timeout" — el pipeline se corta por el timeout del
  gateway (fix 2026-08, PR #171)**: `invoke_agent` tenía timeout FIJO de 150s; pipelines
  pesados (adaptar-a-enki: 181s, 21K tokens de salida; construir-modulos: 32K) lo superaban
  → el chat reportaba "timeout, no escribió nada" con el agente SIGUIENDO vivo y la bitácora
  verificada después. El fix: timeout derivado del PRESUPUESTO del pipeline
  (`generacion_timeout_ms × generaciones_por_paso + 30s` margen; fallback 300s) consultado
  en vivo. Y el `in 124` de los reintentos NO es contexto perdido: es cache del provider
  (prompt idéntico → cache_read). **Cuando el chat reporta timeout, la BITÁCORA es la
  verdad**: si está `verificada`, el entregable existe aunque el chat no lo viera.
- El chat/agente no ve `modules/` del sistema → sus "no se construyó nada" no son prueba
  de ausencia: comprueba con fs directo (el gate/local) antes de concluir.
- El límite de iteraciones del chat (15) se arregló a 500 (`max_tool_iterations`) — si un
  agente se corta "a mitad", revisar si el fix está deployeado en prod (repo vs prod diff).

Detalle completo de la cadena de 10 eslabones de la F4 en vivo (síntomas, causas raíz,
fixes, patrones de diagnóstico, la traducción event-driven del adaptador):
`references/cadena-f4-eslabones-2026-08.md`.

## Operar el repo 3enki (git)

- Flujo: rama `hermes/<feature>` → commit → push → PR (base main) → merge **squash** →
  **borrar rama local Y remota** (rama viva → GitHub re-propone PR duplicado, caso #122).
- **Tras squash, la rama original muestra "1 commit no mergeado" — normal**. Usa
  `git cherry main <rama>`: `-` = ya en main por contenido; `+` = realmente pendiente (hazle PR).
- **PR de rama vieja con base atrasada → diff gigante** (ej. 117K líneas): NO crear PR
  directo; cherry-pick del/los commit(s) sobre main en rama nueva → PR limpio.
- **Al resolver conflictos (modify/delete, cherry-pick)**: revisa el diff COMPLETO
  (`git diff main --stat` + contenido). El bloque de conflicto puede incluir secciones de
  main que una resolución descuidada borra (lección: se perdían `## Entradas`/`## Formas`
  de un SKILL.md al resolver un modify/delete).
- **PR superado por evolución**: si main reescribió lo que el PR elimina, comprueba
  `git log base..main -- <archivo>` antes de mergear; a veces lo correcto es cerrar sin
  merge con comentario del motivo (PR #13 de uiwebv2/piel-del-sistema).
- **Ramas remotas huérfanas**: limpiar con `git push origin --delete` (iterar `git branch -r`
  excepto main). Con 0 PRs abiertos todas son candidatas; si hay dudas, `git cherry` antes
  de borrar para no perder trabajo real.
