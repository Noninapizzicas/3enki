---
name: herramientas-web
description: Cómo alcanzar datos de la web DENTRO de un turno (leer una página, buscar, extraer) sin curl a mano — conduciendo las tools de fastcrw por el canal que ya tienes, bus.publishAndWait. Skill GENÉRICO: cualquier página lo bebe. Enseña la herramienta que el diseño deja en segundo plano, sin surfacearla. Incluye cómo leer el error FÉRTIL para no rendirse ante un fallo transitorio.
fuente: enki
dominio: web
lente_dominio: web
lente_tarea: consultar
tags: [web, datos, fastcrw, scrape, search, extract, scraping, bus, herramientas, precio, investigacion]
---

# Herramientas web — conduce fastcrw por el bus (no curl a mano)

> Las tools están en segundo plano por diseño (el sistema prefiere agentes/skills a que el LLM
> encadene primitivas). Eso NO significa que no puedas usar la web: significa que la alcanzas por
> el canal que YA tienes —`bus.publishAndWait`— en vez de curlear el servidor a mano por el
> ejecutor (frágil, y te pierdes el error fértil). Este skill es la puerta genérica; cualquier
> página que necesite web lo bebe. Un caso concreto (precio de ingredientes) lo CONDUCE.

## Cuándo usar

Cuando necesites datos de la web en el turno: leer una página, buscar algo, o extraer campos.
Motor: `crw-server` nativo (fastCRW) — las tools viven en el bus, tú las llamas por publishAndWait.

## El canal (VERIFICADO — así se invoca)

```
// scrape: URL → markdown limpio (determinista, sin LLM en el servidor)
md = bus.publishAndWait('fastcrw.scrape', { url: 'https://…' })
// search: query → resultados (título, url, snippet). Necesita SearXNG en el servidor.
res = bus.publishAndWait('fastcrw.search', { query: 'harina de fuerza', limit: 5 })
// map: dominio → lista de URLs
urls = bus.publishAndWait('fastcrw.map', { url: 'https://…' })
```

- `bus.publishAndWait('fastcrw.scrape', {…})` **resuelve con la markdown** (el wrapper desenvuelve
  `status/data`). NO uses `ejecutor` + `curl`: pierdes el endpoint encapsulado y el error fértil.
- `fastcrw.extract` (JSON en un paso) existe pero pide un LLM DENTRO de crw-server (422 sin él).
  Por defecto: **`scrape` + lee tú de la markdown** (el LLM de página ya está en el turno).

## Leer el ERROR FÉRTIL — la parte que evita rendirse

Si la llamada FALLA, `bus.publishAndWait` lanza un Error cuyo `message` viene YA interpretado:

```
[TRANSITORIO] … DIAGNÓSTICO: … SIGUIENTE: reintenta con backoff / verifica /health. NO ES: motor caído · web inscrapeable.
[CONFIG]      … SIGUIENTE: corrige los argumentos … NO ES: throttle · motor caído.
[TERMINAL]    … SIGUIENTE: corrige la URL/identificador … NO ES: motor caído.
```

Mandato al leerlo:

- **`[TRANSITORIO]`** (throttle, timeout, 5xx) → NO es "está roto". Espera y **reintenta con backoff**
  (4s, 8s). Si dudas del motor, prueba una URL neutra (un sitio simple) — si esa responde, el motor
  va y es el destino frenándote. Jamás concluyas "la web es un SPA inscrapeable" por un transitorio.
- **`[CONFIG]`** → corrige los argumentos/credencial y reintenta ya corregido (no idéntico).
- **`[TERMINAL]`** → corrige el objetivo concreto (URL, id); no reintentes igual.
- El `message` te dice `SIGUIENTE` y `NO ES` — **obedécelo en vez de narrar el fallo con tu prior.**

## Ritmo (el sitio destino puede frenarte)

Muchos sitios throttlean las ráfagas (verificado con soysuper: ~15-20 requests seguidos → 504).
Uno a la vez, con pausa (~2-4s). Un lote grande NO se dispara de golpe: va por tandas, y si es
mucho volumen, es trabajo de un **agente** (perspectiva-c con throttle+retry), no de un turno de chat.

## Filosofía

El diseño mantiene la tool en segundo plano para que no encadenes primitivas a ciegas. Este skill
te da justo lo necesario para conducirla bien —el canal, el error fértil, el ritmo— y nada más. La
tool es la mano; este skill, cómo moverla; el saber de cada caso (p.ej. precios) vive en su skill.
