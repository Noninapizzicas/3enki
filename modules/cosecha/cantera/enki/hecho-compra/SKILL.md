---
name: hecho-compra
description: >-
  Skill FULL del módulo REFLEJO STATELESS `hecho-compra` de la vertical contabilidad (Enki).
  Convierte los campos extraídos de un documento de compra (factura · ticket · albarán) en el HECHO
  contable con ASIENTO de partida doble (gasto al DEBE + IVA soportado 472 al DEBE + proveedor 400
  al HABER) y lo publica para que `escritor-diario` lo asiente. Determinista; no inventa cuenta ni IVA.
when-to-use: >-
  - Cuando la extracción ya cuadra y hay que llegar al asiento sin que nadie teclee nada.
  - Cuando un ticket/factura NO asienta y hay que saber por qué (albarán, sin cuenta, sin IVA, descuadre).
  - Cuando hay que decidir la cuenta de gasto por defecto o por proveedor.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, asiento, compras, pgc]
---

# hecho-compra — extracción → hecho contable con asiento

## Qué hace

Es el eslabón que faltaba entre "he tenido un documento" y "hay un asiento en el libro".
Compone la partida doble de una compra y la publica como HECHO `contabilidad.hecho_recibido`,
que es lo que `escritor-diario` (B2) sabe asentar. **No escribe el libro**: propone el hecho.

## Reglas (PGC, deterministas)

1. **Albarán NO asienta** (`asienta:false`, `motivo:'albaran_pendiente_de_factura'`): un albarán no
   devenga gasto. Encadena `cruce-factura-recepcion.cotejar.request` y espera la factura. No encola.
2. **Ticket y factura asientan** si hay `fecha`, `base`, `cuota` y `total` que cuadren
   (`|base + cuota − total| ≤ 0,02`). La cuota es `iva_importe` si viene; si no, `base × iva_pct/100`.
   Sin IVA declarado NO se inventa: `asienta:false` y `abierto.iva`.
3. **Cuenta de gasto**, en este orden: `cuenta_gasto` del input → `config.cuenta_gasto_default` →
   `regla-contrapartida.aplicar.request` (contexto: NIF + proveedor + concepto). Sin ninguna de las
   tres: `asienta:false`, `abierto.cuenta_gasto`. **Nunca se inventa una cuenta.**
4. **Asiento**: DEBE `cuenta_gasto` (base) · DEBE `472` (cuota, si > 0) · HABER `400` (total).
   Fecha normalizada a `YYYY-MM-DD`; se rechaza una fecha inexistente (31/02).
5. `clase:'otro'` o desconocida → `asienta:false` y a la cola.

## Contrato (RPC `componer`, PREGUNTA → sin ui_handler)

Entrada: `{project_id, clase, extraido:{proveedor,nif,numero,fecha,base,iva_pct,iva_importe,total,moneda?}, documento?, cuenta_gasto?}`.
Salida: `{project_id, tipo, clase, hecho{...asiento{lineas[]}}, asienta, cuenta_gasto,
cuenta_gasto_origen, cuadra, motivo, abierto}`.

- `asienta:true` → publica `contabilidad.hecho_recibido {project_id, asiento, hecho, origen:'hecho-compra'}`.
- `asienta:false` → NO publica hecho; encadena `encolado-excepcion.encolar.request`
  (salvo albarán, que va a `cruce-factura-recepcion.cotejar.request`).

## Config (config.json → modules_config['hecho-compra'])

| Clave | Default | Qué hace |
|---|---|---|
| `cuenta_gasto_default` | `null` | cuenta de gasto si no hay regla; `null` = todo va a revisión (no se inventa) |
| `cuenta_iva_soportado` | `'472'` | cuenta de IVA soportado |
| `cuenta_proveedores` | `'400'` | cuenta de proveedores |

## Pitfalls

- **Sin `cuenta_gasto_default` ni regla, NADA se asienta**: es el comportamiento correcto, no un bug.
  Declarar la cuenta por defecto del negocio es decisión del dueño.
- El importe llega como string del OCR (`'69,96'`): se parsea a número con coma decimal; no se
  re-formatea antes de comparar.
- `asienta:false` por descuadre duplica la excepción si `control-cuadre-documento` ya la encoló:
  el cuadre real lo decide primero el control (A4.3); este módulo comprueba otra vez antes de asentar.

## Verificación

```bash
node tests/unit/entrada__hecho-compra.test.js               # 12/12
node tests/integration/entrada-documental-cadena.test.js    # ticket → asiento 629/472/400
```
