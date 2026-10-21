---
tipo: proyecto
sector: cnc-laser-diy
tags: [proyectos, finger-joints, mandala, personalizacion, senaletica, cutting-board]
---
# Proyectos láser — ideas y tutoriales paso a paso

> El láser premia más el diseño inteligente que la potencia bruta — la mayoría de los proyectos que se ven en Etsy con miles de ventas usan máquinas de 200-500€, la diferencia está en el archivo y el acabado, no en el equipo.

---

## Caja con finger joints en acrílico o madera (★★☆☆☆)

```
QUÉ ES
  Caja de ensamblaje sin tornillos ni cola, con "dientes" alternos que encajan a presión
  entre paredes — el proyecto de entrada clásico para entender kerf y tolerancias.

MATERIALES
  Acrílico 3mm (mejor con CO2 para transparente, diodo si usas negro/opaco) o
  contrachapado 3-4mm (cualquier diodo 20W+)

CLAVES DE DISEÑO
  → Compensar el kerf de tu máquina en el ancho de los dientes (LightBurn tiene
    generadores de finger joint que ya piden este dato)
  → Probar el ajuste con un recorte pequeño antes de cortar la caja completa
  → En madera, lijar ligeramente los dientes chamuscados antes del ensamblaje final

DIFICULTAD: baja — ideal como primer proyecto tras el Material Test inicial
```

---

## Mandala/patrón geométrico en madera (★★☆☆☆)

```
QUÉ ES
  Diseño de corte pasante con simetría radial — decoración de pared o posavasos.

MATERIALES: contrachapado 3-6mm, cualquier diodo o CO2
FUENTE RÁPIDA: Etsy tiene cientos de mandalas SVG listos por 2-5€, o generarlo en
  Inkscape con la herramienta de simetría radial nativa

CLAVES
  → Cortar de dentro hacia fuera reduce el riesgo de que la pieza se desplace a mitad
    de corte por vibración de zonas ya cortadas
  → Usar honeycomb bed — el patrón fino se marca fácilmente contra una superficie plana
```

---

## Cutting board engraving — tabla de cortar personalizada (★★★☆☆)

```
QUÉ ES
  Grabado (no corte) de texto/imagen sobre una tabla de cortar de madera maciza —
  uno de los productos más vendidos en negocio de regalo personalizado.

MATERIALES: nogal, arce, bambú — maderas densas dan mejor contraste de grabado
POTENCIA: diodo medio-alto (20W+), múltiples pasadas a baja potencia mejor que una
  pasada a potencia máxima (evita quemado profundo irregular)

CLAVES DE ACABADO
  → Aceite mineral food-safe DESPUÉS del grabado, nunca antes (el aceite interfiere
    con la absorción del láser)
  → Diseñar con suficiente margen de los bordes — el warping de madera maciza puede
    desalinear el grabado si está muy cerca del canto
```

---

## Personalización de regalos — llaveros, joyería, marcapáginas (★☆☆☆☆)

```
QUÉ ES
  El proyecto de mayor volumen en negocio de corte láser — piezas pequeñas, repetibles,
  personalizables por nombre/fecha, ideal para el Array tool de LightBurn.

MATERIALES: acrílico color (llaveros), madera fina 3mm (marcapáginas), cuero (joyería)
FLUJO: diseñar plantilla base → variable de texto (nombre) → Array de LightBurn para
  producir varios a la vez en la misma sesión de corte

DIFICULTAD: baja, pero el margen de negocio depende del volumen — ver nota de Negocio
```

---

## Señalética y letreros (★★★☆☆)

```
QUÉ ES
  Letreros de negocio, placas de casa, carteles decorativos — corte + grabado combinado.

MATERIALES: MDF pintado, contrachapado, acrílico con vinilo de fondo de color
TÉCNICA CLAVE: "backfill" — grabar el hueco de las letras y rellenar con pintura o
  vinilo de color contrastante después del corte, técnica muy usada en el sector
  profesional de rotulación con CorelDraw+CO2

DIFICULTAD: media — requiere buen dominio de capas (corte perimetral + grabado de
  relleno + orden de operaciones correcto)
```

---

## Living hinge — bisagra viva flexible (★★★★☆)

```
QUÉ ES
  Patrón de cortes paralelos muy finos que convierten madera/acrílico rígido en un
  material que se dobla — usado para cajas curvas, cierres de cartera, esferas plegables.

MATERIALES: contrachapado fino (2-3mm) da mejor flexibilidad que grosores mayores
HERRAMIENTA: LightBurn incluye una librería de living hinge con patrones predefinidos
  (recto, curvo, ondulado) donde solo ajustas dimensiones

CLAVES
  → El espaciado del patrón determina cuánto se dobla — patrones más apretados flexionan
    más pero debilitan la resistencia estructural
  → Probar SIEMPRE en un recorte antes de cortar la pieza final — el comportamiento de
    flexión varía mucho según veta de la madera y grosor real (no el nominal de fábrica)

DIFICULTAD: alta — el proyecto que separa a quien "usa el láser" de quien "domina el láser"
```

---

## Errores comunes en proyectos

```
→ No hacer test de material antes de un proyecto con archivo comprado — el archivo trae
  sugerencias de potencia/velocidad de OTRA máquina, casi nunca coinciden exactamente.
→ Ignorar la dirección de veta de la madera en piezas con detalle fino — la veta
  transversal se astilla más fácil en zonas de corte estrecho.
→ Subestimar el tiempo de post-procesado (lijado, aceite, pintura de backfill) al calcular
  cuánto tiempo real lleva un proyecto "listo para vender" — ver nota de Negocio.
```

## Novedades 2025-2026

```
→ La librería de living hinge de LightBurn sigue siendo la referencia gratuita más usada
  del sector — pocos competidores igualan su facilidad de generación paramétrica.
→ El backfill con vinilo de color (en vez de pintura) gana popularidad en señalética DIY
  por ser más rápido y dar acabado más uniforme que pintar a mano cada letra grabada.
```

→ Materiales y parámetros de partida: [[Materiales para láser — qué corta cada potencia]]
→ Software donde diseñar estos proyectos: [[Software de corte láser — LightBurn, LaserGRBL, xTool Creative Space]]
→ Cómo convertir estos proyectos en ingresos: [[Negocio con láser y CNC — servicio, Etsy, cálculo €-hora]]
