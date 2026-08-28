# Pasada 2 — Prisma de los sub-productos de CONTRATO

---

## 2.9 Feedback de operación

**IDENTIDAD:** La señal que la interfaz devuelve al operador después de ejecutar una acción — éxito, fallo, datos de retorno.

**RESTRICCIONES:** Es síncrono desde la perspectiva del operador (ejecutó → vio el resultado). Puede ser éxito con datos, éxito sin datos, o error con mensaje.

**CONTRATO:** Toda operación tiene un feedback visible. El operador nunca se queda sin saber qué pasó.

**Sub-productos:**
- **Resultado exitoso** — la operación se ejecutó; se muestra confirmación y datos si los hay → ATÓMICO
- **Resultado fallido** — la operación falló; se muestra el motivo legible → ATÓMICO
- **Propagación al contexto** — un resultado exitoso actualiza lo que se ve (la lista, el detalle, los contadores) → REF (→ Reflejo de estado en vivo)

---

## 2.10 Reflejo de estado en vivo

**IDENTIDAD:** La capacidad de la interfaz de actualizarse cuando el mundo cambia sin que el operador pregunte. Otro operador creó un pedido, la cocina confirmó un envío, un pago llegó.

**RESTRICCIONES:** Requiere un canal de observación — la interfaz escucha señales del mundo exterior.

**CONTRATO:** Lo que el operador ve converge hacia la verdad. El desfase entre lo real y lo mostrado tiende a cero.

**Sub-productos:**
- **Suscripción a eventos** — la interfaz se registra para recibir señales de cambio → ATÓMICO
- **Reconciliación** — al recibir una señal, la interfaz actualiza su vista (recargar lista, actualizar estado) → ATÓMICO
- **Indicador de frescura** — el operador sabe si lo que ve está actualizado o puede estar desfasado → ATÓMICO

---

## 2.11 Guía de flujo

**IDENTIDAD:** La capacidad de la interfaz de sugerir o facilitar el siguiente paso natural en el flujo de trabajo.

**RESTRICCIONES:** No es obligatoria — el operador puede saltar pasos o ir en otro orden. Pero el camino feliz está señalizado.

**CONTRATO:** Las operaciones pertinentes al momento se destacan; las no pertinentes se atenúan o desaparecen.

**Sub-productos:**
- **Agrupación por fase** — las operaciones se organizan por momento del ciclo de vida, no por orden alfabético → ATÓMICO
- **Acción primaria** — en cada momento hay una acción "obvia" que se destaca → ATÓMICO
- **Flujo encadenado** — al completar una operación, la interfaz ofrece la siguiente (creaste pedido → ¿añadir item?) → ATÓMICO
