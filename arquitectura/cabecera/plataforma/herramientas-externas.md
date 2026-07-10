---
id: plataforma/herramientas-externas
dominio: plataforma
resumen: Órganos externos por naturaleza — Crawl4RS (web, Docker por Chromium) · OCR4RS (imagen/PDF escaneado, Rust puro NATIVO) · Python (SearXNG, Headroom, Docker). Las dos alas de la evidencia externa (web+físico). Enganche al ejecutor por config.
fuentes:
  - deployment/python-tools/**
  - deployment/crawl4rs/**
  - deployment/ocr4rs/**
  - deployment/vps-setup.sh
  - modules/crawl4rs/**
  - modules/ocr4rs/**
  - modules/_shared/error-fertil.js
  - modules/cosecha/cantera/enki/leer-web/**
  - modules/cosecha/cantera/enki/precio-ingredientes-web/**
verificado: 2026-07-10
---

# HERRAMIENTAS EXTERNAS — Crawl4RS en Docker (el órgano web) · Python en Docker (Headroom · el contenedor universal)

> Cada pieza en su sitio POR NATURALEZA. Un binario Rust estático puro va NATIVO en el VPS;
> cuando arrastra una dependencia sucia (Chromium), va CONTENIDO en Docker — Crawl4RS. Lo Python
> (dependencias sucias, modelos ML, servicios externos) va AISLADO en Docker. **El contenedor
> Python es el hogar de TODA herramienta Python que quepa** — no un contenedor por herramienta,
> sino un lugar Python que crece. La reja del ejecutor ya toma la imagen por config
> (`contenedor_imagen`), así que darle Python a un agente = un ajuste, no código.

## El principio (JSON)

```json
{
  "esquema": "herramientas-externas-v2",
  "reparto_por_naturaleza": {
    "rust_binario_estatico_puro": "NATIVO en el VPS (cargo install + systemd). Una pieza, sin runtime que ensucie.",
    "rust_con_dependencia_sucia": "DOCKER aislado. Ej: Crawl4RS — el binario es limpio pero arrastra Chromium; lo sucio va contenido (deployment/crawl4rs/).",
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
  SearXNG   docker-compose.searxng.yml — backend de /search para crawl4rs.buscar (OPCIONAL; leer/mapear/
            rastrear NO lo necesitan). Red compartida enki-web: el contenedor enki-crawl4rs lo alcanza
            por nombre (SEARXNG_URL=http://enki-searxng:8080). 127.0.0.1:8080 queda solo para debug.
  Headroom  headroom/Dockerfile + docker-compose.headroom.yml — proxy de compresión de contexto (ver abajo).
}
```

## Crawl4RS (D-os) — el ÚNICO órgano web del bus (Docker) + puente + semillas de cantera

```
QUÉ ES  Crawler Rust del repo hermano D-os (modo auto: fetch HTTP ligero primero, navegador real
        Chromium/CDP + stealth solo ante 403/challenge/JS pesado · crawl profundo BFS/DFS ·
        extracción CSS/semántica/JSON-LD · /search vía SearXNG · /map). Da a Enki datos web frescos
        DENTRO del runtime. Caso motivador: precio/cantidad/formato de ingredientes (soysuper) para
        escandallo — reemplazo del API de Mercadona no oficial y frágil.

RELEVO (v0.2.0 del puente)  fastcrw (motor crw-server nativo :3002 + puente tools_http) RETIRADO:
        el modo auto de Crawl4RS cubre el fetch ligero que hacía crw-server, y el navegador real
        elimina su límite verificado (páginas JS-pesadas → timeout sin render). Un motor, todas
        las puertas: leer · buscar · mapear · rastrear. El Chromium de crawling vive SOLO en el
        contenedor (las libs Chromium de vps-setup.sh son de open-wa/WhatsApp, otro órgano).

POR QUÉ DOCKER (la excepción que confirma "Rust → nativo"): el binario es limpio pero ARRASTRA
        Chromium — la dependencia sucia. Reparto por NATURALEZA: lo sucio va contenido (como python-tools).

1 · MOTOR (Docker)  deployment/crawl4rs/ {
     docker-compose.yml  build desde el clon /opt/d-os (override DOS_DIR) → imagen enki-crawl4rs.
     127.0.0.1:8081→8080 (el :8080 local es de SearXNG) · shm_size 1gb (Chromium revienta con 64MB)
     · CRAWL4RS_JWT_SECRET OBLIGATORIO sin default (el del Dockerfile de D-os es público/forjable;
       compose falla si falta — fail-closed) · CRAWL4RS_API_KEY opcional · red compartida enki-web
       con SearXNG (SEARXNG_URL=http://enki-searxng:8080) · healthcheck TCP por bash.
     PROVISIONING AUTOMÁTICO  deployment/vps-setup.sh (sección 3a-bis) lo hace TODO en el
       `sudo ./deployment/vps-setup.sh <dominio>`: docker engine + plugin compose · retira el
       crw-server viejo si quedó · clona/actualiza /opt/d-os · genera el secreto UNA vez en
       data/.env (persiste: data/ está excluido del rsync) · crea la red enki-web · levanta
       enki-crawl4rs + SearXNG. Idempotente y guardado (fallo → warn, el puente degrada honesto).
       Instalar el engine aquí NO mete a www-data en el grupo docker (eso sigue opt-in, --docker).
     README.md  el setup lo hace solo; la receta manual queda como plan B / debug.
  }
2 · PUENTE (bus)  modules/crawl4rs/ {
     Reflejo bus↔HTTP: leer/rastrear job-based (token JWT cacheado → POST /crawl → poll → result,
     retry ante 401); buscar/mapear directos (POST /search · /map, mismo token). Eventos:
     crawl4rs.{leer,rastrear,buscar,mapear}.request → .response. Tool de chat: leer_web (url,
     query BM25, extract_semantic). NACE OFF (interruptor 'crawl4rs', grupo sistema) · degrada
     honesto (503 {degradado, motivo}; buscar sin SearXNG → la prescripción del servidor viaja en
     message). Precedencia env > config (CRAWL4RS_BASE_URL/API_KEY). Test: crawl4rs__index.
  }
3 · DESCUBRIMIENTO (skill-first, NO se cablea a escandallo) {
     leer-web (genérico, dominio web): el canal — bus.publishAndWait('crawl4rs.leer.request')
       y hermanos, leer el error, el ritmo. precio-ingredientes-web (dominio escandallo, autocontenida):
       el saber soysuper — descubrir por /search (no adivinar slug), leer la ficha, guard no-inventar
       (precio real o 'sin_precio', mismo mandato que el freno PRECIO_INVENTADO). La cantera las
       auto-indexa; el conserje las ofrece al costear.
  }
TESTS  crawl4rs__index (9) · leer-web-seed (4) · precio-ingredientes-web-seed (4).
HORIZONTE  Fase 7 de D-os = crate crawl4rs-mqtt (el motor habla MQTT nativo por
           core/<id>/api/request/crawl/*) → este puente HTTP se retira; el compose solo cambia el CMD.
```

## OCR4RS (repo ocr4rs) — el órgano FÍSICO NATIVO (imagen/PDF escaneado → texto)

```
QUÉ ES  Motor OCR del repo hermano ocr4rs (Rust PURO — ocrs+rten, sin ONNX/MNN/Python).
        Imagen o PDF ESCANEADO → texto. Rasteriza el PDF (extrae el ráster embebido, NO renderiza)
        y limpia la imagen (deskew·normalizar·binarizar opc.) DENTRO — preparar la imagen ES hacer OCR.

POR QUÉ NATIVO (no Docker, a diferencia de crawl4rs)  la regla de la casa reparte por NATURALEZA:
        Rust estático PURO → nativo (como fue fastcrw); Rust + dependencia sucia (Chromium) → Docker.
        OCR4RS no arrastra Chromium ni Python → no hay nada sucio que contener → cargo + systemd.

LAS DOS ALAS DE AFIRMACION_EXTERNA (prisma-del-caso)  una afirmación externa entra con su dirección
        de vuelta. Hay dos, ahora las dos cubiertas: la web (url·api_id → crawl4rs) y el papel/imagen
        (la imagen: path+sha256 → ocr4rs). El prisma ya enumeraba 'url·api_id·documento·medición' —
        crawl4rs respondió las digitales, ocr4rs responde 'documento'. El hueco ya estaba tallado.

1 · MOTOR (Rust NATIVO)  deployment/ocr4rs/ {
     vps-setup (sección 3a-ter), orden ligero→pesado: 1) baja el binario PREBUILT del release de
     ocr4rs (musl estático — un fichero, sin toolchain); 2) fallback: compila con cargo (asegura
     rustup). Luego get-models.sh (una vez) → systemd (ocr4rs.service, bindea 127.0.0.1:8090) →
     siembra el interruptor ON. TODO en el deploy, cero pasos manuales.
     SIN AUTH (ley de la frontera: solo loopback) · sin modelos → /ocr degrada 503 honesto.
     ocr4rs.service  unit plantilla (__MODELS__ sustituido por el dir real). Restart=always, hardened.
     RELEASE  ocr4rs/.github/workflows/release.yml — cada tag v* publica el binario musl estático.
              El binario esquiva la deriva de glibc (no hay que fijar Debian, a diferencia del Dockerfile).
  }
2 · PUENTE (bus)  modules/ocr4rs/ {
     Reflejo bus↔HTTP SÍNCRONO (sin job/poll, sin token — más simple que crawl4rs). Lee la imagen del
     fs (base64, el bus mueve punteros no MB) → POST /ocr → proyecta { source_kind, texto, paginas,
     evidencia:{path,sha256} }. Eventos: ocr4rs.{leer,leer_lote}.request → .response · texto.extraido
     (dominio) · pdf.es_digital (HANDOFF: PDF digital → 409 redirigido a crawl4rs, los órganos se pasan
     el trabajo por el bus). Tool de chat: leer_imagen. NACE OFF (interruptor 'ocr4rs'). Degrada honesto
     (apagado·sin_servicio·sin_modelos). LA EVIDENCIA (path+sha256) ES la dirección de vuelta del prisma:
     un dato OCR entra por la ley de la evidencia con fuente='ocr4rs' + imagen. Test: ocr4rs__index (10).
  }
LATENTE (forma, no prosa)  el motor v0.0.1 (OcrLine solo texto) aún no da confianza por línea → el gate
     umbral_confianza + evento ocr4rs.baja_confianza.detectada están DECLARADOS, se activan cuando el
     motor la exponga. El freno gemelo del 'no inventar precio': línea dudosa se marca, no se afirma.
RELEVO PENDIENTE  facturas hace OCR hoy con tesseract.js + scribe.js-ocr (JS pesado). OCR4RS es su
     relevo (como crawl4rs relevó a fastcrw) → esos deps salen del package.json cuando facturas migre.
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
  ARRANQUE AUTOMÁTICO  vps-setup.sh lo levanta en el camino por defecto (sin --docker: mismo patrón que
              crawl4rs — root lo levanta, el core le habla por HTTP, cero concesión de grupo docker) y
              enki.service ya trae HEADROOM_PROXY_URL=http://localhost:8787.
  ENCENDER  solo el interruptor 'headroom' ON (nace OFF; con el proxy caído el provider va directo — fallback seguro).
}
FIDELIDAD  los frenos de blueprint (<mod>.validar → 422) son el test AUTOMÁTICO: si la compresión rompiera un
           contrato, se ve en el acto. Por eso nace OFF y se gradúa (fases como el ejecutor). Ver propuesta
           arquitectura/decisiones/propuestas/headroom-compresion.md.
```

## OFRECER TOOLS COMO SKILL DE DESCUBRIMIENTO — las tools viven en segundo plano

> El principio que emergió al conectar el primer órgano web (entonces fastCRW) al LLM real. **Las
> tools están en segundo plano POR DISEÑO** — no es un descuido. El ai-gateway pone `invoke_agent`
> el PRIMERO ("PREFERENTE… los agentes saben hacer su trabajo mejor que tú encadenando tools
> básicos; solo cae a tools directas si NINGÚN agente cubre el caso") y **filtra las tools por
> página** (`_getTools`: `allowedPrefixes` + `GLOBAL_TOOLS`). Una tool registrada NO llega al LLM
> de una página que no la tiene en scope. Eso es correcto: el LLM no debe empuñar el bisturí,
> debe llamar al cirujano.

```json
{
  "esquema": "tools-como-skill-de-descubrimiento-v1",
  "hallazgo_vivo": "(histórico, ciclo fastcrw) el LLM de escandallo llamó al motor 46× por ejecutor+curl y 0× por la tool — porque no la tenía en scope. Bypaseaba el endpoint encapsulado Y el error fértil, y se rindió ante un curl-timeout mudo ('web inscrapeable, mételo a mano'). El principio sobrevive al relevo: hoy la tool en segundo plano es crawl4rs.",
  "antipatron": "surfacear la tool a la página (fuerza el diseño; el LLM encadena primitivas).",
  "patron": "OFRECER la tool por un SKILL de descubrimiento que enseña a alcanzarla por el canal que el LLM YA tiene (bus.publishAndWait) — la tool sigue en segundo plano.",
  "tres_capas": {
    "skill_generico": "CÓMO alcanzar la tool (el canal + leer el error + el ritmo). Reutilizable. Ej: leer-web (dominio web).",
    "skill_dominio": "el SABER del caso, AUTOCONTENIDO (la invocación inline, no depende del genérico). Ej: precio-ingredientes-web (dominio escandallo).",
    "agente": "AISLAR un lote grande fuera del turno de chat (perspectiva-c con throttle+retry). Cuando el volumen no cabe en una vuelta."
  },
  "verificado_en_codigo": "bus.publishAndWait es universal y SIN allowlist; bus.publishAndWait('crawl4rs.leer.request',{url}) correla con 'crawl4rs.leer.response' (reflejo _atender, request_id) y resuelve con {status, data.markdown}; la prescripción del fallo viaja en message.",
  "autocontencion": "las lentes se filtran/rankean por DOMINIO (ai-gateway ~1658: filter l.dominio===dominio). Una skill de dominio NO puede depender de otra de dominio distinto estando cargada → lleva su invocación INLINE."
}
```

```
canal (lo que el LLM ya tiene)     bus.publishAndWait('crawl4rs.leer.request', { url })  → {status, data.markdown}
                                    (NUNCA curl por ejecutor: pierde el token JWT + el mensaje interpretado)
skill genérico   leer-web                (dominio web · lente_tarea consultar) — el canal + el error + ritmo
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
VERIFICADO EN VIVO  (histórico, con fastcrw.extract, antes del relevo) el 422 llegaba al caller como:
          "[CONFIG] … DIAGNÓSTICO: … SIGUIENTE: corrige los argumentos … NO ES: throttle · motor caído · rendirse."
          El mismo principio vive en el puente crawl4rs: la prescripción del servidor viaja en message
          (p.ej. "search no disponible: define SEARXNG_URL") y la degradación lleva {degradado, motivo}.
TESTS  error-fertil (6, caso testigo del 504 incl.). El banco sigue enganchado a TODA tool_http vía loader.
SIGUIENTE (fases)  gate del rail (no cerrar en 'manual' sin agotar el retry prescrito) · anti-especulación-canonizada.
```

## Topics / piezas / estado

```
EVENTOS {
  crawl4rs.{leer,rastrear,buscar,mapear}.request → .response  (reflejos del puente → contenedor :8081)
  interruptor 'crawl4rs' (grupo sistema, OFF) → enciende/apaga el puente en caliente
  interruptor 'headroom' → ai-gateway.onInterruptorCambiado (hot-switch del proxy de compresión)
  conserje.empujon {tipo:'skill', accion 'cosecha.promover:precio-ingredientes-web'}  (descubrimiento al costear)
}
PIEZAS {
  deployment/crawl4rs/                    provisioning del órgano web (compose + receta, Docker por Chromium, red enki-web)
  modules/crawl4rs/                       puente bus↔HTTP al motor Crawl4RS (D-os) — interruptor OFF, degrada honesto
  modules/_shared/error-fertil.js         banco de errores fértiles (heredado por toda tool_http vía loader)
  modules/cosecha/cantera/enki/leer-web/         skill GENÉRICO — cómo alcanzar la tool por bus (descubrimiento)
  modules/cosecha/cantera/enki/precio-ingredientes-web/  skill DOMINIO — el saber del precio, invocación inline (autocontenida)
  deployment/python-tools/                el hogar Python: imagen base + SearXNG + Headroom
  deployment/python-tools/headroom/       proxy de compresión (FASE 0 docker)
}
ESTADO {
  ✓ código: crawl4rs v0.2.0 (leer·rastrear·buscar·mapear) · error-fertil · skills (genérico+dominio
    recableadas a crawl4rs) · headroom (8/8) · tests (crawl4rs__index 9 · seeds 4+4) · fastcrw RETIRADO.
  ✓ hallazgo vivo (heredado del ciclo fastcrw — la física del sitio no cambia): soysuper THROTTLEA
    ráfagas (~15-20 → 504); adivinar slug /p/<x> → 404 vacío → descubrir por /search es el camino fiable.
  ✓ VIVO (2026-07-09, verificado por el bus MQTT/WSS en enki-ai.online, interruptor ON): leer →
    example.com 200 y soysuper /search 200 (286 productos, 8.4k chars markdown con enlaces /p/) ·
    buscar → 3 resultados reales vía SearXNG · mapear → 200. Tres fallos cazados y sellados en el
    camino: target 'minimal' por defecto del Dockerfile (→ target: runtime) · CRAWL4RS_API_KEY
    vacía = clave configurada (→ passthrough sin '=') · SearXNG exige env SEARXNG_SECRET, sin _KEY.
  ◑ falta cerrar en vivo: un turno real de escandallo usando la skill precio-ingredientes-web →
    revisar tool_calls.
  ⏸ escandallo NO cableado a crawl4rs por DECISIÓN — el enlace es skill-first (descubrir/promover/crear), no hardcode.
  ⏸ agente precio-web (perspectiva-c) para el lote de 39 — siguiente.
}
```

> **Trade-off vivo.** Retirar fastcrw compra UN solo órgano web (menos superficie, un token, un
> interruptor) al precio de pagar Chromium hasta en lecturas simples — mitigado porque el modo auto
> solo abre el navegador ante 403/challenge. El reparto sigue siendo por NATURALEZA, no por función:
> binario limpio nativo; dependencia sucia (Chromium, Python) contenida. Cuando dos inquilinos se
> estorben de verdad, se separan — no antes.
