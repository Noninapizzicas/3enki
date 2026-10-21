# Coste de tokens de inyección del rail + diseño de doble inyección

> Medido en vivo (2026-08-19) con el rail real de the-pirate (`f4_construir_modulos_the_pirate`,
> 13 pasos) y el código exacto del nervio `_composeRailSection` en
> `modules/conversacion/ai-gateway/index.js` (~L1722).

## Dónde se gasta el coste (desglose real de ~500 tok)

| Componente | chars | ≈tok | % |
|---|---|---|---|
| Boilerplate (texto fijo, se repite idéntico cada turno) | 453 | 129 | 26% |
| Cuerpo de los pasos | 1097 | 313 | 63% |
| Aviso "sin objetivo" | 180 | 50 | 10% |

Regla práctica: **~1 token por 3.5 chars** (medido sobre texto real del rail).

## El nervio solo inyecta la lista ACTIVA

`_leerRailActivo(project_id)` → RPC `estados.estado` (best-effort, timeout 2s → null).
- Sin lista activa → **0 tokens** (no inyecta nada).
- Con lista activa → los ~500 tok de ESA lista, en cada turno real con proyecto.

## Lección clave de compresión (probada)

Truncar el texto del paso a 3 palabras **pierde la idea** (ej. "P7 inventario —…" no dice nada).
El valor está en los **órganos** (la parte tras `—`). El patrón de paso es uniforme:
`P<num> <nombre> — <órgano> + <órgano> + …` (verificado 13/13 en the-pirate).

Compresión que conserva la idea:
```
1 ○ inventario:CatalogoIngredientes·StockAlmacen·Compras·Merma
```
= `número` (orden) + `símbolo` (estado) + `nombre:órganos` (con `·` separando, sin paréntesis).
Eso baja a ~67% (1/1.5) — **no llega a 1/3** porque el contenido de los pasos en sí pesa.

## Diseño de doble inyección (decisión del dueño, 2026-08-19)

El dueño quiere: **arranque gordo + turno diario en símbolos**.

| Turno | Qué se inyecta | Coste |
|---|---|---|
| 1º de una conversación nueva | Rail COMPLETO (texto del paso + protocolo + objetivo) | ~500 tok |
| Siguientes | Rail en SÍMBOLOS (mapa escueto + paso actual) | ~110 tok (~1/4) |

Símbolos acordados: `✓` hecho · `○` pendiente · `✗` atascado · `—` descartado · `★` prioridad (opcional).
Regla: **orden = posición, estado = símbolo, texto = palabra escueta**. Máx 2 símbolos por paso.

Para llegar a 1/3 de verdad hay que combinar:
1. **Boilerplate** 129 → ~20 tok (una línea: `# RAIL «nombre» (estricto) — marca con estados.avanzar`).
2. **Aviso sin-objetivo** 50 → 0 (fijar objetivo a la lista activa lo elimina, y de paso activa el juez).
3. **Cuerpo**: o bien "solo paso actual" (Camino A, ~90-110 tok, el detalle solo en el paso en curso,
   el mapa va escueto; el LLM ve el resto a demanda con `estados.estado`), o bien "mapa completo
   comprimido" (Camino B, ~200 tok, conserva todo el mapa pero pierde legibilidad).

**Camino A** es el que cumple "1/3" de verdad y encaja con la filosofía del rail (en orden estricto
el LLM solo necesita el paso en curso con detalle).

## Implementación pendiente (no hecha en esta sesión)

Cambio en `_composeRailSection` del ai-gateway: detectar primer turno de la conversación
(historial vacío de inyección) → formato largo; ya inyectado → formato símbolos. Rama `hermes/` + PR + test.
