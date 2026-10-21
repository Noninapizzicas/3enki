# Pasada 2 — Expansión de los SPAWN de "marketing-automation"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Flujos

Un flujo automatizado. Se dispara por un evento, ejecuta una secuencia de pasos y aplica reglas para bifurcar.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Identificador legible del flujo ("Bienvenida nuevo suscriptor", "Recuperación carrito"). |
| 2 | **Trigger** | ATÓMICO | El evento que dispara el flujo: { evento, condiciones }. Matching determinista. |
| 3 | **Pasos** | ATÓMICO | Secuencia ordenada de acciones: [{ tipo, config }]. Tipos: enviar / esperar / evaluar / bifurcar. |
| 4 | **Reglas** | ATÓMICO | Predicados que deciden el camino: [{ condicion, paso_si_verdadero, paso_si_falso }]. Deterministas. |
| 5 | **Estado** | ATÓMICO | Máquina de estados: borrador → activo → pausado → retirado. |
| 6 | **Historial** | ATÓMICO | Registro de ejecuciones: [{ fecha, trigger_data, pasos_ejecutados, resultado }]. Se ACUMULA. |

**Suelo alcanzado** — piezas atómicas.

---

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 6 |
| SPAWN residual | 0 |
| Convergencias | 0 |
