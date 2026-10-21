# PASADA · ROL: `trabajador` (función interna: opera el proceso HOY)

> El ROL trabajador es el que opera la cadena de cada nicho en el día a día —
> ejecuta la secuencia semilla→búsqueda→validación→construcción→operación→cobro.
> En Nichos Autónomos es el propio sistema (la autonomía), pero se esquematiza por
> separado porque exige SU cara de control de proceso Y SU lógica de ejecución.

---

## Prisma de los 5 huecos DESDE la silla del trabajador + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es el negocio para el trabajador?
El **proceso que opera HOY**: una cadena por nicho con estados y colas. El
trabajador no ve el portafolio (eso es el jefe); ve el PIPELINE de un proyecto en
progreso: en dónde está, qué falta, qué bloquea, qué hay que empujar.

### 2 · RESTRICCIONES — ¿qué le limita al ROL trabajador?
- **FRENO**: los pasos en serie (buscar→validar→construir→operar) se atascan uno a
  uno. → **EMPUJON**: cola/cola de ciclo del pipeline con estados; el batch de
  validación desacopla el cuello (varios nichos en paralelo).
- **FRENO**: un paso falla (fuente muerta, puente-humano pendiente) y el resto
  espera. → **EMPUJON**: manejo de fallo + reintento y alternativa
  (invariante: se crea/alternativa), el puente-humano es SOLO excepción.
- **FRENO**: el trabajador no sabe qué pasó en las pasadas previas del nicho.
  → **EMPUJON**: historial por nicho (registro de estados y decisiones) — pieza de
  continuidad.
- **FRENO**: sin señal de avance, nadie sabe si la cadena anda. → **EMPUJON**:
  pulso de avance por etapa (cruza con canal-supervision escalones).

### 3 · CONTRATO — qué espera VER y ACTUAR el rol trabajador (cara de interfaz)
- VER: pipeline por nicho (estado de cada etapa), cola de candidatos en validación,
  fallos y reintentos.
- ACTUAR: lanzar la siguiente etapa de un nicho, reintentar, desbloquear, empujar el
  batch de validación.

### LÓGICA DE DOMINIO que el rol trabajador exige construir
- `pipeline-por-nicho` (máquina de estados de la cadena semilla→caja por proyecto) —
  PIEZA central de lógica.
- `cola-candidatos-validacion` (buffer del cuello de botella).
- `manejo-fallo-reintento` (resiliencia de cada etapa).
- `historial-por-nicho` (registro append-only de estados/decisiones).
- `pulso-avance-etapa` (progreso por etapa → escalones al supervisor).

### 4 · NO-OBJETIVOS del rol trabajador
NO decide el futuro del portafolio (jefe); NO es el pagador (cliente). Ejecuta el
proceso de HOY: no decide estrategia global.

### 5 · PREGUNTAS ABIERTAS del rol trabajador
- ¿Cuántos proyectos en paralelo opera el pipeline por defecto (limiten el batch)?
- ¿Qué pasa si un nicho queda a mitad por puente-humano pendiente: espera en cola
  o se pausa su historial?

## PIEZAS que emergen SOLO desde el rol trabajador → al árbol
- `pipeline-por-nicho` (máquina de estados semilla→caja).
- `cola-candidatos-validacion` (buffer del cuello).
- `manejo-fallo-reintento`.
- `historial-por-nicho` (continuidad).
- `pulso-avance-etapa`.
