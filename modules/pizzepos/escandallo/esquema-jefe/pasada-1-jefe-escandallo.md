# PASADA 1 — prisma con las 5 preguntas-jefe del módulo `escandallo` (pizzepos)

> SUJETO del análisis: **la cara del ROL JEFE del módulo escandallo** — la capacidad
> del módulo de servir las DECISIONES del jefe sobre food-cost. NO el módulo entero.
> Ley de agnosticismo: cero tecnología del sistema ambiente. Lo que el módulo no da,
> se NOMBRA ([ABIERTO]), no se inventa.

## El sujeto que entra al prisma

```
"la capacidad del módulo escandallo de servir las DECISIONES del JEFE:
 ¿cuánto me cuesta esta pizza y me deja margen? — ver costes por receta,
 leer la aritmética (ingrediente × cantidad = coste), y decidir con esa
 evidencia qué receta tocar, qué receta no, y a qué precio vender"
```

## Inyectado antes de prisar (informes de código, no adivinanzas)

- `module.json v2.3.0`: HÍBRIDO. 5 subscribes (todas reflejo JS): `costear`,
  `escalar`, `recalcular_siguiente`, `recalcular_lote`, `validar`. 5 ui_handlers
  (1:1 con los subscribes, zone barra_modulos). Publica: `escandallo.coste.calculado`.
- `index.js` (reflejo v1.4.0): costeo determinista — aritmética pura. Lee catálogo y
  recetas vía *otro* reflejo (`recetas.*`). Sub-recetas: el coste_unidad de una receta
  sirve de precio de una línea de la receta padre (fuente `sub_receta`).
- Moneda verificada: **EUROS**. `coste_total` redondeado a 2 dec (L305). `coste_unidad`
  a 6 dec para no tragarse sub-recetas baratas (L309). La UI muestra €, sin céntimos.
- **No hay NINGUNA operación de ESCRITURA propia del módulo**: ni precios de venta,
  ni márgenes objetivo, ni ajustes. El escandallo solo calcula y publica un dictamen.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

- **D1 — ¿qué receta costea y cuándo?** disparar el costeo (una, siguiente pendiente,
  o lote completo) para tener la evidencia fresca del food-cost — `recalcular_lote`,
  `recalcular_siguiente`, `costear`
- **D2 — ¿mi food-cost está sano?** leer el coste por unidad y su desglose línea a
  línea, y juzgar si la receta "deja margen" — `costear` + persistido en las recetas
- **D3 — ¿qué pasa si cambio el tamaño?** derivar el coste a otro diámetro (masa ×
  diámetro, resto × área) para decidir tamaños/precios sin tocar la receta — `escalar`
- **D4 — ¿puedo fiar este coste?** pedir el dictamen de procedencia+coherencia: nada
  de precios inventados, la aritmética debe cuadrar — `validar`

Lo que el jefe NO decide aquí: poner precio de venta (no existe en el módulo), fijar
margen objetivo (no existe), editar ingredientes (módulo `ingredientes`) ni recetas
(módulo `recetas`).

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- INV1 — **el coste es un DICTAMEN del motor, no una opinión del jefe**: la UI lo
  MUESTRA, jamás lo calcula. El único escritor es el reflejo.
- INV2 — **los precios fecundan en otro módulo**: las líneas beben del catálogo
  (`ingredientes`); retar un precio no es gesto de este panel — es gesto del panel
  del otro módulo. Aquí el jefe solo ve el efecto.
- INV3 — **la persistencia vive en la receta**: el coste se guarda en la ficha de la
  receta (coste_total, coste_unidad, lineas_detalle, lineas_sin_precio) por el
  custodio de recetas — no hay store propio de escandallo.
- INV4 — **moneda = EUROS**: coste_total € (2 dec); coste_unidad viaja a 6 dec
  (sub-recetas baratas); la UI muestra € sin conversión.
- INV5 — **freno de evidencia**: el dictamen `validar` no juzga forma, juzga
  procedencia (precio inventado = precio no fiable) y aritmética (valor =
  cantidad×precio; total = Σ líneas; unidad = total/rinde).
- INV6 — **el escalado no persiste**: es derivación transitoria para decidir; si el
  jefe quiere guardarlo, costea con la receta nueva.

## Hueco 3 — CONTRATO: ¿qué necesita VER y qué SEÑAL confirma?

VER antes de decidir:
- la cinta del lote: recetas con coste vs pendientes, coste medio/min/max por porción
- LA TABLA-CÁLCULO de una receta: ingrediente × cantidad × precio unidad = coste de
  línea, con su fuente (catálogo/sub_receta/sin precio) y su peso relativo
- las líneas sin precio (honestidad del costeo: lo que no se pudo costear)
- la derivación escalada (origen → destino, factores, nuevo coste)

SEÑAL que confirma (pareadas, verificadas en index.js):
| Declaración (leer/computar) | Señal de confirmación | Granularidad |
|---|---|---|
| `costear` con persistir | `escandallo.coste.calculado` | 1 evento por receta, payload full (coste + desglose + sin_precio) |
| `recalcular_siguiente` | `escandallo.coste.calculado` | 1 evento (la que costeó) |
| `recalcular_lote` | `escandallo.coste.calculado` | **N eventos (1 por receta costeada)** |
| `escalar` | — (no persiste → no hay señal) | la respuesta RPC es la confirmación |

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **Utilización (POS/venta)**: el coste no se vende; la venta lee precios de venta en
  la carta/tarifas. NADA de este módulo se ejecuta en el momento de la atención.
- **La edición** de ingredientes/recetas: módulos con su propia cara (y su propio
  panel); este panel los LEE, no los escribe.
- **El cálculo en cliente**: prohibido — la UI no repite la aritmética, incluso si
  "parece fácil": el dictamen es del reflejo.

## Hueco 5 — PREGUNTAS ABIERTAS (decisiones del dueño — NOMBRADAS, no suplidas)

- [ABIERTO] **margen objetivo por receta o global** — el módulo no lo almacena; si
  llega a existir, la cinta "# sobre objetivo" tiene dueño; hoy queda declarado como
  expectativa del jefe, no como dato.
- [ABIERTO] **umbral de food-cost sano** (p.ej. 25-33%) — regla de negocio, del dueño.
- [ABIERTO] **precio de venta de referencia** por receta (para margen €/% reales) —
  vive en la carta, no en escandallo; el puente está por definir.
- [ABIERTO] cuándo un coste "caduca" (p.ej. re-costear si precios del catálogo han
  subido desde coste_actualizado_at).