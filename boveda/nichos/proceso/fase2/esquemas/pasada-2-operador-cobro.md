# PASADA 2 · PUNTO: `operador-cobro` (F4 — operar y cobrar)

> F4: donde el proyecto deja de ser un montaje y se convierte en flujo de caja.
> Es el tramo que materializa la medida maestra (salud financiera). Incluye
> estudio de competencia y reunión con el admin/operador antes de operar.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El **motor de operación y cobro**: pone en marcha la solución construida, la hace
llegar a su cliente final (el pagador del nicho) y ejecuta el cobro real según el
modelo decidido. Antes de operar, declara un **estudio de competencia** (¿quién
más sirve este nicho? ¿qué ofrecemos distinto?) y una **reunión con el admin** →
decisión del dueño de lanzar. Opera hasta que el flujo a caja se materializa.

### 2 · RESTRICCIONES
- **FRENO**: "reunión con admin → decisión del dueño" es otro tapón humano antes
  de operar. → **EMPUJON**: **decisión de operar** como punto de gate con paquete
  cerrado (competencia + modelo + proyección) que el dueño aprueba/rechaza por el
  canal — no una reunión síncrona; el resto del ciclo autónomo no espera.
- **FRENO**: cobrar exige integración con procesadores/plataformas por tipo de
  nicho (no declarados). → **EMPUJON**: puerto de **cobro agnóstico** (pasada
  proveedor/cobro): plataformas declaradas e intercambiables; se crea la
  integración si ninguna sirve (invariante).
- **FRENO**: sin competencia evaluada se opera a ciegas. → **EMPUJON**:
  **estudio-competencia** automatizado como pieza previa al gate de operación.
- **FRENO**: cliente final no llega solo. → **EMPUJON**: canal de llegada
  (distribución) del proyecto al comprador según el nicho — pieza que conecta con
  el cliente (pasada cliente).

### 3 · CONTRATO
Recibe de F3: solución operable + modelo de cobro. Emite: ventas reales → flujo a
caja (que alimenta el monitor de salud financiera) + registro de cobros. A cambio
del conjunto: la cadena cumple su promesa (llegar a caja, no detenerse en ideas).

### 4 · NO-OBJETIVOS
NO valida (F2) ni construye (F3). NO decide el portafolio (jefe). Opera y cobra:
no inventa demanda que no haya pasado validación.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué procesadores/plataformas de cobro y distribución se declaran de partida?
- ¿Qué define "operar hasta cobrar" como terminado: primer cobro, flujo estable
  N semanas? (el umbral de operación es abierto).
- ¿Cada cuánto se reporta el flujo al monitor de salud financiera?

---

## Lo que sale (hojas / piezas)
- `estudio-competencia` (reflejo + micro-agente — antes del gate) → hoja
- `gate-decision-operar` (puente — paquete al dueño por canal, evento) → hoja
- `motor-cobro` (reflejo puro — registra/ejecuta cobro vía plataformas declaradas) → hoja
- `canal-distribucion` (puente — lleva la solución al pagador del nicho) → hoja
