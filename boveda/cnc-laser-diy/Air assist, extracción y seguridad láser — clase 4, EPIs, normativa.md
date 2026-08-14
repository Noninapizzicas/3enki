---
tipo: seguridad
sector: cnc-laser-diy
tags: [seguridad, air-assist, extraccion-humos, epi, normativa, clase-laser, hepa]
---
# Air assist, extracción y seguridad láser — clase 4, EPIs, normativa

> El láser es la herramienta maker que más rápido castiga la falta de respeto: un haz invisible de 40W puede quemar retina en milisegundos y los humos de corte acumulan más partículas finas que un cigarrillo por minuto de uso — el equipo de seguridad no es opcional, es la mitad de la inversión real en esta afición.

---

## Air assist — por qué es casi obligatorio

```
QUÉ HACE
  Un chorro de aire coaxial al haz que expulsa el humo y las partículas del punto de
  corte, evitando que se re-quemen contra el material (causa principal de bordes negros
  y chamuscados feos) y reduciendo drásticamente el riesgo de llama sostenida.

COMPONENTES
  Compresor: desde una bomba de acuario pequeña (5-15€, solo grabado ligero) hasta un
    compresor de aire silencioso dedicado (40-80€, necesario para corte real)
  Boquilla coaxial: plástica (incluida de fábrica) o metálica de alta presión (Sculpfun
    S30 Ultra la incluye, mejora hasta 5× la velocidad de corte efectiva)
  Tubo y racores: estándar 4-6mm, casi siempre incluidos con la máquina

IMPACTO EN RESULTADO
  → Sin air assist: bordes chamuscados, riesgo de llama, cortes más lentos necesarios
  → Con air assist: bordes limpios, velocidad de corte mayor, menos residuo en la lente
```

---

## Extracción de humos — HEPA + carbón activo

```
POR QUÉ ES CRÍTICO
  Cortar/grabar madera, MDF o cuero genera partículas finas (PM2.5) y compuestos
  orgánicos volátiles (VOCs) — en un espacio cerrado sin ventilar se acumulan a niveles
  que superan largamente los límites de exposición laboral en pocas horas de uso.

SISTEMA MÍNIMO — ventilación al exterior
  Un tubo de 100-125mm desde la máquina hasta una ventana con un extractor en línea
  (30-60€) es la solución más barata y efectiva si tienes acceso a exterior.

SISTEMA CERRADO — filtración HEPA + carbón activo (sin salida al exterior)
  Prefiltro (partículas grandes) → HEPA H13 (99,97% a 0,3 micras, retiene partícula fina)
  → carbón activo (neutraliza VOCs y olor). Necesario en interiores sin ventana practicable.
  Ejemplo de referencia: extractor OMTech 4 capas de filtro (precio orientativo 150-300€,
  2026) o Mr Beam Air Filter System (gama premium, filtros de recambio periódico).

MANTENIMIENTO
  Los filtros de carbón activo se saturan — sustituir cada 2-4 meses de uso frecuente según
  el fabricante. Un filtro saturado deja de retener VOCs aunque siga pareciendo "limpio".
```

---

## Honeycomb bed y rotary — accesorios de mesa

```
HONEYCOMB BED (cama de panal)
  Rejilla de aluminio en panal de abeja que sujeta el material minimizando el punto de
  contacto — evita que el reverso del corte se queme por reflexión del haz contra una
  superficie plana sólida. Prácticamente obligatorio para corte limpio por el reverso.
  Precio orientativo: 30-80€ según tamaño (2026).

ROTARY ATTACHMENT
  Rodillo motorizado que gira objetos cilíndricos (vasos, botellas, tazas) bajo el haz,
  sustituyendo el eje Y por rotación — abre la puerta a personalización de objetos
  redondos. La mayoría de fabricantes (xTool, Sculpfun, OMTech) venden el suyo compatible
  con su propia máquina; LightBurn soporta rotary de forma nativa en su configuración.
  Precio orientativo: 60-150€ según marca (2026).
```

