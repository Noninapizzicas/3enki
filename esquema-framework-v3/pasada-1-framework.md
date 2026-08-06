# Pasada 1 — Prisma sobre el CONCEPTO: cimiento de agentes v3

> Sujeto: el aparato que ejecuta trabajadores inteligentes con garantía de que su trabajo aterriza.
> Ley: agnosticismo — cero tecnologías del entorno (todo puerto abierto).

## 1 · IDENTIDAD

**Qué es:** el TALLER donde un trabajador inteligente produce y un jefe verifica antes de dar por hecho. No es el trabajador ni el jefe: es el aparato que los pone a trabajar juntos con un contrato.

**Trabajo del cliente que resuelve:** que un trabajo delegado termine con un entregable REAL y verificado — sin humo, sin cortes silenciosos, con progreso visible y reanudable.

## 2 · RESTRICCIONES (verdad_obligatoria)

- El éxito se certifica contra el ENTREGABLE, no contra la palabra del trabajador.
- Un trabajo que no cabe en el presupuesto no termina "hecho": termina honesto o se reanuda.
- El trabajador produce; el sistema juzga. El trabajador jamás certifica su propio trabajo.
- El progreso se registra paso a paso: una interrupción nunca pierde lo hecho.
- Los contratos con el exterior no cambian de forma al crecer: se amplían, no se rompen.

## 3 · CONTRATO

| Atributo | Descripción |
|---|---|
| `perfil` | Qué herramientas usa el trabajador, qué presupuesto, QUÉ ENTREGA (la promesa) |
| `bitácora` | Los pasos hechos, el paso actual, el estado |
| `veredicto` | verificado / no-verificado-explícito + la PRUEBA |

| Opción | Sub-forma | Sentido |
|---|---|---|
| Presupuesto | por trabajador | Cada tarea declara sus límites; no hay default que mutile |
| Entregable | opcional | Sin promesa → veredicto "no-verificado" explícito (nadie lo confunde) |
| Verificación | por tipo | archivo · evento · respuesta — según lo prometido |

| Estado | Descripción |
|---|---|
| solicitado → ejecutando → pausado → resumido → verificado → entregado | el ciclo de vida |
| fallido-honesto | cuando el trabajo no cabe o no existe — NUNCA "hecho" sin prueba |

## 4 · NO-OBJETIVOS

- No es un aparato de conversación: el chat no es un agente.
- No decide QUÉ tarea hacer: ejecuta el mandato que recibe.
- No reemplaza a los árbitros de dominio: los gates del proceso siguen decidiendo en su terreno.
- No garantiza que el trabajador piense bien: garantiza que su salida se verifica antes de creerle.
- No es un lenguaje ni un motor genérico de llamadas.

## 5 · PREGUNTAS ABIERTAS

- ¿Cómo se verifica un entregable que es "una decisión" (no un objeto)? → puerto `verificar(juicio)` o declarar no-verificable.
- ¿Cuánto avance mínimo define "sin progreso" en tareas de pensamiento puro (sin herramientas)?
- ¿Quién vigila al vigilante? (el jefe es determinista — ¿y si el propio jefe falla?)
- ¿La reanudación conserva el presupuesto restante o lo reinicia?

## Sub-productos (salen del prisma — pasan a pasada 2)

```
1. TRABAJADOR     — el que produce (fuzzy, con herramientas)
2. JEFE           — el que juzga el entregable (determinista)
3. TALLER         — el núcleo que ejecuta con presupuesto y registra pasos
4. CONTRATO       — el lenguaje entre ellos (perfil + veredicto)
5. VITRINA        — lo que el exterior observa (progreso verdadero)
```
