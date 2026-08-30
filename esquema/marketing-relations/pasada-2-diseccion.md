# Disección — Módulo "marketing-relations"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Suscriptores

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre/Contacto | **reflejo** | Dato identificador. CRUD puro. Un test afirma que existe. |
| 2 | Canal preferido | **reflejo** | Elección determinista. Un valor de un enum cerrado. |
| 3 | Segmentos | **reflejo** | Array de ids. Lectura/escritura directa. |
| 4 | Consentimiento | **custodio** | Registro inmutable de permiso. Se crea una vez, no se edita ni se borra. El custodio vigila la integridad. |
| 5 | Preferencias | **reflejo** | Objeto editable: frecuencia, temas, idioma. CRUD puro. |
| 6 | Estado | **reflejo** | Máquina de estados determinista (activo → pausado → dado_de_baja). |

## Piezas de Interacciones

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 7 | Tipo | **reflejo** | Valor de un enum cerrado. Determinista. |
| 8 | Canal | **reflejo** | Referencia a un id externo. Lectura directa. |
| 9 | Pieza | **reflejo** | Referencia a un id externo. Puede ser null. Lectura directa. |
| 10 | Fecha | **reflejo** | Timestamp. Inmutable por naturaleza (se asigna al crear). |
| 11 | Resultado | **reflejo** | Valor de un enum cerrado. Determinista. |
| 12 | Datos | **reflejo** | Objeto libre de metadata. CRUD. |

## Piezas del nivel raíz (contrato)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 13 | Consentimiento explícito | **custodio** | Vigila que todo suscriptor tiene registro de consentimiento con fecha y origen. No se crea suscriptor sin él. |
| 14 | Preferencias respetadas | **reflejo** | Invariante: las preferencias del suscriptor se leen antes de enviar. Un test afirma. |
| 15 | Historial inmutable | **custodio** | Vigila que las interacciones no se borran ni se editan. Solo se añaden. Append-only. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre/Contacto, Canal preferido, Segmentos, Preferencias, Estado, Tipo, Canal, Pieza, Fecha, Resultado, Datos, Preferencias respetadas |
| **custodio** | 3 | Consentimiento, Consentimiento explícito, Historial inmutable |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **15** | |

## Lectura del reparto

- **Reflejo dominante (12/15 = 80%)** — datos de suscriptor e interacciones son deterministas.
- **Custodio (3/15 = 20%)** — consentimiento inmutable e historial append-only.
- **Cero fuzzy** — la relación registra, no interpreta.

**El módulo es reflejo puro con custodia de consentimiento e historial.** Sin blueprint, sin micro-agente. Todo es CRUD + append-only + state machine.
