---
tipo: componente
sector: quimica-practica
tags: [electroquimica, electrolisis, galvanotecnia, pilas, anodizado, cobre]
---
# Electroquímica — electrólisis, galvanotecnia, pilas

## La ecuación central

La electroquímica es química impulsada por diferencia de potencial eléctrico (o que genera
ese potencial). La mitad más importante del universo:

```
Reducción (cátodo −): X^n+ + ne⁻ → X⁰   (los iones ganan electrones → depósito metálico)
Oxidación (ánodo +):  X⁰ → X^n+ + ne⁻   (el metal se disuelve o el agua se oxida)

Ley de Faraday:
  m = (M × I × t) / (n × F)

  m = masa depositada [g]
  M = masa molar del metal [g/mol]
  I = corriente [A]
  t = tiempo [s]
  n = electrones por ion (Cu²⁺ → n=2, Ag⁺ → n=1, Au³⁺ → n=3)
  F = 96485 C/mol (constante de Faraday)

Ejemplo: depositar 1g de cobre (M=63.55, n=2):
  t = (m × n × F) / (M × I) = (1 × 2 × 96485) / (63.55 × 0.5A) = 6046s ≈ 100 min a 500mA
```

---

## Electrólisis del agua — el experimento más limpio

```
REACCIÓN:
  Cátodo (−): 2H₂O + 2e⁻ → H₂↑ + 2OH⁻   (hidrógeno)
  Ánodo (+):  2H₂O → O₂↑ + 4H⁺ + 4e⁻    (oxígeno)
  Global:     2H₂O → 2H₂ + O₂

  Relación de volumen: H₂:O₂ = 2:1 siempre (verificable visualmente)

MONTAJE:
  Fuente: 6-12V DC (cargador USB 5V funciona pero lento)
  Electrodos: acero inoxidable 316L o grafito (el aluminio se disuelve — NO usar)
  Electrolito: NaOH 1M (1g/100ml agua destilada) o Na₂SO₄ 0.5M (más limpio)
    NUNCA NaCl → produce Cl₂ (gas tóxico amarillo-verde)
  Recolección: tubos de ensayo invertidos llenos de agua sobre cada electrodo

TENSIÓN MÍNIMA TEÓRICA: 1.23V (pero hay sobrepotencial → en práctica ≥ 1.8V)
EFICIENCIA: 70-80% con buen electrolito, electrodo bien preparado

VARIANTE INTERESANTE — electrolizador PEM (Proton Exchange Membrane):
  Membrana Nafion entre dos electrodos → produce H₂ puro sin humedad
  Temperatura de operación: 60-80°C → mayor eficiencia
  El mismo principio de los electrolizadores industriales de MW
```

---

## Galvanotecnia — recubrir metales con otros metales

### Cobrizado (electrodeposición de cobre)

```
ELECTROLITO: sulfato de cobre CuSO₄·5H₂O 200g/L + H₂SO₄ 50ml/L en agua destilada
  → sulfato de cobre en ferretería o tienda de acuario
  → H₂SO₄: ácido de batería diluido (comprar al 33%, usar así o diluir a 10%)

ÁNODO:  lámina de cobre puro (90% del ánodo se disuelve → reponer)
CÁTODO: pieza a cobrar (acero, latón, zamak, incluso plástico metalizado)

PARÁMETROS:
  Densidad de corriente: 1-3 A/dm² (A por dm² de superficie del cátodo)
  Tensión típica: 2-4V
  Temperatura: 20-30°C (agitar suavemente → depósito más uniforme)
  Tiempo para 10µm de cobre: ≈ 30 min a 2 A/dm²

PREPARACIÓN DE LA PIEZA (crítica para la adherencia):
  1. Desengrase: acetona o NaOH 5% a 60°C, 5 min
  2. Decapado: HCl 10% o H₂SO₄ 10%, 30s → activa la superficie
  3. Enjuague triple en agua destilada entre cada paso
  4. NO tocar la superficie limpia con los dedos (la grasa arruina el recubrimiento)

PROBLEMAS COMUNES:
  Depósito quemado/rugoso → densidad de corriente demasiado alta → bajar A o subir agitación
  Depósito poroso → concentración de Cu²⁺ baja → añadir CuSO₄
  Depósito no adherente → preparación deficiente → volver al paso 1
```

### Niquelado — para resistencia a la corrosión

```
ELECTROLITO (baño de Watts):
  NiSO₄·6H₂O  300 g/L
  NiCl₂·6H₂O   45 g/L
  H₃BO₃ (ácido bórico — farmacia)  45 g/L
  pH: 3.5-4.5 (ajustar con HCl o NaOH)

ÁNODO: níquel puro (difícil de encontrar en pequeño — usar S-rounds de níquel)
DENSIDAD: 3-5 A/dm², temperatura 45-55°C
PRECAUCIÓN: el polvo de níquel y sus sales son carcinógenos — usar guantes y evitar inhalación

ALTERNATIVA MÁS SENCILLA — niquelado por inmersión (electroless):
  No requiere corriente eléctrica
  Solución: NiSO₄ + hipofosfito sódico + tampón pH
  Catalizador: paladio (muy caro) o activador de niquelado comercial
  Depósito: 5-10µm de Ni-P con dureza 500-600 HV (vs 150 HV del Ni electrolítico)
```

### Anodizado de aluminio — protección y color

