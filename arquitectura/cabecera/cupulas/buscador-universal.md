---
id: cupulas/buscador-universal
dominio: cupulas
resumen: UNA puerta de búsqueda sobre TODAS las cúpulas — consulta las 5 en paralelo (_rpc × 5) y fusiona con RRF. El LLM llama una vez, recibe un top-K unificado con tipo por resultado. Cada cúpula sigue dueña de su índice y su reflejo.
fuentes:
  - modules/buscador-universal/**
verificado: 2026-08-01
---

# BUSCADOR UNIVERSAL — una puerta, todas las cúpulas

> Las cúpulas son 5 bibliotecas separadas (skills · agentes · eventos · estados · APIs). Cada una
> tiene su reflejo, su índice y su `buscar_*`. El problema: el LLM tiene que DECIDIR en cuál
> buscar ANTES de saber qué hay — decisión fuzzy que a veces falla. El buscador universal elimina
> esa decisión: UNA llamada, las 5 cúpulas responden en paralelo, un ranking fusionado sale.
>
> Las cúpulas NO se tocan. El buscador es un AGREGADOR fino que hace `_rpc` × 5 y fusiona
> resultados ya rankeados. Cada cúpula sigue rankeando con su lógica propia (la cantera tiene
> source-tier boost, agentes filtra obsoletos, eventos distingue tool/rpc). El agregador solo
> fusiona — reciprocal-rank fusion, el mismo patrón que la búsqueda híbrida de cantera
> (keyword + semántica, verificado con +31.4 P@5 vs vector-solo).

## Contrato (JSON)

```json
{
  "esquema": "buscador-universal-v1",
  "principio": "cúpulas separadas, búsqueda común — cada cúpula es dueña de su índice; el buscador solo fusiona",
  "cupulas_consultadas": [
    {"nombre": "cantera",        "rpc": "cosecha.buscar.request",              "tipo_resultado": "skill"},
    {"nombre": "agentes",        "rpc": "buscar_agente",                       "tipo_resultado": "agente"},
    {"nombre": "eventos",        "rpc": "cupula-eventos.buscar.request",       "tipo_resultado": "tool"},
    {"nombre": "estados",        "rpc": "estados.buscar.request",              "tipo_resultado": "proceso"},
    {"nombre": "apis-publicas",  "rpc": "apis-publicas.buscar.request",        "tipo_resultado": "api"}
  ],
  "puertas": {
    "buscar": "{query, tipo?:'skill'|'agente'|'tool'|'proceso'|'api'|'*', dominio?, limite?} → top-K unificado. tipo='*' por defecto (busca en TODAS). Con tipo explícito, solo consulta esa cúpula.",
    "estado": "→ {cupulas_activas[], total_por_tipo, ultima_fusion}"
  },
  "fusion": "Reciprocal Rank Fusion (RRF) sobre los rankings de cada cúpula. Cada cúpula devuelve su top-K interno ya rankeado; el agregador fusiona por 1/(k+rank) sumado entre cúpulas que devolvieron el mismo ítem (raro entre tipos, frecuente con overlap skill↔tool).",
  "universal": "tool buscar en GLOBAL_TOOLS (como buscar_skill/buscar_agente). El LLM llama UNA vez en vez de elegir cúpula."
}
```

## Pseudocódigo (reflejo)

```
CLASE BuscadorUniversal HEREDA ModuloHibridoReflejo {

  CONSTANTE CUPULAS = [
    { nombre: 'cantera',       rpc: 'cosecha.buscar.request',         tipo: 'skill',   campo: 'skills'  },
    { nombre: 'agentes',       rpc: 'buscar_agente',                  tipo: 'agente',  campo: 'agentes' },
    { nombre: 'eventos',       rpc: 'cupula-eventos.buscar.request',  tipo: 'tool',    campo: 'items'   },
    { nombre: 'estados',       rpc: 'estados.buscar.request',         tipo: 'proceso', campo: 'items'   },
    { nombre: 'apis-publicas', rpc: 'apis-publicas.buscar.request',   tipo: 'api',     campo: 'apis'    }
  ]

  CONSTANTE K_RRF = 60    // constante RRF estándar (= la de cosecha híbrida)

  // ── BUSCAR (la ÚNICA puerta) ──
  _buscar({query, tipo?, dominio?, limite?}):
    limite ← limite ?? 10
    tipo   ← tipo ?? '*'

    // 1. Seleccionar cúpulas a consultar
    targets ← tipo == '*' ? CUPULAS : CUPULAS.filtrar(c → c.tipo == tipo)
    SI targets.vacio: RETORNA 400 { tipo_desconocido: tipo }

    // 2. Consultar en PARALELO (_rpc concurrentes, timeout individual 3s)
    respuestas ← await Promise.allSettled(
      targets.map(c → _rpc(c.rpc, { query, dominio, limite }, { timeout: 3000 })
                        .then(r → { cupula: c, items: r[c.campo] ?? [] })
                        .catch(_ → { cupula: c, items: [] })        // cúpula caída → vacío, no rompe
      )
    )

    // 3. Fusionar con RRF
    scores ← Map<nombre, {score, entry, tipo}>
    PARA resp EN respuestas.fulfilled:
      PARA (item, rank) EN resp.items:
        key ← resp.cupula.tipo + ':' + item.nombre
        prev ← scores.get(key) ?? { score: 0, entry: item, tipo: resp.cupula.tipo }
        prev.score += 1 / (K_RRF + rank)
        scores.set(key, prev)

    // 4. Rankear y devolver
    ranked ← scores.values().ordenarDesc(score).tomar(limite)
    RETORNA {
      total: scores.size,
      cupulas_consultadas: respuestas.length,
      cupulas_respondieron: respuestas.fulfilled.length,
      resultados: ranked.map(→ { nombre, tipo, descripcion, score, dominio })
    }
}
```

## Modelo OOP — por qué AGREGADOR, no unificador

```
PATRON      Mediator (GoF) — el buscador MEDIA entre las cúpulas sin que se conozcan entre sí.
            Cada cúpula expone su buscar_* al bus (ya existente); el buscador las consulta por _rpc.
            Las cúpulas NO saben que el buscador existe. El buscador NO sabe cómo rankean internamente.

NO ES       Facade (escondería las cúpulas) — las buscar_* individuales SIGUEN expuestas.
            El LLM puede llamar buscar (universal) O buscar_skill (directo). Ambos caminos vivos.

COMPOSICIÓN (sobre herencia)
  BuscadorUniversal
    ├─ cupulas: Array<CupulaConfig>     (config, no instancias — desacoplado por bus)
    ├─ fusion:  RRF                     (el mismo algoritmo que cosecha híbrida)
    └─ bus:     EventBus                (el canal, no una dependencia de cada cúpula)
```

## El flujo completo (ejemplo: "nutrición")

```
LLM → buscar({ query: 'nutrición' })

  buscador → _rpc('cosecha.buscar', {query:'nutrición'})           → skills de escandallo
           → _rpc('buscar_agente', {query:'nutrición'})            → agente recetario-creativo
           → _rpc('cupula-eventos.buscar', {query:'nutrición'})    → tools ingredientes/productos
           → _rpc('estados.buscar', {query:'nutrición'})           → (vacío)
           → _rpc('apis-publicas.buscar', {query:'nutrición'})     → Open Food Facts, Edamam, Spoonacular

  ← RRF fusión → top-10 unificado:
    1. {nombre:'Open Food Facts',           tipo:'api',    score:0.048}
    2. {nombre:'precio-ingredientes-web',   tipo:'skill',  score:0.045}
    3. {nombre:'ingredientes.listar',       tipo:'tool',   score:0.042}
    4. {nombre:'Edamam',                    tipo:'api',    score:0.038}
    5. {nombre:'recetario-creativo',        tipo:'agente', score:0.035}
    ...

LLM → sabe qué hay de CADA tipo sin haber elegido cúpula antes.
     Si quiere la API → obtener_api('Open Food Facts') → ficha completa.
     Si quiere la skill → cosecha.obtener('precio-ingredientes-web') → SKILL.md.
     Si quiere el agente → invoke_agent('recetario-creativo').
```

## Degradación — cúpula caída no rompe la búsqueda

```
REGLA  cada _rpc tiene timeout individual (3s). Cúpula que no responde → 0 resultados de ese tipo,
       NUNCA error global. El buscador SIEMPRE devuelve — con menos tipos si una cúpula está caída.

  cantera caída    → el resultado no tiene skills, pero tiene agentes + tools + apis.
  apis-publicas    → aún no construida (◯ DISEÑO) → 0 apis. El buscador funciona con las 4 que existen.
  TODAS caídas     → { total: 0, cupulas_respondieron: 0, resultados: [] }. Honesto, no inventado.

  cupulas_respondieron < cupulas_consultadas → el LLM sabe que falta algo. El campo lo dice.
```

## Topics / piezas / estado

```
EVENTOS {
  buscador.buscar.request → .response    (la puerta universal)
  buscador.estado.request → .response
}
PIEZAS {
  modules/buscador-universal/              el agregador (reflejo, NO existe aún)
}
ESTADO {
  ◯ DISEÑO (v0, esta rebanada). El módulo NO existe aún.
  → SIGUIENTE: construir el reflejo — ~50 líneas: 5 _rpc en paralelo + RRF + proyección.
  → SIGUIENTE: tool buscar en GLOBAL_TOOLS (reemplaza la elección de cúpula por el LLM).
  → SIGUIENTE: decidir si las buscar_* individuales salen de GLOBAL_TOOLS (solo accesibles
    por bus) o se mantienen las dos vías (universal + directa). Empezar con las dos.
}
```

> **Trade-off vivo.** Mantener las búsquedas individuales (buscar_skill, buscar_agente, etc.)
> junto a la universal suma 6 tools al prompt del LLM. Pero quitar las individuales fuerza a
> TODA búsqueda a pasar por el agregador — incluso cuando el LLM ya sabe que busca una skill.
> Las dos vías es más superficie pero más eficiente: la universal para descubrir, la directa
> para ir a tiro fijo. Si el LLM abusa de las directas, se retiran de GLOBAL_TOOLS y solo
> quedan accesibles por bus (el buscador universal las sigue usando por _rpc).
