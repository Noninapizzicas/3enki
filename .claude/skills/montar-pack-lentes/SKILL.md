---
name: montar-pack-lentes
description: Recetario para onboardear un agente/skill externo (agency-agents, VoltAgent, un .md de oficio) como PACK del cuenco de lentes (modules/lentes-diseno), siguiendo la Teoría del Órgano. Un pack = un ÓRGANO de conocimiento: MEMORIA (.md) + opcional MOTOR (motor.js) + opcional QUÍMICO (frecuencia) + EVENTO. El cuenco lo auto-descubre; no se toca su código. La regla que manda: una lente solo entra cuando hay PÁGINA que la beba. Referencia viva: packs diseño/copy/negocio.
when-to-use: Cuando quieras dar a una página un OFICIO nuevo (diseño, copy, negocio, estrategia…) trayendo lentes de fuera, o añadir lentes a un oficio existente. NO para "acumular" .md sin destino — si ninguna página lo consume, se COSECHA como candidato, no se monta (pack colgante ensucia el grafo). Para el vertical 2 (comercio local): los packs llegan con sus páginas.
---

# montar-pack-lentes

> Soltar una carpeta `packs/<dominio>/` = soltar un ÓRGANO. El cuenco (lentes-diseno)
> la auto-descubre al cargar. No se reescribe nada. La diferencia entre un pack de
> solo-saber (diseño/copy) y uno que ADEMÁS hace (negocio) = qué facultades despierta.

## Cuándo usar (trigger como CONDICIÓN)

```
HAY una página (o varias) que beberá el oficio   → MONTA el pack
NO hay página consumidora todavía                → COSECHA el .md como candidato (lista viva), NO montes
quieres reforzar un oficio existente             → añade lentes a su pack (mismo recetario, sin página nueva)
```

## Contrato (JSON)

```json
{
  "entrada": {
    "dominio": "negocio",
    "fuente_md": ["agency-agents/finance/finance-financial-analyst.md", "..."],
    "paginas_consumidoras": ["escandallo", "viabilidad"],
    "motor": { "necesita": false, "ops": [] },
    "quimico": { "necesita": false }
  },
  "salida": {
    "packs/<dominio>/_pack.json": "el ADN (memoria + rutas + opcional motor/quimico + evento)",
    "packs/<dominio>/*.md": "las lentes copiadas",
    "packs/<dominio>/motor.js?": "solo si el órgano HACE (determinista)",
    "module.json de cada página": "lente_default: { dominio, tarea }",
    "tests": "verde (servir/anatomia ya cubren el cuenco; +caso si hay motor nuevo)"
  }
}
```

## Mecanismo (pseudocódigo)

```
FUNCION montarPack(dominio, fuente_md[], paginas[], motor?, quimico?) {
  // GUARD no_esteril: sin boca, no hay órgano (solo candidato cosechado)
  SI paginas.vacio Y NO refuerza_pack_existente:
      RETORNA cosechar(fuente_md)   // a la lista viva; NO se monta

  // 1. carpeta + memoria
  mkdir modules/lentes-diseno/packs/<dominio>/
  copiar fuente_md → packs/<dominio>/<dominio>-<nombre>.md   // prefijo por dominio

  // 2. ADN (_pack.json) — el genoma que el cuenco lee
  escribir packs/<dominio>/_pack.json {
    dominio, cuando_usar: "<trigger fuzzy que el LLM matchea>",
    memoria: {
      lentes: { "<nombre>": { archivo, cuando_usar } ... },   // cuando_usar = el filo de elección del LLM
      rutas:  { "<tarea>": ["<nombre>", ...] }                 // ruteo determinista (reflejo); también = tags del grafo
    },
    [motor:  { hook: "./motor.js", ops: [...] }],              // SOLO si HACE
    [quimico:{ cada: "7d", op: "<op>", evento: "<dominio>.<algo>" }],  // SOLO si late solo
    evento: { emite: ["lente.registrar"], escucha: ["lentes.obtener.request","lentes.listar.request"] }
  }

  // 3. MOTOR (opcional) — la facultad izquierda, determinista, una respuesta correcta
  SI motor.necesita:
      escribir packs/<dominio>/motor.js  // module.exports = { op(args){...} }; dinero en CÉNTIMOS

  // 4. NERVIO — cablea la entrega event-driven en cada página
  PARA pagina EN paginas:
      module.json[pagina].lente_default = { dominio, tarea: "<ruta por defecto>" }

  // 5. cierre — el cuenco NO se toca (auto-descubre). El grafo teje aristas solo.
  validar JSON de todos los _pack.json + module.json
  node scripts/validate-hibridos.js   // PASS
  node tests/unit/lentes-diseno__servir.test.js + __anatomia + __grafo   // PASS (+caso si motor nuevo)
}
```

## Pasos (accionables)

```
0. GUARD: ¿hay página que beba este dominio? Si NO → cosecha, NO montes (no colgantes).
1. mkdir packs/<dominio>/ ; copia los .md (prefijo <dominio>-).
2. _pack.json: dominio · cuando_usar · memoria{lentes,rutas} · evento. (motor/quimico solo si aplica.)
3. memoria.rutas: tarea→[lentes]. Son el SUELO determinista Y los tags del grafo (vecindad). Píénsalas.
4. ¿el órgano HACE algo determinista (aritmética/lectura)? → motor.js puro (céntimos si dinero). Si no, motor dormido.
5. lente_default {dominio,tarea} en cada página consumidora (module.json).
6. valida JSON + validate-hibridos + tests del cuenco. Verde o no se cierra.
7. el cuenco auto-descubre; el grafo absorbe nodos+aristas al cargar. Cero cambios en lentes-diseno/index.js.
```

## Lo que NO se hace

```
· NO se toca modules/lentes-diseno/index.js (el cuenco es genérico; auto-descubre).
· NO se monta un pack sin página consumidora (= memoria sin lector → dangling en el grafo).
· NO se mete dinero en floats (céntimos enteros, como pedido-tasador / motor negocio).
· NO se duplica una lente que ya existe en otro pack con otro nombre (ensucia la vecindad).
```

## Filosofía (trade-off vivo)

La tentación al escalar es **acumular** oficios "por si acaso". El cuenco lo hace barato, pero
cada pack sin boca es un nodo que el grafo carga sin que nadie lo pise. El filo no es *cuántas
lentes tienes* — es *cuántas tienen página que las beba*. Cosechar (lista) ≠ instalar (pack).
Ver `arquitectura/decisiones/propuestas/rumbo-plataforma.md`.
