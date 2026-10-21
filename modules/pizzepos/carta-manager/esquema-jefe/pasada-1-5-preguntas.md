# Pasada 1 — Cinco preguntas al módulo carta-manager (v2.8.0, 19 reflejos RPC)

Fuente de verdad: `modules/pizzepos/carta-manager/index.js` vía el contrato híbrido
reflejo de `modules/_shared/modulo-hibrido-reflejo.js` (`_atender`). Cero supuestos —
todo lo listado aquí fue verificado en vivo contra el core real (incluida la prueba
RPC `carta.get` del proyecto 'despacho-de-pan' → 200 `{meta.nombre:'Despacho de Pan'}`).

## 1. ¿QUIÉN es? ¿Qué es ESTO?

**Aggregate root del subsistema-carta.** Es el CUSTODIO único del catálogo de cartas
de un proyecto: qué cartas existen, en qué estado están (borrador / en_servicio /
archivada), qué categorías y productos contiene cada una, y cuántas versiones
persistidas tiene. Todo lo demás del subsistema (tarifas, escaparate, carta-digital,
preview, motor de opciones) DERIVA de lo que este módulo guarda.

## 2. ¿QUIÉN manda aquí? ¿Qué hace EL JEFE desde aquí?

El chef del negocio. Desde aquí DECLARA el catálogo vivo:

- **Crea y guarda cartas** (save → `carta.actualizada`).
- **Puebla cada carta**: añade productos (alta con precio en €), quita, corrige,
  mueve en lote; crea categorías; reta precios de todo el bloque
  (add_product, remove_product, update_product, update_products, add_category,
  update_prices, update_extras → `carta.editada` + version++).
- **Orquesta el ciclo de vida**: activa una carta (degrada automáticamente las demás
  en_servicio, motivo 'activar'), clona como base de la siguiente temporada,
  restaura una versión anterior del historial, archiva (delete suave → estado
  archivada) la que deja de regir.

## 3. ¿Qué se hace AQUÍ y ahora? ¿Qué es el AHORA de este módulo?

El ahora de carta-manager es la TRANSICIÓN: el paso de una carta al servicio vivo
(del borrador al catálogo que vende) y la edición dirigida de su contenido. Los
demás roles del módulo (consultar, medir, restaurar) existen para ALIMENTAR esa
transición: ver el estado del parque de cartas, elegir cuál operar, comprobar antes
de cambiar (validar), y poder volver atrás si la transición fue un error.

## 4. ¿Qué se hace DESPUÉS? ¿Qué es el FUTURO de este módulo?

Todo el downstream del negocio consume lo que aquí se declara:

- **Servir**: la carta en_servicio alimenta tarifas (set_general), pedidos, POS y
  cocina — cada pieza lee de la carta activa.
- **Mostrar**: escaparate público, carta-digital, carta-preview proyectan al
  cliente lo que aquí se edita.
- **Costear**: los productos referencian ingredientes (insumos/escandallo), así que
  el coste de cada venta nace de las fichas que el jefe da de alta aquí.
- **Sincronizar**: cada mutación emite carta.actualizada / carta.editada /
  carta.borrada, y módulos vecinos (ingredientes, tarifas, contenido, precios-web)
  re-accionan a esas señales.

Lo que el jefe declara aquí se vuelve precio, cocina y escaparate en el resto del
ecosistema — por eso el gesto más pesado del módulo (activar) es también el que
más cuidado exige.

## 5. ¿Qué PUEDE salir mal? ¿Qué es el PEOR escenario?

- **Activar una carta a medio hacer**: el catálogo vivo entero cambia al instante
  (las demás en_servicio se degradan solas, sin confirmación por carta) — clientes
  ven productos inexistentes o sin precio. Por eso el activar exige confirmador
  NOMBRADO y el dictamen de `validar` como FRENO previo.
- **Alta de producto sobre una categoría inexistente**: 412 PRECONDITION_FAILED —
  no es un fallo, es una dependencia no satisfecha ("crea antes la categoría").
- **Producto duplicado**: id determinista slug(cat)_slug(nombre) → 409
  ALREADY_EXISTS. El mensaje debe decirle al jefe que YA existe (y con qué id).
- **Editar la versión equivocada / restaurar sin querer**: versions + restore
  existen precisamente para retroceder con nombre; un restore sin confirmador
  nombrado sería una catástrofe a un clic.
- **Perder la noción de cuál está viva**: sin la cinta de estados el jefe podría
  editar creyendo que edita el catálogo activo. La cinta (n borrador · n
  en_servicio · n archivada) es obligatoria en la vista jefe.

## Veredicto

| Pregunta | Respuesta corta |
|---|---|
| Qué es | Custodio del catálogo de cartas (aggregate root subsistema-carta) |
| Quién manda | El chef — declara cartas, productos, precios y transiciones |
| El ahora | La transición al servicio vivo + edición dirigida del contenido |
| El futuro | Servir (tarifas/pedidos), mostrar (escaparate/digital), señales a vecinos |
| Peor escenario | Activar a medio hacer · duplicado/categoría ausente sin mensaje nombrado |