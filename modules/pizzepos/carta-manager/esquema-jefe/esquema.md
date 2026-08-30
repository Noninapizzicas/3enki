# esquema-jefe · carta-manager (v2.8.0, 19 reflejos RPC) — composición final

Contrato real verificado: `modules/pizzepos/carta-manager/index.js` vía
`modules/_shared/modulo-hibrido-reflejo.js`. Pasadas: 1 (5 preguntas) y 2 (formas
UI + señales hoja a hoja). Módulo molde: ingredientes (193 líneas de blueprint).

## Composición (3 capas)

### Capa 1 — SELECCIONAR (qué carta toca)

La vista jefe abre con la CINTA de estados del catálogo — n borrador · n
en_servicio · n archivada — y un ref-select que lista las cartas reales filtradas
por estado (list/get, roles consulta). Nada se asume: la carta "elegida" siempre
viene de una lectura RPC fresca (multi-tenant: el proyecto activo manda).

### Capa 2 — INFORMARSE (dictámenes antes de decidir)

- `get` de la carta elegida → detalle (meta, categorías, productos).
- `versions` → historial {timestamp, filename}[] desc — la lista de "atrás" posible.
- `validar` → FRENO: dictamen {valid, errors[], productos} del contenido actual.
- `stats` → agregados para la cinta.
- `search` → localizar producto/carta sin recorrer a mano.

Estas ops NO publican señal: son lectura pura, el almacén local solo se escribe
desde aquí (R2).

### Capa 3 — DECLARAR (las 12 manos del jefe)

Todas por RPC al custodio y TODAS cierran círculo con señal pareada:

1. `save` → carta.actualizada
2. `add_product` → carta.editada + version++ (409 duplicado / 412 categoría ausente)
3. `remove_product` → carta.editada + version++
4. `update_product` → carta.editada + version++
5. `update_products` → carta.editada + version++ (lote)
6. `add_category` → carta.editada + version++
7. `update_prices` → carta.editada + version++
8. `update_extras` → carta.editada + version++
9. `clonar` → carta.actualizada (201, id carta_<slug>)
10. `restore` → carta.actualizada (acepta path del snapshot; basename)
11. `activar` → carta.actualizada (DEGRADA las demás en_servicio, motivo 'activar')
12. `delete` → carta.borrada (soft: estado→archivada)

## Árbitro: 12 / 6 / 1

| Grupo | Ops | Criterio |
|---|---|---|
| JEFE (12) | save, add_product, remove_product, update_product, update_products, add_category, update_prices, update_extras, clonar, restore, activar, delete | FUTURO: escriben el catálogo que servirá mañana; cada una emite su señal |
| CONSULTA (6) | get, list, search, stats, versions, validar | SOLO-LEE: alimentan la decisión sin publicar nada |
| VALIDAR (1) | validar | NEUTRO-FRENO: dictamen {valid, errors[], productos}; no muta, no publica. La UI lo ejecuta ANTES de activar y bloquea si !valid |

## Huecos y decisiones ABIERTAS cerradas aquí

| Hueco | Estado |
|---|---|
| validar-como-freno-en-UI | **[ABIERTO]** la UI jefe debe bloquear `activar` si `validar` dictamina `!valid`. El contrato de los reflejos ya lo da ({valid, errors[]}); falta acordar dónde se pinta el dictamen (esta F7 lo resuelve de facto: dictamen-bloque bajo el botón). |
| ruta de mutación frontend→custodio | **YA RESUELTA (verificada en vivo)**: publicar a `core/*/events/carta/<op>/request` con `*` LITERAL — el EventBus del core re-emite a módulos locales solo topics con `*`. El `publish()` de `$lib/ui-core` (client.ts) ya envuelve en EventEnvelope con `source.core_id='ui-frontend'` y normaliza dot-notation al mismo patrón. Respuesta top-level `{request_id, status, data|error}` (NO anidada bajo result). `ui/request/...` (mqttRequest) = TIMEOUT: no hay handlers UI. Probado: carta.get 'despacho-de-pan' → 200 {meta.nombre:'Despacho de Pan'}. |

## Reglas que gobiernan el panel (F7)

- R1 — el jefe ve SIEMPRE el estado: cinta (n borrador · n en_servicio · n
  archivada) arriba, todo refresco pasa por señal o lectura, nunca por fe.
- R2 — solo las RPC escriben estado local; las mutaciones NUNCA asumen resultado.
- R3 — el refresco lo da la SEÑAL (carta.actualizada/editada/borrada/creada →
  debounce 60ms → re-list). Nunca recarga.
- R4 — transiciones NOMBRADAS: activar/clonar/restaurar/archivar exigen
  confirmador que diga exactamente qué pasará ("activa AHORA '$nombre' — degrada
  la activa y cambia el catálogo vivo").
- R5 — euros SIEMPRE: el precio se edita y envía en EUROS (number ≥ 0, 2dec), sin
  conversión a céntimos.