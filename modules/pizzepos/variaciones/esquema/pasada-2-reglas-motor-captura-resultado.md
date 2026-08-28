# Pasada 2 — Prisma sobre los sub-productos

Ronda 2: prisma sobre **Reglas**, **Motor**, **Captura**, **Resultado**.

---

## 2.1 · REGLAS — prisma

**IDENTIDAD**: la definición de qué se puede hacer con un producto. Tiene DOS naturalezas según QUIÉN la toca:
- **Declaración** (modo JEFE): decidir qué se puede quitar/añadir, límites, precios extra, sugerencias. Es CONFIGURACIÓN con cara de edición.
- **Derivación** (modo automático): si nadie declaró nada, se generan reglas por defecto desde lo que el producto ya lleva + su familia. Determinista, sin decisión humana.

**Sub-productos**: Declaración (editor) · Derivación (generador) · Paleta (qué existe para añadir, por categoría).

**RESTRICCIONES**: solo hay UNA fuente de verdad por producto; la derivación nunca pisa una declaración; la derivación es PURA (no consulta nada).

**CONTRATO**: entra producto + paleta → salen opciones con modo, valores, deltas. Entra declaración humana → sobrescribe lo derivado.

**NO-OBJETIVOS**: no valida selecciones (eso es el motor), no muestra nada.

**PREGUNTAS_ABIERTAS**: ¿la edición de reglas vive dentro de este módulo o es cara de otro? → ABIERTA, la responde el dueño.

### Prisma sobre Declaración (ronda 3, toca suelo)
- **ATÓMICO 1**: editor de opciones por producto (elegir quitables, añadir extras con precio, límite máximo). FORMA → ver disección.
- **ATÓMICO 2**: vista de reglas vigentes (solo lectura, qué derivó el sistema y qué declaró el jefe). FORMA → ver disección.
- `[ABIERTO]`: quién tiene permiso para declarar (rol/negocio), fuera del módulo.

### Prisma sobre Derivación (ronda 3, toca suelo)
- **ATÓMICO 3**: derivador de opciones (producto → opciones por defecto). Ya existe como pieza pura y probada — REF, no se re-prisma.

## 2.2 · MOTOR — prisma

**IDENTIDAD**: el juez neutro. Valida una selección contra las reglas (pertenencia, disponibilidad, cardinalidad por modo) y suma el precio.

**Sub-productos**: Regla-por-modo (una estrategia por forma de elegir) · Agregador (N opciones → dictamen + delta total).

**RESTRICCIONES**: puro (sin bus, sin disco); dinero entero; el modo define la regla, no la pieza.

**CONTRATO**: entra (producto+opciones, selección) → sale (válida, motivo, delta). Rechazo SIEMPRE con motivo nombrado.

**NO-OBJETIVOS**: no persiste, no emite señales de vida, no conoce UI.

**PREGUNTAS_ABIERTAS**: ninguna — ya está construido y probado. **REF** (repetido), no se re-prisma.

## 2.3 · CAPTURA — prisma

**IDENTIDAD**: el momento de elegir. NO es una pieza única: **emerge del modo de cada opción** (radio si eliges uno, check si eliges varios, chips «sin X» si quitas, texto si es libre). El error sutil del esquema: tratar «captura» y «modos» como ramas separadas — son DIMENSIONES que convergen en UNA pieza: la hoja de elección.

**Sub-producto único convergente**: Hoja de elección (recibe producto+opciones, dibuja un control por modo, recoge selecciones, muestra estimación, entrega la selección).

**RESTRICCIONES**: no tasa la verdad (solo hint); no envía nada por sí misma; el precio final lo pone el motor al añadir.

**CONTRATO**: entra producto con opciones → sale selección `{opción: [valores]} + notas`. Cancelable sin coste.

**NO-OBJETIVOS**: no edita reglas, no valida en duro (el motor es el juez; aquí solo estimación).

**PREGUNTAS_ABIERTAS**: ¿dónde vive esta hoja — en el punto de venta (flujo «utilización») o también en la gestión? → ABIERTA, decisión del dueño.

**Ronda 3 sobre Hoja de elección**: sus hojas son controles por modo — **REF** al catálogo de modos (ya definidos en el motor); el resto es presentación atómica.

## 2.4 · RESULTADO — prisma

**IDENTIDAD**: la variación ya dictaminada, convertida en dato que acompaña al item elegido.

**Sub-productos**: Dictamen válido (composición final + precio desglosado, viaja con el item) · Dictamen rechazado (motivo, para nombrar el fallo — nunca silencio).

**RESTRICCIONES**: el rechazo no es error genérico — es señal con motivo; la validación ocurre en el punto de captura Y al llegar al buffer de venta (doble verificación, la segunda es la que vale).

**CONTRATO**: validada → observadores (buffer, impresión, ticket) reciben la composición final; rechazada → el capturador recibe el motivo y corrige.

**NO-OBJETIVOS**: no retiene estado propio — el resultado vive con el item.

**PREGUNTAS_ABIERTAS**: ninguna — las señales ya existen y tienen consumidores.

**Ronda 3**: hojas atómicas — **ATÓMICO 4**: emisión de dictámenes (publicar validada/rechazada con motivo y desglose).

**Ronda completa sin productos nuevos → SUELO alcanzado.**