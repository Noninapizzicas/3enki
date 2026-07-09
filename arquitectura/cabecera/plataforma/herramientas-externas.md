---
id: plataforma/herramientas-externas
dominio: plataforma
resumen: Rust nativo en el VPS (fastCRW) · Python en Docker (contenedor universal: SearXNG, Headroom) · Crawl4RS en Docker (Chromium contenido) · enganche al ejecutor por config.
fuentes:
  - deployment/fastcrw/**
  - deployment/python-tools/**
  - deployment/crawl4rs/**
  - modules/fastcrw/**
  - modules/crawl4rs/**
  - modules/_shared/error-fertil.js
  - modules/cosecha/cantera/enki/herramientas-web/**
  - modules/cosecha/cantera/enki/precio-ingredientes-web/**
verificado: 2026-07-09
---

# HERRAMIENTAS EXTERNAS — Rust nativo en el VPS · Python en Docker (fastCRW · Headroom · el contenedor Python universal)

> Cada lenguaje en su sitio. Un binario Rust estático es una pieza → más limpio NATIVO en el VPS
> (cargo + systemd) que envuelto en contenedor. Lo Python (dependencias sucias, modelos ML,
> servicios externos) va AISLADO en Docker. **El contenedor Python es el hogar de TODA herramienta
> Python que quepa** — no un contenedor por herramienta, sino un lugar Python que crece. La reja del
> ejecutor ya toma la imagen por config (`contenedor_imagen`), así que darle Python a un agente = un
> ajuste, no código. Vivo desde 2026-07-06 (rama fastcrw-information-search).

## El principio (JSON)

```json
{
  "esquema": "herramientas-externas-v1",
  "reparto_por_naturaleza": {
    "rust_binario_estatico": "NATIVO en el VPS (cargo install + systemd). Una pieza, sin runtime que ensucie. Ej: crw-server (fastCRW).",
    "python_todo": "DOCKER aislado. Dependencias sucias / modelos ML / servicios → no ensucian el VPS. HOGAR ÚNICO: deployment/python-tools/ (una casa Python que crece, NO un contenedor por herramienta)."
  },
  "hogar_python_unico": "deployment/python-tools/ — imagen base enki-python-tools (para el ejecutor) + inquilinos como servicios (SearXNG, Headroom). Añadir una tool Python = crecer aquí, no montar un stack nuevo.",
  "ejecutor_sin_codigo": "la reja ya toma config.contenedor_imagen (default node:20-slim). Python aislado para un agente = poner 'enki-python-tools' en config, cero código (la reja OFF/audit/efímero sigue).",
  "regla": "si una herramienta es Python y CABE en el contenedor, va ahí (no se instala suelta en el VPS ni se crea otro Docker). El VPS queda lean; lo Python, contenido."
}
```

## El contenedor Python universal — `deployment/python-tools/`

```
IMAGEN BASE  Dockerfile → python:3.12-slim + requests·beautifulsoup4·lxml·crw (SDK fastCRW).
             Mínimo a propósito (más fácil crecer que podar). AÑADIR una tool = añadir su lib aquí.
ENGANCHE AL EJECUTOR (cero código) {
  el ejecutor ya resuelve this.contenedorImagen = config.contenedor_imagen || 'node:20-slim'.
  Para correr Python aislado: modules/ejecutor/module.json → config.contenedor_imagen: "enki-python-tools".
  ejecutor.ejecutar {aislamiento:'contenedor'} corre el cmd en la imagen Python con la reja COMPLETA
  (interruptor 'ejecutor' OFF por defecto · --rm efímero · --cap-drop ALL · no-new-privileges · audit).
  NOTA: contenedor_imagen es GLOBAL al ejecutor. Node+Python a la vez = una imagen que traiga ambos.
}
INQUILINOS (servicios Python, cada uno su compose bajo python-tools/) {
  SearXNG   docker-compose.searxng.yml — backend de /search para fastcrw.search (OPCIONAL; scrape/extract NO lo necesitan).
            127.0.0.1:8080 · crw-server nativo le apunta con CRW_SEARCH__SEARXNG_URL.
  Headroom  headroom/Dockerfile + docker-compose.headroom.yml — proxy de compresión de contexto (ver abajo).
}
```

## fastCRW — motor Rust NATIVO + puente en el bus + semilla de cantera (skill-first, NO cableado)

```
QUÉ ES  API de datos web en Rust (scrape·extract·search·crawl·map), alt. open-source a Firecrawl/Tavily.
        Da a Enki datos web frescos DENTRO del runtime (antes solo WebSearch en sesiones de Claude, nada en el bus).
        Caso motivador: precio/cantidad/formato de ingredientes (soysuper) para escandallo — reemplazo del
        API de Mercadona no oficial y frágil.

1 · MOTOR (Rust, NATIVO)  deployment/fastcrw/ {
     install.sh   cargo install crw-server → /usr/local/bin (no hay releases precompiladas; instala rustup si falta).
     crw-server.service  systemd, :3002 (el core tiene el :3000), sin auth local, endurecido.
     scrape/extract/map funcionan SOLO con el binario. /search necesita SearXNG (inquilino Python, opcional).
     RENDER (verificado en vivo): páginas server-rendered (ficha soysuper /p/<slug>) → extract rápido y limpio;
     páginas JS-pesadas (soysuper /search) → crw-server SIN render da timeout. Salida: atacar por la ficha directa,
     o compilar crw-server --features cdp + LightPanda para full-JS (receta en deployment/fastcrw/README.md).
  }
2 · PUENTE (bus)  modules/fastcrw/ {
     module.json  tools_http → http://localhost:3002/v1/* (auth_type none). Tools: fastcrw.scrape · extract · search · map.
                  El loader genera las closures (templating + fetch + response_path); scrape→data.markdown,
                  extract→data.json (schema como objeto crudo), search→data.
     index.js     mínimo (BaseModule onLoad; el motor vive fuera). Degradable: crw caído → UPSTREAM_UNREACHABLE, sin reventar.
     cloud opcional: cambiar url a https://api.fastcrw.com/v1/* + auth_type bearer + credential FASTCRW. Sin instalar nada.
  }
3 · DESCUBRIMIENTO (skill-first, NO se cablea a escandallo)  modules/cosecha/cantera/enki/precio-ingredientes-web/SKILL.md {
     La skill EMPAQUETA el saber "cómo sacar precio de un ingrediente de soysuper con fastcrw.scrape" (search→ficha→
     leer precio; extract pide LLM en crw-server) y CONDUCE las tools deterministas (las manos), por bus.publishAndWait,
     con la invocación INLINE (autocontenida). Hogar declarado lente_dominio:escandallo · lente_tarea:costear.
     → se DESCUBRE (buscar_skill / conserje-cantera al costear) · se ENLAZA (activar_skill → lente en escandallo) ·
       o el LLM la REESCRIBE por proyecto (cosecha.crear). Guard no-inventar: precio de la ficha real o 'sin_precio'
       (mismo mandato que el freno PRECIO_INVENTADO de escandallo). La cantera la auto-indexa (cero código nuevo).
  }
TESTS  fastcrw-module (5: tools registran · scrape/extract templating+response_path · degradación honesta) ·
       precio-ingredientes-web-seed (4: descubrimiento · búsqueda · hogar · conducción). validate-all cero drift.
```

## Crawl4RS (D-os) — el crawler PESADO en Docker + puente en el bus

```
QUÉ ES  Crawler Rust del repo hermano D-os (navegador real Chromium/CDP + stealth + crawl profundo
        BFS/DFS + extracción CSS/semántica/JSON-LD). HERMANO PESADO de fastcrw: fastcrw = fetch HTTP
        ligero (primero); Crawl4RS = navegador real para sitios JS-pesados/protegidos que fastcrw no salta.

POR QUÉ DOCKER (la excepción que confirma "Rust → nativo"): el binario es limpio pero ARRASTRA
        Chromium — la dependencia sucia. Reparto por NATURALEZA: lo sucio va contenido (como python-tools).

1 · MOTOR (Docker)  deployment/crawl4rs/ {
     docker-compose.yml  build desde el clon /opt/d-os (override DOS_DIR) → imagen enki-crawl4rs.
     127.0.0.1:8081→8080 (el :8080 local es de SearXNG) · shm_size 1gb (Chromium revienta con 64MB)
     · CRAWL4RS_JWT_SECRET OBLIGATORIO sin default (el del Dockerfile de D-os es público/forjable;
       compose falla si falta — fail-closed) · CRAWL4RS_API_KEY opcional · healthcheck TCP por bash.
     README.md  receta completa: clone → secreto → up → verificar → encender → usar.
  }
2 · PUENTE (bus)  modules/crawl4rs/ {
     Reflejo bus↔HTTP job-based (token JWT cacheado → POST /crawl → poll → result, retry ante 401).
     Eventos: crawl4rs.{leer,rastrear}.request → .response. Tool de chat: leer_web (url, query BM25,
     extract_semantic). NACE OFF (interruptor 'crawl4rs', grupo sistema) · degrada honesto (503
     {degradado, motivo}). Precedencia env > config (CRAWL4RS_BASE_URL/API_KEY). Test: crawl4rs__index.
  }
HORIZONTE  Fase 7 de D-os = crate crawl4rs-mqtt (el motor habla MQTT nativo por
           core/<id>/api/request/crawl/*) → este puente HTTP se retira; el compose solo cambia el CMD.
```

## Headroom — proxy de compresión de contexto (código integrado + FASE 0 en Docker)

```
QUÉ ES  middleware Python que COMPRIME todo lo que el agente LEE (tool outputs, JSON, código, historial) antes
        del LLM: 60–95% menos tokens facturados, reversible (CCR). Infraestructura que ahorra dinero, NO cantera.
        Enki es caro en tokens por diseño (blueprints + contexto) → ahorro directo sobre deepseek.

CÓDIGO YA INTEGRADO (ai-gateway 2.27.0) {
  headroom-switch.js  singleton isOn/setOn/proxyBase (lee HEADROOM_PROXY_URL).
  interruptor 'headroom' (grupo sistema, OFF por defecto) → onInterruptorCambiado conmuta setOn EN CALIENTE.
  base-provider._apiBase()  si config.headroom:true + interruptor ON + HEADROOM_PROXY_URL → enruta por el proxy;
                            si no → proveedor directo (fallback seguro, sin reinicio). deepseek-anthropic+anthropic
                            marcados headroom:true. Test ai-gateway__apibase-override 8/8.
}
FASE 0 · PROVISIONING (HECHA, Docker)  deployment/python-tools/headroom/ {
  Dockerfile  python:3.12-slim + pip install "headroom-ai[all]" · headroom proxy :8787 · healthcheck /livez ·
              modelo Kompress cacheado en volumen. Verificado contra headroom-ai 0.30.0 (arranca, /livez healthy).
  docker-compose.headroom.yml  127.0.0.1:8787 · upstream por ANTHROPIC_TARGET_API_URL (default deepseek /anthropic;
              quítalo para Claude real → api.anthropic.com). HEADROOM_MODE=token (máx compresión).
  ENCENDER  HEADROOM_PROXY_URL=http://localhost:8787 en el arranque del core + interruptor 'headroom' ON.
}
FIDELIDAD  los frenos de blueprint (<mod>.validar → 422) son el test AUTOMÁTICO: si la compresión rompiera un
           contrato, se ve en el acto. Por eso nace OFF y se gradúa (fases como el ejecutor). Ver propuesta
           arquitectura/decisiones/propuestas/headroom-compresion.md.
```

## OFRECER TOOLS COMO SKILL DE DESCUBRIMIENTO — las tools viven en segundo plano

> El principio que emergió al conectar fastCRW al LLM real. **Las tools están en segundo plano
> POR DISEÑO** — no es un descuido. El ai-gateway pone `invoke_agent` el PRIMERO ("PREFERENTE… los
> agentes saben hacer su trabajo mejor que tú encadenando tools básicos; solo cae a tools directas
> si NINGÚN agente cubre el caso") y **filtra las tools por página** (`_getTools`: `allowedPrefixes`
> + `GLOBAL_TOOLS`). Una tool_http registrada (p.ej. `fastcrw.scrape`) NO llega al LLM de una página
> que no la tiene en scope. Eso es correcto: el LLM no debe empuñar el bisturí, debe llamar al cirujano.

```json
{
  "esquema": "tools-como-skill-de-descubrimiento-v1",
  "hallazgo_vivo": "el LLM de escandallo llamó a crw-server 46× por ejecutor+curl y 0× por la tool fastcrw — porque no la tenía en scope. Bypaseaba el endpoint encapsulado Y el error fértil, y se rindió ante un curl-timeout mudo ('web inscrapeable, mételo a mano').",
  "antipatron": "surfacear la tool a la página (fuerza el diseño; el LLM encadena primitivas).",
  "patron": "OFRECER la tool por un SKILL de descubrimiento que enseña a alcanzarla por el canal que el LLM YA tiene (bus.publishAndWait) — la tool sigue en segundo plano.",
  "tres_capas": {
    "skill_generico": "CÓMO alcanzar la tool (el canal + leer el error fértil + el ritmo). Reutilizable. Ej: herramientas-web (dominio web).",
    "skill_dominio": "el SABER del caso, AUTOCONTENIDO (la invocación inline, no depende del genérico). Ej: precio-ingredientes-web (dominio escandallo).",
    "agente": "AISLAR un lote grande fuera del turno de chat (perspectiva-c con throttle+retry). Cuando el volumen no cabe en una vuelta."
  },
  "verificado_en_codigo": "bus.publishAndWait es universal y SIN allowlist; bus.publishAndWait('fastcrw.scrape',{url}) correla con 'fastcrw.scrape.response' (loader _renderResponseEvent, ~1108) y resuelve con la markdown; el error fértil viaja en el message.",
  "autocontencion": "las lentes se filtran/rankean por DOMINIO (ai-gateway ~1658: filter l.dominio===dominio). Una skill de dominio NO puede depender de otra de dominio distinto estando cargada → lleva su invocación INLINE."
}
```

```
canal (lo que el LLM ya tiene)     bus.publishAndWait('fastcrw.scrape', { url })  → markdown
                                    (NUNCA curl por ejecutor: pierde endpoint + error fértil)
skill genérico   herramientas-web         (dominio web · lente_tarea consultar) — el canal + error fértil + ritmo
skill dominio    precio-ingredientes-web  (dominio escandallo) — el saber, con la invocación INLINE (autocontenida)
agente           precio-web (perspectiva-c, siguiente) — el lote de 39 fuera del turno
```

## ERROR FÉRTIL — la tool interpreta su propio fallo (no el prior del LLM)

> La otra cara de "qué lleva al LLM a rendirse". Un error crudo (`504`/timeout/código pelado) llega
> como RUIDO, y el LLM lo rellena con su prior pesimista. Interpretar el fallo de una tool es
> conocimiento DETERMINISTA (la tool SABE que 504 sobre un scraper = throttle, no "motor caído") —
> estaba en la capa fuzzy equivocada. La Lente de Análisis Profundo aplicada a los errores.

```
BANCO   modules/_shared/error-fertil.js — enriquecerError(code) → {clase, reintentable, diagnostico, siguiente, no_es}
        clase ∈ TRANSITORIO (reintenta/backoff) · TERMINAL (corrige el objetivo) · CONFIG (corrige args/credencial)
        no_es = mata el prior falso EXPLÍCITO (p.ej. "NO ES: motor caído · web inscrapeable · motivo para rendirse")
ENGANCHE  core/modules/loader.js _httpErrorResponse → TODA tool_http hereda el error fértil gratis. Degrada honesto
          (error plano) si el banco no carga. La prescripción va EMBEBIDA en `message` — el único campo que TODA capa
          de transporte preserva (UIRequestHandler/ai-gateway hacen cherry-pick de {code,message}); los hermanos
          estructurados sobreviven en el camino directo handler→reflejo (para el gate del rail, futuro).
VERIFICADO EN VIVO  el 422 de fastcrw.extract llega al caller como:
          "[CONFIG] … DIAGNÓSTICO: … SIGUIENTE: corrige los argumentos … NO ES: throttle · motor caído · rendirse."
TESTS  error-fertil (6, caso testigo del 504 incl.) · fastcrw-module asserta el error fértil.
SIGUIENTE (fases)  gate del rail (no cerrar en 'manual' sin agotar el retry prescrito) · anti-especulación-canonizada.
```

## Topics / piezas / estado

```
EVENTOS {
  fastcrw.{scrape,extract,search,map}  (tools_http del bus → crw-server :3002)
  interruptor 'headroom' → ai-gateway.onInterruptorCambiado (hot-switch del proxy de compresión)
  conserje.empujon {tipo:'skill', accion 'cosecha.promover:precio-ingredientes-web'}  (descubrimiento al costear)
}
PIEZAS {
  deployment/fastcrw/                     motor Rust nativo (install.sh + crw-server.service)
  modules/fastcrw/                        puente tools_http al bus
  modules/_shared/error-fertil.js         banco de errores fértiles (heredado por toda tool_http vía loader)
  modules/cosecha/cantera/enki/herramientas-web/         skill GENÉRICO — cómo alcanzar la tool por bus (descubrimiento)
  modules/cosecha/cantera/enki/precio-ingredientes-web/  skill DOMINIO — el saber del precio, invocación inline (autocontenida)
  deployment/python-tools/                el hogar Python: imagen base + SearXNG + Headroom
  deployment/python-tools/headroom/       proxy de compresión (FASE 0 docker)
  deployment/crawl4rs/                    provisioning del crawler pesado (compose + receta, Docker por Chromium)
  modules/crawl4rs/                       puente bus↔HTTP al motor Crawl4RS (D-os) — interruptor OFF, degrada honesto
}
ESTADO {
  ✓ código: fastcrw · error-fertil · skills (genérico+dominio) · headroom (8/8) · tests · validate-all verde
  ✓ VIVO (verificado por MQTT): crw-server :3002 sano · fastcrw.scrape devuelve la ficha con precio
    (mozzarella 4,62€) · error fértil llega al caller con [CLASE]+SIGUIENTE+NO ES.
  ✓ hallazgo vivo: /search NO da timeout estructural (8 fichas, 200); soysuper THROTTLEA ráfagas (~15-20 → 504);
    adivinar slug /p/<x> → 404 vacío → descubrir por /search es el camino fiable.
  ◑ falta cerrar en vivo: que el LLM de escandallo USE la tool por skill (0 fastcrw / 46 curl medidos ANTES del
    skill genérico + precio autocontenida). Se confirma con un turno real en la app → revisar tool_calls.
  ⏸ escandallo NO cableado a fastcrw por DECISIÓN — el enlace es skill-first (descubrir/promover/crear), no hardcode.
  ⏸ agente precio-web (perspectiva-c) para el lote de 39 — siguiente.
}
```

> **Trade-off vivo.** Un contenedor Python compartido puede sonar a acoplar herramientas que no se
> hablan. Pero el reparto es por NATURALEZA, no por función: Rust estático nativo (limpio) vs Python
> sucio contenido. El hogar único evita el sprawl de un Docker por tool y mantiene el VPS lean; cuando
> dos tools Python se estorben de verdad, se separan — no antes.
