# PASADA 4 · PUNTO `federacion` — seco

> Cuarta vuelta. El punto no se parte más: 25 hojas, cada una atómica, abierta o repetida.
> Aquí se declara **por qué** está seco, y qué queda fuera del árbol a propósito.

## 1 · Las 25 son atómicas, abiertas o repetidas

```
atómica    se puede escribir con un test o con un formulario. Nada dentro se subdivide.
abierta    no se puede escribir hasta que el dueño responda algo (Q41–Q55).
repetida   ya está en otro grupo del árbol con otro nombre y no se duplica.
```

| Pieza | Por qué no se parte |
|---|---|
| `registro-de-plazas` | es una tabla con un escritor: id, localidad, estado, versión, fecha |
| `alta-de-plaza` | un acto con fecha y responsable; lo que falta es quién (Q50), no qué |
| `estado-de-plaza` | cuatro estados y sus transiciones; la quinta transición sería un estado nuevo |
| `silencio-de-plaza` | un umbral y un reloj |
| `censo-de-tiendas` | proyección de eventos; nombre, id, estado, plaza. Nada más que guardar |
| `version-de-plaza` | un dato declarado por la plaza en cada `plaza.viva` |
| `despliegue-de-plaza` | un acto; lo de después es `verificacion-de-despliegue` |
| `verificacion-de-despliegue` | compara versión declarada con versión desplegada y tiendas vivas |
| `compatibilidad-de-version` | tabla cerrada de "qué puede una plaza atrasada" |
| `indice-nacional` | proyección del padrón, reescrita por evento |
| `buscador-nacional` | una consulta sobre el índice; no escribe |
| `resultado-con-su-plaza` | invariante de forma del resultado |
| `enrutado-a-plaza` | una redirección; no sirve páginas |
| `consolidacion-nacional` | una suma de devengos cerrados |
| `cuadro-de-la-federacion` | agregados de plaza |
| `marca-nacional` | el activo y quién lo publica |
| `licencia-de-marca` | el contrato de uso, con alcance y vigencia |
| `soporte-nacional` | un canal de nivel 2; su contenido es una política, no una pieza |
| `permiso-de-plaza` | la concesión, con alcance y plazo |
| `traza-de-acceso` | append-only: qué se vio, cuándo, quién |
| `acceso-delegado-a-plaza` | el permiso vivo; consume y caduca |
| `acta-de-federacion` | documento con versión y firma |
| `guarda-sin-catalogo-nacional` | un test sobre el esquema de datos |
| `guarda-no-recauda` | un test sobre los flujos de dinero |
| `guarda-frontera-de-plaza` | un test sobre el origen de cada fila |

**Ninguna hoja de este grupo es "abierta" en el sentido de "no sé qué es".** Las que dependen de
una respuesta sin respuesta están fuera del árbol, marcadas **[ABIERTA]** — y en este grupo hay
una: `canon-de-plaza`.

## 2 · La pieza que existe solo si el dueño dice que sí

| pieza | estado | qué la decide |
|---|---|---|
| `canon-de-plaza` | **[ABIERTA]** | cómo se paga el nacional: canon fijo por plaza, porcentaje del devengo de cada plaza, o nada. **Q41.** Si es canon fijo → CUSTODIO + un `devengo` por plaza que lo descuenta. Si es porcentaje → el mismo `devengo` con otro coeficiente, y `guarda-no-recauda` hay que reescribirla con cuidado (descontar en origen es parecerse mucho a recaudar). |

Y una segunda, que no es del nacional pero se decide aquí porque es su frontera:

| pieza | estado | qué la decide |
|---|---|---|
| `pasaporte-de-rider` | **[ABIERTA]** | si la credencial del rider (papeles, seguro, alta) viaja entre plazas o se re-valida en cada una. **Q44.** Si viaja → PUENTE hacia el padrón de riders de cada plaza; si no, cada plaza valida desde cero y el rider repite el trámite N veces. |

## 3 · Lo que NO es una pieza (y por eso no está en el árbol)

Cuatro cosas que un esquema menos disciplinado metería, y que aquí se nombran para prohibirlas:

1. **Un planificador nacional.** Barrido de todos los pedidos del país contra todos los riders:
   sería el final del modelo en una línea, y además es imposible (el nacional no tiene ni
   pedidos ni posiciones).
2. **Un catálogo nacional.** Precios y cartas de todas las tiendas en un solo sitio: es el
   marketplace, y con él la captura de la demanda (F0 §1: si Bocaos captura al cliente, es Glovo).
3. **Un ranking de tiendas.** Ni por ventas, ni por "calidad", ni por "cercanía patrocinada". El
   nacional ordena por localidad escrita por el cliente y por nada más (`neutralidad-orden`).
4. **Una puntuación de riders a escala federal.** El histórico no viaja (regla 2). Una nota
   federal sería el histórico viajando por la puerta de atrás, y además una presunción de
   laboralidad servida en bandeja (Directiva UE 2024/2831, art. 3–5: se mira el conjunto, y una
   nota de desempeño es control).

## 4 · El cuello propio del registro

El nacional tiene **un** eslabón limitante, y es sorprendentemente pequeño:

```
una plaza deja de publicar plaza.viva
   → silencio-de-plaza cuenta
   → estado-de-plaza la declara caída
   → el buscador nacional deja de ofrecerla        ← ¿o no?
   → sus tiendas siguen existiendo en la realidad
   → sus clientes buscan su tienda y no la encuentran
```

**El único poder operativo real del nacional es declarar caída una plaza, y ese poder tiene
consecuencias sobre gente que no tiene nada que ver con el fallo.** Es el eslabón limitante del
registro, y no se resuelve con código: se resuelve decidiendo qué ve el cliente cuando su plaza
está caída (Q47). Las tres salidas posibles, ninguna declarada:

```
1 · desaparecer        el cliente no encuentra su tienda: el fallo de la plaza se convierte en
                       un fallo del restaurante, que no lo provocó
2 · marcar la plaza    "esta plaza está en mantenimiento": honesto, pero le dice al cliente que
                       hay una federación detrás — y el cliente no debe saberlo
3 · servir en caché    el índice sigue ofreciendo la tienda y el clic falla: peor que las dos
```

## 5 · Se declara seco

Ninguna de las 25 hojas se subdivide. Ninguna pregunta del grupo se puede cerrar con
investigación (son decisiones del dueño: dinero, quién firma, quién abre plazas). Ninguna pieza
nueva aparece al pasar el prisma por quinta vez.

```
federacion · r1 (pasada-1) → r2 (pasada-2, 19) → r3 (pasada-3, 25) → r4 (SECO)
```

**Total del grupo R · NACIONAL: 25 hojas, 1 marcada [ABIERTA]** (`canon-de-plaza`) **más**
`pasaporte-de-rider`, que se decide aquí porque es la frontera del padrón de riders de cada plaza.
