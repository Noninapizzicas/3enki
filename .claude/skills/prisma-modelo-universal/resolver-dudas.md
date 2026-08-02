# Cómo resolver dudas — Diseccionador

> El proceso de DESCOMPONER cuando no sabe.
> No pregunta primero. Busca, cruza, y si aún duda, pregunta.
> Con nuevos datos, repite el análisis desde el principio.

---

## Tarea

Resolver dudas sobre un producto cuando los datos de entrada no son suficientes.

---

## PARTIR

```
BUSCAR → CRUZAR → PREGUNTAR → REPETIR
```

---

## CLASIFICAR

### 1. BUSCAR — consultar fuentes antes de preguntar

| Pregunta | Respuesta |
|---|---|
| ¿JUICIO o MECÁNICA? | **MECÁNICA_DURA** — cada fuente tiene su lector/web/scraper/API. Mecánico, por fuente. |
| ¿Quién lo hace? | Cada lector (web, OCR, API proveedor, catálogo propio). Independientes. |
| ¿De a una o tanda? | En paralelo (todas las fuentes a la vez). |
| ¿Qué falta? | Fuente no disponible → se salta, se prueba la siguiente. |
| ¿Cambia de medio? | Sí — formato fuente → estructura. TRADUCTOR. |
| Conecta con: | Output: candidatos → CRUZAR. |

**Forma: MECÁNICA_DURA + TRADUCTOR**

Posibles fuentes:

| Fuente | Qué aporta |
|---|---|
| OCR (foto/etiqueta) | Nombre, ingredientes, precio |
| Web (proveedor, Mercadona) | Precio de referencia, categoría |
| API del fabricante | Ficha técnica completa |
| Catálogo propio (histórico) | Productos similares ya modelados |
| Búsqueda semántica en skills | Cómo se modelaron productos parecidos |

---

### 2. CRUZAR — contrastar fuentes, medir confianza

| Pregunta | Respuesta |
|---|---|
| ¿JUICIO o MECÁNICA? | **MECÁNICA_BLANDAS** — cruzar es mecánico (solape de datos), pero decidir qué fuente es más fiable requiere criterio. |
| ¿Quién lo hace? | Quien puede ponderar fuentes (confianza por tipo de fuente). |
| ¿De a una o tanda? | Tanda (todas las fuentes cruzadas a la vez). |
| ¿Qué falta? | Fuentes contradictorias → conflicto marcado. |
| ¿Cambia de medio? | No. |
| Conecta con: | Coincidencias → DESCOMPONER continúa. Conflicto o duda → PREGUNTAR. |

**Forma: MECÁNICA_BLANDAS**

Reglas de cruce:

| Situación | Resultado |
|---|---|
| Todas las fuentes coinciden | Alta confianza → se acepta el dato |
| La mayoría coincide, una difiere | Se toma la mayoría, la discrepante se marca |
| Fuentes se contradicen sin mayoría | Conflicto → se pregunta |
| Ninguna fuente tiene el dato | Duda → se pregunta |
| Fuente externa vs fuente manual | La manual gana (el comerciante sabe más que la web) |

---

### 3. PREGUNTAR — al usuario, solo lo necesario

| Pregunta | Respuesta |
|---|---|
| ¿JUICIO o MECÁNICA? | **MECÁNICA_BLANDAS** — la pregunta está determinada por el campo faltante, pero redactarla bien y elegir el momento requiere criterio. |
| ¿Quién lo hace? | Quien conoce el contexto del usuario. |
| ¿De a una o tanda? | Máximo 3 preguntas por ronda. |
| ¿Qué falta? | Usuario no responde → se difiere. El producto queda en `necesita_aclaracion`. |
| ¿Cambia de medio? | La respuesta del usuario → entrada para REPETIR. |
| Conecta con: | Output: respuesta → REPETIR. |

**Forma: MECÁNICA_BLANDAS**

Solo se pregunta si:

1. Se agotaron las fuentes disponibles (no quedan más que consultar)
2. Hay conflicto entre fuentes (no hay mayoría clara)
3. El campo es de seguridad/salud (nunca se asume, siempre se pregunta si no se sabe)

---

### 4. REPETIR — volver a DESCOMPONER con los nuevos datos

| Pregunta | Respuesta |
|---|---|
| ¿JUICIO o MECÁNICA? | **MECÁNICA_DURA** — ejecutar DESCOMPONER otra vez con más datos. Es el mismo proceso, no una decisión nueva. |
| ¿Quién lo hace? | El mismo DESCOMPONER. |
| ¿De a una o tanda? | De a una (cada respuesta del usuario dispara una iteración). |
| ¿Qué falta? | Si los nuevos datos no resuelven la duda → se vuelve a PREGUNTAR. |
| ¿Cambia de medio? | No. |
| Conecta con: | Output: producto completo → CLASIFICAR. O vuelve a PREGUNTAR si sigue faltando. |

**Forma: MECÁNICA_DURA**

El bucle:

```
BUSCAR (fuentes)
  → CRUZAR (contrastar)
    → si hay duda → PREGUNTAR (al usuario)
      → REPETIR (DESCOMPONER con nuevos datos)
        → si ya no hay duda → CLASIFICAR
        → si sigue habiendo duda → PREGUNTAR otra vez
```

---

## Resumen

| Verbo | Forma |
|---|---|
| BUSCAR | MECÁNICA_DURA + TRADUCTOR |
| CRUZAR | MECÁNICA_BLANDAS |
| PREGUNTAR | MECÁNICA_BLANDAS |
| REPETIR | MECÁNICA_DURA |

**2 MECÁNICA_DURA, 2 MECÁNICA_BLANDAS.**

BUSCAR y REPETIR son mecánicos (se automatizan). CRUZAR y PREGUNTAR requieren criterio (cuándo preguntar, qué preguntar, a quién).

Lo importante: **preguntar al usuario es el último recurso, no el primero.** Primero se buscan fuentes, se cruzan, y solo si la duda persiste se pregunta. Y cuando llega la respuesta, el análisis se repite desde el principio, no se parchea.
