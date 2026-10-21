---
name: lotes
description: "Módulo lotes (reflejo 0.1.0, GENÉRICO): el riel compartido de producción anticipada — sigue la vida de cada tanda/lote (masa, huevos prehechos, cazuelas precocidas, salsas…) con ventana de uso. State machine nace→madura→en-ventana→consumido/descartado, ocupación contra capacidad declarada (409 si no cabe), avisos por regla y reamasado parcial con política configurable. No sabe qué contiene el lote: trabaja con estados, fechas y ocupación; la política (ventanas por tipo, capacidad, lote parcial) la declara el negocio vía lote.config.actualizar (ConfigCustodio)."
when-to-use: "Operar lotes de producción: crear un lote (masa, huevos, cazuelas…), consultar su estado efectivo y tiempo restante de ventana, avanzar su ciclo (madurar/consumir/descartar/reamasar_parcial), ver la ocupación del frigo contra capacidad, o leer/actualizar la configuración de ventanas y capacidad. Es la fuente única de verdad de lotes para el avisador de producción (A4)."
tags: [lotes, produccion, panaderia, fermentacion, ventana-uso, custodio, reflejo, capacidad]
---

# Lotes — ciclo de vida de tandas con ventana de uso (genérico)

## Qué es

Módulo REFLEJO (JS determinista, cero LLM) construido en F4 (2026-08-17) desde
pasada-1-lotes.md y plan-construccion.md hoja C2. GENÉRICO: no sabe qué contiene
el lote — trabaja con estados, fechas y ocupación. La política (ventanas por tipo,
capacidad, lote parcial) la declara cada negocio vía `lote.config.actualizar`.
El resto del sistema bebe sus valores por RPC (masa declara su ventana 24-72h en
`ventanas_por_tipo.masa`; el avisador A4 lee ocupación y ventanas).

Base: `ModuloHibridoReflejo` (../_shared/modulo-hibrido-reflejo) + `ConfigCustodio`
(../_shared/config-custodio) — single-writer con validadores por campo y persistencia
por fs reflejo.

## Contrato (module.json / index.js)

- version: 0.1.0 (reflejo-0.1.0) · sin blueprint (reflejo puro)
- dependencia: ../_shared/config-custodio (¡el Guardian NO cubre _shared! — toda
  pieza nueva en _shared debe pedirse versionar)
- persists en: `lotes.json` del proyecto (schema `lotes-store-v1`, `{ lotes: {} }`)
- config en: `lotes-config.json` (schema `lotes-config-v1`, vía ConfigCustodio)

### State machine

| Acción | Desde | Hasta | Notas |
|---|---|---|---|
| madurar | NACIDO | EN_VENTANA | materializa la maduración YA ocurrida: guard sobre estado persistido + fecha de maduración llegada |
| consumir | EN_VENTANA | CONSUMIDO | |
| descartar | NACIDO, EN_VENTANA | DESCARTADO | |
| reamasar_parcial | EN_VENTANA | EN_VENTANA | recalcula la ventana desde ahora; `parciales += 1`; límite por política |

Estado EFECTIVO (proyección sin persistir): un lote NACIDO cuya `maduracion_iso`
ya pasó se proyecta EN_VENTANA. `tiempo_restante_horas` = (fin_ventana − ahora)/h.

### Config por defecto (DEFAULT_CONFIG — null = política por declarar)

```json
{
  "esquema": "lotes-config-v1",
  "capacidad": { "unidad": "kg", "total": 250, "calibracion": null },
  "ventanas_por_tipo": { "masa": { "ventana_min_horas": 24, "ventana_max_horas": 72 } },
  "avisos": { "al_entrar_en_ventana": true, "se_agota_en_horas": 12, "fuera_de_circuito": true },
  "lote_parcial": { "hacer_parcial_mas_2_veces": false },
  "condiciones": { "temperatura_objetivo_c": null }
}
```

## RPCs (subscribes del reflejo)

| RPC | Handler | Entrada | Respuesta | Errores |
|---|---|---|---|---|
| lote.crear.request | onCrearRequest | { project_id, tipo, cantidad, unidad, ocupacion?, nacido_iso?, nota? } | 200 { lote } | 400 INVALID_INPUT · 409 CONFLICT_STATE |
| lote.estado.consultar.request | onEstadoConsultarRequest | { project_id, lote_id } | 200 { lote } | 404 RESOURCE_NOT_FOUND |
| lote.avanzar.request | onAvanzarRequest | { project_id, lote_id, accion, motivo? } | 200 { lote } | 400 · 404 · 409 |
| lote.ocupacion.consultar.request | onOcupacionConsultarRequest | { project_id } | 200 { ocupacion_total, capacidad_total, unidad, disponible, lotes_vivos, pct_ocupacion } | — |
| lote.ventana.consultar.request | onVentanaConsultarRequest | { project_id, tipo? } | 200 { tipo?, ventana?, ventanas_por_tipo? } | — |
| lote.config.leer.request | onConfigLeerRequest | { project_id } | 200 { config, fuente } | — |
| lote.config.actualizar.request | onConfigActualizarRequest | { project_id, cambios } | 200 { config } | 400 INVALID_INPUT |

### Detalle de ops

