# Pasada 2 — Recursión: decisiones del jefe y señales pareadas (cobros)

> Ronda de recursión sobre la pasada-1. Se afila el CONTRATO (qué VER y qué
> SEÑAL confirma cada decisión) y se verifica el veredicto del árbitro contra
> el código real (index.js v3.0.0). Se confirma la moneda (EUROS) y el shape
> real del cobro.

## Veredicto del ÁRBITRO (lente-roles) — 9/9 ops

Pregunta árbitro: ¿decide el FUTURO del dinero del día (transiciona el ciclo de
vida del cobro) → JEFE · ¿sirve una decisión AHORA de cobro al cliente → 
UTILIZACIÓN (POS, fuera) · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `create` | **JEFE** | Inicia el cobro sobre una cuenta (pendiente). La decisión de ARRANCAR el cobro. Idempotente por cuenta. |
| `confirm` | **JEFE** | **LA TRANSICIÓN**: pendiente/procesando → completado. Emite cobro.procesado (cuentas lo escucha) + abre cajón en efectivo. |
| `refund` | **JEFE** | Transición INVERSA: completado → reembolsado. Emite cobro.reembolsado. Destructiva (devuelve dinero). |
| `list` | neutro | alimenta la cinta-estado y el ref-select de cobros |
| `get` | neutro | detalle del cobro que alimenta el gesto |
| `payment-methods` | neutro | los 7 métodos canónicos (informa el create del POS) |
| `list-cajones` | neutro | cajones conectados (informa, no decide) |
| `health` | neutro (sistema) | estado del módulo — fuera del flujo |
| `metrics` | neutro (sistema) | contadores/gauges operativos — fuera del flujo |

**La dualidad, en una línea**: el cobro NACE en el POS (utilización: el
comandero/cuenta llama `cobro.create` al cobrar al cliente) y el panel-jefe
SOLO gestiona los cobros del día — confirmar lo pendiente, reembolsar lo
completado. Jamás re-precía ni toca el gateway externo.

## Señales pareadas por hoja de declaración (verificadas en index.js v3.0.0)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
create   → cobro.iniciado     ✅ (publishCobroIniciado, L493)
confirm  → cobro.procesado    ✅ (publishCobroProcesado, L505)
           + periferico.abrir-cajon ✅ (abrirCajonDinero, L537, solo efectivo, best-effort)
refund   → cobro.reembolsado  ✅ (publishCobroReembolsado, L518)
```

CORRECCIÓN de la premisa del enunciado: el enunciado decía "cobro.procesado"
para confirm — VERIFICADO correcto. `periferico.abrir-cajon` es señal REAL
adicional de confirm en efectivo (no es una op de UI, es un efecto del módulo).

## Shape real del cobro (verificado — moneda EUROS, no céntimos)

`cobro.get`/`list` devuelven el objeto cobro (index.js L211-221, L348-350,
L393-395):

```json
{
  "id": "uuid",
  "cuenta_id": "string",
  "pedido_ids": ["string"],
  "monto": 12.5,            // EUROS
  "metodo_pago": "efectivo|tarjeta|bizum|transferencia|mixto|link_pago|qr",
  "estado": "pendiente|procesando|completado|fallido|reembolsado",
  "propina": 0,
  "monto_total": 12.5,      // monto + propina, EUROS
  "cambio": 2.5,            // solo efectivo: monto_recibido - monto_total
  "monto_recibido": 15,     // solo efectivo
  "referencia_pago": "REF_...",  // tras confirm
  "completado_at": "ISO",   // tras confirm
  "motivo_reembolso": "string",  // tras refund
  "reembolsado_at": "ISO",  // tras refund
  "desglose": [...],        // solo mixto
  "link_url": "...",        // solo link_pago
  "qr_url": "...",          // solo qr
  "expira_en": "ISO",       // solo link_pago/qr
  "created_at": "ISO"
}
```

**Conclusión moneda**: el cobro trabaja en **EUROS** (monto, monto_total,
propina, cambio). NO céntimos. El formateo del panel usa euros.

## Composición de la vista del jefe (3 capas) — ESTACIÓN DE TRANSICIONES

```
1. SELECCIONAR  — ref de cobros del día: cobro.list por estado (pendiente,
                  completado, reembolsado) · la cinta ES el selector natural
2. INFORMARSE   — list/{estado} (cobros por fase) + get (detalle en tarjeta:
                  cuenta, método, monto_total, propina, cambio, referencia) ·
                  cinta-estado "n cobros hoy · n confirmados · n reembolsados"
3. DECLARAR     — las ÚNICAS escrituras del jefe: TRANSICIONES nombradas según
                  el estado actual del cobro (confirm pendiente → completado;
                  refund completado → reembolsado), vía cobro.confirm/refund ·
                  la señal pareada re-lee, nunca recarga
```

### Frecuencia → jerarquía

- El gesto rey es CONFIRMAR el cobro pendiente (en vista, 1 toque).
- `refund` es gruesa y destructiva (devuelve dinero) → `confirmador-nombrado`
  (cuenta + monto_total + motivo).
- `confirm` también es transición de dinero → `confirmador-nombrado` (nombra
  cuenta + monto_total + método).
