# El sistema de preguntas de DESCOMPONER

> Qué, cuándo, dónde, por qué pregunta.
> Derivado de los 5 huecos de prisma.

---

## Las preguntas (QUÉ)

Cada hueco que DESCOMPONER no puede llenar genera preguntas específicas:

| Hueco | Pregunta | Se pregunta cuando |
|---|---|---|
| IDENTIDAD | "¿Qué es esto?" | No hay nombre, no se reconoce el producto |
| IDENTIDAD | "¿Qué trabajo resuelve?" | El nombre no explica el propósito |
| RESTRICCIONES | "¿Tiene alérgenos?" | Es comestible y no se declaran |
| RESTRICCIONES | "¿Caduca?" | Perecedero sin fecha |
| RESTRICCIONES | "¿Requiere instalación?" | Parece un bien físico grande |
| CONTRATO | "¿Tiene variantes?" (tallas, colores) | Hay indicios de opciones pero no están claras |
| CONTRATO | "¿Se puede personalizar?" | El producto lo permite |
| NO-OBJETIVOS | "¿Qué NO es?" | Puede confundirse con otro tipo de producto |
| PREGUNTAS_ABIERTAS | "¿Cuánto cuesta?" | Sin precio (privado) |
| PREGUNTAS_ABIERTAS | "¿Hay stock?" | Sin stock declarado (privado) |

Máximo de preguntas por ronda: **3**. Si hay más pendientes, se priorizan las que bloquean clasificación.

---

## El cuándo

| Momento | Pregunta |
|---|---|
| **Antes de CLASIFICAR** | Solo las que bloquean el arquetipo (IDENTIDAD esencial) |
| **Después de CLASIFICAR** | Las que mejoran el modelo pero no bloquean (CONTRATO, NO-OBJETIVOS) |
| **En paralelo** | Las reglas duras (RESTRICCIONES de seguridad/salud) → siempre se preguntan si no se declaran |
| **Nunca** | Las que el sistema puede inferir con alta confianza (un producto con nombre "Pizza Margarita" no necesita que le preguntes si es comestible) |

---

## El dónde

| Canal | Cuándo se usa |
|---|---|
| **Chat** | Onboarding guiado: el comerciante responde en conversación |
| **Formulario** | Lote de productos: se muestran todas las preguntas pendientes juntas |
| **API** | Integración con proveedor: las preguntas vuelven como campos opcionales en el schema |
| **Silencio** | Si no hay nadie para responder: se marca y se difiere. El producto queda en `necesita_aclaracion_comerciante`. |

El canal no cambia las preguntas — solo el mecanismo de entrega.

---

## El por qué

1. **Para no inventar.** La razón original de prisma: lo que no se sabe se marca abierto. Preguntar es mejor que inventar.

2. **Para no atascar el flujo.** Si DESCOMPONER se bloquea porque falta un dato, todo para. Si pregunta y sigue con lo que tiene, el flujo avanza y las respuestas llegan después.

3. **Para que el onboarding SEA responder preguntas.** Cada pregunta es un campo que el comerciante llena. Cuando no quedan preguntas, el producto está completo. No hay formulario previo — el formulario *es* el diálogo de preguntas.

4. **Para manejar casos híbridos.** Un producto que parece "servicio + producto físico" no entra en ningún arquetipo puro. La pregunta "¿cuál prima?" resuelve la ambigüedad.

---

## La regla que gobierna todo

**Pregunta solo cuando el coste de preguntar es menor que el coste de equivocarte.**

Preguntar "¿tiene alérgenos?" cuesta un clic.  
No preguntar y asumir "no tiene" puede matar a alguien.  
➡ Siempre pregunta.

Preguntar "¿es comestible?" en una pizza con foto y nombre no cuesta nada, pero el sistema ya lo sabe con 99% de confianza.  
➡ No preguntes.

El umbral depende del campo, no del producto. Los campos de seguridad/salud siempre preguntan. Los campos de confort (color, variante) solo si hay ambigüedad real.
