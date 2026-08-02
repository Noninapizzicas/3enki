# Paso 2 — Prisma sobre prisma-modelo-universal

## 1 · IDENTIDAD

**Qué es:** Un molde universal de 5 huecos que modela cualquier producto de comercio.

**Trabajo del cliente que resuelve:** Poder vender cualquier cosa (pizza, TV, corte de pelo, alquiler de excavadora) con un solo sistema, sin personalizar el software por cada tipo de comercio.

---

## 2 · RESTRICCIONES

- Lo privado nunca se inventa (coste, stock, agenda) → se marca como abierto
- El arquetipo se clasifica por FORMA (ejes + naturalezas), no por la superficie del producto
- La identidad del comercio EMERGE de sus productos, no se declara a mano
- El sistema es aditivo: los productos encienden órganos, nunca los apagan solos

---

## 3 · CONTRATO

**Atributos:** 5 huecos fijos (IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS), ejes (tiempo, ciclo, estado_de_partida), naturalezas (stock, precio), 4 arquetipos (pieza, comestible, servicio, uso_temporal).

**Opciones:** 4 sub-formas de opciones (variante, modificación, añadido, personalización_libre). Registro abierto de arquetipos (anti-wipe — la semilla no se toca, lo nuevo se propone y humano aprueba).

**Estados del producto:** `listo`, `necesita_aclaracion_comerciante`, `necesita_revision`.

---

## 4 · NO-OBJETIVOS

- No modela procesos de fabricación (eso lo hace la skill compuestos + costeador)
- No gestiona clientes, pedidos, ni ventas (eso es el POS)
- No fija el precio de venta (solo marca el coste como abierto para que otro lo cierre)
- No configura el comercio (la identidad emerge, no se configura)

---

## 5 · PREGUNTAS ABIERTAS

| Pregunta | Estado |
|---|---|
| ¿Un producto puede tener dos arquetipos? (ej. servicio que incluye producto físico) | No contemplado |
| ¿La emergencia de identidad tiene límite o siempre es completa? | Difuso |
| madurez: `listo` |

---

## Arquetipo

| Eje | Valor |
|---|---|
| `tiempo` | `ninguno` (el molde no depende del tiempo) |
| `ciclo` | `de_ida` (modelas el producto una vez, luego se vende) |
| `stock` | `activo_reutilizable` (el molde no se consume; se aplica N veces) |
| `precio` | — (no es un bien de comercio, es una skill) |

**Arquetipo: `pieza`** — skill manufacturada una vez, reutilizable para cualquier producto.
