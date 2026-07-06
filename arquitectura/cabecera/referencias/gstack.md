---
id: referencias/gstack
dominio: referencias
resumen: gstack + gbrain re-analizados de primera mano — el número duro (+31.4 P@5, vector-solo pierde) cosechado en la cantera (fusión RRF, cosecha 0.10.0 ✓), poda-por-referencia, canary token, panel de review multi-perspectiva, y donde Enki ya supera (ejecutor, portal, rail+juez).
fuentes: []
verificado: 2026-07-06
---

# Referencia externa — gstack + gbrain (Garry Tan · MIT · re-analizado 2026-07-06) — planos cosechados

> ANALIZADO de primera mano (garrytan/gstack +108K★ · garrytan/gbrain). gstack = OS de harness
> sprint-estructurado (Think→Plan→Build→Review→Test→Ship→Reflect), 23 skills + binarios, capa de
> config del asistente (como ECC), no runtime. Sus SKILLS solapan con ECC y son off-vertical (oficio
> desarrollo) → NO se montan como pack. El oro es el DISEÑO. Compañero de DeerFlow y ECC.
>
> **CORRECCIÓN de la nota vieja (honestidad).** La versión previa atribuía a gstack un "N=3 · cuarentena
> hasta probar" para el destilador. **FALSO** — no existe en la fuente. `/learn` de gstack es un
> `~/.gstack/projects/$SLUG/learnings.jsonl` con confianza 0–10 + poda cuando el fichero referenciado
> desaparece; sin cuarentena, sin umbral de N usos. Se corrige abajo.

## Mecanismos reales (los detalles importan)

```json
{
  "esquema": "gstack-gbrain-mecanismos-v2",
  "gbrain (el cerebro persistente)": {
    "store": "PGLite (Postgres 17 vía WASM, zero-config, hasta ~50K páginas) · Postgres+pgvector para grande. Conocimiento = markdown en un git repo ('brain repo') sincronizado a Postgres.",
    "retrieval_HIBRIDO": "HNSW vector (pgvector) + BM25 keyword + RECIPROCAL-RANK FUSION + source-tier BOOST. Modos conservative/balanced/tokenmax (coste/calidad).",
    "grafo": "aristas TIPADAS (attended·works_at·founded·advises) extraídas SIN LLM → +31.4 puntos P@5 sobre vector-solo RAG. NÚMERO DURO: vector-solo PIERDE.",
    "federacion": "brain = instancia DB · source = repo dentro · precedencia 6-tier vía dotfiles .gbrain-source",
    "permisos": "OAuth scopes read/write/admin · slice por login (cada uno ve solo lo suyo)",
    "cron_dream_cycle": "mientras duermes: dedup páginas · arregla citas · puntúa salience · halla contradicciones · prepara tareas"
  },
  "gstack (el harness)": {
    "learn": "learnings.jsonl · confianza 0–10 + source + paths · otras skills lo buscan antes de recomendar ('Prior learning applied') · PODA cuando el fichero referenciado ya no existe. SIN cuarentena/umbral.",
    "review_panel": "3 revisores INDEPENDIENTES leen el MISMO design doc: /plan-ceo-review (¿el producto 10-estrellas oculto? 4 modos scope) · /plan-eng-review (arquitectura+diagramas ASCII+matriz de tests) · /plan-design-review (rate 0–10 por dimensión, detecta AI-slop). /autoplan los corre en cadena, surfacea SOLO decisiones de gusto.",
    "cso": "OWASP+STRIDE · ZERO-NOISE: 17 exclusiones de falso-positivo + gate confianza 8/10 + verificación INDEPENDIENTE de cada hallazgo + escenario de exploit concreto",
    "investigate": "Iron Law: NO fixes sin investigación · traza data-flow · PARA tras 3 fixes fallidos · auto-freeze del módulo",
    "gates": "PreToolUse hooks (session-scoped): /careful (avisa ante rm-rf/DROP/force-push, whitelist) · /freeze (edits a un dir — su doc ADMITE 'no es sandbox, sed se escapa') · /guard = careful+freeze",
    "pair-agent": "bridge remoto: tunnel scoped + allowlist + session token (NO verificación)"
  }
}
```

## PLANO 1 (COSECHADO ✓) — retrieval HÍBRIDO en la cantera: fusión, no reemplazo

