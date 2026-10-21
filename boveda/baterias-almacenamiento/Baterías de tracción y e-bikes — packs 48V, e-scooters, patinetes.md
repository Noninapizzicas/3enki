---
tipo: componente
sector: baterias-almacenamiento
tags: [ebike, patinete, e-scooter, traccion, 48v, 36v, reparacion]
---
# Baterías de tracción y e-bikes — packs 48V, e-scooters, patinetes

> El pack de un e-bike vive una vida muy distinta a la de un banco doméstico fijo: vibración constante, cambios de temperatura por estar al sol o en la calle, y cientos de ciclos de carga/descarga profunda al año — el diseño tiene que asumir ese maltrato desde el primer tornillo.

---

## Voltajes estándar en movilidad eléctrica

```
24V (10S, poco común hoy) — bicicletas eléctricas muy económicas antiguas
36V (10S NMC / 11S LiFePO4) — el estándar histórico de e-bike de entrada
48V (13S NMC / 15S LiFePO4) — el estándar actual de e-bike de gama media-alta
  y patinete de potencia media, el más recomendable para proyecto DIY nuevo
52V (14S, variante comercial de 48V con más margen de voltaje real)
60-72V — patinetes/motos eléctricas de mayor potencia, fuera del rango
  típico de proyecto DIY casero de entrada

CAPACIDAD TÍPICA (48V, uso e-bike): 10-20Ah → 480-960 Wh
  Autonomía orientativa: 40-80 km según asistencia, peso, terreno
```

---

## Configuraciones de celda habituales en packs comerciales y DIY

```
13S4P (celdas 18650, ~48V, ~10-14Ah según capacidad de celda) — pack de
  e-bike de gama media estándar
14S6P / 14S8P (21700, mayor capacidad y descarga) — gama alta, mayor
  autonomía y capacidad de aportar potencia pico en subidas

DISEÑO TÍPICO EN "TUBO" O "MALETA": las celdas se disponen en filas
  paralelas dentro de una carcasa alargada (imitando el tubo del cuadro
  de la bici o formato "power bank" para portaequipajes) — condiciona la
  elección de formato de celda y la técnica de soldadura al espacio
  disponible
```

---

## Elegir celdas para tracción — descarga sostenida, no solo capacidad

```
LA DIFERENCIA CLAVE FRENTE A UN BANCO DOMÉSTICO: un pack de tracción debe
  entregar corriente ALTA de forma sostenida durante minutos (subida
  prolongada), no solo picos breves — priorizar celdas con buena
  clasificación de descarga continua (Samsung 30Q, Molicel P42A) sobre
  celdas de solo alta capacidad y baja descarga

REGLA PRÁCTICA: verificar que la corriente de descarga continua del grupo
  paralelo completo (celda × número de celdas en P) supera con margen la
  corriente máxima que el motor puede demandar del controlador
```

---

## Reparación de packs comerciales — cuándo tiene sentido

```
SÍNTOMA HABITUAL: pack de e-bike/patinete comercial que pierde autonomía
  drásticamente o se apaga bajo carga — con frecuencia es un grupo de
  celdas concreto degradado o desequilibrado, no el pack completo

PROCESO: abrir el pack (con cuidado, muchos packs comerciales sellan con
  adhesivo/soldadura por ultrasonidos), testear voltaje y capacidad grupo
  por grupo, identificar el grupo débil y sustituirlo por celdas del
  mismo modelo/capacidad testeadas

CUÁNDO TIENE SENTIDO: pack con menos de 2-3 años, con BMS y carcasa en
  buen estado, donde solo un subconjunto de celdas está degradado —
  ahorra el coste de un pack completo nuevo

CUÁNDO NO: pack muy antiguo, con BMS ya dañado o carcasa deteriorada, o
  cuando el coste de horas de trabajo supera claramente el de un pack
  nuevo de reemplazo comercial
```

---

## Precios orientativos 2026

```
PACK COMERCIAL 48V 20Ah CON BMS (nuevo, importado o distribuidor local):
  180-350€ según marca, calidad de celda declarada y BMS incluido
PACK DIY EQUIVALENTE (celdas Samsung/Molicel + BMS JK/Daly + montaje propio):
  150-280€ en material, más el tiempo de montaje — la ventaja económica
  del DIY en e-bike es menor que en almacenamiento doméstico, donde el
  ahorro por kWh es mucho mayor
CARGADOR ESPECÍFICO 48V/54,6V (LiFePO4: 51,2V/58,4V): 25-45€
```

---

## Errores comunes en packs de tracción

```
★★★★★ Elegir celdas de alta capacidad pero baja descarga continua para
  un pack de tracción — el pack se calienta y su voltaje cae bruscamente
  bajo demanda alta (subida, arranque), reduciendo potencia disponible
  justo cuando más se necesita
★★★★☆ No proteger el pack de vibración mecánica en el montaje — las
  soldaduras por punto pueden fatigarse con el tiempo si el pack no está
  bien fijado dentro de la carcasa, generando conexiones intermitentes
★★★★☆ Cargar el pack inmediatamente después de un trayecto exigente, con
  las celdas todavía calientes — acelera la degradación; dejar enfriar
  antes de conectar el cargador
★★★☆☆ Ignorar la resistencia a la intemperie del BMS y la carcasa en
  patinetes/bicicletas de uso habitual en calle — humedad y polvo son
  causa común de fallo prematuro de conexiones y BMS
```

---

## Novedades 2025-2026

```
→ Molicel P42A y celdas 21700 de alta descarga continúan ganando terreno
  en packs de e-bike de gama alta frente al 18650 clásico, por su mejor
  relación capacidad/descarga sostenida en el mismo volumen.
→ Los BMS de packs comerciales de e-bike incorporan cada vez más
  comunicación Bluetooth con app propia para diagnóstico del estado de
  salud del pack sin necesidad de abrirlo, tendencia que facilita también
  el diagnóstico previo a una reparación DIY.
```

---

→ Técnica de montaje aplicable a estos packs: [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo]]
→ Selección de BMS para tracción: [[BMS — selección, cableado y protecciones]]
→ Proyecto completo de pack e-bike paso a paso: [[Proyectos paso a paso — powerwall 5kWh, pack e-bike, UPS casero, banco de pruebas]]
