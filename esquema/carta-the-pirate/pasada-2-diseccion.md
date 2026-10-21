# Pasada 2 — Disección (FORMA de cada átomo)

Cada átomo de pasada 2 pasa por el diseccionador.
Pregunta madre: ¿qué HACE esta pieza? → su FORMA.

---

## Formas posibles

| Forma | Qué hace |
|---|---|
| **Reflejo** | Copia directa de un dato — un test lo afirma |
| **Conversor** | Transforma input → output (formato, cálculo, síntesis) |
| **Custodio** | Guarda un estado o invariante |
| **Puente** | Conecta dos dominios |
| **Micro-agente** | Requiere juicio, no es determinista |

---

## A. Cabecera

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 1 | Logo | REFLEJO | dato directo: URL de imagen + posición fija |
| 2 | Nombre marca | REFLEJO | dato directo: texto "THE PIRATE" + font display |
| 3 | Lema | REFLEJO | dato directo: texto del lema + estilo |
| 4 | Ambiente (fondo) | REFLEJO | dato directo: tokens de piel aplicados por CSS |

## B. Navegación de categorías

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 5 | Chip de categoría | REFLEJO | dato directo: nombre de categoría → botón con estados CSS |
| 6 | Barra contenedora | REFLEJO | layout puro: horizontal scroll + sticky (CSS) |
| 7 | Estado activo chip | CUSTODIO | guarda qué chip está activo según posición de scroll — mantiene sincronía vista↔nav |
| 8 | Scroll-to-section | PUENTE | conecta dominio navegación (chip tap) → dominio contenido (posición de sección) |

## C. Producto

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 9 | Imagen producto | REFLEJO | dato directo: URL de imagen + lazy load + aspect-ratio (CSS/HTML) |
| 10 | Nombre producto | REFLEJO | dato directo: texto del nombre + font display |
| 11 | Descripción corta | REFLEJO | dato directo: texto truncado a 1-2 líneas (CSS) |
| 12 | Precio | REFLEJO | dato directo: número + formato + color acento |
| 13 | Badges alérgenos | CONVERSOR | transforma IDs de alérgeno → emoji compacto (mapeo id→emoji) |
| 14 | Layout convergente | CONVERSOR | sintetiza imagen × texto × precio × acción en layout responsivo — las dimensiones NO son independientes |

## D. Pie

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 15 | Horario | REFLEJO | dato directo: texto del horario |
| 16 | Dirección | REFLEJO | dato directo: texto + construcción de link a Maps |
| 17 | Teléfono | REFLEJO | dato directo: número + link tel: |
| 18 | Redes | REFLEJO | dato directo: URLs sociales → iconos con links |
| 19 | Legal | REFLEJO | dato directo: texto regulatorio (IVA, alérgenos) |

## E. Detalle bajo demanda

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 20 | Trigger expandir | PUENTE | conecta gesto del usuario (tap) → sistema de expansión (detalle) |
| 21 | Panel animado | CUSTODIO | guarda estado abierto/cerrado + ciclo de animación (expand/collapse) |
| 22 | Ingredientes chips | REFLEJO | dato directo: lista de ingredientes → chips |
| 23 | Alérgenos con nombre | CONVERSOR | transforma IDs de alérgeno → nombre + emoji (mapeo enriquecido) |
| 24 | Accordion | CUSTODIO | guarda invariante: máximo 1 detalle abierto a la vez |

## F. Acción de pedido

| # | Átomo | FORMA | Razón |
|---|---|---|---|
| 25 | FAB pedido | REFLEJO | botón en posición fija — layout CSS |
| 26 | Link WhatsApp | CONVERSOR | transforma número de teléfono → URL wa.me con texto pre-rellenado |
| 27 | Visibilidad FAB | CUSTODIO | guarda cuándo aparece el FAB según posición de scroll (threshold) |

---

## Resumen de formas

| Forma | Cantidad | % | Átomos |
|---|---|---|---|
| REFLEJO | 17 | 63% | 1-6, 9-12, 15-19, 22, 25 |
| CONVERSOR | 4 | 15% | 13, 14, 23, 26 |
| CUSTODIO | 4 | 15% | 7, 21, 24, 27 |
| PUENTE | 2 | 7% | 8, 20 |
| MICRO-AGENTE | 0 | 0% | — |

**Lectura:** 63% reflejo — la carta es mayoritariamente proyección directa de datos.
Los conversores son mapeos deterministas (alérgenos→emoji, layout responsivo, URL WhatsApp).
Los custodios guardan estados de UI (scroll sync, accordion, visibilidad).
Los puentes conectan gesto→respuesta.
Cero micro-agentes: la carta pública no necesita juicio — todo es determinista.

> Mismo patrón que el CSS (67% reflejo). La interfaz cliente es una VITRINA,
> no un taller. Muestra datos, no los transforma.
