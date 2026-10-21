---
name: masa
description: "Módulo masa (reflejo 0.1.0, the-pirate): custodio single-writer de las reglas de masa (gramajes por formato, referencia declarada, hidratación, ventana de maduración, % límite de reamasado, agenda de decisión) en masa.json del proyecto + 3 conversores puros — gramaje (escala cuadrática por área desde la referencia declarada; los valores declarados mandan), rendimiento (kilos → bolas) y reamasado (política M5: excedente dentro del límite → REAMASAR_CON_MASA_NUEVA)."
when-to-use: "Operar el módulo masa: leer/actualizar reglas de masa (gramajes, ventana, reamasado), calcular gramaje de un formato, rendimiento en bolas de una tanda, o decidir el reamasado del excedente. Es la fuente única de verdad de masa para lotes, retroplanning y agrupación-tanda."
tags: [masa, the-pirate, panaderia, fermentacion, custodio, reflejo, produccion]
---

# Masa — reglas y conversores de masa (the-pirate)

## Qué es

Módulo REFLEJO (JS determinista, cero LLM) construido en F4 (2026-08-16) desde
diseno-oop.md sección 3 y plan-construccion.md hoja C1. Custodia las reglas de masa
del proyecto en `masa.json` (raíz del storage del proyecto) y expone 3 conversores
puros + lectura/escritura de reglas. El resto del sistema bebe sus valores por RPC:
lotes (ventana_uso), retroplanning/mise-en-place (rendimiento), agrupacion-tanda (A3,
rendimiento por formato).

Base: `ModuloHibridoReflejo` (../_shared/modulo-hibrido-reflejo) + `ConfigCustodio`
(../_shared/config-custodio) — single-writer con validadores por campo y persistencia
por fs reflejo.

## Contrato (module.json / index.js)

