# Pasada 1 — marketing-strategy desde el CLIENTE

**Sujeto**: Los datos de marketing-strategy que el cliente final ve, consume o que condicionan
la interfaz que recibe. No es la estrategia como herramienta del jefe — es su PROYECCIÓN
hacia el punto de contacto con el cliente.

**Fuente**: `modules/marketing-strategy/` — reflejo puro (JS), store `ESTRATEGIA_VACIA`.

---

## IDENTIDAD

La **cara pública de la estrategia**. El jefe define posicionamiento, propuesta de valor,
atributos y evidencias en el módulo. El cliente nunca ve "la estrategia" — ve su efecto:
un titular que comunica, un subtítulo que convence, unos badges que generan confianza,
unos puntos clave que diferencian.

El módulo es la FUENTE; lo que aquí esquematizamos es la SALIDA: los datos que salen
del módulo, pasan por un conversor y se materializan en secciones de la interfaz.

---

## RESTRICCIONES

| Restricción | Detalle |
|---|---|
| **Fuente única** | El store `ESTRATEGIA_VACIA` es la única fuente. No se inventa contenido — si el campo está vacío, la sección no se genera o se marca como hueco. |
| **Reflejo puro** | El módulo almacena y valida, no interpreta. La interpretación es del CONVERSOR que transforma dato crudo → contenido de sección. |
| **Evento de cambio** | `marketing.strategy.actualizada` señala qué campos cambiaron. El sincronizador (#25) escucha y regenera las secciones afectadas. |
| **Sin acceso directo** | El cliente NO toca el store — consume la vista ya renderizada. La tool `update` es del jefe. |

---

## CONTRATO (lo que el cliente RECIBE)

El módulo promete estos datos al cliente (siempre que el jefe los haya rellenado):

| Dato fuente | Promesa al cliente | Sección destino |
|---|---|---|
| `posicionamiento.declaracion` | Frase que dice QUÉ ES el proyecto | Hero headline, About header |
| `posicionamiento.propuesta_valor` | Frase que dice POR QUÉ LE IMPORTA al cliente | Hero subheading, Landing copy |
| `posicionamiento.atributos_deseados[]` | Lista de puntos que diferencian al proyecto | Features/benefits section, badges |
| `posicionamiento.credibilidad.evidencias[]` | Pruebas de que el proyecto cumple (cifras, logos, premios) | Trust badges, social proof, "as seen in" |
| `posicionamiento.territorio.categoria` | Tipo de negocio — no se muestra, pero CONDICIONA la estructura | Selector de estructura (#20) |

**5 datos con cara pública.** El resto del store es tablero del jefe.

---

## NO-OBJETIVOS (para el cliente)

Estos datos viven en el módulo pero NO salen a la interfaz del cliente:

| Dato | Por qué NO es para el cliente |
|---|---|
| `objetivos[]` | Metas internas del negocio (state machine: definido→activo→alcanzado→fallido). El cliente no sabe ni debe saber que el jefe quiere "subir conversiones un 20%". |
| `alineacion_negocio[]` | Mapeo interno objetivo↔propósito de negocio. Herramienta de planificación. |
| `conocimiento_disponible` | Inventario de gaps: { sabemos[], no_sabemos[] }. Radar interno del equipo. |
| `revisiones` | Agenda de revisión de la estrategia. Control temporal interno. |
| `posicionamiento.territorio.vecinos[]` | Competidores identificados. Inteligencia competitiva que no se publica. |
| `posicionamiento.consistencia.*` | Historial de giros de posicionamiento. Gobierno interno del mensaje. |

**6 bloques 100% internos.** Si alguno se expusiera, sería una filtración de inteligencia de negocio.

---

## PREGUNTAS ABIERTAS

1. **¿Territorio.categoría alimenta al arquetipo directamente?**
   El campo `territorio.categoria` dice "restaurante", "SaaS", "e-commerce". El arquetipo de proyecto (#1)
   necesita lo mismo. ¿Es el MISMO dato o el arquetipo se resuelve de otra fuente (project-profile)?
   → Si es el mismo: REF directa. Si no: el conversor cruza ambas fuentes.

2. **¿Las evidencias se muestran literales o se transforman?**
   "2000 clientes satisfechos" → ¿aparece como texto literal en un badge, o el conversor lo descompone
   en { icono: "users", número: "2000", texto: "clientes satisfechos" }?
   → Determina si el conversor es trivial (pass-through) o estructurado (parser).

---

## Piezas encontradas

5 ATÓMICAS con cara de cliente + 2 PREGUNTAS ABIERTAS.

El prisma NO baja más — cada dato del contrato es ya atómico (un campo → una sección).
No hay SPAWN: no hay sub-productos que contengan 5 huecos por dentro.

**Siguiente: disección** — asignar FORMA a cada pieza atómica.
