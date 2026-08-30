# Pasada 2 — Expansión de los SPAWN de "marketing-content"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Catálogo de piezas

Las piezas de contenido del proyecto. Cada pieza tiene un formato, canal destino, etapa del funnel y un ciclo de vida.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Título** | ATÓMICO | Nombre legible de la pieza ("Newsletter febrero", "Guía SEO para principiantes"). |
| 2 | **Formato** | ATÓMICO | Enum: articulo / video / infografia / landing / email / post_social / podcast / caso_exito / guia / faq / otro. |
| 3 | **Canal destino** | ATÓMICO | ID del canal donde se publica (referencia a marketing-channels). |
| 4 | **Etapa funnel** | ATÓMICO | Enum: awareness / consideration / conversion / retention / advocacy. A qué fase del funnel sirve. |
| 5 | **Estado** | ATÓMICO | Máquina de estados: idea → borrador → revision → publicado → retirado. |
| 6 | **Madre ID** | ATÓMICO | ID de la pieza madre (null si es pieza original). Vincula hijas con su madre. |
| 7 | **Descripción** | ATÓMICO | Texto breve del contenido/propósito de la pieza. |
| 8 | **Fecha creación** | ATÓMICO | Timestamp de cuándo se creó la pieza. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Reutilización

La transformación de una pieza grande (madre) en piezas menores adaptadas a distintos canales. El conversor recibe la pieza madre y genera un plan de fragmentación.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 9 | **Pieza madre** | ATÓMICO | Referencia a la pieza original (ID). |
| 10 | **Plan de fragmentación** | ATÓMICO | Lista de formatos × canales que se generarán desde la madre ("artículo → 5 posts + 1 email + 1 infografía"). |
| 11 | **Piezas generadas** | ATÓMICO | Las piezas hijas creadas, con madre_id apuntando a la original. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Canal | Piezas 3 (canal destino) y reutilización (canales de las hijas) | Misma referencia a marketing-channels. |
| Pieza madre/hija | Pieza 6 (madre_id) y pieza 9 (pieza madre en reutilización) | El vínculo madre→hija se resuelve con un campo madre_id en cada pieza. La reutilización consulta por madre_id. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 11 |
| SPAWN residual | 0 |
| Convergencias | 2 |
