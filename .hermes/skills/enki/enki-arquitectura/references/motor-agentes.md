# Motor de Agentes — el esquema (visión aprobada 2026-08-06)

> Fuente: `arquitectura/esquema-motor-agentes/` en el repo 3enki (pasadas +
> esquema.md). Generado con la skill `esquematizador` (prisma recursivo +
> disección) — NO con el agente esquematizador-negocio (falló 3 veces: el LLM
> del agente recibió las tools y no las usó; bitácora con pasos solo
> ['started','final']).

## El sujeto
El motor que ejecuta los agentes de Enki como PIPELINES casi todo deterministas,
con una parte fuzzy acotada y verificada. Vende trabajo terminado y VERIFICADO
contra el mundo real, no promesas.

## Las 10 piezas y sus formas

| Pieza | FORMA | Qué hace |
|---|---|---|
| P1 Ejecutor de pipelines | REFLEJO | recorre pasos en orden; reflejo → ejecuta; fuzzy → abre P5 |
| P2 Registro de pipelines | CUSTODIO | definición de cada agente: pasos, validaciones, entregable+reglas, presupuesto |
| P3 Validador de salidas fuzzy | REFLEJO | checkpoint determinista tras CADA paso fuzzy; reintento quirúrgico con veredicto |
| P4 Verificador de entregable (JEFE) | REFLEJO | reglas contra el MUNDO REAL al final; verificado:false = veredicto, jamás éxito |
| P5 Puerto de generación | MICRO-AGENTE | el ÚNICO fuzzy: genera (instrucción+contexto → salida cruda); nunca persiste/ejecuta/decide |
| P6 Bitácora | CUSTODIO | cada paso de cada ejecución queda ESCRITO |
| P7 Rail de estados | CUSTODIO | checkpoints entre fases; avanzar() solo tras el veredicto |
| P8 Vitrina | PUENTE | proyecta progreso/pasos/veredicto — no escribe |
| P9 Reanudador | REFLEJO+CUSTODIO | retoma pausadas/fallidas desde la bitácora con el veredicto como corrección |
| P10 Conversor de salida | CONVERSOR | UNA frontera crudo→canónico |

Reparto: 4 REFLEJO · 3 CUSTODIO · 1 MICRO-AGENTE · 1 CONVERSOR · 1 PUENTE →
~90% determinista.

## El flujo de una ejecución

```
declarar(pipeline) → P2 · ejecutar(proyecto,pipeline) → P1
  paso REFLEJO → ejecuta → P6 registra → P8 proyecta
  paso FUZZY   → P5 genera → P10 convierte → P3 valida
                 → ¿corregir? → reintento QUIRÚRGICO de P5 (máx. presupuesto)
  fin → P4 JEFE verifica contra el mundo real
       → verificado → P7 avanzar + P6 sella + P8 ✅
       → NO y quedan reintentos → P9 reanuda con el veredicto
       → NO y agotado → P6 sella fallida + P8 ❌ (veredicto completo)
```

## Puertos (cero tecnologías — prueba de fuego)

`leer(proyecto,ruta)` · `escribir(proyecto,ruta,contenido)` ·
`generar(instruccion,contexto)→salida_cruda` · `convertir(salida_cruda)` ·
`validar(salida,reglas)→veredicto_paso` · `verificar(entregable,reglas,mundo)` ·
`persistir(paso)` · `avanzar(estado)` · `observar(execucion)` · `reanudar(execucion)`

## Estado de construcción (ciclo de obra)

1. ✅ Reflejos puros en `modules/_shared/motor/` (validador.js · verificador.js
   con puerto mundo inyectado DI · conversor.js) — test.js 19/19 verdes.
2. ⏭️ Custodios: registro de pipelines (P2) + bitácora (P6) — módulos Enki con
   module.json + eventos (único escritor por store). El rail (P7) se REUTILIZA
   (estados.* existe — referencia, no duplicar).
3. Ejecutor (P1) — ai-agent-framework-v3: orquesta pasos, eventos agent.execute.*
4. Fuzzy (P5) → contrato con el gateway · Puente (P8) → vitrina.

## Decisión de medio (dueño)

JS puro como módulo de Enki + event-driven. El JEFE es I/O (stat/read), no CPU
— Node async aguanta miles de verificaciones; si algún día fuese CPU-bound, se
extrae SOLO el JEFE (candidato Rust/worker), no el motor. El JEFE se diseña ya
para escala: barato · idempotente · paralelo · cacheable (hash del entregable).
