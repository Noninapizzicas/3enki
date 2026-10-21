# Pasada 2 — Contrato (feedback, reflejo, coherencia)

**Sujeto:** Lo que la interfaz promete al actor — las tres garantías del contrato.

---

## 1. Feedback de operación (ATÓMICO — reflejo)

Cada operación (crear, añadir item, confirmar, cancelar...) devuelve un resultado inmediato: éxito con datos, o fallo con razón legible. El actor nunca se queda sin saber qué pasó.

- Puerto: `ejecutar(comando) → resultado | error`
- La interfaz presenta el resultado (éxito) o el error (con la razón del módulo).

## 2. Reflejo en vivo (ATÓMICO — puente)

El estado de los pedidos se actualiza sin que el actor refresque. Cuando la vía operativa cambia un pedido, la vía de consulta lo ve reflejado. Cuando cocina cambia el estado, las dos vías lo ven.

- Puerto: `observar(señal) → dato_actualizado`
- La interfaz se suscribe a las señales del ciclo de vida y reconcilia su vista.

## 3. Coherencia cross-vía (ATÓMICO — reflejo)

Lo que uno edita, el otro lo ve. No hay dos verdades. Esto es consecuencia del reflejo en vivo — si ambas vías observan las mismas señales, la coherencia emerge. No es una pieza separada, es un invariante que se sostiene si el reflejo funciona.

---

**Productos que salen:**
- Feedback de operación → **ATÓMICO** (reflejo)
- Reflejo en vivo → **ATÓMICO** (puente, puerto: `observar(señal)`)
- Coherencia cross-vía → **ATÓMICO** (reflejo — invariante derivado del reflejo en vivo)
