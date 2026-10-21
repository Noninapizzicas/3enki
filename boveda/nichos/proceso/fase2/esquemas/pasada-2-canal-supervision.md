# PASADA 2 · PUNTO: `canal-supervision` (Telegram/canal elegido)

> El vínculo dueño↔sistema que hace real la "autonomía con supervisión". Es el
> pulso, la puerta de las decisiones y el arranque (semilla). F0 lo declara
> "Telegram (u otro canal elegido)".

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
Es el **cara a cara del sistema con el dueño/operador**: recibe su semilla por un
bot (❓→ respuesta → arranca la búsqueda) y le devuelve pulso, casos a decidir,
alertas. La autonomía hace el trabajo; el canal mantiene el control. Diseñado
agnóstico: "u otro canal elegido" → puerto de canal, Telegram como implementación.

### 2 · RESTRICCIONES
- **FRENO**: un único canal = punto único de fallo (si cae, no hay semilla ni
  supervisión). → **EMPUJON**: **puerto de canal declarable** — varios canales
  (Telegram + otro) coexisten sin rehacer lógica; el dueño configura cuál.
- **FRENO**: notificaciones sin clasificar ahogan (pulso ≠ alerta ≠ decisión). →
  **EMPUJON**: **escalones de mensaje** (reflejo): pulso informativo periódico,
  alerta de sangría, y decisión que exige respuesta — cada uno con su cadencia, el
  dueño solo responde lo crítico.
- **FRENO**: el bot recibe semilla y también decisiones → riesgo de colisión de
  intenciones. → **EMPUJON**: **separación de intenciones** del mensaje entrante
  (semilla vs decisión vs consulta) por un micro-agente que clasifica antes de
  enrutar.

### 3 · CONTRATO
Recibe del dueño: semilla (arranque), decisiones (operar/cortar/puente), ajustes.
Entrega al dueño: pulso, alertas, paquetes a decidir, confirmaciones. Es el único
interlocutor técnico que el dueño ve de forma directa — el resto del sistema
trabaja detrás.

### 4 · NO-OBJETIVOS
NO decide (deciden el dueño y los micro-agentes de decisión asistida); NO fabrica
ingresos; NO valida. Es transporte de intención y estado, no cerebro.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué escalón exacto recibe el dueño por defecto (pulso diario? semanal?) y qué
  casos exigen SU respuesta sí o sí (gate de operar, corte de sangría, puente-humano)?
- ¿"Otro canal elegido" = cuáles? (lista no cerrada).
- ¿El pulso incluye el cuadro de salud financiera completo o solo resumen?

---

## Lo que sale (hojas / piezas)
- `puerto-canal` (puente — múltiple, declarable) → hoja → disección
- `escalones-mensaje` (reflejo — pulso/alerta/decisión) → hoja
- `clasificador-intencion` (micro-agente — semilla vs decisión vs consulta) → hoja
