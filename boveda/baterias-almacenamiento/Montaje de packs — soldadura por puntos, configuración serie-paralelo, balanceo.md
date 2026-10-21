---
tipo: tecnica
sector: baterias-almacenamiento
tags: [montaje, soldadura-puntos, spot-welding, serie-paralelo, nickel-strip, packs]
---
# Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo

> Soldar un pack de litio es de las pocas tareas maker donde un error de secuencia, no de habilidad manual, es lo que provoca el accidente — el orden en que se hacen las cosas importa tanto como cómo se hacen.

---

## Notación SxP — el lenguaje de cualquier pack

```
S = celdas en SERIE → suman VOLTAJE (cada celda añade su voltaje nominal)
P = celdas en PARALELO → suman CAPACIDAD/CORRIENTE (cada celda añade su mAh y su
    capacidad de descarga en amperios)

EJEMPLOS DE CONFIGURACIÓN:
  4S1P: 4 celdas en serie, 1 en paralelo → ~14,8V (NMC) o ~12,8V (LiFePO4)
  13S1P: 13 celdas en serie → ~48,1V (NMC), estándar de e-bike de gama alta
  16S1P: 16 celdas LiFePO4 en serie → 51,2V nominal, estándar de banco doméstico
  4S3P: 4 en serie × 3 grupos en paralelo → mismo voltaje que 4S1P, 3× la capacidad

CÁLCULO RÁPIDO:
  Voltaje del pack = voltaje nominal de la celda × número de celdas en serie (S)
  Capacidad del pack = capacidad de una celda (mAh o Ah) × número de celdas
  en paralelo por grupo (P)
```

---

## Soldadura por puntos — por qué NO se suelda con estaño directo a la celda

```
EL PROBLEMA DEL ESTAÑO DIRECTO: soldar con soldador de estaño requiere calentar
  el polo de la celda varios segundos a 300°C+ — ese calor prolongado puede dañar
  el separador interno de la celda y degradar su vida útil, o en el peor caso
  provocar una fuga térmica durante el propio montaje

LA SOLUCIÓN — SOLDADURA POR PUNTOS (spot welding):
  Descarga un pulso de corriente muy alto (cientos de amperios) durante
  milisegundos a través de una tira de níquel puesta sobre el polo de la
  celda — el calor generado es muy localizado y brevísimo, sin transferir
  calor significativo al interior de la celda

MATERIAL NECESARIO:
  Tira de níquel puro (nickel strip), habitualmente 0,15-0,2mm de grosor,
  8-10mm de ancho para 18650/21700 — el níquel puro (no niquelado) es
  clave: tiene menor resistencia y soporta mejor el punto de soldadura
  Precio orientativo: rollo de 5-10m de níquel puro 0,15mm: 8-15€ (2026)

TÉCNICA:
  1. Limpiar los polos de la celda con alcohol isopropílico (elimina grasa/óxido)
  2. Cortar la tira de níquel a la medida del grupo paralelo a conectar
  3. Ajustar la potencia de la soldadora al grosor del níquel (empezar bajo,
     subir progresivamente hasta que el punto quede firme sin agujerear la tira)
  4. Aplicar 2-4 puntos por conexión, nunca uno solo (redundancia mecánica)
  5. Verificar tirando suavemente de la tira — debe resistir sin despegarse
```

---

## Secuencia de montaje segura — el orden que evita accidentes

```
1. TESTEAR cada celda individualmente ANTES de montar (voltaje, capacidad,
   resistencia interna) — ver [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]

2. EMPAREJAR celdas por grupo paralelo — mismo modelo, capacidad medida
   dentro de un 3-5% entre sí, voltaje de reposo similar

3. AISLAR entre celdas — separadores de plástico o fibra entre celdas
   adyacentes (packs comerciales de separadores 18650/21700, o impresos en 3D)

4. SOLDAR grupos paralelo primero (conexión celda a celda dentro del mismo
   grupo P), verificando voltaje del grupo con multímetro antes de continuar

5. CONECTAR grupos en serie — soldar la unión entre grupos paralelos,
   verificando voltaje acumulado tras cada unión

6. CONECTAR el BMS SOLO AL FINAL, con el pack completo ya montado y
   verificado — conectar el BMS a un pack a medio montar puede confundir
   sus lecturas y disparar protecciones erráticas

7. PRIMERA CARGA VIGILADA — la primera carga de cualquier pack nuevo se
   hace siempre presencialmente, sobre superficie no inflamable, con
   posibilidad de intervenir de inmediato

8. CARCASA Y AISLAMIENTO FINAL — termorretráctil sobre el pack completo,
   protección mecánica de las conexiones de balanceo y potencia
```

---

## Balanceo inicial — antes de que el BMS tome el relevo

```
POR QUÉ IMPORTA: un pack recién montado con celdas a distintos niveles de
  carga puede hacer que el BMS interprete mal el estado real del sistema en
  sus primeros ciclos

CÓMO SE HACE: cargar cada celda individualmente hasta el mismo voltaje
  (4,2V en NMC, 3,65V en LiFePO4, o un punto intermedio seguro como 3,5V/3,3V
  respectivamente) ANTES de soldarlas juntas — así el pack nace ya balanceado
  y el BMS solo tiene que mantener ese equilibrio, no crearlo desde cero
```

---

## Errores comunes en el montaje

```
★★★★★ Soldar con estaño directo al polo de la celda "porque no tengo
  soldadora de puntos" — riesgo real de dañar la celda por calor prolongado,
  además de una unión mecánicamente más frágil que el punto de soldadura
★★★★★ Montar el pack completo sin testear cada celda individual antes —
  una celda defectuosa o muy desigual solo se descubre cuando ya falla en
  el pack montado, con mucho más trabajo (y riesgo) para corregirlo
★★★★☆ Mezclar celdas de fabricantes/lotes distintos en un mismo grupo
  paralelo — descompensa el balanceo con el uso y acelera la degradación
  de las celdas más débiles del grupo
★★★☆☆ No verificar el voltaje acumulado tras cada unión en serie — un
  error de conexión no detectado a tiempo puede acumularse hasta un voltaje
  peligroso antes de conectar el BMS
★★★☆☆ Usar tira de níquel niquelado en vez de níquel puro para ahorrar
  coste — mayor resistencia interna, más calentamiento en la unión,
  soldadura menos fiable a largo plazo
```

---

## Novedades 2025-2026

```
→ Las soldadoras de puntos de gama DIY (Sunkko 709A/AD y equivalentes)
  incorporan cada vez más control por microprocesador con perfiles de
  pulso ajustables, reduciendo la curva de aprendizaje frente a modelos
  puramente analógicos de hace unos años.
→ Los separadores impresos en 3D (PETG, resistente a mayor temperatura que
  el PLA) se popularizan en la comunidad como alternativa económica a los
  separadores comerciales para packs 18650/21700 de formato no estándar.
```

---

→ Herramientas necesarias para este proceso: [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]
→ Conexión del BMS al pack terminado: [[BMS — selección, cableado y protecciones]]
→ Proyectos completos paso a paso: [[Proyectos paso a paso — powerwall 5kWh, pack e-bike, UPS casero, banco de pruebas]]