```
PRINCIPIO: oxidar el aluminio INTENCIONADAMENTE para crear Al₂O₃ poroso + teñir + sellar

PROCESO:
  1. Desengrase: NaOH 10% a 50°C, 2-3 min → enjuague → HNO₃ 30% (neutralizar), 30s
  2. ANODIZADO: H₂SO₄ 15-20% (ácido de batería diluido 1:3 con agua destilada)
     - Cátodo: plomo o aluminio puro
     - Ánodo: pieza de aluminio (6061, 7075 → buen anodizado; fundición de aluminio → mal resultado)
     - Densidad: 1.2-1.5 A/dm²
     - Temperatura: 18-22°C (CRÍTICO — calentar >25°C = capa delgada y blanda)
     - Tiempo: 45-60 min para capa de 10-15µm
  3. TEÑIDO: inmersión en colorante aniónico (colorantes textiles Dylon o Rit Dye)
     - Temperatura: 55-60°C, 15-20 min
     - Colores posibles: negro, rojo, azul, dorado, verde — los poros absorben el colorante
  4. SELLADO: agua desionizada a 96-100°C, 20 min
     - La capa porosa de Al₂O₃ se convierte en boehmita (AlOOH) → poros sellados
     - Alternativa: sellado con acetato de níquel (Ni(CH₃COO)₂ · 4H₂O 5g/L, 80°C)

RESULTADO: protección a la corrosión (Cl⁻, NaOH) superior al aluminio desnudo
  Espesor de capa: 10-25µm (clase 2 según ISO 7599)
  Dureza: 300-400 HV (aluminio base: 60-150 HV)
```

---

## Pilas — de Volta al litio

### Pila de Volta (Zn-Cu) — la primera pila

```
REACCIÓN:
  Ánodo (−): Zn → Zn²⁺ + 2e⁻    (ΔE° = +0.76V vs SHE)
  Cátodo (+): Cu²⁺ + 2e⁻ → Cu    (ΔE° = +0.34V vs SHE)
  FEM teórica: 0.34 − (−0.76) = 1.10V

CONSTRUCCIÓN:
  Electrolito: H₂SO₄ diluido (10%) o ZnSO₄ saturado (no corrosivo)
  Ánodo: tira de zinc (de pila usada o de ferretería)
  Cátodo: tira de cobre
  
PILA EN SERIE (batería de Volta):
  Apilamiento de celdas Zn-Cu-electrolito
  10 celdas → 11V (suficiente para LED, pequeño motor)
  La FEM cae al sacar corriente (resistencia interna alta en las pilas salinas)

SERIE ELECTROQUÍMICA — FEM de celda:
  E°_celda = E°_cátodo − E°_ánodo

  Metal    E° (V vs SHE)    Metal    E° (V vs SHE)
  Li       −3.04            Sn       −0.14
  Mg       −2.37            Pb       −0.13
  Al       −1.66            H₂        0.00
  Zn       −0.76            Cu       +0.34
  Fe       −0.44            Ag       +0.80
  Ni       −0.25            Au       +1.50
```

### Pila de limón / patata — experimento clásico

```
NO es magia: el limón/patata es el electrolito (ácido cítrico/fosfórico)
El par galvánico Zn (moneda/clavo galvanizado) − Cu (moneda o alambre)
FEM ≈ 0.9V (menos que la teórica por la resistencia interna alta del fruto)

Para encender un LED rojo (1.8V): 2 limones en serie
Para un LED blanco (3.2V): 4 limones en serie

VARIANTE MAKER: pila de sal (NaCl) con electrodos de Mg y cobre
  Mg tiene E° = −2.37V → par Mg-Cu ≈ 2.7V (enciende un LED solo)
  El Mg se consume (sacrificial) — el principio de la protección catódica de barcos/tuberías
```

### Pila de grafito-sal — la DIY más duradera

```
MATERIALES: sal de cocina, agua, grafito (minas de lápiz 6B o varillas de carbono de pila AA)
  Ánodo: zinc (hoja de lata galvanizada o pila AA abierta — la carcasa ES zinc)
  Cátodo: grafito
  Electrolito: ZnCl₂ saturado + NH₄Cl (la pasta negra de las pilas AA antiguas)

FEM: 1.5V (igual que una pila AA comercial)
Capacidad DIY: baja — el zinc se corroe rápido sin aditivos inhibidores

INTERÉS REAL: entender por qué las pilas comerciales usan ZnCl₂ + MnO₂ como depolarizante
  Sin MnO₂: el H₂ generado en el cátodo "polariza" la pila (cae la tensión)
  Con MnO₂: H₂ + MnO₂ → MnOOH + H₂O (el oxidante consume el H₂ → pila estable)
```

---

## Corrosión — electroquímica involuntaria

```
CORROSIÓN GALVÁNICA: cuando dos metales diferentes se tocan en presencia de electrolito
  El metal más activo (ánodo, E° más negativo) se corroe
  El metal más noble (cátodo) queda protegido

Ejemplos cotidianos:
  Tornillo de acero en aluminio + agua → el aluminio se corroe
  Cañería de cobre unida a galvanizado con Zn → el zinc se corroe (protegiendo el cobre)
  Casco de barco de acero + hélice de bronce → el acero se corroe sin ánodo de sacrificio

PROTECCIÓN CATÓDICA:
  Ánodo de sacrificio: bloque de zinc o magnesio fijado al casco → se corroe en lugar del acero
  Corriente impresa (ICCP): corriente DC externa fuerza al casco a ser cátodo → sin corrosión
  Recubrimientos: pintura, galvanizado, anodizado → aislan el metal del electrolito

EXPERIMENTO: corrosión diferencial del clavo
  Clavo en gelatina + indicador de fenolftaleína + ferrocianuro potásico
  Zonas de tensión mecánica (punta, cabeza): se oxida antes → azul (Fe²⁺ + ferrocianuro)
  Zona central: zona catódica → rosa (OH⁻ + fenolftaleína)
  Visible en 30 min — el mapa de potencial del clavo en color
```
