# PASADA 2 · PUNTO: `sala-mercado` (la operación humana mínima)

> Sale del hueco RESTRICCIONES de la pasada 1: si el mercado se corrige solo, ¿qué
> queda para un humano? Altas, estados, decisiones y disputas — y nada más.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La sala es **el mínimo humano** que un mercado de dos lados necesita: admitir tiendas y
riders, cambiar estados, mirar la salud del mercado, decidir lo que no se mide y
resolver lo que se discute. Su objetivo es **encogerse**: todo lo que se pueda medir se
automatiza, y el humano solo decide lo que tiene consecuencia sobre personas.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: admitir riders de más los canibaliza (pocos pedidos por rider), admitir de
  menos deja pedidos sin rider. → **EMPUJÓN**: `politica-densidad` mide riders activos
  por zona frente a pedidos y avisa; la decisión es de la sala.
- **FRENO**: tiendas y riders cambian de estado a todas horas. → **EMPUJÓN**:
  `estado-tienda` y `estado-rider` con un escritor claro (no "lo cambia cualquiera").
- **FRENO**: los fallos y las disputas caen en un teléfono. → **EMPUJÓN**: `cola-sala` +
  `vista-parte` (todo lo de una tienda o un rider en una pantalla) + `disputa-fallo`.
- **FRENO**: el dueño no puede mirar 40 tiendas. → **EMPUJÓN**: `salud-mercado` +
  `tablero-fricciones` (los 8 pares medidos) + `acta-decisiones`.
- **FRENO**: decidir sin rastro convierte el mercado en arbitrario. → **EMPUJÓN**:
  `acta-decisiones` append-only: por qué se admitió, se suspendió o se expulsó.

### 3 · CONTRATO
- La sala **da**: acceso al mercado, orden y decisión explicada.
- La sala **recibe**: pedidos que encuentran rider, pocas excepciones, y el acta.

### 4 · NO-OBJETIVOS
- NO atiende al cliente final: ese cliente es de la tienda (`reclamacion-por-la-tienda`).
- NO cocina, NO reparte, NO fija precios de la comida.
- NO juzga fallos que ya tienen hecho medido: los aplica.
- NO crece con el volumen: si crece, es que algo no se está midiendo.

### 5 · PREGUNTAS ABIERTAS
- ¿Quién atiende la sala al principio (el dueño solo)? ¿en qué horario?
- ¿Cuántas altas por semana se esperan? (no declarado).
- ¿Se puede **expulsar** a una tienda o a un rider, con qué motivo y con qué plazo?
- ¿Cuántas zonas abre el mercado a la vez al arrancar? (mercado mínimo por zona: no
  declarado).

## Hojas que salen (→ disección)
`alta-tienda` · `alta-rider` · `estado-tienda` · `estado-rider` · `salud-mercado` ·
`tablero-fricciones` · `aviso-sala` · `terminos-parte`
