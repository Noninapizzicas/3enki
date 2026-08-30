# Pasada 2 — Expansión de los SPAWN de "marketing-relations"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Suscriptores

Una persona que ha dado permiso para recibir comunicación directa del proyecto. Cada suscriptor tiene datos de contacto, preferencias y estado.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre/Contacto** | ATÓMICO | Identificador del suscriptor: nombre, email u otro dato de contacto (según canal). |
| 2 | **Canal preferido** | ATÓMICO | El canal por el que el suscriptor prefiere recibir comunicación: email, whatsapp, sms, push. |
| 3 | **Segmentos** | ATÓMICO | Los segmentos a los que pertenece el suscriptor (array de ids → marketing-audience). |
| 4 | **Consentimiento** | ATÓMICO | Registro de permiso: { fecha, origen, tipo }. Inmutable una vez creado. |
| 5 | **Preferencias** | ATÓMICO | Frecuencia deseada, temas de interés, idioma. Editables por el suscriptor o el proyecto. |
| 6 | **Estado** | ATÓMICO | Máquina de estados: activo → pausado → dado_de_baja. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Interacciones

El historial de comunicaciones entre el proyecto y un suscriptor. Cada interacción registra qué se envió, por qué canal, cuándo y qué pasó (apertura, click, respuesta).

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 7 | **Tipo** | ATÓMICO | Clase de interacción: envio, respuesta, feedback, queja, bounce. |
| 8 | **Canal** | ATÓMICO | Por qué canal ocurrió (id → marketing-channels). |
| 9 | **Pieza** | ATÓMICO | Qué contenido se usó (id → marketing-content). Puede ser null para respuestas. |
| 10 | **Fecha** | ATÓMICO | Cuándo ocurrió la interacción. |
| 11 | **Resultado** | ATÓMICO | Qué pasó: entregado, abierto, click, respondido, rebotado, queja. |
| 12 | **Datos** | ATÓMICO | Payload libre de la interacción (metadata del canal, tracking, etc.). |

**Suelo alcanzado** — piezas atómicas.

---

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 12 |
| SPAWN residual | 0 |
| Convergencias | 0 |
