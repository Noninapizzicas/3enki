# PASADA 2 · PUNTO: `semilla-buscador` (arranque del proceso)

> El disparador del ciclo completo. Sin semilla válida, la cadena no arranca:
> es la entrada que convierte al dueño (humano) en parte acoplada del flujo.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
Puerto de entrada del dueño → el sistema. Captura una palabra/idea corta (o un
contexto mayor) por el canal elegido (Telegram por defecto, "u otro canal
elegido") y la convierte en la orden de arranque de una búsqueda: ❓ lanzar →
respuesta del dueño → primera pasada del buscador. No es un chat abierto: es un
**gatillo con formato** (recibe semilla y emite `buscar(seed)`).

### 2 · RESTRICCIONES
- **FRENO**: una sola palabra es ambigua (¿qué quiere decir "zapato"?). →
  **EMPUJON**: normalización de semilla — expande/desambigua la idea a intenciones
  de búsqueda (reflejo) antes de emitirla al buscador, para que F1 no trabaje en vacío.
- **FRENO**: depende de un canal único → si Telegram cae, no hay arranque. →
  **EMPUJON**: puerto de canal agnóstico (canal-supervision), Telegram es una
  implementación; varios canales pueden coexistir sin rehacer la lógica.
- **FRENO**: semilla no validada (idea vacía o inválida) atasca. → **EMPUJON**:
  regla de aceptación de semilla (reflejo puro): rechaza lo vacío, pide
  confirmación, nunca bloquea sin aviso.

### 3 · CONTRATO
Da al dueño: el arranque de una búsqueda y la confirmación de que su semilla
entró. Recibe del dueño: la semilla. Emite hacia dentro: `buscar(seed)`.

### 4 · NO-OBJETIVOS
NO es el buscador (no explora); NO es la validación (no juzga viabilidad); NO es
el supervisor (no decide casos). Solo *gatilla*.

### 5 · PREGUNTAS ABIERTAS
- ¿Formato exacto de semilla (palabra → ¿cuántas? frase permitida? ¿con contexto
  opcional adjunto?) — no declarado.
- ¿Debe el dueño aprobar la semilla normalizada antes de buscar, o arranca directo?
- ¿"Otro canal elegido" = cuáles? (lista no cerrada en F0).

---

## Lo que sale (hojas / piezas)
- `captura-semilla` (reflejo puro — acepta/formatea) → hoja atómica → disección
- `normalizacion-semilla` (reflejo — desambigua a intenciones) → hoja → disección
- señal `buscar(seed)` (evento de arranque, consumido por el buscador)
