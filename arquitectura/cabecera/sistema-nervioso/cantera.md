---
id: sistema-nervioso/cantera
dominio: aprendizaje
resumen: La abundancia alojada: cosecha (importar/promover/crear/patch), planificador, feeder (skills.sh), conserje-cantera, escalera de determinismo, cantera semántica (Turso).
fuentes:
  - modules/cosecha/**
  - modules/planificador/**
  - modules/feeder/**
  - modules/cantera-semantica/**
verificado: 2026-07-06
---

# CANTERA — la abundancia alojada (hermano ADITIVO del cuenco · vivo en main, 2026-07-01)

> La *Teoría del Órgano* prometió cosechar skills; esto es la realidad construida. El CUENCO
> (lentes-diseno) sostiene las lentes ACTIVAS (inyectadas por turno). La CANTERA (cosecha) sostiene
> TODA la abundancia — skills de cualquier fuente (destilador, ECC/VoltAgent, un .md suelto) —
> buscable pero NO inyectada. La cúpula queda VIVA porque la cantera absorbe lo demás. **Sumar, no
> restar:** la abundancia bien alojada no es ruido, es MUNICIÓN (el conserje ofrece; planificador
> ensambla). Módulos: `modules/cosecha/` ({{version:modules/cosecha}}) · `modules/planificador/` ({{version:modules/planificador}}) · cuenco {{version:modules/lentes-diseno}}.

## El órgano cosecha/CANTERA (reflejo puro)

```json
{
  "esquema": "cantera-v1",
  "vive_en": "DOS raíces — SEMILLA cantera/<fuente>/<skill>/SKILL.md (código, versionada) +
              CRECIDO data/cosecha/cantera/ (en caliente, persistente). Lo crecido gana en colisión.",
  "skill": { "nombre", "descripcion", "fuente", "dominio", "tags[]", "lente_dominio?", "lente_tarea?", "contenido" },
  "puertas": {
    "buscar":   "{query?,dominio?,tarea?,limite?} → catálogo BARATO rankeado (sin contenido) — evita la dilución de selección",
    "obtener":  "{nombres[]} → el SKILL.md COMPLETO (lo caro, bajo demanda)",
    "listar · stats": "catálogo entero · recuento por fuente",
    "importar": "{fuente, skills[]} → escribe cada SKILL.md en data/ y re-indexa (crece en caliente). Idempotente por nombre",
    "olvidar":  "{nombre} → borra la skill CRECIDA y re-indexa"
  }
}
```

```
MANDATO semilla_intocable : lo curado en el código es la base; olvidar/desmontar operan SOLO sobre
                            lo crecido (data/). Pedir olvidar una semilla → 409 (no vive en data/, por construcción).
MANDATO hogar_declarado   : una skill puede decir dónde vivir como lente (lente_dominio + lente_tarea
                            en su frontmatter) → promover lo defaultea; el conserje la ofrece para ACTIVAR.
NERVIO destilador→cantera : onSkillDestilada absorbe `aprendizaje.skill.creada` (fire-and-forget). El
                            destilador enriquece el evento con contenido_md+descripcion → la cantera aloja
                            SIN re-consultar cúpulas. Lo que el runtime aprende queda buscable/ofrecible.
```

## Ciclo de vida — sumar y poder retirar, en caliente

```
importar ↔ olvidar                       (cantera)
promover → lentes.montar ↔ desmontar     (cuenco)

promover (cosecha 0.6.0)  el PUENTE cantera→cuenco: lee la skill y la entrega a lentes.montar para que
                          la MONTE como lente activa del dominio. Defaultea dominio/tarea desde el HOGAR
                          de la skill (basta `cosecha.promover:<nombre>`). Propaga el veredicto del cuenco.
montar (cuenco 2.3.0)     PUERTA DE ESCRITURA del cuenco (mismo patrón semilla+crecido): _descubrirPacks
                          escanea packs/ (código) + data/lentes-diseno/packs/ (crecido) y MERGEA en el pack
                          semilla del dominio (añade lentes + extiende rutas; nunca pisa motor/quimico).
                          GUARDA no-colgantes: dominio sin pack (no bebido por página) → 409.
desmontar                 reversa de montar: quita la lente crecida del overlay; la semilla no se desmonta (404).
NO TOCA ai-gateway        el nervio de lentes ya inyecta lo que el pack sirve para el lente_default de la
                          página; promover solo mete la skill en el pack → se inyecta sin cambiar el nervio.
```

## conserje-cantera — la 3ª facultad (ofrece ACTIVAR)

```
INTERRUPTOR 'conserje-cantera' (grupo aprendizaje, OFF por defecto, independiente de brecha/rutas)
Tras un paso, mina la cosecha por la última capacidad tocada (cosecha.buscar) y ofrece la skill pertinente:
  · si la skill declara HOGAR (lente_dominio) → accion_sugerida `cosecha.promover:<nombre>` ("¿la activamos?")
  · si no                                     → `cosecha.obtener:<nombre>` ("¿la leemos?")
Demand-driven (sin skill pertinente, no spamea) · cooldown · prioridad menor que brecha/rutas.
El nervio (ai-gateway) surfacea el empujón en el chat una vez, natural.
```

## FUERA = PULL (por qué NO hay 4ª facultad proactiva) — simplificación v0.7.0

> Hubo una 4ª facultad (conserje-fuera: buscar FUERA y trae+activa auto). Se RETIRÓ. La
> lección, verificada en vivo: buscar proactivamente fuera obliga a ADIVINAR la query pública
> desde el nombre de capacidad interno — un mapa cap→query calibrado a mano contra un catálogo
> que se mueve. Frágil por construcción (probado: `diseno`→0, `marca`→basura; solo "funcionaba"
> con `design` tecleado a mano). El valor de find-skills es que quien tiene la INTENCIÓN la escribe.

```
REGLA  la intención la pone quien la tiene. Fuera se queda como PULL, no PUSH.
  FUERA (pull)      tools de chat buscar_fuera/traer_skill (feeder) — el LLM, que YA conoce la
                   tarea del turno (nervio: vista_frontend + lente_default), llama con palabras
                   REALES ("menu design" → 614K), sin traducción y con mejores resultados.
  PROACTIVO (push) solo DENTRO: conserje-cantera ofrece de la cantera PROPIA (indexada en
                   español, sin adivinar, sin red por tick). Robusto y barato.
GANANCIA  2 capas con propósito nítido (exponer find-skills en el chat · skill→lente viva) en
          vez de 3 con una de pegamento. Menos que mantener, sin autonomía de bajar código a
          ciegas, y mejor resultado (pull casa con el catálogo; push adivinaba mal).
  la "búsqueda para la tarea entre manos" NO se pierde: la hace el LLM (que entiende la tarea)
  llamando buscar_fuera cuando toca, no un reflejo con un mapa fijo.
```

## planificador — el ensamblador de proyecto GOAL-DRIVEN (gemelo del conserje-cantera)

> NOMBRE: se llamó `find-skills` un rato; renombrado a `planificador` para no chocar con el
> `find-skills` PÚBLICO de Vercel (github.com/vercel-labs/skills), que es OTRA cosa —un descubridor+
> instalador del ecosistema público. El nuestro ensambla proyectos sobre la cantera INTERNA. Capas
> distintas; el de Vercel entra como FUENTE por el feeder (abajo), no como copia.
>
> El conserje ofrece 1 skill por lo que TOCASTE (reactivo). planificador ensambla el SET por lo que
> QUIERES (proactivo). Declaras un proyecto → descompone → busca en la cantera → propone/ensambla el set.
> blueprint-agentico. Cero infra nueva: reutiliza cosecha.buscar/listar/promover. `modules/planificador/`.

```
ESPINAZO (6 fases)  CONTRATO → PENSAR·1 descomponer → LEER cosecha.buscar → PENSAR·2 elegir/HUECO
                    → PENSAR·3 criticar (loop-until-dry) → VALIDAR (reflejo) → GUARDAR promover → EMITIR
REPARTO   LLM (blueprint): descomponer·elegir·criticar   ·   REFLEJO (index): _validar·_ensamblar

FRENO HÍBRIDO de completitud (el corazón — cada mitad su naturaleza):
  REFLEJO (planificador.validar) — la LEY computable:
    no_silent_drops (ninguna capacidad se cae callada) · no_alucinadas (la skill EXISTE, contra
    cosecha.listar) · cobertura = |capacidades con skill| / |capacidades|
  LLM (criticar) — lo IRREDUCIBLE: "¿qué capacidad NECESARIA no está nombrada?"
  → el reflejo no juzga si la descomposición fue completa (fuzzy); el LLM no es de fiar para "existe"
    (determinista). MANDATO P0: el plan nace FÉRTIL — nombra los HUECOS, no los esconde. Un hueco es
    QUÉ COSECHAR después → planificador hace crecer la cantera con propósito (cierra el lazo).
GRADUALIDAD  modo proponer por defecto (no promueve) → ensamblar cuando se confíe (como el Portal read→write).
```

## feeder — el alimentador público (skills.sh → cantera)

> El destilador SELLA patrones internos → cantera; el feeder TRAE del ecosistema PÚBLICO
> (skills.sh / `npx skills`, vercel-labs/agent-skills, anthropics/skills) → cantera. Reflejo puro.
> `modules/feeder/`. Adopta el `find-skills` de Vercel como FUENTE, no como copia — los dos
> "find-skills" son un PIPELINE, no rivales. Ver propuestas/feeder-ecosistema.md.

```
PIPELINE  skills.sh → npx skills add → SKILL.md → feeder INGIERE → cosecha.importar → cantera
          → conserje ofrece → promover → lente viva → planificador ensambla proyectos
PUERTAS   feeder.ingerir {fuente, md, nombre?}  NÚCLEO DETERMINISTA — cualquier SKILL.md crudo →
                                                cosecha.importar (parsea frontmatter+hogar). Testeable.
          feeder.instalar {paquete, fuente?}    npx skills add → lee SKILL.md → ingiere. Degradeable.
          feeder.buscar   {query}               npx skills find → salida cruda. Degradeable.
MANDATO fail-honest  el CLI externo ausente/red caída → 503 UPSTREAM_UNREACHABLE {degradado:true},
                     NUNCA falso éxito. El núcleo (ingerir) testeable; los wrappers npx en vivo.
```

## La superficie — tools del chat (el grifo, v0.7.0)

> Toda la cantera era fontanería de fondo (solo bus). Ahora cosecha registra 2 TOOLS que el
> LLM de CUALQUIER conversación invoca — el grifo por el que el comerciante la TOCA:
> `buscar_skill {query}` (busca en la cantera — realiza el "¿cómo hago X?" de find-skills
> sobre el catálogo interno) y `activar_skill {nombre}` (promueve a lente viva, con confirmación).
> "busca una skill para X" / "quiero construir X" → el asistente busca y activa, en el chat.
>
> Y el feeder añade el grifo de FUERA (v0.2.0): `buscar_fuera {query}` (descubre en skills.sh
> vía `npx skills find`) + `traer_skill {paquete}` (`npx skills add owner/repo@skill` → cantera,
> con confirmación). Así el pipeline entero se opera desde el chat: "busca fuera una skill de X"
> → ver los installs → "tráete la de Y" → queda en la cantera → "actívala". buscar_skill mira
> DENTRO; buscar_fuera mira FUERA. (Fuera es PULL a propósito — ver "FUERA = PULL": la búsqueda
> externa la dispara el LLM con palabras reales cuando conoce la tarea, no un reflejo que adivina.)

## El lazo entero + topics

```
                          ┌─ destilador (patrones internos, SELLA) ─┐
aprende ──────────────────┤                                         ├──→ aloja (cantera)
                          └─ feeder (ecosistema público, TRAE) ─────┘
  → OFRECE ACTIVAR (conserje-cantera) → lente viva (cuenco)
  ↘ ENSAMBLA por proyecto (planificador) ↗
EVENTOS {
  cosecha.{buscar,obtener,listar,stats,importar,promover,olvidar,traer,crear,patch}.request → .response
  aprendizaje.skill.creada                     (destilador → cantera absorbe; lleva contenido_md)
  feeder.{ingerir,instalar,buscar}.request → .response   (ecosistema público → cantera; degradeable)
  lentes.{montar,desmontar}.request → .response  (cuenco crecible + reversible)
  conserje.empujon {tipo:'skill', accion_sugerida:'cosecha.promover|obtener:<n>'}
  planificador.{validar,ensamblar}.request → .response · planificador.plan.listo  (huecos = demanda)
}
INSTANCIAS  semilla: deep-research·agentic-engineering (ECC) · verificar-en-vivo (enki) ·
            vercel-carta-craft (Vercel Web Interface Guidelines destiladas al oficio de CARTA,
            hogar diseño/tema — VERIFICADA en vivo: promovida, la lente entró en un turno real de
            carta-digital y moldeó el diseño con tabular-nums/APCA/nbsp; round-trip reversible sin residuo).
TESTS  cosecha__index · cosecha__promover · cosecha__destilador-bridge · conserje__cantera ·
       lentes-diseno__montar · planificador__index · feeder__index. Gate híbridos 11/0.
```

> **Trade-off vivo.** planificador sobre ~4 skills hoy es un juguete; el mecanismo se construye ahora y
> PAGA a medida que la cantera crece. La semántica del catálogo es determinista (cero embeddings); la
> descomposición LLM tapa ese hueco por ahora — el upgrade HNSW queda para cuando el catálogo lo pida.

## Cantera ESCRIBIBLE + la ESCALERA DE DETERMINISMO contra el falso éxito (cosecha 0.9.0)

> El LLM MIENTE cuando el resultado se lo inventa él: dijo "web-scraping instalada" con la cantera
> intacta. La cura no es un mandato ("verifica") — falla, el LLM se fía de su propio historial
> envenenado. La cura es que el REFLEJO compute el desenlace y lo devuelva; el LLM solo lo repite.

```json
{
  "esquema": "escalera-determinismo-honestidad",
  "peldaños": [
    { "n": 1, "táctica": "MANDATO en el prompt ('verifica lo que instalaste')", "fuerza": "blanda — FALLA (el LLM se fía de su historia)" },
    { "n": 2, "táctica": "GROUNDING — inyectar el inventario REAL (cosecha.listar) en el system prompt", "fuerza": "media — el LLM ve la verdad, aún puede desviarse" },
    { "n": 3, "táctica": "OUTCOME COMPUTADO — el reflejo hace el trayecto y devuelve el veredicto", "fuerza": "dura — el falso éxito es IMPOSIBLE por construcción (la reja/rail)" }
  ],
  "regla": "el LLM no afirma un HECHO que no computó; el reflejo se lo entrega ya juzgado.",
  "gemelo": "= la propiocepción (el LLM solo afirma lo que el reflejo registró) = el ejecutor (el veredicto del guard lo pone el reflejo, no la prosa)."
}
```

```
CLASE CosechaModule (ampliación) {              // la cantera CRECIBLE en-turno + el trayecto determinista
  _traer({ query? | paquete }):                 // PELDAÑO 3 — el reflejo hace el viaje y JUZGA
    hallados ← paquete ? [paquete] : feeder.buscar(query).candidatos.top_installs
    feeder.instalar(cada hallado)               // npx skills add → SKILL.md → cosecha.importar
    RETORNA { ok: this._skills.has(nombre_esperado), traidas | motivo }   // VERIFICA contra el store REAL
    // el LLM recibe {ok:false} si no entró — no puede cantar éxito

  _crear({ nombre, contenido, descripcion, dominio? }):   // create-only, anti-wipe
    SI this._skills.has(nombre): RETORNA 409     // no pisa; para mejorar → patch
    valida frontmatter (_serializar→_parse) ; delega _importar(fuente:'agente')
    RETORNA { creada } | 400 (nombre inválido)

  _patch({ nombre, old_string, new_string, replace_all? }):   // read-before-write (Hermes skill_manage)
    SI !existe: 404 · SI semilla (no vive en data/): 409 (intocable)
    SI old ∉ raw: 404 · SI no-único ∧ !replace_all: 409
    aplica → SI resultado pierde name/description ∨ renombra: 422 ROLLBACK (no persiste)
    SINO escribe SKILL.md + re-indexa ; RETORNA { patcheada, reemplazos }
}
```

TESTS  cosecha__escribir (11: crear/409/400 · patch old→new/404/no-único/rollback-422/no-renombra/semilla-409).
VERIFICADO EN VIVO (Pacoo)  crear·patch·FRENO-422·409·404·olvidar — limpio, sin residuo.

## Cantera SEMÁNTICA (Turso) — buscar por SIGNIFICADO (modules/cantera-semantica · spike vivo 2026-07-06)

> El upgrade que esta cabecera aplaza en cinco sitios ("semántica DETERMINISTA por prefijo · cero
> embeddings · HNSW para después"): buscar skills por lo que SIGNIFICAN, no por la palabra exacta.
> La pieza que faltaba era un índice vectorial; Turso (SQLite reescrito en Rust) lo trae NATIVO.

```json
{
  "esquema": "cantera-semantica-v1",
  "que": "índice vectorial de la cantera sobre Turso — complementa el buscar por palabras de cosecha, no lo reemplaza",
  "motor": "@tursodatabase/database (SQLite compatible, búsqueda vectorial nativa): vector32() guarda el embedding · vector_distance_cos ordena por distancia coseno",
  "reparto": "el REFLEJO custodia el índice (indexar/buscar/reindexar, determinista) · el EMBEDDING (lo fuzzy) lo pide al ai-gateway (embedding.generate.request → vector, providers gemini/openai)",
  "puertas": {
    "cantera.indexar.request":          "{nombre, dominio, texto} → embed(texto) → upsert en el índice",
    "cantera.buscar_semantica.request": "{query, dominio?, limite?} → embed(query) → orden por distancia coseno. Filtro opcional por dominio",
    "cantera.reindexar.request":        "trae todas las skills (cosecha.listar) y las indexa por su descripción",
    "cantera.semantica_estado.request": "{activo, turso_disponible, total_indexadas, dims}"
  },
  "gate_y_degradacion": {
    "NACE OFF":  "interruptor 'cantera-semantica' (grupo sistema, default OFF). Turso es BETA + dependencia OPCIONAL → encender el índice es decisión consciente",
    "DEGRADA":   "sin Turso instalado · interruptor OFF · sin embeddings → 503 {degradado, motivo}. El caller cae al buscar por PALABRAS (cosecha.buscar). Fail-honest, como el feeder — nunca finge un resultado",
    "NO TOCA":   "los datos vivos: índice aparte en data/cantera-semantica/index.db (system). La cantera keyword sigue intacta"
  }
}
```

```
VERIFICADO (spike real, este entorno)  @tursodatabase/database instala y corre en Node 22 (require CJS OK).
  vector32() + vector_distance_cos() rankean por significado: query 'coste' → skills de escandallo primero
  (distancia 0.0003 / 0.0008) vs la de diseño lejísimos (0.86). Test: cantera-semantica__index (10/10, Turso
  in-memory real + embedder stub determinista: rankea · filtro dominio · upsert no duplica · índice vacío 200 ·
  reindexar desde cosecha · las 3 degradaciones honestas · estado).
DETALLE DE CAMPO  Turso BETA: LIMIT no acepta parámetro (se inlinea el entero saneado). Pin ^0.6.1 (0.1.x
  daba 'Invalid vector type' en vector_distance_cos — versión vieja). optionalDependency: si no instala en una
  plataforma, el módulo degrada, no rompe.
CABLEADO ✓ (cosecha 0.10.0)  buscar_skill FUSIONA palabras + semántica por reciprocal-rank fusion (no delega ni
  reemplaza — FUNDE, lección de gbrain/gstack: vector-solo pierde, +31.4 P@5) + source-tier boost semilla +
  auto-index fire-and-forget al importar/crear (lote ≤20). Degrada honesto a palabras si el índice está OFF/vacío.
  Ver 'Referencia externa — gstack + gbrain', PLANO 1. SIGUIENTE: el conserje ofrece encenderlo · el GRAFO tipado
  alimenta el ranking (aristas lentes co-uso, +31.4 en gbrain) · proveedor de embeddings (gemini/openai; deepseek
  NO embebe) — hasta entonces la fusión corre por palabras y la semántica queda a la espera del embed.
```

> **Trade-off vivo — por qué un spike y no el motor de todo.** Turso está en BETA y Enki corre pizzerías VIVAS;
> cambiar el SQLite de los datos reales por una beta es riesgo que no toca. Pero la búsqueda semántica es un
> subsistema NUEVO y no crítico (la cantera), y el coste de vuelta atrás es cero (índice aparte, degrada a
> keyword). Por eso Turso entra AQUÍ primero: da el upgrade HNSW que la cabecera promete, sin arriesgar un byte
> del POS. Si la beta madura, ya está probado para lo demás (concurrencia MVCC, CDC→bus, cifrado, réplicas).