```json
{
  "estado": "IMPLEMENTADO — cosecha 0.10.0 (buscar_skill del chat)",
  "leccion_dura": "gbrain: vector-solo PIERDE (+31.4 P@5 al fusionar). La cantera NO debe sustituir palabras por Turso — debe FUNDIR.",
  "lo_construido": {
    "RRF": "buscar_skill = reciprocal-rank fusion de _buscar (palabras, BM25-lite) + cantera.buscar_semantica (Turso si ON). K=60.",
    "source_tier_boost": "la SEMILLA curada (código) recibe un nudge sobre lo CRECIDO (bulk) — el tier se etiqueta al escanear. = el 'source-tier boost' de gbrain.",
    "degradacion_honesta": "semántica OFF/sin Turso/sin embeddings/índice vacío → cae a palabras (marcado en `por: palabras|fusion`). Por eso la key de Gemini pasa de REQUISITO a MEJORA: la cantera rankea por palabras hoy, la semántica solo afina el orden.",
    "auto_index": "importar/crear (lote ≤20) → fire-and-forget cantera.indexar mantiene el índice caliente (503 ignorado si OFF; reindexar backfillea el bulk)",
    "no_fusiona": "el RPC cosecha.buscar (mina del conserje, cada tick) se queda en palabras — barato, sin RPC por tick. La fusión solo donde paga: el chat interactivo."
  },
  "pendiente_del_mismo_plano": "el GRAFO tipado (+31.4) — Enki ya tiene aristas (lentes co-uso, grafo Obsidian); alimentar el ranking con ellas, no solo visualizar. HNSW nativo = el spike Turso (cantera-semantica)."
}
```

## PLANO 2 (pendiente) — poda-cuando-obsoleto para skills crecidas

```json
{
  "regla_gstack": "learnings.jsonl se poda cuando el fichero referenciado ya no existe",
  "mapeo_enki": "una skill CRECIDA cuyo módulo/ruta que la motiva ya no está → se poda. Freshness barata, per-reflejo (Enki federado, sin dream-cycle central). El dream-cycle de gbrain (dedup/salience/contradicciones) NO aplica tal cual — Enki no tiene Postgres central."
}
```

## PLANO 3 (pendiente, cuando se abra la frontera) — defensa anti-inyección de navegador

```json
{
  "capas_gstack": ["clasificador ML LOCAL (22MB) pre-lectura", "voting de un LLM barato sobre la FORMA (¿la página secuestra la tarea?)", "CANARY TOKEN en el system prompt → si sale en una request, exfiltración", "ensemble DeBERTa opt-in (721MB) modo paranoico", "deny-default del escape a Chrome DevTools Protocol"],
  "cuando": "el día que Enki corra automatización web NO-confiable (agent-browser vía ejecutor) — el contenido de la página es input adversarial",
  "canary_token": "barato y potente — aplicable YA al Portal/ejecutor (un token que NUNCA debe salir; si aparece en una llamada saliente, aborta), no solo a navegador"
}
```

## Donde Enki YA supera a gstack — NO cosechar

```
AISLAMIENTO   ejecutor (contenedor --rm --cap-drop ALL) > /freeze de gstack, que su propia doc admite "no es sandbox (sed se escapa)".
PUERTA REMOTA Portal MCP (interruptor kill-switch + scope/mode + audit + confirmación) > /pair-agent (tunnel+allowlist+token).
RAIL + JUEZ   objetivo + blocker tipado + tiro automático (de DeerFlow) — gstack no tiene evaluador de objetivo.
```

## Planos aún cosechables (DISEÑO, no código)

```
PANEL DE REVIEW multi-perspectiva  3 revisores independientes leen el MISMO artefacto (ceo/eng/design) → = judge-panel del Workflow.
                                   Enki lo tiene como patrón de orquestación; gstack lo tiene como oficio codificado (los 4 modos de scope del CEO).
CSO zero-noise                     gate de confianza 8/10 + 17 exclusiones + verificación independiente + exploit concreto = el patrón del /security-review,
                                   afinado contra ruido. Aplicable al code-review de Enki: subir el listón de confianza antes de reportar.
INVESTIGATE iron-law               "no fixes sin investigación · para tras 3 fallos · auto-freeze" = disciplina anti-parche. Cosechable como skill de oficio.
```

> **Por qué apunte y no pack, y qué cambió.** El valor real de gstack HOY fue un solo número —**+31.4 P@5,
> vector-solo pierde**— que cambió cómo cablear la cantera-semántica: FUSIÓN, no reemplazo, con boost de tier
> semilla (cosecha 0.10.0, ✓). Lo demás (canary, poda-por-referencia, panel de review, cso zero-noise) son
> planos baratos de copiar y caros de descubrir, guardados aquí para cuando la frontera lo pida. Las skills
> de gstack no se montan: solapan con ECC y no beben del vertical.

Sources: [github.com/garrytan/gstack](https://github.com/garrytan/gstack) · [github.com/garrytan/gbrain](https://github.com/garrytan/gbrain) · [gstack/docs/skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md)
