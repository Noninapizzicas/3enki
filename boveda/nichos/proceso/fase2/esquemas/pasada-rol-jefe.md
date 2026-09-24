# PASADA · ROL: `jefe` (función interna: visión de conjunto)

> El ROL es la función interna que el sistema debe servir. En Nichos Autónomos el
> jefe es el dueño en su faceta de DECISIÓN DE PORTAFOLIO: ve la totalidad, decide
> el futuro del negocio. Se esquematiza por separado del trabajador aunque sea el
> mismo humano.

---

## Prisma de los 5 huecos DESDE la silla del jefe + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es el negocio para el jefe?
Su **portafolio de negocios**: un conjunto de proyectos (nichos) cada uno con su
salud financiera. El jefe NO opera la cadena de cada nicho; ve el agregado y decide
qué sigue, qué se corta, hacia dónde pivota. Su idioma no es "pasada de buscador"
sino "cuánto genera / quién sangra / qué operar a continuación".

### 2 · RESTRICCIONES — ¿qué le limita al ROL jefe?
- **FRENO**: el jefe no puede ver 15 nichos en detalle. → **EMPUJON**: vista
  AGREGADA de salud financiera por proyecto (el monitor es la lógica que lo sirve).
- **FRENO**: decidir sin el costo de cada proyecto. → **EMPUJON**: coste imputado
  por proyecto (imputacion-costes) visible en el cuadro.
- **FRENO**: si los micro-agentes deciden todo, el jefe pierde el control real.
  → **EMPUJON**: los gates de decisión (operar/cortar/puente) SIEMPRE llegan al
  jefe auto-explicados (paquete-decision) — autonomía operativa, control estratégico.

### 3 · CONTRATO — qué espera VER y ACTUAR el ROL jefe (cara de interfaz)
- VER: cuadro maestro (generan|sangran|neutro + flujo a caja por proyecto), alertas
  de sangría, cola de decisiones de gate.
- ACTUAR: aprobar/vetar gates (operar, cortar, puente-humano), ajustar umbrales y
  límites, reasignar prioridades del portafolio.

### LÓGICA DE DOMINIO que el rol jefe exige construir (lo que no cubre el interlocutor dueño)
- `vista-agregada-portafolio` (agregación sobre todos los proyectos → alimenta el
  dashboard de supervisión) — PIEZA de lógica nueva.
- `cola-decisiones-gate` (una sola cola donde el jefe resuelve gate por gate sin
  perderse).
- `ajustador-umbrales` (el jefe retunea criterio de viabilidad/sangría en caliente).

### 4 · NO-OBJETIVOS del rol jefe
NO opera el proceso de un nicho concreto (no es el trabajador); NO es el pagador
(cliente). Decide el futuro del portafolio, no ejecuta la cadena.

### 5 · PREGUNTAS ABIERTAS del rol jefe
- ¿Qué umbrales de decisión (genera/sangra/cortar) fija el jefe por defecto?
- ¿Con qué cadencia quiere el cuadro agregado (semanal? por evento de cobro/alerta)?

## PIEZAS que emergen SOLO desde el rol jefe → al árbol
- `vista-agregada-portafolio` (dashboard del jefe, cruza todos los módulos).
- `cola-decisiones-gate` (resolución ordenada de gates).
- `ajustador-umbrales` (retuning de criterio).
