---
name: prisma-modelo-universal
description: Modela CUALQUIER producto de comercio con un molde universal de 5 huecos y deja que la identidad del comercio EMERJA de sus productos — lo objetivo lo descompone la IA, lo privado se marca abierto (nunca se inventa). El know-how del vertical Prisma, destilado para conducir sus reflejos.
when-to-use: Al dar de alta o modelar productos de un comercio en prisma (onboarding de catálogo, decidir arquetipos/naturalezas/órganos, descomponer un producto crudo en el molde de 5 huecos), o al diseñar/tocar módulos del vertical prisma que deban respetar la tesis identidad-emerge. NO para costear formulaciones (eso es prisma-compuestos) ni para disecionar una tarea nueva en piezas (eso es diseccionador).
---

# Prisma — el modelo universal de producto

> Entra luz blanca (un producto crudo, indistinto) y sale su espectro (sus facetas
> descompuestas). El mismo prisma vale para cualquier luz: cambias lo que entra, no el
> aparato. Así un solo vertical inteligente sirve a **todo** comercio.

**La tesis que lo gobierna todo:** la identidad del comercio NO se declara, EMERGE de sus
productos. Nadie configura "soy peluquería". Metes cortes de pelo → el sistema deduce que
necesita agenda. Metes pizzas → deduce que necesita cocina. El comercio *es* el conjunto de
arquetipos de lo que vende.

## Cuándo usar

Al modelar un producto real de un comercio (foto/texto/fila de catálogo) o al arrancar un
comercio Prisma: para descomponerlo en el molde, clasificar su arquetipo y saber qué órganos
enciende. NO para inventar datos privados del comerciante — esos se marcan abiertos.

## El molde — 5 huecos fijos + ejes + naturalezas

Si modelas "pizza" por sus atributos concretos, atas el sistema a la pizza. Todo producto
—pizza, TV, corte de pelo, alquiler de excavadora— cae en los MISMOS 5 huecos:

```
1 · IDENTIDAD          qué es · qué trabajo del cliente resuelve
2 · RESTRICCIONES      reglas duras (si se rompen, el producto está MAL). verdad_obligatoria
                       (alérgenos·etiqueta energética·seguridad) = clase aparte: no se alinea, se dice fiel
3 · CONTRATO           atributos_saber (de saber) + opciones (de tocar) + estados (ciclo de vida)
4 · NO-OBJETIVOS       qué NO es (evita prometer lo que no da)
5 · PREGUNTAS ABIERTAS lo privado/no-computable → el comerciante lo cierra (ES su onboarding)
                       + madurez: listo | necesita_aclaracion_comerciante | necesita_revision
```

Las **opciones** tienen 4 sub-formas (huella del arquetipo): `variante` (modelos fijos: talla) ·
`modificacion` (tocar el producto: quitar cebolla) · `añadido` (lo que lo rodea: instalación,
garantía) · `personalizacion_libre` (texto del cliente: "Feliz cumple María").

Los **ejes** se encienden por producto: `tiempo` (ninguno·instante·cita·intervalo_que_cobra) ·
`estado_de_partida` (el producto parte de TI: color sobre tu pelo) · `ciclo` (de_ida·con_retorno).
Las **naturalezas**: `stock` (unidades·ingredientes·capacidad_temporal·activo_reutilizable) ·
`precio` (por_unidad·por_peso·por_tiempo·rango_valoracion).

## El mandato — lo privado NO se inventa

