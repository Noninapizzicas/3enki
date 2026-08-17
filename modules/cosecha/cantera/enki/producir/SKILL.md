---
name: prisma-producir
description: "Módulo prisma/producir (reflejo 0.1.0): el MOTOR que PROYECTA un COMPUESTO a un OBJETIVO FÍSICO — la abstracción que masa demostró. 3 RPCs: producir.proyectar (compuesto + objetivo {formato?, cantidad, unidad} → componentes escalados en SU unidad + totales por insumo en SU unidad base: el desmembramiento, lo que hay que COMPRAR), producir.rendimiento (stock → unidades de producción floor + sobrante: la inversa, lo que tengo → lo que sale), producir.validar (freno puro). Registro de 4 reglas de escala (lineal · area diam² · fija · densidad); formato declarado gana; sin regla → pendiente_declaracion, NUNCA inventa el factor. Sirve a CUALQUIER compuesto: masa-pan (area), mortero 1:4 (fija, por sacos), jarabe (lineal, por litros), fórmula química (densidad). Emite producir.proyeccion.calculada."
when-to-use: "Operar el órgano producir de prisma: proyectar un compuesto a un objetivo físico (¿cuánta harina y agua para 30 bolas de masa de 315g? ¿cuánto cemento y arena para 30 sacos de 25kg de mortero?), calcular el rendimiento desde el stock (¿cuántas bolas salen con 5kg de masa?), o validar un objetivo antes de proyectar. También al construir/extender un compuesto: declarar unidad_produccion, formatos (con regla area y diámetro) o regla_escala_default. Es la generalización de masa: la lógica de producción universal para cualquier fabricante de productos compuestos."
tags: [prisma, producir, produccion, compuestos, proyeccion, escala, reflejo, motor, desmembramiento]
---

# Prisma · Producir — compuesto → objetivo físico → componentes

## Qué es

Módulo REFLEJO (JS determinista, cero LLM) construido en F6 (2026-08-16) desde
prisma-producir.md (decisión del dueño: OPCIÓN A — módulo nuevo, no tocar conversor).
Es el MOTOR que PROYECTA un compuesto (formulación) a un objetivo físico. Nace de la
hoja masa (F4): masa construyó 3 calculadoras de producción (gramaje por formato,
rendimiento, reamasado) que son la MISMA lógica que necesita cualquier fabricante de
productos compuestos — mortero (cemento + arena A + arena B, por sacos), jarabe
(concentrado + agua, por litros), fórmula química, pre-mezcla — con un solo cambio:
la NOMENCLATURA y la REGLA DE ESCALA.

Regla rectora: la lógica es universal; los nombres son del dominio que la bautizó.
masa pasa a ser una INSTANCIA de este órgano (compuesto 'masa-pan' + formatos + políticas).

Reparto de la casa: custodio GUARDA · motor CALCULA · puente CONECTA · actor INTERPRETA.
PRODUCIR es un MOTOR: sin store, lee compuestos + insumos por RPC (patrón costeador),
y emite producir.proyeccion.calculada. Nunca decide por el negocio.

Base: `ModuloHibridoReflejo` (../_shared/modulo-hibrido-reflejo) + `prisma-unidades`
(../_shared/prisma-unidades — conversor PURO de unidades por insumo: g→kg, ml→l, densidad).

## Contrato (module.json / index.js)

- version: 0.1.0 (reflejo-0.1.0) · sin blueprint (reflejo puro)
- dependencias: ../_shared/modulo-hibrido-reflejo + ../_shared/prisma-unidades
  (¡el Guardian NO cubre _shared! — toda pieza nueva en _shared debe pedirse versionar)
- lee por RPC: compuestos.get · insumos.get (no guarda nada)

### El compuesto que proyecta (campos que declara — datos, no lógica)

```json
{
  "unidad_produccion": "bolas | sacos | litros | ud | ... (la unidad del OBJETIVO)",
  "formatos": "[{ id, etiqueta, cantidad, unidad, regla, diametro_cm }] — disco_33_cm → {cantidad:315, unidad:'g', regla:'area', diametro_cm:33}",
  "regla_escala_default": "lineal | area | fija | densidad (usada por formatos sin regla propia)",
  "politicas_produccion": "{ pendiente_declaracion: true, reamasado_limite_pct: Number } — opcional"
}
```

## RPCs (subscribes del reflejo)

| RPC | Handler | Entrada | Respuesta | Errores |
|---|---|---|---|---|
| producir.proyectar.request | onProyectarRequest | { project_id, compuesto_id, objetivo:{formato?, cantidad, unidad} } | 200 { status:'calculada'\|'pendiente_declaracion', factor, desc, componentes[], totales[] } | 400 INVALID_INPUT · 404 RESOURCE_NOT_FOUND |
| producir.rendimiento.request | onRendimientoRequest | { project_id, compuesto_id, stock:[{ref, cantidad, unidad}] } | 200 { status, unidades, detalle[], sobrante[], unidad_produccion } | 400 INVALID_INPUT · 404 RESOURCE_NOT_FOUND |
| producir.validar.request | onValidarRequest | { compuesto_id, objetivo } | 200 { valid, errors } | 400 INVALID_INPUT |

### Detalle de ops