---

## Clases de láser y qué EPI corresponde

```
CLASE 1  → seguro sin protección — requiere enclosure certificado (ej. xTool S1 cerrado)
CLASE 3B → dañino con exposición directa al haz — requiere gafas si se opera abierto
CLASE 4  → dañino incluso con luz difusa/reflejada, riesgo de incendio — la mayoría de
  diodo DIY abierto (Ortur, Sculpfun, Atomstack sin enclosure) es Clase 4 real

GAFAS DE PROTECCIÓN — imprescindibles con máquina abierta
  Deben cumplir UNE-EN 207 (protección frente al haz directo) y UNE-EN 208 (visión durante
  el ajuste/alineación) certificadas para la longitud de onda EXACTA de tu láser:
  → 450nm (diodo azul): gafas específicas OD4+ a 450nm — NO sirven las de CO2
  → 10.600nm (CO2): gafas específicas para ese rango — el material de la lente es distinto
  → 1064nm (fibra): gafas específicas para infrarrojo cercano — la más peligrosa por ser
    invisible al ojo humano, sin percepción de deslumbramiento previo
  Nunca se comparten gafas entre tecnologías — cada longitud de onda necesita su filtro.
```

---

## Normativa en España — resumen operativo

```
COMERCIALIZACIÓN
  Toda máquina láser vendida en España debe incluir manual de instrucciones en español,
  conforme a la normativa de comercialización de maquinaria de la UE (Directiva de
  Máquinas 2006/42/CE, marcado CE obligatorio).

USO DOMÉSTICO/HOBBY
  No existe licencia específica para operar un láser Clase 4 en un domicilio particular,
  pero la responsabilidad de la seguridad (ventilación, EPIs, prevención de incendios)
  recae enteramente en el usuario — no hay inspección salvo incidente.

USO PROFESIONAL/TALLER CON EMPLEADOS
  Aplica la Ley de Prevención de Riesgos Laborales — evaluación de riesgos del puesto,
  EPIs obligatorios, ficha de seguridad del equipo, formación específica del operario.
  Los láseres Clase 3B/4 requieren carcasa de protección, sistema de confinamiento y
  enclavamiento (interlock) según la normativa de seguridad industrial aplicable.
```

---

## Errores comunes

```
→ Operar un diodo abierto sin gafas "porque no se ve el haz" — el 450nm es visible pero
  el reflejo especular en superficies pulidas es igual de peligroso y menos previsible.
→ Comprar gafas genéricas "protección láser" sin especificar longitud de onda — inútiles
  si no cubren exactamente tu rango, dan falsa sensación de seguridad.
→ Cortar sin extracción en una habitación cerrada "solo una pieza rápida" — la exposición
  acumulada en sesiones cortas y frecuentes es el patrón real de riesgo, no la sesión única.
→ Dejar la máquina desatendida durante un corte largo — el riesgo de incendio real existe,
  especialmente en madera con air assist mal calibrado o material con resina.
→ No tener extintor cerca — un extintor de CO2 o polvo ABC pequeño junto a la máquina es
  la medida de seguridad más barata y menos aplicada del sector.
```

## Novedades 2025-2026

```
→ Los sistemas de filtración 3-en-1 (partícula gruesa + HEPA H13 + carbón activo en un
  único cartucho, como el de OMTech) simplifican el mantenimiento frente a los sistemas
  de filtros separados de generaciones anteriores.
→ Las máquinas enclosure Clase 1 (xTool S1, competidores en camino) desplazan parte de
  la carga de seguridad de "EPI del usuario" a "diseño de la máquina" — tendencia clara
  del mercado hacia hacer el láser seguro por defecto en vez de exigir disciplina externa.
```

→ Cómo montar el interlock en un enclosure DIY: [[Láser DIY — construcción, upgrades K40 y enclosures]]
→ Qué materiales generan más humo/VOCs: [[Materiales para láser — qué corta cada potencia]]
