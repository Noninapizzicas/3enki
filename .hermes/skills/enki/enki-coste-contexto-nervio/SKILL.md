---
name: enki-coste-contexto-nervio
description: >-
  Medir y reducir el coste en tokens que el nervio de Enki (ai-gateway) inyecta
  como contexto en cada turno — el rail de la cúpula de estados, propiocepción,
  y otras secciones compuestas por _composeRailSection / _leerRailActivo.
  Cuándo: el dueño pregunta "cuánto cuesta en tokens inyectar X" o "cómo meto la
  misma información en un tercio de los tokens". Método: medir el output real del
  código del nervio sobre los datos reales de un proyecto, desglosar por
  componente, y aplicar las palancas de compresión.
source: hermes
tags: [enki, tokens, coste, contexto, nervio, ai-gateway, rail, cupula, optimizacion]
---

# Enki — coste de contexto del nervio y cómo comprimirlo

Cuando se pregunta "¿cuánto cuesta en tokens inyectar <sección del nervio>?" o
"¿cómo meto la misma info en un tercio?", NO se estima de memoria: se **mide el
output del código real** sobre los **datos reales de un proyecto**, se desglosa,
y se aplican palancas. Este método vale para el rail de estados y para cualquier
sección que `_composeRailSection`/`_leerRailActivo` generen.

## 1 · Localizar el código del nervio
- `modules/conversacion/ai-gateway/index.js`
  - `_leerRailActivo(project_id)` (~L1699): RPC `estados.estado` sin lista_id → la ACTIVA. Timeout 2s → null. **Sin lista activa → 0 tokens.**
  - `_composeRailSection(lista)` (~L1722): compone la sección inyectada.
  - `_composeJuezPrompt` / `_composeJuezInput` (~L1776): el juez del objetivo.
- `estados` reflejo: `modules/estados/` · plantillas: `_shared/procesos-semilla.js`.

## 2 · Medir (no adivinar)
Regla rápida de tokens: **chars / 3.5** (o 1/4 como cota alta). Para medir, replicar
`_composeRailSection` en Python sobre `data/projects/<slug>/storage/estados/listas.json`,
tomar la lista `activa`, y sumar chars por componente. El nervio solo inyecta la ACTIVA.

### Desglose típico del rail activo (13 pasos, sin objetivo) — medido 19-ago the-pirate
| Componente | ≈tok | % |
|---|---|---|
| Boilerplate (texto fijo, idéntico cada turno) | 129 | 26% |
| Cuerpo de los pasos | 313 | 63% |
| Aviso "sin objetivo" | 50 | 10% |
| **Total** | **~500** | |

Lista pequeña (4 pasos): ~176–200 tok. Lista media (13): ~440–500 tok.

## 3 · Palancas para llegar a ~1/3
1. **Boilerplate → comprimir a una línea** (`# RAIL «X» (estricto) — marca con estados.avanzar`).
   El texto fijo se repite igual cada turno; el LLM ya sabe qué es un rail. 129 → ~20 tok.
2. **Aviso "sin objetivo" → 0**: solo aparece si la lista no tiene objetivo. Fijar objetivo
   lo elimina Y despierta al juez. Es el 10% gratis.
3. **Cuerpo de pasos** (la palanca grande, con trade-off):
   - (a) formato compacto (sin numeración, textos escuetos): → ~250 tok.
   - (b) inyectar SOLO el paso actual (estricto; el LLM pide la lista a demanda con
     `estados.estado`): → ~75–90 tok. **Menos de 1/3, de largo.**

**(b) + palancas 1 y 2 ≈ ~85 tok/turno** vs ~500 ≈ **1/6**.

## Trade-off (decidir con el dueño)
- "Solo paso actual" (~85 tok): mínimo coste, pero el LLM no ve el mapa completo cada turno (lo ve a demanda).
- "Cuerpo compacto completo" (~180 tok, 1/3 justo): conserva el mapa entero, formato escueto.

## Verificación
- Leer `_composeRailSection` y confirmar que el cambio respeta: marca hecho/falta/atascado,
  paso ACTUAL en estricto, y que "NO lo recites" sigue presente aunque sea más corto.
- Cambios de código en ai-gateway van por rama `hermes/` + PR (regla 3enki), y el
  `verificado:` de la rebanada `cupulas/estados.md` se actualiza.

> Nota: la skill `rail-vivo` (cantera externa read-only) cubre el USO del rail; esta cubre el
> COSTE de inyección y su compresión. No duplican.