- version: 0.1.0 (reflejo-0.1.0) · sin blueprint (reflejo puro)
- dependencia: ../_shared/config-custodio (¡el Guardian NO cubre _shared! — versionado
  vía PR #255; toda pieza nueva en _shared debe pedirse versionar)
- persists en: `masa.json` del proyecto (schema `reglas-masa-v1`)

### Config por defecto (DEFAULT_REGLAS — null = política por declarar)

```json
{
  "esquema": "reglas-masa-v1",
  "gramajes_formato": { "disco_33_cm": 315, "disco_30_cm": null, "disco_28_cm": null,
                        "pan_bocata": null, "pan_hotdog": null, "cuenco_cazuela": null },
  "referencia_declarada": { "formato": "disco_33_cm", "gramos": 315 },
  "receta": { "hidratacion_pct": null, "harina_pct": null, "agua_pct": null,
              "sal_pct": null, "madre_pct": null },
  "ventana_uso": { "min_horas": 24, "max_horas": 72 },
  "reamasado_limite_pct": null,
  "agenda": { "decision_martes": null }
}
```

Los únicos formatos con diámetro conocido (interpolables por área):
`disco_28_cm=28 · disco_30_cm=30 · disco_33_cm=33`.

## RPCs (subscribes del reflejo)

| RPC | Handler | Entrada | Respuesta | Errores |
|---|---|---|---|---|
| masa.gramaje.calcular.request | onGramajeCalcularRequest | { project_id, formato } | 200 { formato, gramaje_gramos, metodo } | 400 INVALID_INPUT |
| masa.rendimiento.calcular.request | onRendimientoCalcularRequest | { project_id, formato, kilos } | 200 { formato, gramaje_gramos, kilos, bolas, gramos_sobrantes, metodo } | 400 INVALID_INPUT |
| masa.reamasado.calcular.request | onReamasadoCalcularRequest | { project_id, excedente_gramos, tanda_original_gramos } | 200 { decision, dentro_limite, limite_gramos, excedente_gramos } | 400 INVALID_INPUT |
| masa.reglas.leer.request | onReglasLeerRequest | { project_id } | 200 { reglas, fuente } | — |
| masa.reglas.actualizar.request | onReglasActualizarRequest | { project_id, cambios } | 200 { reglas } | 400 INVALID_INPUT |

### Detalle de ops

```
_calcular(id, input)                                // dispatcher de fórmulas
  formula ← FORMULAS[id]  SI !formula → 400 INVALID_INPUT field id
  validarSchema(formula.schema, input) → 400 si falla
  { config: reglas } ← custodio.leer(project_id)    // DI: la fórmula recibe las reglas
  RETORNA formula.fn(reglas, input)                 // status 200 data

gramaje:  gramajePara(reglas, formato)
  declarado (número > 0 en gramajes_formato)        → { gramos, metodo: 'declarado' }
  si no: ref = referencia_declarada; si formato y ref tienen diámetro conocido:
      gramos ← round(ref.gramos * diam² / refDiam²) → { gramos, metodo: 'interpolado' }  // escala cuadrática por área
  si no → { gramos: null, metodo: 'pendiente' }

rendimiento:
  g ← gramajePara(formato)
  SI g.gramos null → 200 { bolas: null, gramos_sobrantes: null, metodo: 'pendiente',
                           nota: 'gramaje del formato sin declarar: declara gramajes_formato o la referencia' }
  bolas ← floor(kilos*1000 / g.gramos)
  gramos_sobrantes ← round(kilos*1000 - bolas*g.gramos)

reamasado (política M5):
  limitePct ← reglas.reamasado_limite_pct
  SI limitePct no es número → 200 { decision: 'pendiente_declaracion',
                                    nota: 'reamasado_limite_pct sin declarar' }
  limiteGramos ← tanda_original_gramos * limitePct / 100
  dentro ← excedente_gramos <= limiteGramos
  → decision: 'REAMASAR_CON_MASA_NUEVA' | 'FUERA_DEL_CIRCUITO'
```

### Custodia (ConfigCustodio)

- bloques: gramajes_formato · ventana_uso · receta · referencia_declarada · agenda
- valida SOLO los campos que vienen (los ausentes no se tocan); null permitido en
  política por declarar; evento `masa.reglas.actualizadas` tras persistir
- validadores: gramajes_formato (número > 0 o null por formato) · ventana_uso
  (min > 0, max > 0, min < max) · reamasado_limite_pct ([0,100] o null) ·
  referencia_declarada (formato con diámetro conocido + gramos > 0) · receta
  (porcentaje ≥ 0 o null por campo)

## Eventos (publishes)

| Evento | Cuándo | Payload |
|---|---|---|
| masa.reglas.actualizadas | Tras actualizar reglas (solo si 200) | { project_id, reglas } |

## Errores canónicos

- 400 INVALID_INPUT: fórmula desconocida (field id) · schema inválido (field del
  campo) · campo de custodia inválido (field nombrado, ej. ventana_uso.min_horas).

## Reglas vivas (M del plan)

- M5: reamasado del excedente — dentro del límite → REAMASAR_CON_MASA_NUEVA; fuera →
  FUERA_DEL_CIRCUITO. El límite lo declara el dueño (reamasado_limite_pct); sin
  declarar, el módulo responde `pendiente_declaracion` (no decide por el negocio).
- Los nulls del contrato son política por declarar — el dueño los puebla vía
  masa.reglas.actualizar (single-writer: el resto del sistema solo lee).

## Operar (verificar por disco, no por RPC)

- Reglas persistidas: `<storage>/masa.json` (masa.json en la raíz del storage del
  proyecto). Un valor que no aparece en disco NO existe.
- Los Map/config se hidratan por project.activated; post-restart, hasta que el
  proyecto se active, el reflejo responde con lo vacío/default.
- La skill no se activa como lente (sin lente_dominio): es eslabón de pipeline.

## Pitfalls (verificados en vivo)

- _shared/config-custodio es dependencia REAL (línea 4 de index.js): si un deploy
  borra _shared, masa muere al cargar. El Guardian no cubre _shared — versionado
  manual vía PR (config-custodio: PR #255).
- El gramaje declarado MANDA: la interpolación por área solo actúa cuando el formato
  no tiene valor declarado. Cambiar la referencia NO recalcula los declarados.
- La interpolación es cuadrática por diámetro (área), no lineal: disco 30 vs 33 con
  referencia 315g → 315 * (30²/33²) ≈ 260g.
- persistencia por proyecto (snapshot filtra por project_id): multi-tenant aislado.
