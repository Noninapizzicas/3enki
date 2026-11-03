# PASADA · INTERLOCUTOR `Bocaos`

> Perspectiva: **el suelo del mercado**, visto desde sí mismo. Aquí no hay coartada: lo que
> Bocaos quiere, lo que le tienta y lo que no puede permitirse.

## 1 · IDENTIDAD — ¿qué es Bocaos para sí mismo?
**Un criterio con una plaza debajo.** No es un marketplace que crece por efecto de red y luego
monetiza: es un criterio que se aplica igual a todos y una plaza que cobra por coordinación.
Su activo no son los datos ni la marca: es que **el criterio sea creíble**.

Con el matiz, su identidad se afina: **Bocaos no decide el mercado, decide una pregunta**
(*¿a quién le propongo esto?*) y la decide igual miles de veces.

## 2 · RESTRICCIONES (freno → empujón)

- **FRENO**: la tentación permanente de meter un optimizador global. *"Con un solver repartiría
  mejor"*. Es verdad — y sería el final del modelo: si Bocaos reparte, Bocaos asigna, y si
  asigna es Glovo.
  → **EMPUJÓN**: `guarda-sin-optimizador` (A28) + `guarda-sin-asignacion` (A27), como tests.
  La renuncia se escribe en código, no en un manifiesto.

- **FRENO**: sin riders suficientes no hay mercado, y eso **no lo arregla el software** (F0,
  par 5).
  → **EMPUJÓN**: `politica-densidad` (N01) — riders activos por zona frente a pedidos por zona.
  No resuelve la densidad; dice cuándo no se puede abrir una zona. Es un freno al crecimiento,
  que es lo que hace falta.

- **FRENO**: el enlace ahorra kilómetros, y Bocaos podría cobrar por ellos.
  → **EMPUJÓN**: `guarda-no-captura-del-ahorro` (A32). Si Bocaos cobrara por km ahorrado, su
  ingreso crecería al endurecer los enlaces — y el umbral de retraso entraría en conflicto con
  su propia caja. **El esquema prohíbe esa coincidencia de incentivos.**

- **FRENO**: la IA es barata y tienta meterla en la decisión ("que puntúe candidatos").
  → **EMPUJÓN**: tres agentes, **todos en el borde** (A18 redacción, F07 incidencia, L04
  resumen), cada uno con validador puro. Cero agentes en la cadena.

- **FRENO**: si el mercado va mal, la tentación es cambiar los umbrales hasta que algo pase.
  → **EMPUJÓN**: `config-umbrales` con vigencia + `acta-decisiones` (O02) + `simulador-de-umbrales`
  (J05). Cambiar el criterio cuesta un acta y un test.

## 3 · CONTRATO
Da: el criterio, la plaza, el escaparate y la medida. Recibe: céntimos por pedido aceptado.
**No cobra el ticket, no retiene, no emplea, no ordena, no juzga.**

## 4 · NO-OBJETIVOS — lo que Bocaos NO puede permitirse
- **No puede ser el más listo de la sala.** Un planificador central es la muerte del modelo.
- **No puede capturar el ahorro** que genera el enlace.
- **No puede usar la IA para decidir** a quién se propone.
- **No puede crecer captando demanda** (app de cliente).
- **No puede sobrevivir sin riders** — y no puede retenerlos: solo darles razones.

## 5 · PREGUNTAS ABIERTAS
Q16 (los km ahorrados, ¿de quién son?) · Q22 (el mercado mínimo de una zona) · Q25 (revisión
humana desde el día uno) · Q23/Q24 (legal y adjudicación) · Q6 (serie o paralelo: es la
decisión que más cambia la experiencia del rider sin tocar el código de la regla)

## Piezas que SOLO se ven desde aquí
- `politica-densidad` (REFLEJO) — cuándo una zona no puede abrirse.
- `simulador-tramos` (REFLEJO) — el efecto de un tramo, con los números del dueño.

**Refuerza**: `salud-mercado` (I05), `tablero-fricciones` (I06), `guarda-no-retencion` (H06).
