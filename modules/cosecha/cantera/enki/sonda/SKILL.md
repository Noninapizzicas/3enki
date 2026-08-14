---
name: sonda
description: Micro-agente híbrido (reflejo + blueprint) que vigila las fuentes de mercado (RSS, APIs públicas, feeds) y cosecha SEÑALES crudas (titulo, fuente, url, sector, fechaCosecha) SIN decidir si un nicho vale. Reflejo: registro de fuentes (patrón radar-fuente: canal/métrica/frecuencia/umbral) + dedupe por (fuente,url) + persistencia. Blueprint: cajón recolectar (responde:true) que LEER/PENSAR con crawl4rs y DELEGA el GUARDAR al reflejo.
when-to-use: Cuando el radar de nichos necesite vigilar fuentes de mercado, cosechar señales crudas de la web (RSS/APIs/feeds vía crawl4rs), o persistir/consultar el registro de fuentes de un proyecto. Es el eslabón de ENTRADA del ciclo: reloj → sonda → banco → evaluador → redactor → cartero.
tags: [radar, nichos, vigilancia, crawl4rs, rss, cosecha, micro-agente, hibrido, egress]
lente_dominio: radar
---

# sonda — el vigilante de fuentes de mercado

## Qué es

Micro-agente híbrido del sistema Radar de Nichos. Vigila fuentes de mercado y cosecha señales crudas SIN decidir si un nicho vale (eso es el evaluador). La sonda es el eslabón de ENTRADA del ciclo completo:

```
reloj (semanal) → sonda.recolectar (cajón) → sonda.cosecha.guardar (reflejo) → sonda.senales_cosechadas
→ banco.anadir → evaluador.evaluar → banco listar APROBADO → redactor → cartero → ciclo_completado
```

## Contrato

- **entrada** = configuración de fuentes (canal, métrica, frecuencia_h, umbral, url, activa) + cosechas del cajón
- **salida** = `sonda.senales_cosechadas` (señales NUEVAS, dedupe por fuente+url) · `sonda.fuente.configurada` · `sonda.recolectar.failed`
- **garantía** = custodia el registro de fuentes; dedupe determinista; persiste por proyecto (PosPersistencia)
- **no hace** = no decide si un nicho vale (evaluador); no analiza el markdown (cajón del blueprint)

## FORMA: REFLEJO del híbrido

Op determinista + evento de dominio. El cajón `recolectar` (blueprint, responde:true en `sonda.recolectar.request`) hace LEER/PENSAR con crawl4rs y DELEGA el GUARDAR aquí (`sonda.cosecha.guardar.request`) para que el dedupe y la persistencia sean deterministas. **Anti-colisión: recolectar SOLO en el blueprint, nunca en el reflejo.**

## RPCs que atiende (reflejo)

| request | handler | respuesta |
|---|---|---|
| `sonda.fuentes.listar.request` | onFuentesListarRequest | 200 `{ fuentes, total, ultimaCosecha }` |
| `sonda.fuentes.configurar.request` | onFuentesConfigurarRequest | 200 `{ id, config }` · 400 INVALID_INPUT si falta métrica o frecuencia_h |
| `sonda.cosecha.guardar.request` | onCosechaGuardarRequest | 200 `{ añadidas, duplicadas, malformadas, senales }` |
| `project.activated` | onProjectActivated | restaura persistencia (fuentes + ultimaCosecha + senalesVistas) |

## Eventos que publica

- `sonda.senales_cosechadas` — SOLO si hay señales NUEVAS (añadidas > 0). Payload: `{ senales, total_nuevas, ultimaCosecha }`
- `sonda.fuente.configurada` — fuente creada/ajustada. `{ id, config }`
- `sonda.recolectar.failed` — ciclo de recolección falló. `{ error, detalle? }`

## Reglas del registro de fuentes (patrón radar-fuente)

- Cada fuente: `{ id, canal, metrica, frecuencia_h, umbral, url, activa }`
- **métrica y frecuencia_h OBLIGATORIAS** (400 si faltan) — la garantía del contrato
- `configurar` = merge parcial: base (existente o defaults) + `input.config`

## Dedupe y persistencia (deterministas)

