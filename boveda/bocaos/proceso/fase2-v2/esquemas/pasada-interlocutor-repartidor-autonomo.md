# PASADA · INTERLOCUTOR `repartidor autónomo`

> Perspectiva: **el rider**. Se oferta a los restaurantes del mercado, acepta repartos, los
> enlaza y cobra del cliente. Es el único que puede marcharse sin avisar — y por eso es el
> sujeto real del eslabón limitante.

## 1 · IDENTIDAD — ¿qué es Bocaos para él?
**Una fuente de propuestas con números.** No un jefe, no una app de tareas, no un contrato.
Cada propuesta es un contrato puntual que él puede firmar o no firmar, y la relación entera
cabe en esa frase.

Con el matiz, Bocaos es algo más preciso: **el que le dice la verdad antes de que decida**.

## 2 · RESTRICCIONES (freno → empujón)

- **FRENO**: *"me llega una propuesta y voy conduciendo"*.
  → **EMPUJÓN**: los **mismos cuatro números en el mismo orden**, una frase de una línea, y
  `ventana-de-propuesta` declarada. Cuánto dura la ventana es **Q5** — y es de las preguntas
  que más le afectan a él.

- **FRENO**: *"si rechazo, ¿me penalizan?"*
  → **EMPUJÓN**: `rechazo-sin-coste` (A21) + `guarda-sin-puntuacion` (A22). El rechazo se
  registra y **nunca** se agrega. Y para que "sin coste" no signifique "propuestas eternas",
  el control es suyo: `estado-rider` con **pausa declarada** (I04) y `zona-rider` (M02).

- **FRENO**: *"¿cuatro números? ¿y si `cobra` es lo que pago yo por el desvío?"*
  → **EMPUJÓN**: `medida-cobra` (A11) declara si es **bruto** o **neto**. Y aquí está el
  hallazgo más duro de esta pasada: **si es bruto, el cuarto umbral no le protege de nada**. Un
  rider al que se le propone un pedido que paga poco y cuyo desvío cuesta casi lo mismo pasa el
  umbral `cobra > 0` y pierde dinero en el viaje. La F0 §6.5 dice *"si el rider no gana más, no enlaza"*, y eso
  **solo se cumple si `cobra` es neto** (**Q2**). Es la pregunta que decide si el enlazado es
  una palanca o una trampa.

- **FRENO**: *"el que ya llevaba un pedido no es mi problema si enlazo otro"*.
  → **EMPUJÓN**: `promesa-por-parada` (B03) — su promesa con el cliente anterior está escrita,
  y el umbral de retraso le obliga a respetarla. **Eso también le protege**: le da una razón
  objetiva para decir "no" sin parecer vago.

- **FRENO**: *"no sé por qué me llega esto a mí"*.
  → **EMPUJÓN**: `razones-de-la-decision` (A16) + `frase-derivada` (A17). Y desde la Directiva
  (UE) 2024/2831 (art. 8, extendido a no asalariados por el art. 10) **no es un detalle de UX:
  es un derecho**.

- **FRENO**: *"me tratan como a un empleado sin darme derechos"*.
  → **EMPUJÓN**: `guarda-sin-asignacion` (A27) + `guarda-sin-exclusividad` (M03) + `cartera-rider`
  (M01). No hay turnos, no hay protocolo de obediencia, no hay asignación.

## 3 · CONTRATO
Da: una decisión libre en ~20 s y la entrega. Recibe: los cuatro números, la frase que los
explica, el importe **íntegro** del reparto (se lo paga el cliente), la medida de su espera
(G04) y el histórico del local antes de aceptar (L03).

## 4 · NO-OBJETIVOS — lo que NO quiere
- **No quiere asignaciones.** Ni "acepta en 20 s o se lo damos a otro" dicho como amenaza: eso
  ya es un plazo, y un plazo es una relación laboral.
- **No quiere una nota.** Ni estrellas, ni fiabilidad, ni "prioridad por aceptación".
- **No quiere exclusividad**, ni turnos, ni zona impuesta.
- **No quiere que Bocaos retenga su dinero.** Cobra del cliente; a Bocaos le paga su cuota.
- **No quiere que le propongan viajes que le cuestan dinero.** (De ahí Q2.)

## 5 · PREGUNTAS ABIERTAS
Q2 · Q5 · Q7 (orden de candidatos) · Q8 (¿puede depender de sus datos?) · Q9 (¿rechazo sin
consecuencia **informativa**? ¿se le muestra su propia tasa?) · Q10 (¿basta la pausa?) · Q11
(¿puede rechazar **con motivo**? ¿ese motivo alimenta el histórico de la tienda o el suyo?) ·
Q12 (acepta y no aparece) · Q13 (¿puede devolver si el local se pasa de la espera?) · Q33
(capacidad) · Q34 (qué acredita y quién lo verifica)

## Piezas que SOLO se ven desde su silla
- `cartera-rider` (REFLEJO) — lo ganado, lo debido, lo que se le debe.
- `zona-rider` (CUSTODIO) — la zona que **él** declara.
- `guarda-sin-exclusividad` (REFLEJO) — nada le bloquea por trabajar con otro.
- `canal-rider` (PUENTE) — puerto abierto de notificación; no queda atado a una superficie.
- `vista-de-propuesta` (REFLEJO) — **los mismos cuatro números, siempre, en el mismo orden**.

**Refuerza**: `rechazo-sin-coste` (A21), `razones-de-la-decision` (A16), `cargo-fallo` (G04) a
su favor, `medida-espera` (A08).
