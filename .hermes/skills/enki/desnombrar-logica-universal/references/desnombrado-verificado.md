# Referencia — Desnombrado verificado (2026-07-31)

## Caso 1: variaciones → opciones (ya hecho antes de esta sesión)
- pizzepos/variaciones (poner/quitar ingredientes de pizza) → prisma/opciones
- La lógica: selección con delta de precio (ELEGIR_UNO/VARIOS/QUITAR/LIBRE), céntimos.
- Sub_forma domina según arquetipo: pizza=modificacion · TV=variante+añadido ·
  tarta=+personalizacion_libre.

## Caso 2: cocina/pedidos → preparar (hecho en esta sesión, PR #75)
- Fuente real: `modules/pizzepos/cocina/index.js` + `modules/pizzepos/pedidos/index.js`
- Estados copiados FIELES a la fuente:
  - cocina: pendiente → preparando → (pases) → listo → entregado · para_cobrar → cobrado
  - pedidos: borrador → pagado → en_cocina → pendiente_recogida → recogido_y_cobrado/expirado
- Desnombrado a prisma/preparar v0.2.0:
  - ESTADOS BASE: pendiente → preparando → listo → entregado (≡ recogido|enviado) + cancelado
  - TAP DIRECTO: listo desde pendiente (fiel a cocina — un ítem que ya viene hecho salta el pase)
  - PUERTA ABIERTA: /prisma/preparar/config.json → { estados: [{ id, desde[], terminal? }] }
    el freno valida contra BASE ∪ CUSTOM (pastelería añade 'enfriando', tienda 'enviado')
- Ops: preparar.{crear,listar,get,estado,cancelar}.request → .response
- Store: /prisma/preparar/<pedido_id>.json (escritura atómica temp+rename, single-writer)
- Estado agregado: todos los ítems en el MISMO estado → el pedido es ese estado; si no,
  semántica de avance (listo ⟺ todos listo/terminal · preparando si alguno preparando).
- Tests: tests/unit/prisma__preparar.test.js (8/8)

## El esquema del negocio universal (esquematizador, /tmp/esquema-negocio/)
Espina: PRODUCIR → VENDER → ENTREGAR. 8 órganos:
- NÚCLEO (universales): VENDER (carrito→cobro→cuenta→ticket) · COSTEAR (coste→margen→pvp) · MOSTRAR (escaparate)
- VARIABLES (según negocio): ELABORAR (recetario, origen=elaborado) · PREPARAR (estados) ·
  ENTREGAR (recogida|envío|vía cita) · PROGRAMAR (calendario: cita|intervalo|franja) · STOCK (inventario)

Combinaciones típicas (de la pasada 3):
| Negocio | ELABORAR | PREPARAR | ENTREGAR | PROGRAMAR |
|---|---|---|---|---|
| Panadería | ✅ | ✅ encargos | ✅ mostrador+entrega | ✅ |
| Pastelería | ✅ tartas | ✅ | ✅ cita | ✅ |
| Pizzería | ✅ cocina | ✅ comandas | ✅ delivery | ⚠️ franja |
| Regalos | ⚠️ | ✅ envolver | ✅ | ❌ |
| Servicio técnico | ⚠️ | ❌ | ✅ cita | ✅ |
| Alquiler | ❌ | ✅ | ✅ devolución | ✅ intervalo |

## Regalos como banco de pruebas (NO como modelo)
- Catálogo real: 42 productos, 2 arquetipos custom (impulso 25 · valor_percibido 17),
  8 categorías (paños/fundas, portamonedas/llaveros, tazas/botellas, abanicos, ...).
- Ficha: { nombre, arquetipo, coste, precio, margen, estado, pendientes[] } — los
  pendientes = preguntas_abiertas del molde prisma (stock_actual, proveedor, envoltorio).
- Lección: el caso concreto sirve para VERIFICAR el molde, nunca para modelarlo.

## Conductor prisma-tienda (blueprint, PR #75)
- modules/prisma/comercio/comercio.blueprint.json — target_page_id: prisma-tienda
- Cajones: adaptar · ver_catalogo · alta_producto · vender · encargar (cita vía calendario)
  · preparar · costear · publicar_escaparate
- Regla de oro: leer el ProductoUniversal (arquetipo+ejes+naturalezas) para saber qué
  enciende cada negocio; FIDELIDAD (no inventar lo privado); DELEGADO (los reflejos
  poseen los stores).
- project-type prisma.json tiene ui.pages: [] — el conductor necesita declararse ahí
  para que el LLM llegue a la página.
