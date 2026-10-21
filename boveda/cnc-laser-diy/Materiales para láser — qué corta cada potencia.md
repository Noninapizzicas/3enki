---
tipo: materiales
sector: cnc-laser-diy
tags: [materiales, madera, acrilico, cuero, tela, mdf, laser, corte, grabado]
---
# Materiales para láser — qué corta cada potencia

> La pregunta más repetida en cualquier comunidad de láser es "¿mi máquina corta esto?" — y la respuesta correcta casi siempre depende menos de la marca y más de la longitud de onda, el grosor y si el material está limpio de barnices y adhesivos.

---

## Tabla de materiales — diodo vs CO2

```
MADERA CONTRACHAPADA (plywood)
  Diodo 20W: hasta 6-8mm en una pasada, 12-15mm con 2-3 pasadas
  Diodo 40W: hasta 12-15mm en una pasada
  CO2 40-60W: hasta 15-20mm en una pasada
  Cuidado: colas/adhesivos de baja calidad generan chamuscado irregular en los bordes

MDF
  Diodo 20-40W: hasta 6-10mm — corta pero con más chamuscado que el contrachapado por
    la resina/cola que lo compone (huele fuerte, ventilar bien)
  CO2: hasta 12-15mm con buen acabado

BALSA / CONTRACHAPADO DE ÁLAMO (basswood, tilo)
  Diodo 10-20W: hasta 3-6mm sin esfuerzo, ideal para maquetas y prototipos rápidos

ACRÍLICO (metacrilato/PMMA)
  Diodo: SOLO acrílico negro/oscuro (absorbe 450nm) — transparente/claro NO se corta bien
  CO2: TODOS los colores, incluido transparente — hasta 10-12mm con buen pulido de borde
    (el CO2 funde el borde dejándolo pulido de fábrica, ventaja frente al diodo)

CUERO
  Diodo 5-20W: corta y graba sin problema, cuero curtido vegetal da mejor resultado que
    curtido al cromo (puede liberar vapores de cromo hexavalente — ventilar/evitar)
  Grabado de precisión: potencia baja + velocidad alta para no quemar el grano

TELA / FIELTRO
  Diodo baja potencia: corta con borde sellado (evita deshilachado) en sintéticos
  Algodón 100%: se quema con más facilidad, requiere ajuste fino de potencia/velocidad

CARTÓN Y CARTULINA
  Diodo 5-10W: corta sin esfuerzo, material de entrenamiento perfecto para calibrar

CORCHO
  Diodo 10-20W: hasta 3-5mm, buen material de práctica y proyectos ligeros

PIZARRA Y PIEDRA (grabado, no corte)
  CO2: graba con buen contraste (quema la superficie dejando marca blanquecina)
  Diodo alta potencia: graba pero con menos contraste que CO2

CARTÓN CORRUGADO
  Diodo 5-15W: corta limpio, muy usado en prototipado de packaging
```

---

## Lo que NO se debe cortar NUNCA con láser

```
PVC (cloruro de polivinilo)
  → Libera gas de CLORO al vaporizarse — tóxico, corrosivo (ataca la óptica y la
    estructura metálica de la máquina) y peligroso para la salud. VETADO absoluto.

POLICARBONATO
  → No se corta limpio: amarillea, se derrite en vez de vaporizarse, bordes feos.
    Sí se puede grabar superficialmente en algunos casos, pero no cortar.

ABS
  → Libera cianuro de hidrógeno al quemarse — mismo problema de toxicidad que el PVC.

FIBRA DE VIDRO / MATERIALES CON RESINA EPOXI
  → Vapores tóxicos + puede dañar la lente por partículas en suspensión.

METALES DESNUDOS (aluminio, acero inoxidable pulido, cobre, latón sin recubrir)
  → El diodo y el CO2 simplemente REFLEJAN el haz — riesgo real de dañar la óptica o
    incluso reflejar el láser hacia el operador. Solo fibra corta/marca metal desnudo.

VINILO (PVC en otra forma)
  → Mismo problema del cloro. El vinilo autoadhesivo de rotulación NO es apto para láser.
```

---

## Parámetros de referencia — punto de partida (ajustar siempre con test)

```
MADERA CONTRACHAPADA 3mm, diodo 20W óptico
  Corte: velocidad 200-400mm/min · potencia 100% · 1-2 pasadas
  Grabado (relleno): velocidad 3000-6000mm/min · potencia 30-60% · escaneo 0,1mm

ACRÍLICO NEGRO 3mm, diodo 20W óptico
  Corte: velocidad 100-200mm/min · potencia 100% · 2-3 pasadas · aire assist obligatorio

CUERO 2mm, diodo 10W óptico
  Corte: velocidad 300-500mm/min · potencia 70-90%
  Grabado: velocidad 5000-8000mm/min · potencia 15-25%

CARTÓN 2mm, diodo cualquier potencia
  Corte: velocidad 500-800mm/min · potencia 40-60%
```

> Estos valores son PUNTO DE PARTIDA, no receta fija — cada lote de material, cada lente
> desgastada y cada humedad ambiente cambian el resultado. Siempre correr un test de
> materiales (grid de potencia×velocidad) antes de un corte importante — LightBurn incluye
> una herramienta de "Material Test" que genera esta rejilla automáticamente.

---

## Errores comunes

```
→ No limpiar el material de polvo/grasa antes de cortar — reduce absorción y ensucia lente
→ Cortar madera con nudos sin bajar velocidad — el nudo es más denso, quema el resto
→ Confundir "corta" con "corta LIMPIO" — el diodo corta MDF pero deja mucho chamuscado;
  para acabado limpio en MDF, CO2 es mejor opción
→ No ventilar cuero curtido al cromo — riesgo real de vapores de cromo hexavalente
→ Probar potencias altas directamente en material caro — siempre hacer el grid de test
  en recortes antes de la pieza final
```

## Novedades 2025-2026

```
→ El salto de diodo a 40-72W ópticos (Sculpfun S70 MAX, xTool S1 40W) permite cortar
  contrachapado de 15-18mm en una sola pasada, terreno que hace 2-3 años era exclusivo
  de CO2 de gama media — la brecha de capacidad de corte entre tecnologías se estrecha.
→ Las boquillas de air assist de alta presión metálicas (ej. Sculpfun serie S30 Ultra)
  multiplican por 5× la velocidad de corte efectiva frente a cortar sin asistencia de aire.
```

→ Máquinas y potencias reales por marca: [[Cortadoras láser — diodo, CO2 y fibra]]
→ Air assist y extracción de humos: [[Air assist, extracción y seguridad láser — clase 4, EPIs, normativa]]
→ Ideas de proyectos por material: [[Proyectos láser — ideas y tutoriales paso a paso]]