```
_proyectar({project_id, compuesto_id, objetivo})
  comp ← compuestos.get(compuesto_id)                  // 404 si no existe → error honesto
  freno ← _validar(comp, objetivo)                     // unidad coherente, formato conocido, cantidad > 0
  {factor, desc, motivo} ← _resolverFactor(comp, objetivo)
    formato declarado (cantidad > 0)  → factor = objetivo.cantidad   // el formato ES la unidad
    formato sin cantidad con regla    → interpola (area: diam²/refDiam²; densidad: vol×ρ)
    sin formato: unidad_produccion    → factor = objetivo.cantidad
    objetivo.unidad ≠ unidad_produccion → convierte por densidad (ESCALAS.densidad)
    nada resoluble                     → pendiente_declaracion (NUNCA inventa)
  componentes ← comp.componentes × factor en SU unidad
  totales ← _desmembrar(project_id, componentes)       // conversor por insumo: g→kg, ml→l (unidad_base)
  EMITIR producir.proyeccion.calculada {totales}
  → { status:'calculada', factor, desc, componentes, totales }

_rendimiento({project_id, compuesto_id, stock})
  necesidad ← _proyectar(objetivo {cantidad:1, unidad: unidad_produccion})   // lo que pide 1 unidad
  SI necesidad pendiente → pendiente_declaracion
  unidades ← MIN sobre componentes de (stock_en_unidad_del_componente / necesidad)
  sobrante ← stock − unidades × necesidad              // por componente
  → { status:'calculada', unidades: floor(unidades), detalle, sobrante }

_validar(comp, objetivo)                                 // FRENO, función pura (patrón escandallo.validar)
  objetivo requerido · cantidad > 0 · formato conocido (si comp.formatos no vacío) · formato objeto con cantidad o diametro_cm
```

### Registro de REGLAS DE ESCALA (ESCALAS — añadir una = añadir una entrada, sin tocar handlers)

| Regla | Descripción | Factor |
|---|---|---|
| lineal | proporciones por unidad de producción (jarabe, composición base) | 1 |
| area | la cantidad escala con el ÁREA (diam²): disco 33cm=315g → 30cm≈260g (masa) | (diam²/refDiam²) |
| fija | proporciones fijas por lote (mortero 1:4, pre-mezcla): el objetivo es el nº de lotes | 1 |
| densidad | objetivo en volumen → masa por densidad declarada (masa = vol × ρ) | conv/objetivo.cantidad |

## Eventos (publishes)

| Evento | Cuándo | Payload |
|---|---|---|
| producir.proyeccion.calculada | Tras proyectar (solo si 200 calculada) | { project_id, compuesto_id, objetivo, factor, totales, timestamp } |

Lo consumirá mise-en-place (plan/retroplanning desde objetivo físico) sin acoplarse
al origen del compuesto (prisma o pizzepos). Coste NO se toca: el costeador sigue
siendo el único que calcula €; la proyección emite CANTIDADES físicas.

## Errores canónicos

- 400 INVALID_INPUT: project_id/compuesto_id ausentes · stock no array · objetivo inválido (freno)
- 404 RESOURCE_NOT_FOUND: compuesto no existe (entity_type: 'compuesto', id)

## Reglas vivas

- Un compuesto sin regla de escala declarada → `pendiente_declaracion` (motivo incluido).
  NUNCA se inventa el factor — mismo espíritu que formulador (cantidad ausente → null).
- El formato DECLARADO es la unidad de producción y gana: pido 30 discos_33_cm → 30 × 315g.
  La interpolación por área solo actúa sobre formatos SIN cantidad con referencia (cantidad + diametro_cm).
- El desmembramiento convierte a la unidad_base de cada insumo (g→kg, ml→l) vía prisma-unidades;
  lo que no reconcilia unidades se agrega por (ref, unidad) tal cual — NO se inventa la conversión.

## masa como INSTANCIA (migración suave, contrato vivo)

- masa sigue respondiendo masa.*.request — nada se rompe.
- Por dentro delega en producir.proyectar cuando el compuesto 'masa-pan' existe;
  si no existe compuesto, mantiene su lógica actual (degradación honesta, cero bloqueo).
- Las 3 calculadoras de masa viven ahora aquí (universal); masa conserva SOLO los
  nombres de dominio (disco_33_cm, pan_bocata) como datos del compuesto.

## Operar (verificar por disco, no por RPC)

- Verificado por lógica pura: node --check index.js + test.js (7 bloques, EXIT=0) —
  los 7 casos del diseño: formato declarado, interpolación área 30cm≈260.3g,
  pendiente_declaracion, rendimiento con stock → 10 bolas + sobrante, mortero fija
  150/600 kg, frenos de validar, 404.
- La skill no se activa como lente (sin lente_dominio): es eslabón de pipeline.

## Pitfalls

- Dependencias _shared (modulo-hibrido-reflejo, prisma-unidades) son REALES: si un deploy
  borra _shared, producir muere al cargar. El Guardian no cubre _shared — versionado manual.
- La interpolación por área es cuadrática por diámetro (área), no lineal:
  disco 30 vs 33 con referencia 315g → 315 × (30²/33²) ≈ 260g.
- El módulo no tiene store: hasta que el bus cargue (restart) y el proyecto se active,
  las RPCs responden vacío/default — mismo ciclo que el resto de reflejos.
