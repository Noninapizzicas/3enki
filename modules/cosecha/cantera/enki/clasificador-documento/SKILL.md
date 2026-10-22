---
name: clasificador-documento
description: >-
  Skill FULL del módulo REFLEJO STATELESS `clasificador-documento` de la vertical contabilidad
  (Enki). Decide QUÉ documento es (factura · albarán · ticket · otro) por señales declaradas en el
  texto, con confianza y motivos, y devuelve el ESQUEMA de extracción del tipo (regex que consume
  `extraccion-dato`). Determinista, cero LLM: sin señal no inventa tipo.
when-to-use: >-
  - Cuando llega texto ya leído y hay que decidir si es factura, albarán o ticket antes de extraer.
  - Cuando hay que ajustar los patrones de un campo (NIF, total, base, IVA) o añadir un tipo.
  - Cuando `clase:'otro'` manda documentos a la cola y hay que ver qué señal faltó.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, clasificacion, esquemas]
---

# clasificador-documento — texto → tipo + esquema

## Qué hace

Lee el texto de `lector-documento` y devuelve la **clase** del documento y el **esquema** con el
que `extraccion-dato` debe extraer los campos. No extrae: declara patrones.

## Señales y pesos (case-insensitive)

| Señal | Peso |
|---|---|
| `albarán` / `nota de entrega` / `delivery note` | 3 |
| `factura` / `invoice` / `factura simplificada` | 3 |
| `base imponible` + `iva` | 2 (factura) |
| `nº de factura` | 2 (factura) |
| `ticket` / `tique` / `simplificado` / `gracias por su compra` | 3 |
| NIF español | señal booleana (refuerza el desempate) |

`confianza = min(1, peso_ganador/6)`. Desempate: mayor peso → si empatan, `factura` cuando hay NIF
y desglose base+IVA, `albaran` si además hay "entrega"/"pedido", si no `ticket`.
**Ninguna señal → `clase:'otro'`, confianza 0, `abierto.tipo` declarado.**

## Esquema devuelto

`{campo: {regex, flags}}` — el valor es el **grupo 1**. Campos: `nif`, `fecha`, `numero`, `base`,
`iva_pct`, `iva_importe`, `total`, `proveedor`. Obligatorios: factura/albarán `nif,fecha,total`;
ticket `fecha,total`; `otro` sin esquema.

## Pitfall capital (medido)

Los patrones capturan el **primer** número que sigue a la etiqueta. Con texto cuyo orden de línea se
ha roto (OCR por bloques), `TOTAL` puede ir seguido de la cifra de una línea de detalle → extracción
errónea y descuadre falso. Por eso `lector-documento` usa tesseract `--psm 4` (orden de línea) antes
que OCR4RS. **No se arregla aquí con regex más listos: se arregla en la lectura.**

## Contrato (RPC `clasificar`, PREGUNTA → sin ui_handler)

Entrada: `{project_id, texto, documento?, source_kind?}`. Sin texto (<8 chars) → 400.
Salida: `{project_id, tipo, clase, confianza, motivos[], senales{}, esquema{}, obligatorios[],
encadenado_a:'extraccion-dato', abierto}`.

Publica el HECHO `contabilidad.documento_clasificado {project_id, documento, clase, confianza,
motivos, source_kind}` y encadena **siempre** `extraccion-dato.juzgar.request` con
`{project_id, documento:{...texto}, texto, esquema, obligatorios, clase}` — también con `otro`,
para que la cola de excepciones lo recoja (nada se pierde en silencio).

## Verificación

```bash
node tests/unit/entrada__clasificador-documento.test.js   # 11/11
```
