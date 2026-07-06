---
id: plataforma/herramientas-externas
dominio: plataforma
resumen: Rust nativo en el VPS (fastCRW) · Python en Docker (contenedor universal: SearXNG, Headroom) · enganche al ejecutor por config.
fuentes:
  - deployment/fastcrw/**
  - deployment/python-tools/**
  - modules/fastcrw/**
verificado: 2026-07-06
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
  }
2 · PUENTE (bus)  modules/fastcrw/ {
     module.json  tools_http → http://localhost:3002/v1/* (auth_type none). Tools: fastcrw.scrape · extract · search · map.
                  El loader genera las closures (templating + fetch + response_path); scrape→data.markdown,
                  extract→data.json (schema como objeto crudo), search→data.
     index.js     mínimo (BaseModule onLoad; el motor vive fuera). Degradable: crw caído → UPSTREAM_UNREACHABLE, sin reventar.
     cloud opcional: cambiar url a https://api.fastcrw.com/v1/* + auth_type bearer + credential FASTCRW. Sin instalar nada.
  }
3 · DESCUBRIMIENTO (skill-first, NO se cablea a escandallo)  modules/cosecha/cantera/enki/precio-ingredientes-web/SKILL.md {
     La skill EMPAQUETA el saber "cómo sacar precio de un ingrediente de soysuper con fastcrw.extract" y CONDUCE
     las tools deterministas (las manos). Hogar declarado lente_dominio:escandallo · lente_tarea:costear.
     → se DESCUBRE (buscar_skill / conserje-cantera al costear) · se ENLAZA (activar_skill → lente en escandallo) ·
       o el LLM la REESCRIBE por proyecto (cosecha.crear). Guard no-inventar: precio de la ficha real o 'sin_precio'
       (mismo mandato que el freno PRECIO_INVENTADO de escandallo). La cantera la auto-indexa (cero código nuevo).
  }
TESTS  fastcrw-module (5: tools registran · scrape/extract templating+response_path · degradación honesta) ·
       precio-ingredientes-web-seed (4: descubrimiento · búsqueda · hogar · conducción). validate-all cero drift.
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
  modules/cosecha/cantera/enki/precio-ingredientes-web/  semilla skill (descubrimiento, no cableado)
  deployment/python-tools/                el hogar Python: imagen base + SearXNG + Headroom
  deployment/python-tools/headroom/       proxy de compresión (FASE 0 docker)
}
ESTADO {
  ✓ código: módulo fastcrw · semilla cantera · headroom (switch+interruptor+_apiBase, 8/8) · tests · validate-all verde
  ✓ deployment: scaffolding Rust nativo + Docker Python (fastCRW · SearXNG · Headroom) — listo para el VPS
  ◑ EN VIVO (VPS): correr install.sh (crw-server) + docker compose up (headroom/searxng) + encender interruptores.
    Nada de esto corre aún en el VPS; el repo tiene todo lo instalable, falta la mano en la máquina.
  ⏸ escandallo NO cableado a fastcrw por DECISIÓN — el enlace es skill-first (descubrir/promover/crear), no hardcode.
}
```

> **Trade-off vivo.** Un contenedor Python compartido puede sonar a acoplar herramientas que no se
> hablan. Pero el reparto es por NATURALEZA, no por función: Rust estático nativo (limpio) vs Python
> sucio contenido. El hogar único evita el sprawl de un Docker por tool y mantiene el VPS lean; cuando
> dos tools Python se estorben de verdad, se separan — no antes.