```
_crear(input)
  validarSchema(tipo, cantidad>0, unidad, ocupacion?, nacido_iso?, nota?) → 400
  ventana ← config.ventanas_por_tipo[tipo]
  SI !ventana → 400 INVALID_INPUT field tipo ('declárala en lotes-config')
  SI ocupacion es número:
      ocupada ← Σ ocupación de lotes vivos (≠ CONSUMIDO/DESCARTADO)
      SI ocupada + ocupacion > config.capacidad.total → 409 CONFLICT_STATE field ocupacion
  nacido ← nacido_iso || ahora
  lote ← { id, tipo, cantidad, unidad, ocupacion, estado: NACIDO,
           nacido_iso, maduracion_iso: nacido+min_h, fin_ventana_iso: nacido+max_h,
           parciales: 0, historial: [creado] }
  guardar store · publish lote.creado → 200 { lote: proyeccion }

_avanzar(input)
  validarSchema(lote_id, accion) → 400
  accion ∈ ACCIONES, SI no → 400 field accion
  estadoPersistido ← lote.estado ; estadoActual ← _estadoEfectivo(lote, ahora)
  SI accion.materializa (madurar):
      SI estadoPersistido ∉ desde → 409 CONFLICT_STATE
      SI estadoActual ≠ EN_VENTANA → 409 ('el lote aún madura: maduración en <iso>')
  SI no Y estadoActual ∉ desde → 409 CONFLICT_STATE
  reamasar_parcial:
      limite ← config.lote_parcial.hacer_parcial_mas_2_veces ? 2 : 1
      SI parciales >= limite → 409 CONFLICT_STATE (política)
      ventana ← config.ventanas_por_tipo[lote.tipo] → 400 si falta
      maduracion/fin ← ahora + min_h / ahora + max_h ; parciales += 1 ; estado EN_VENTANA
  resto: lote.estado ← accion.a
  guardar store · publish lote.estado.avanzado → 200 { lote: proyeccion }
```

### Proyección pública del lote

```
{ id, tipo, cantidad, unidad, ocupacion, estado (efectivo), parciales,
  nacido_iso, maduracion_iso, fin_ventana_iso, en_ventana (bool),
  tiempo_restante_horas }
```

### Custodia (ConfigCustodio)

- bloques: capacidad · ventanas_por_tipo · avisos · lote_parcial · condiciones
- valida SOLO los campos que vienen (los ausentes no se tocan); null permitido en
  política por declarar; evento `lote.config.actualizado` tras persistir
- validadores: capacidad (unidad string no vacía · total > 0 · calibracion > 0 o
  null) · ventanas_por_tipo (min > 0, max > 0, min < max por tipo) · avisos
  (se_agota_en_horas > 0 · flags boolean) · lote_parcial (boolean) · condiciones
  (temperatura_objetivo_c número o null)

## Eventos (publishes)

| Evento | Cuándo | Payload |
|---|---|---|
| lote.creado | Tras crear (solo si 200) | { project_id, lote: proyeccion } |
| lote.estado.avanzado | Tras avanzar (solo si 200) | { project_id, lote_id, accion, estado_anterior, estado_nuevo, lote } |
| lote.config.actualizado | Tras actualizar config | { project_id, config } |

## Errores canónicos

- 400 INVALID_INPUT: tipo sin ventana declarada (field tipo) · acción desconocida
  (field accion) · schema inválido (field del campo) · campo de custodia inválido.
- 404 RESOURCE_NOT_FOUND: lote_id inexistente (field lote_id).
- 409 CONFLICT_STATE: no cabe en capacidad (field ocupacion) · transición inválida
  desde el estado efectivo (field accion) · madurar antes de tiempo · reamasado
  excede la política (field accion).

## Reglas vivas (M del plan)

- Los nulls del contrato son política por declarar — el dueño los puebla vía
  lote.config.actualizar (single-writer: el resto del sistema solo lee).
- La ocupación de un lote es OPCIONAL: si no declara ocupacion, no cuenta contra
  capacidad (no bloquea la creación).
- 'madurar' es una materialización, no una acción física: el lote entra EN_VENTANA
  por fecha (estado efectivo); la RPC persiste lo que el tiempo ya dijo.
- reamasar_parcial no cambia de estado (EN_VENTANA → EN_VENTANA): recalcula la
  ventana desde ahora y cuenta en parciales contra la política.

## Operar (verificar por disco, no por RPC)

- Lotes persistidos: `<storage>/lotes.json` (raíz del storage del proyecto).
  Config: `<storage>/lotes-config.json`. Un valor que no aparece en disco NO existe.
- Los Map/config se hidratan por project.activated; post-restart, hasta que el
  proyecto se active, el reflejo responde con lo vacío/default.
- La skill no se activa como lente (sin lente_dominio): es eslabón de pipeline.

## Pitfalls (verificados en vivo)

- _shared/config-custodio es dependencia REAL (línea 3-4 de index.js): si un deploy
  borra _shared, lotes muere al cargar. El Guardian no cubre _shared — versionado
  manual vía PR (config-custodio: PR #255).
- El 409 de capacidad mira ocupación de lotes VIVOS (no CONSUMIDO/DESCARTADO):
  consumir/descartar libera frigo automáticamente.
- La proyección es por tiempo: un lote NACIDO puede leerse EN_VENTANA sin haber
  llamado a madurar. Los guards de avance usan estado persistido para madurar y
  estado efectivo para el resto.
- persistencia por proyecto (snapshot filtra por project_id): multi-tenant aislado.
