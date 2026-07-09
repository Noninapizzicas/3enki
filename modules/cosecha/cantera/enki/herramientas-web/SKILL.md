---
name: herramientas-web
description: Cómo alcanzar datos de la web DENTRO de un turno (leer una página, buscar, mapear enlaces, rastrear un sitio) sin curl a mano — conduciendo los reflejos de crawl4rs por el canal que ya tienes, bus.publishAndWait. Skill GENÉRICO: cualquier página lo bebe. Enseña la herramienta que el diseño deja en segundo plano, sin surfacearla. Incluye cómo leer el error para no rendirse ante un fallo transitorio.
fuente: enki
dominio: web
lente_dominio: web
lente_tarea: consultar
tags: [web, datos, crawl4rs, leer, buscar, mapear, rastrear, scraping, bus, herramientas, precio, investigacion]
---

# Herramientas web — conduce crawl4rs por el bus (no curl a mano)

> Las tools están en segundo plano por diseño (el sistema prefiere agentes/skills a que el LLM
> encadene primitivas). Eso NO significa que no puedas usar la web: significa que la alcanzas por
> el canal que YA tienes —`bus.publishAndWait`— en vez de curlear el servidor a mano por el
> ejecutor (frágil, y te pierdes el mensaje interpretado del fallo). Este skill es la puerta
> genérica; cualquier página que necesite web lo bebe. Un caso concreto (precio de ingredientes)
> lo CONDUCE.

## Cuándo usar

Cuando necesites datos de la web en el turno: leer una página, buscar algo, mapear sus enlaces
o rastrear un sitio. Motor: **Crawl4RS** (contenedor `enki-crawl4rs`, repo D-os) — modo auto:
fetch HTTP ligero primero, navegador real (Chromium + stealth) solo cuando la página lo exige.
Los reflejos viven en el bus (`modules/crawl4rs`); tú los llamas por publishAndWait.

## El precondicional (una sola cosa)

El puente **nace OFF**: el interruptor `crawl4rs` (grupo sistema) tiene que estar ON. Si está
apagado, TODA llamada responde `503 {degradado, motivo:'apagado'}` — eso no es un fallo del
motor, es la puerta cerrada: dilo, no lo rodees.

## El canal (así se invoca)

```
// leer: URL → markdown limpio (+ extracción opcional). query filtra por relevancia (BM25).
res = bus.publishAndWait('crawl4rs.leer.request', { url: 'https://…', query: 'precio' })
res.data.markdown                                 // el contenido
// buscar: query → resultados {titulo, url, resumen}. SearXNG detrás del servidor.
res = bus.publishAndWait('crawl4rs.buscar.request', { query: 'harina de fuerza', limit: 5 })
res.data.resultados
// mapear: página → sus enlaces (ligero, sin contenido)
res = bus.publishAndWait('crawl4rs.mapear.request', { url: 'https://…' })
res.data.enlaces
// rastrear: crawl profundo BFS/DFS (varias páginas — respeta el ritmo, ver abajo)
res = bus.publishAndWait('crawl4rs.rastrear.request', { url: 'https://…', max_depth: 2, max_pages: 10 })
res.data.paginas                                  // [{url, markdown, extraido}]
```

- La respuesta llega como `{status, data}` (o `{status, error}`). Con `status: 200`, lee `data`.
- NO uses `ejecutor` + `curl`: pierdes el token JWT encapsulado, el flujo job-based y el mensaje
  interpretado del error.
- ¿JSON estructurado en un paso? `leer` acepta `extract_css` (`{campo: 'selector'}` /
  `::attr(...)`) y `extract_semantic: true` → llega en `data.extraido`. Por defecto:
  **`leer` + lee tú de la markdown** (el LLM de página ya está en el turno).

## Leer el error — la parte que evita rendirse

Si `status` no es 200, el `error.message` trae la interpretación (y en los fallos del servidor,
su prescripción textual, p.ej. `search no disponible: define SEARXNG_URL`):

- **503 `{degradado, motivo:'apagado'}`** → el interruptor está OFF. No es el motor: pide encenderlo.
- **503 `{degradado, motivo:'sin_servicio'}`** → el contenedor no responde. Verifica
  `curl http://127.0.0.1:8081/health`; si responde, fue transitorio → reintenta con backoff (4s, 8s).
- **504 `UPSTREAM_TIMEOUT`** → la página tardó más que `timeout_ms`. Reintenta una vez; si repite,
  baja el alcance (menos `max_pages` / URL más concreta).
- **4xx `INVALID_INPUT` / rechazo del servidor** → corrige los argumentos (URL absoluta, query no
  vacía); no reintentes idéntico.
- Jamás concluyas "la web es inscrapeable" por UN fallo transitorio: el motor lleva navegador real
  — prueba una URL neutra; si esa va, es el destino frenándote, no el motor.

## Ritmo (el sitio destino puede frenarte)

Muchos sitios throttlean las ráfagas (verificado con soysuper: ~15-20 requests seguidos → 504).
Uno a la vez, con pausa (~2-4s). `rastrear` ya acota con `max_pages` — úsalo bajo. Un lote grande
NO se dispara de golpe: va por tandas, y si es mucho volumen, es trabajo de un **agente**
(perspectiva-c con throttle+retry), no de un turno de chat.

## Filosofía

El diseño mantiene la tool en segundo plano para que no encadenes primitivas a ciegas. Este skill
te da justo lo necesario para conducirla bien —el canal, el error, el ritmo— y nada más. La
tool es la mano; este skill, cómo moverla; el saber de cada caso (p.ej. precios) vive en su skill.
