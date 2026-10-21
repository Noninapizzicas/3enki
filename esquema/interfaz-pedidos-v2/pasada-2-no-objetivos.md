# Pasada 2 — No-objetivos (fronteras)

**Sujeto:** Lo que la interfaz de pedidos NO es — las fronteras claras con dominios adyacentes.

---

## 1. Operación vs Producción (ATÓMICO — puente)

La interfaz de pedidos termina cuando envía a cocina. Lo que pasa en la cocina (tiempos, estaciones, prioridades) es otro dominio. El pedido emite la señal `enviado_cocina` y la cocina la recibe — es un puente unidireccional.

- Puerto salida: `señalar(pedido_enviado)` → cocina lo recoge
- Puerto entrada: `observar(cocina_completó)` → el pedido se marca completado

## 2. Consulta vs Analítica (ATÓMICO — reflejo)

La vía de consulta muestra pedidos individuales en estado real. No agrega, no calcula tendencias, no genera informes. La analítica (ventas por hora, ticket medio, productos estrella) es otro dominio que consume los mismos datos pero con otra lente.

---

**Productos que salen:**
- Operación vs Producción → **ATÓMICO** (puente — conecta dos dominios)
- Consulta vs Analítica → **ATÓMICO** (reflejo — la frontera como invariante)
