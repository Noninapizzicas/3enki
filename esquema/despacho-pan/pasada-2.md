# Pasada 2 · Recursión del prisma — hojas no atómicas de la pasada-1

> Ronda 2 del prisma de 5 huecos con lente CLIENTE.
> Sujeto: las hojas que en pasada-1 aún describían "un flujo"/"una experiencia"
> y NO eran dibujables por el agente de UI: `flujo-pedido` y `reenganche`.
> Regla: si una hoja describe un flujo, SIGUE prismando hasta atómico-UI.

## Hoja A · FLUJO-PEDIDO (SPAWN → se descompone)

> En pasada-1 era "carrito → pago → confirmación" — un flujo, no una hoja dibujable.
> Se prisma con las 5 preguntas-cliente.

### IDENTIDAD — ¿Qué ELIGE el cliente aquí?
- Elige **confirmar** su pedido (los items que ya seleccionó).
- Elige **pagar** (adelantado — el acto que cierra).
- Elige **cuándo recoger** (la franja: HOY / MAÑANA / PASADO MAÑANA).

### RESTRICCIONES — ¿Qué ya está decidido por el negocio?
- **Pago anticipado**: solo se hornea lo pagado (cero merma).
- **Precio**: lo fija el backend; la web solo muestra el total.
- **Franjas**: HOY / MAÑANA / PASADO MAÑANA (cero inputs de fecha).
- **Método de pago**: link de pago (P4 del FM1) — el cliente no elige infraestructura.

### CONTRATO — ¿Qué necesita VER para decidir y qué SEÑAL confirma?
- Ver el **resumen del pedido** (items + total) antes de pagar.
- Ver el **botón de pago** (grande, claro).
- **Señal**: "pedido confirmado" tras pagar (nunca recarga).

### NO-OBJETIVOS — ¿Qué caras NO son del cliente aquí?
- No es gestión de cuentas recurrentes (jefe).
- No es configuración de precios ni de catálogo (jefe).
- No es el dashboard de métricas (jefe).

### PREGUNTAS_ABIERTAS — ¿Qué decisión falta y bloquea?
- **Q4. Métodos de pago**: ¿link de pago, transferencia, tarjeta? (bloquea el botón de pago).

### SUB-HOJAS atómicas (resultado de la descomposición)
1. **`resumen-pedido`** — items + total antes de pagar. → ATÓMICO
2. **`boton-pago`** — el acto de pagar (link de pago). → ATÓMICO
3. **`confirmacion-pedido`** — la señal "pedido confirmado". → ATÓMICO (REF a `señal-confirmacion`)

---

## Hoja B · REENGANCHE (SPAWN → se descompone)

> En pasada-1 era "recordatorio semanal, aviso, oferta recurrente" — una experiencia,
> no una hoja dibujable. Se prisma con las 5 preguntas-cliente.

### IDENTIDAD — ¿Qué ELIGE el cliente aquí?
- Elige **repetir** su pedido semanal en un click (cuenta recurrente).
- Elige **aceptar** el descuento 10% por recurrencia.

### RESTRICCIONES — ¿Qué ya está decidido por el negocio?
- **Descuento 10%** en pedidos semanales recurrentes (promo principal, FM0).
- **Recordatorio semanal** "¿repites?" (reenganche recurrente, FM0).
- **Aviso de tanda**: qué pan hay, cuándo se hornea (FM0 calendario).

### CONTRATO — ¿Qué necesita VER para decidir y qué SEÑAL confirma?
- Ver el aviso "¿repites esta semana?" con su pedido guardado.
- Ver el botón "repetir mi pedido" (grande).
- **Señal**: "pedido de la semana generado" (aplica 10%).

### NO-OBJETIVOS — ¿Qué caras NO son del cliente aquí?
- No es la gestión de la cuenta recurrente (activar/desactivar/editar base) — eso es jefe.
- No es la configuración del recordatorio (jefe).

### PREGUNTAS_ABIERTAS — ¿Qué decisión falta y bloquea?
- Ninguna nueva. Depende de Q1 (catálogo inicial) y Q2 (franjas) para el contenido del aviso.

### SUB-HOJAS atómicas (resultado de la descomposición)
1. **`aviso-repeticion`** — el recordatorio "¿repites esta semana?" con el pedido guardado. → ATÓMICO
2. **`boton-repetir`** — replicar el pedido semanal en un click. → ATÓMICO
3. **`oferta-recurrente`** — el descuento 10% visible (promo). → ATÓMICO

---

## Árbitro de lente — resultado por hoja

| Hoja | Árbitro | Veredicto |
|---|---|---|
| hero-promesa | ¿lo consume el cliente al descubrir? | **CLIENTE** (este esquema) |
| tarjeta-item | ¿lo consume al elegir? | **CLIENTE** |
| selector-opciones | ¿lo consume al elegir? | **CLIENTE** |
| resumen-pedido | ¿lo consume al convertir? | **CLIENTE** |
| boton-pago | ¿lo consume al pagar? | **CLIENTE** (el link de pago en sí = neutro, alimenta) |
| confirmacion-pedido | ¿lo consume al confirmar? | **CLIENTE** |
| aviso-repeticion | ¿lo consume al repetir? | **CLIENTE** |
| boton-repetir | ¿lo consume al repetir? | **CLIENTE** |
| oferta-recurrente | ¿lo consume al repetir? | **CLIENTE** |

## Hojas de GESTIÓN separadas (NO son del cliente → interfaz del JEFE, otro agente)

> Existen en el sistema pero NO entran en la web de consumo. Van a `esquematizador-jefe`.

| Hoja de gestión | Cara | Por qué se separa |
|---|---|---|
| Dashboard de métricas (P5) | JEFE | el dueño decide con los datos (nº pedidos/semana, recurrencia, producto top) |
| Gestión de cuentas recurrentes | JEFE | activar/desactivar/editar la base del pedido semanal |
| Configuración de precios | JEFE | el backend fija precio; el dueño lo configura |
| Gestión de catálogo | JEFE | qué panes/repostería se ofrecen |
| Configuración de franjas de tanda | JEFE | cuántas franjas y a qué hora se hornea |
| Operación de cocina/recogida | POS | se ejecuta en el momento de la venta/atención |

## Estado de cada hoja en el árbol maestro

| Hoja | Estado |
|---|---|
| hero-promesa | **ATÓMICO** |
| tarjeta-item | **ATÓMICO** |
| selector-opciones | **ATÓMICO** |
| flujo-pedido | **SPAWN** (→ pasada-2) |
| ├─ resumen-pedido | **ATÓMICO** |
| ├─ boton-pago | **ATÓMICO** |
| └─ confirmacion-pedido | **ATÓMICO** (REF `señal-confirmacion`) |
| señal-confirmacion | **ATÓMICO** |
| reenganche | **SPAWN** (→ pasada-2) |
| ├─ aviso-repeticion | **ATÓMICO** |
| ├─ boton-repetir | **ATÓMICO** |
| └─ oferta-recurrente | **ATÓMICO** |
| (gestión) dashboard, cuentas, precios, catálogo, franjas | **REF** → esquematizador-jefe |
