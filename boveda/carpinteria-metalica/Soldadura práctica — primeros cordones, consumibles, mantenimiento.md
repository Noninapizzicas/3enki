---
tipo: tecnica
sector: carpinteria-metalica
tags: [soldadura, mig, electrodo, tig, principiantes, mantenimiento]
---
# Soldadura práctica — primeros cordones, consumibles, mantenimiento

> Nadie suelda bien a la primera. El objetivo del primer mes no es hacer cordones bonitos: es entender por qué salen feos, porque ese diagnóstico es la mitad de la habilidad. Para la elección de proceso a nivel avanzado (MIG vs TIG vs electrodo, parámetros completos), la referencia técnica está en [[../metalurgia-diy/Soldadura — procesos y elección|Soldadura — procesos y elección (Metalurgia DIY)]]. Esta nota es el aterrizaje práctico del día 1.

---

## El primer cordón — MIG sin gas (flux core), el punto de entrada más habitual

```
DIFICULTAD: ★★☆☆☆

1. PREPARA LA PIEZA
   Limpia óxido, pintura y grasa con radial + disco flap o cepillo de alambre — 5-10cm a cada lado
   de la unión. El óxido y la grasa son la causa nº1 de porosidad (burbujas en el cordón)

2. AJUSTA LA MÁQUINA
   Para pletina de 3mm con máquina 140A: voltaje medio-bajo, velocidad de hilo media
   REGLA PRÁCTICA: si el hilo "traquetea" y salpica mucho → velocidad de hilo demasiado alta para
   el voltaje. Si el hilo se pega al metal → voltaje demasiado bajo

3. POSTURA Y ÁNGULO
   Pistola inclinada 10-15° en dirección de avance ("empujando", no "arrastrando" para flux core)
   Distancia de la boquilla a la pieza: 10-15mm (stick-out)
   Velocidad de avance constante — ni tan rápido que no funda, ni tan lento que se acumule material

4. PRUEBA EN RETAZO ANTES DE LA PIEZA REAL
   Siempre. 10 minutos de retazo ahorran una pieza estropeada
```

## Lectura del cordón — diagnóstico visual

```
CORDÓN BUENO: uniforme, escamas regulares, penetración visible en el reverso sin agujero
CORDÓN CON POROS (burbujas): superficie sin limpiar, gas insuficiente (MIG con gas), electrodo húmedo
CORDÓN QUE SALPICA MUCHO: voltaje/velocidad de hilo descompensados, distancia excesiva a la pieza
CORDÓN QUE NO PENETRA (se queda "pegado" encima): amperaje/voltaje insuficiente, avance demasiado rápido
CORDÓN QUEMADO/AGUJEREADO: amperaje excesivo para el espesor, avance demasiado lento
DEFORMACIÓN DE LA PIEZA (se comba): exceso de calor acumulado — soldar por tramos cortos y dejar enfriar
```

## Electrodo (MMA/SMAW) — la alternativa robusta

```
DIFICULTAD: ★★★☆☆ (más difícil de iniciar el arco limpio que MIG, pero más tolerante al aire libre)

Electrodo básico para acero al carbono: rutilo (fácil de encender, buen acabado) — E6013
Electrodo de mayor penetración: básico (E7018) — mejor para estructura, exige electrodo seco

VENTAJA REAL: funciona con viento, a la intemperie, sin botella de gas — el proceso de campo
DESVENTAJA REAL: más salpicadura, más escoria que picar después, curva de aprendizaje del "encendido"
  del arco (como encender una cerilla, con roce controlado)
```

## TIG — cuando el acabado importa

```
DIFICULTAD: ★★★★★

Reservado para: inox visible, aluminio, piezas de bicicleta, arte, trabajo donde el cordón se ve
No es el punto de entrada recomendado — requiere control simultáneo de pedal/amperaje, varilla de
aporte y antorcha con la otra mano. Practicar primero MIG o electrodo y llegar a TIG en el nivel 2
```

---

## Consumibles — qué gastar y cuánto dura

```
HILO MIG (bobina 0,8-1mm, acero): 15kg ≈ 35-50€ (2026) — rinde para muchos proyectos pequeños
GAS DE PROTECCIÓN (botella 20L Ar/CO2 mezcla): alquiler + carga ≈ 40-70€ la carga completa,
  o botella desechable pequeña (2-5kg) para uso ocasional ≈ 25-40€
ELECTRODOS (caja 5kg E6013 Ø2,5mm): 15-25€ — cunde muchísimo, ideal para proyectos esporádicos
BOQUILLAS Y TOBERAS DE DESGASTE (MIG): se gastan con el uso — repuesto 1-3€/ud, cambiar cuando
  el arco empieza a "bailar" o el hilo se atasca con frecuencia
DISCOS DE CORTE Y DESBASTE: contar 1 disco de corte fino por cada 1-2m de corte en pletina de 5mm
```

---

## Mantenimiento del equipo

```
DESPUÉS DE CADA SESIÓN:
  → Soplar el interior de la máquina con aire comprimido (el polvo metálico conductor es la principal
    causa de avería de la electrónica interna de una inverter)
  → Revisar el estado de la boquilla y el tubo de contacto (MIG) — cambiar si hay desgaste irregular
  → Guardar el hilo/electrodos en lugar seco — el hilo oxidado da mala calidad de arco y el electrodo
    húmedo (E7018 sobre todo) provoca porosidad

CADA VARIOS MESES:
  → Revisar el cable de masa y las conexiones — una masa floja es la causa nº1 de "la máquina no suelda
    bien" cuando en realidad la máquina está perfecta
  → Comprobar el manorreductor de gas (si aplica) — fugas y presión inestable arruinan el cordón
```

---

## Errores comunes del principiante

```
1. NO LIMPIAR LA PIEZA — la causa más frecuente de mal cordón, y la más fácil de evitar
2. MASA MAL COLOCADA — lejos de la zona de soldadura, sobre pintura u óxido → arco inestable
3. NO PROBAR PARÁMETROS EN RETAZO — ir directo a la pieza final y arruinarla
4. IGNORAR LA DEFORMACIÓN TÉRMICA — piezas finas se comban si se sueldan de un tirón sin puntos de
   sujeción previos ni enfriado entre tramos
5. CARETA FIJA EN LUGAR DE AUTOOSCURECIMIENTO — mala postura, cordones torcidos por mirar de reojo
6. SOLDAR SIN VENTILACIÓN, ESPECIALMENTE GALVANIZADO — riesgo real de intoxicación por humos de zinc
7. GUARDAR EL EQUIPO SUCIO — acorta la vida de la máquina más que el propio uso
```

---

## Novedades 2025-2026

```
→ Soldadoras inverter multiproceso (4 en 1) por debajo de 250-300€ democratizan probar varios
  procesos con una sola máquina antes de especializar la compra
→ Hilos MIG con mejor resistencia a la porosidad en superficies con óxido ligero llegan a marcas
  de gama media, reduciendo (no eliminando) la exigencia de limpieza perfecta de la pieza
```

---

## Ver también

→ Elección técnica de proceso y parámetros avanzados: [[../metalurgia-diy/Soldadura — procesos y elección|Soldadura — procesos y elección (Metalurgia DIY)]]
→ Seguridad y EPI completos: [[Normativa y seguridad — EPI, ventilación, CTE-SE-A]]
→ Herramientas y precios de soldadoras: [[Herramientas — kits por nivel, marcas, precios España]]
