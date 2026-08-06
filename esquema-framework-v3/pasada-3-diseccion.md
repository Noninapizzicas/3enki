# Disección — FORMA de cada hoja del cimiento de agentes v3

> Método: las 6 preguntas del diseccionador a cada hoja atómica.
> Corte maestro (PENSAR/CALCULAR) aplicado primero.

## 1 · TRABAJADOR → **MICRO-AGENTE fuzzy**

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | PENSAR — interpreta el mandato, decide las herramientas, produce. Juicio real. |
| ¿Quién ESCRIBE? | Nadie más que él en su producción (su salida es cruda, no definitiva). |
| ¿De A UNA? | Sí — un mandato a la vez (invariante del sistema). |
| ¿Si FALTA contexto? | Lo nombra en su salida (hueco declarado, jamás inventa). |
| ¿Frontera de formatos? | No cruza unidades: produce en el formato del mandato. |
| ¿Cómo se CONECTA? | Por mandato y herramienta (puertos `ejecutar(herramienta)`, `recibir(mandato)`). |

**Regla de oro:** el trabajador NUNCA se autoevalúa. Su salida es materia prima del jefe.

## 2 · JEFE → **REFLEJO puro**

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — existencia y cumplimiento se comprueban con reglas objetivas. |
| ¿Quién ESCRIBE? | Un solo dueño del veredicto (él). |
| ¿Si FALTA la prueba? | Veredicto `no-verificado-explícito` — jamás afirma sin prueba. |
| ¿Frontera de formatos? | No. |
| ¿Cómo se CONECTA? | Por evento: recibe `producción` y `promesa` → emite `veredicto`. |

**Un test afirma su veredicto.** Es la pieza que hace el humo estructuralmente imposible.

## 3 · TALLER → **REFLEJO** (orquestación determinista)

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — el bucle (ejecutar → registrar → ¿seguir? → cerrar) es lógica fija. |
| ¿Quién ESCRIBE? | Él delega: la bitácora (custodio) y el reanudador (custodio). El taller no persiste. |
| ¿De A UNA? | Sí — un paso a la vez, registrado antes de seguir. |
| ¿Si FALTA? | Corta en HONESTO: fallido-honesto con la razón, nunca "hecho". |
| ¿Cómo se CONECTA? | Por evento: `mandato` entra, `producción + bitácora` salen. |

## 4 · BITÁCORA → **CUSTODIO**

| Pregunta | Respuesta |
|---|---|
| ¿Quién ESCRIBE? | El taller, y SOLO él (single-writer — 1 registro = 1 dueño). |
| ¿De A UNA? | Sí — apéndice por paso, atómico. |
| ¿Si FALTA el registro? | El paso no existe: el reanudador solo continúa desde pasos registrados. |
| ¿Cómo se CONECTA? | Por evento: `registrar(paso)` → `bitácora.actualizada`. |

**Es el origen de la verdad del progreso.** La vitrina solo la proyecta.

## 5 · PRESUPUESTO → **REFLEJO**

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — avance, tamaño, tiempo, iteraciones: aritmética de límites. |
| ¿De A UNA? | Sí — se consulta antes de cada paso. |
| ¿Si FALTA? | Agotado → fallido-honesto (o pausado para reanudar con más). |
| ¿Cómo se CONECTA? | Por evento: `consultar(presupuesto)` → `restante`. |

## 6 · REANUDADOR → **REFLEJO + CUSTODIO**

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — reconstruye el estado desde el último paso registrado. |
| ¿Quién ESCRIBE? | Él (persistencia del punto de reanudación — single-writer). |
| ¿De A UNA? | Sí — un punto de reanudación por ejecución. |
| ¿Si FALTA el estado? | Reinicia la ejecución desde cero (declarado, sin fingir avance). |
| ¿Cómo se CONECTA? | Por evento: `pausar` → guarda; `resumir` → continúa. |

## 7 · CONTRATO (perfil + veredicto) → **REFLEJO** (validación)

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — validación de esquema: reglas, no juicio. |
| ¿Si FALTA la promesa? | Perfil inválido → rechazado en la puerta; sin promesa → no-verificado explícito. |
| ¿Cómo se CONECTA? | Por evento: `definir(perfil)` → `validado` / `rechazado`. |

## 8 · VITRINA → **PUENTE**

| Pregunta | Respuesta |
|---|---|
| ¿PENSAR o CALCULAR? | CALCULAR — proyección de la bitácora (pero no escribe: por eso PUENTE, no CUSTODIO). |
| ¿Quién ESCRIBE? | Nadie — solo observa la bitácora y la proyecta al exterior. |
| ¿Cómo se CONECTA? | Por evento: `bitácora.actualizada` → `avance.visible` (sin pisar el registro). |

**No toca la verdad: la muestra.**

---

## Reparto final

```
REFLEJO (7):   JEFE · TALLER · PRESUPUESTO · CONTRATO · REGLA-DE-VERIFICACIÓN · VEREDICTO · VISTA-DE-AVANCE
CUSTODIO (2):  BITÁCORA · REANUDADOR
MICRO-AGENTE (1): TRABAJADOR
PUENTE (1):    VITRINA
CONVERSOR (0): — no hay frontera de unidades que cruzar
```

## Lo que la disección revela (el cruce)

- **El jefe y el taller son REFLEJOS separados** — en el guión original el gate vivía dentro del orquestador; la disección los separa: el taller ejecuta, el jefe juzga. Un test puede afirmar cada uno por separado.
- **La bitácora es un CUSTODIO con nombre propio** — "checkpoint por tool_call" era la intuición; ahora es una pieza con single-writer, persistencia y origen de la verdad.
- **La vitrina es un PUENTE** — el progreso observable no es un extra: es una pieza que proyecta sin escribir, conectada por evento.
- **1 solo micro-agente** (el trabajador) — todo lo demás es determinista. El cimiento es mayoritariamente reflejo: testeable, fiable, sin humo posible.
- **Puerto `verificar(juicio)`** — la pregunta abierta honesta: un entregable que es una decisión no se verifica como un objeto; se declara o se abre el puerto.