- Clave de dedupe: `${fuente}|${url}` en `_senalesVistas` (Set persistido)
- Señal malformada (sin fuente o url): se descarta pero CUENTA en `malformadas` (nunca silenciosa)
- Snapshot persistido: `{ fuentes, ultimaCosecha: { ts, barrido, senales }, senalesVistas }` en `storage/radar/sonda.json`
- `ultimaCosecha.barrido` refleja las fuentes consultadas en el último ciclo (`{ fuentesConsultadas, ok }`)

## El cajón `recolectar` (blueprint)

- LEER/PENSAR con crawl4rs por cada fuente del registro (solo las activas)
- **Guardado INCREMENTAL por fuente (fix C, 2026-08-14)**: tras extraer señales de UNA fuente, llama `sonda.cosecha.guardar.request` con SOLO las de esa fuente y el barrido acumulado. NO esperar a terminar el bucle para un único guardar grande: si el LLM se corta a mitad, la pérdida queda acotada a las fuentes restantes, no al ciclo entero.
- Reparto de contenido por canal:
  - `rss`: markdown del feed, truncado a ~5000 chars por fuente (contexto acotado)
  - `busqueda`: extraer de `r.data.resultados` — `{ titulo, url, resumen }` (contrato real de crawl4rs.buscar; el campo `resultados` NO existe en la respuesta)
- Cierre best-effort: al acabar, un último guardar con `senales: []` y el barrido COMPLETO para que el estado persistido refleje las 15 fuentes consultadas aunque el guardado haya sido por fuente (el reflejo no emite evento si no hay nuevas — solo actualiza ultimaCosecha.barrido).
- Todas las fuentes caídas → `sonda.recolectar.failed`
- El veredicto final suma los totales de cada guardar (añadidas/duplicadas/malformadas)

## Interruptor

- `sonda` — egress consciente (la sonda sale a internet vía crawl4rs). Apagarlo detiene el egress SIN tocar el registro de fuentes. Registrado en onLoad vía `interruptor.registrar`.
- Al arrancar puede NO aparecer en el registro central si el broadcast `interruptor.solicitar_registro` no está suscrito — verificar con `interruptores.estado.request` { id:'sonda' } antes de dar por apagado.

## Pitfalls aprendidos en vivo

1. **Hidratación LAZY (fix 2026-08-14)**: tras restart, si `fuentes` está vacío y hay persistencia en disco, `_listarFuentes` restaura ANTES de responder. Sin esto, `fuentes.listar.request` devolvía `{fuentes: [], total: 0}` con 15 fuentes en disco — el delator fue un project.activated sin base_path (el filesystem anclaba el path global a otro proyecto). Síntoma: ciclo → 0 señales → semana_vacia sin error.
2. **Guarda de verificación**: NUNCA confiar en la respuesta RPC para saber si la cosecha persistió — verificar por DISCO (`fs.read storage/radar/sonda.json`): `ultimaCosecha.ts` y `barrido.fuentesConsultadas` son la evidencia.
3. **Blueprints se recargan por invocación**: un fix en sonda.blueprint.json NO requiere restart — el cajón se relee al invocarlo. Los módulos JS (reflejo) sí requieren restart. (Fix C del 14-08 funcionó en prod SIN restart: ciclo 20:40 cosechó ~100 señales de 9 fuentes.)
4. **El runtime ve la versión de disco del blueprint**: si el runtime no muestra el fix, confirmar que el archivo en disco es el esperado (comparar mtime con el deploy) antes de reiniciar.
5. **`ultimaCosecha.senales` acumula**: cada guardar appenda a `senales` del snapshot — el archivo puede crecer; el dedupe por (fuente,url) evita duplicados en nuevos barridos.
6. **Crawl4rs puede tardar**: barridos de 15 fuentes pueden dejar 2 en timeout — es normal, `barrido` lo refleja y el ciclo sigue (13 ok / 2 timeout es un barrido sano).

## Verificación del entregable

- `node --check index.js` limpio (reflejo)
- Gate `validate-hibridos --module sonda` PASS (reparto reflejo/cajón, anti-colisión, persistencia delegada, emisión)
- Smoke en vivo: `sonda.fuentes.listar.request` → 200 con `fuentes` + `total` (≥1 si hay registro) + `ultimaCosecha`
- Ciclo completo: en el journal, `sonda.cosecha.guardar` llamándose por fuente con señales (8-15 llamadas), no 0