**Lo objetivo lo descompone la IA; lo privado se marca ABIERTO.** El coste, el stock, la tarifa,
la agenda son privados del comerciante. No los adivines: márcalos como `pregunta_abierta`. Esas
preguntas *son* el onboarding. Es la fidelidad del sistema: nunca afirma un dato que no sabe.
(Semilla: el skill `product-capability` de ECC — "do not invent product truth; mark unresolved
questions explicitly".)

## Clasificar el arquetipo POR LA FORMA (no por la superficie)

El arquetipo se decide por la FORMA de la descomposición (ejes+naturalezas), no por lo que el
producto parece. Un corte de pelo y un masaje caen ambos en `servicio` porque su forma coincide.

```
ciclo=con_retorno                         → uso_temporal   (alquiler; órganos: agenda·retorno·fianza)
tiempo=cita | stock=capacidad_temporal    → servicio       (peluquería; órgano: agenda)
stock=ingredientes | precio=por_peso      → comestible     (pizza/pan; órganos: carta·cocina)
resto (bien manufacturado)                → pieza           (TV/bombilla; órgano: stock)
```

Registro ABIERTO (anti-wipe): si algo no encaja, PROPÓN un arquetipo nuevo; un humano lo aprueba;
la semilla es intocable. Un aprobado clasifica con prioridad.

## El reparto que sostiene TODO — reflejo vs blueprint

Cada operación se parte en dos, y esto es la espina dorsal:

```
determinista (UNA respuesta correcta computable)  → REFLEJO  (JS)   — clasificar, sumar céntimos, calcular huecos, tasar
fuzzy (interpretar/decidir/dar forma)             → BLUEPRINT (LLM de página, NO un agente) — leer una foto, redactar, decidir
```

TÚ (el LLM de página) eres la mitad fuzzy. Interpretas el producto crudo → el molde, y CONDUCES
los reflejos. Nunca tocas el fs ni inventas: lo que no sabes lo dejas abierto; lo determinista lo
pides al reflejo.

## El flujo — cómo un comercio cobra vida de sus productos

```
foto/texto → ADAPTADOR (tú descompones → crudo de 5 huecos; el reflejo clasifica por forma, marca lo abierto, VALIDA, GUARDA)
           → PRODUCTO-MANAGER (custodio único del catálogo; persiste el ProductoUniversal)
           → BOSS (lee el catálogo → arquetipos presentes → unión de ÓRGANOS que necesitan)
           → ENFORCEMENT (enciende los interruptores de esos órganos; additivo, no apaga solo)
           → aparecen los órganos que ESE comercio necesita, ni uno más
```

Un solo producto real dispara la cadena entera.

## Las dos caras + la venta

```
CARA COMERCIANTE  coste → margen → pvp   (coste.aplicar escribe el precio en el producto y cierra la pregunta de coste)
CARA CLIENTE      escaparate (vista pública, PODA lo no ofrecido) + opciones (valida y TASA la selección, en céntimos)
POS universal     carrito → cuenta → cobro → ticket → cierre   (agnóstico al arquetipo; cocina = órgano de hostelería, no del POS)
```

## Cómo conducir los reflejos (las puertas RPC que ya existen)

```
adaptador.adaptar.request { crudo, project_id }        → clasifica + valida + GUARDA (producto.adaptado)
catalogo.{save,get,list,add_product,update_product,...} → producto-manager (custodio)
opciones.evaluar.request { producto, selecciones }      → valida + precia (céntimos)
coste.{costear,aplicar}.request                         → margen/pvp; aplicar lo escribe en el producto
escaparate.publico.request                              → vista pública del catálogo
boss.plan.request · enforcement.estado.request          → qué arquetipos/órganos tiene el comercio
carrito/cobro/cuenta/ticket/cierre.<op>.request         → el POS
calendario.<op>.request                                 → el órgano agenda (huecos·reservar; cita y alquiler, mismo motor)
```

## Anti-patrones

- Inventar coste/stock/tarifa "para completar" el producto → JAMÁS. Márcalo abierto.
- Clasificar por la superficie ("es un tinte → belleza") en vez de por la forma (ejes+naturalezas).
- Hacer aritmética de dinero tú → los precios los tasa el reflejo, en céntimos enteros.
- Declarar el tipo de comercio a mano → la identidad emerge de los productos vía BOSS.

## Filosofía (el hilo, en una frase)

El reflejo hace lo determinista (la verdad computable), tú haces lo fuzzy (interpretar/decidir),
lo privado se queda abierto (nunca se inventa), y la identidad del comercio emerge de sus
productos — encendiendo solo los órganos que necesita.

> Referencia técnica viva: `arquitectura/decisiones/propuestas/prisma.md` (el reparto, los módulos
> reflejo) y `calendario.md` (el órgano agenda). Esta skill es el KNOW-HOW; los reflejos son las
> herramientas que conduce.
