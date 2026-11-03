# PASADA 2 · PUNTO: `plaza-tienda` — el escaparate dentro de una plaza (D, actualizado)

> Sale del hueco CONTRATO de la r1 y **se reescribe** en esta pasada. La v2 lo tenía bien: el
> escaparate es de la tienda. La §7 le añade dos cosas que no estaban: **la cobertura** (solo se
> enseña lo que reparte en la dirección del cliente) y **el nivel** (el escaparate vive en una
> plaza, y el nacional no lo sirve).

## Prisma de los 5 huecos

### 1 · IDENTIDAD

**Una tienda con dueño, colgada de una plaza, con su marca y su cliente.** Tres capas y ninguna
sobra:

```
la carta y la marca     de la TIENDA       (su TPV es la fuente, su nombre es el que firma)
el índice y el filtro   de la PLAZA        (quién reparte aquí, ahora)
la nada                 del NACIONAL      (no sirve esta página: redirige a ella)
```

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: el cliente solo ve las tiendas que reparten en su zona** (F0 §7 r.1).
  → **EMPUJÓN**: `radio-de-tienda` (lo declara la tienda) + `config-zona` de la plaza (lo declara
  la plaza) + `filtro-por-cobertura` (la intersección, en el índice). La tienda no se ve menos
  porque la plaza sea pequeña: se ve menos porque **no llega**, y eso es un hecho.
- **FRENO: la tienda teme que le quiten al cliente** (par 4 de la F0). Sigue siendo el freno más
  caro del negocio.
  → **EMPUJÓN**: `marca-tienda` + `registro-cliente-tienda` aislado + `guarda-marca-ajena`
  **ampliada al nacional**. Con la §7 este freno se refuerza: el nacional tampoco puede poner su
  marca en el escaparate. Un cliente de Bocaos-Málaga ya sería una captura; uno de Bocaos-Nacional
  sería el final del modelo.
- **FRENO: no quiere cambiar su TPV ni tener la carta en dos sitios.**
  → **EMPUJÓN**: `carta-publica` como conversor (una fuente, una vista podada). Intacto.
- **FRENO: dos tiendas del mismo barrio compiten y el índice las pone al lado.**
  → **EMPUJÓN**: `neutralidad-orden`, ampliada: **filtrar no es ordenar** (ver
  `pasada-2-corte-de-piezas.md` §3). El índice quita por hecho y no pone por preferencia.

### 3 · CONTRATO

```
da       su carta, su marca, su cliente, su radio de reparto declarado, su incentivo
recibe   un escaparate propio dentro de una plaza, precio cerrado antes de pagar,
         la medida de su cocina (panel-tienda, puntualidad-declarada), y los riders de esa plaza
NO recibe  clientes de otras tiendas · visibilidad pagada · una ficha en un directorio nacional
```

### 4 · NO-OBJETIVOS

No capta demanda · no cruza clientes entre tiendas · no ordena el índice · no vende posiciones ·
**no se ve fuera de su cobertura** · no aparece en el buscador nacional como ficha de producto
(solo como nombre dentro del censo, si Q54 lo permite) · no guarda su carta en el nacional.

### 5 · PREGUNTAS ABIERTAS

Q39 (invitado y desglose) · ¿la cobertura es polígono, radio o códigos postales? · ¿quién declara
el radio: la tienda o la plaza de acuerdo con ella? · Q54 (qué datos de la tienda viajan al censo
nacional) · ¿una tienda puede estar en dos plazas (dos locales, misma marca)? — **no está
declarado**, y con la §7 es una pregunta nueva de verdad: la misma marca con dos escaparates en
dos despliegues no es el mismo proyecto.

## Hojas

`marca-tienda` (CUSTODIO) · `carta-publica` (CONVERSOR) · `precio-cerrado` (REFLEJO) ·
`carrito-tienda` (CUSTODIO) · `registro-cliente-tienda` (CUSTODIO) · **`radio-de-tienda`**
(CUSTODIO, nueva) · `plaza-publica` (REFLEJO, pasa a la plaza y se filtra) ·
`neutralidad-orden` (REFLEJO, ampliada).

## Lo que cambia respecto a la v2

| | v2 | esta pasada |
|---|---|---|
| `plaza-publica` | "el índice del mercado como proyección" | **el índice de la plaza, ya filtrado por cobertura** — y "mercado" en singular deja de existir |
| cobertura | `config-zona`: "qué barrios cubre este mercado" | `config-zona` (plaza) **×** `radio-de-tienda` (tienda) → `filtro-por-cobertura` |
| `neutralidad-orden` | prohíbe ranking y destacados | prohíbe además **confundir el filtro con un orden** |
| el nacional | no existía | **no sirve este escaparate**; solo enruta hacia él (`enrutado-a-plaza`) |
