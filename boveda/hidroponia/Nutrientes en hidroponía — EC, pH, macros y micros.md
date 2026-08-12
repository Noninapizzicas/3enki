---
tipo: componente
sector: hidroponia
tags: [nutrientes, EC, pH, macros, micros, solución-nutritiva, hidroponía, fertilizante]
---
# Nutrientes en hidroponía — EC, pH, macros y micros

## Los 17 elementos esenciales en solución

```
MACRONUTRIENTES PRIMARIOS (g/L en la solución):
  N  — Nitrógeno:   la forma iónica importa:
        NO₃⁻ (nitrato): más estable, no sube el pH, la preferida en hidroponía
        NH₄⁺ (amonio): usado con moderación (<25% del N total) — en exceso es tóxico
        Relación ideal: 80-90% NO₃⁻ / 10-20% NH₄⁺ en solución standard
  P  — Fósforo:     H₂PO₄⁻ (dihidrógenofosfato) — disponible a pH 5.5-7.0
  K  — Potasio:     K⁺ — el catión más demandado · ratio K:N importante para el sabor

MACRONUTRIENTES SECUNDARIOS:
  Ca — Calcio:      Ca²⁺ — crucial para la pared celular · blossom end rot = falta de Ca
  Mg — Magnesio:   Mg²⁺ — centro de la clorofila · deficiencia = hojas amarillas viejas
  S  — Azufre:     SO₄²⁻ — proteínas, sabor (allicina del ajo, glucosinolatos de coles)

MICRONUTRIENTES (µg/L a mg/L):
  Fe  — Hierro:    forma quelada (Fe-EDTA, Fe-DTPA, Fe-EDDHA) — si no, precipita a pH > 6.5
  Mn  — Manganeso: MnSO₄ · antagonista del Fe si está en exceso
  Zn  — Zinc:      cofactor enzimático · deficiencia rara si se usa agua dura
  Cu  — Cobre:     muy pequeñas cantidades (0.05-0.1 ppm) · tóxico si se excede
  B   — Boro:      H₃BO₃ (ácido bórico) · importantísimo para el cuajado del fruto
  Mo  — Molibdeno: MoO₄²⁻ · la planta necesita muy poco (0.05 ppm basta)
  Cl  — Cloro:     Cl⁻ · presente en cualquier agua de red · rara vez deficiente
  Ni  — Níquel:    NiSO₄ · menores de 0.05 ppm bastan
  Si  — Silicio:   no esencial pero beneficioso (pared celular, resistencia plagas)
                   silicato de potasio 1-3ml/L · compatible con la mayoría de recetas
```

---

## EC — Conductividad Eléctrica

```
PRINCIPIO:
  El agua pura no conduce electricidad (EC ≈ 0 mS/cm)
  Los iones disueltos (NO₃⁻, K⁺, Ca²⁺...) conducen la electricidad
  → la EC mide INDIRECTAMENTE la concentración total de nutrientes

UNIDADES: mS/cm (milisiemens/centímetro)
  Algunas sondas usan µS/cm: 1 mS/cm = 1000 µS/cm
  Algunas tiendas usan EC (EC = mS/cm numericamente) o TDS (ppm en escala 500 o 700)

CONVERSIÓN (aproximada):
  1 mS/cm ≈ 500 ppm (en escala de KCl 500)
  1 mS/cm ≈ 700 ppm (en escala de NaCl 700)

EC POR FASE Y CULTIVO:
  Germinación/semillero:           EC 0.8-1.2 mS/cm (solución muy diluida — raíces delicadas)
  Fase vegetativa (lechugas etc.): EC 1.2-2.0 mS/cm
  Fase vegetativa (tomate, pimiento): EC 1.5-2.5 mS/cm
  Floración y fructificación:      EC 2.0-3.5 mS/cm (más nutrientes para fruto)
  Final del cultivo (maduración):  EC 3.0-4.0 mS/cm (estrés controlado → más azúcar y sabor)

GESTIÓN DE LA EC:
  EC SUBE CON EL TIEMPO: las plantas absorben agua preferentemente → los nutrientes se concentran
    → si EC sube: añadir agua pura (no solución) para diluir
  EC BAJA CON EL TIEMPO: las plantas absorben más nutrientes que agua (clima cálido)
    → si EC baja: añadir solución concentrada o mezcla nueva

  MEDICIÓN: diaria en sistemas activos · cada 2-3 días en Kratky
  HERRAMIENTA: EC-metro digital ($10-30) · calibrar con solución estándar (1413 µS/cm o 2764 µS/cm)
```

---

## pH en hidroponía

```
RANGO ÓPTIMO: 5.5 - 6.5 (el 5.8-6.2 es el ideal para la mayoría de cultivos)

POR QUÉ ES TAN CRÍTICO:
  Los iones de nutrientes PRECIPITAN (se vuelven insolubles) fuera del rango:
    pH < 5.5: Fe, Mn, Zn se disuelven en exceso → toxicidad
              Ca y Mg precipitan (deficiencia aunque estén en la solución)
    pH > 6.5: Fe, Mn, Zn, B precipitan → deficiencia (aunque los hayas añadido)
              El Ca y Mg se absorben bien hasta pH 7.5

AJUSTE DEL pH:
  Bajar el pH: ácido fosfórico (H₃PO₄) — también aporta P · el más usado en hidroponía
               ácido nítrico (HNO₃) — también aporta N · para etapas nitrogenadas
               ácido cítrico — menos efectivo, se degrada, solo para emergencias
  Subir el pH: hidróxido potásico (KOH) — el más común · también aporta K
               hidróxido cálcico (Ca(OH)₂) — para déficit de Ca + subir pH

  PRODUCTOS:
    pH Down para hidroponía: ácido fosfórico 75% · usar con guantes y gafas
    pH Up para hidroponía: KOH 30% o hidróxido de K 35%
    
  DOSIS: pocas gotas para 20L de solución → SIEMPRE añadir poco, esperar, medir de nuevo

COMPORTAMIENTO DEL pH CON EL TIEMPO:
  En sistemas nuevos (las primeras semanas): el pH oscila mucho
    → las plantas aún no están equilibradas con los iones de la solución
  Sistema maduro: el pH se estabiliza con más lentitud
  
  pH SUBE HABITUALMENTE: las plantas absorben NH₄⁺ y otros cationes → liberan OH⁻
  pH BAJA HABITUALMENTE: las plantas absorben NO₃⁻ → liberan H⁺

TAMPÓN (buffer):
  A diferencia del suelo, la solución hidropónica tiene poca capacidad tampón
  → pequeños cambios de iones provocan grandes cambios de pH
  → no añadir bicarbonato (NaHCO₃) como buffer — precipita Ca y Mg
  → los quelatos de Fe son el buffer más útil (los ácidos que los forman actúan como tampón)
```

---

## Recetas de solución nutritiva

### Solución universal para lechugas y hojas (2-partes)

```
Para preparar una solución A (macros) y B (Ca) por separado:
  → NUNCA mezclar A y B concentrados (el Ca²⁺ y el SO₄²⁻ o el PO₄³⁻ precipitan juntos)
  → diluirlos siempre por separado en el depósito con agua

CONCENTRADO A (macros sin Ca) — para 1L de concentrado x100:
  Nitrato de potasio KNO₃:            70g  (K + NO₃⁻)
  Fosfato monoamónico NH₄H₂PO₄:     15g  (P + NH₄⁺)
  Sulfato de magnesio MgSO₄·7H₂O:   49g  (Mg + SO₄²⁻)
  Quelato de hierro Fe-EDTA 13%:      8g  (Fe)
  Solución de micros (ver abajo):      1ml

CONCENTRADO B (Ca) — para 1L de concentrado x100:
  Nitrato cálcico Ca(NO₃)₂·4H₂O:   236g  (Ca + NO₃⁻)

USO: 10ml de A + 10ml de B por 1L de agua del grifo (EC final ≈ 1.5-1.8 mS/cm)

SOLUCIÓN DE MICRONUTRIENTES (1L):
  MnSO₄·H₂O:    3.4g
  ZnSO₄·7H₂O:   0.5g
  H₃BO₃ (ácido bórico): 2.9g
  CuSO₄·5H₂O:   0.2g
  MoO₃ o (NH₄)₆Mo₇O₂₄: 0.12g
  → añadir 1ml de esta solución por cada litro del concentrado A
```

### Mezcla 3-partes para tomate y fructificación

```
PARTE A (Ca y N):    Nitrato cálcico Ca(NO₃)₂
PARTE B (macros):    KNO₃ + MgSO₄ + KH₂PO₄ (monopotásico) + FeEDTA + micros
PARTE C (K boost):   Sulfato de potasio K₂SO₄ (añadir en floración para subir el K)

Fase vegetativa:     EC 1.8-2.2 · A:B = 1:1 · sin C
Fase floración:      EC 2.2-2.8 · A:B = 1:1.2 · + 10% C
Fase fructificación: EC 2.5-3.5 · A:B = 1:1.5 · + 15% C
```

### Alternativa one-bottle con fertilizante universal

```
PRODUCTOS PREPARADOS (sin mezclar A+B):
  Formulaciones con Ca quelado que no precipita en la misma botella
  
  MaxiGro (General Hydroponics): polvo 10-5-14
    → 7g/L → EC 2.0 mS/cm · fase vegetativa
  MaxiBloom: polvo 5-15-14
    → 7g/L → EC 2.0 mS/cm · fase floración/fructificación
  
  Nutrex Hidro-Mix: fertilizante hidropónico líquido 1-botella para hojas
  Plagron Hydro A+B: la marca más accesible en tiendas grow-shop españolas

CASERO SIMPLIFICADO (single-part, sin precipitación):
  Nitrato potásico KNO₃: 0.7g/L
  Fosfato monopotásico KH₂PO₄: 0.2g/L
  Nitrato cálcico Ca(NO₃)₂: 0.8g/L (añadir en último lugar o en agua ya diluida)
  Sulfato de magnesio MgSO₄·7H₂O: 0.5g/L
  Quelato Fe-EDTA 13%: 0.04g/L (40mg/L → ≈ 5 ppm Fe)
  Micros (solución arriba): 0.5ml/L
  → mezclar bien · EC resultado ≈ 1.4-1.6 mS/cm
  → ajustar pH a 5.8-6.2 con H₃PO₄
```

---

## Deficiencias — diagnóstico visual

| Deficiencia | Síntoma | Causa frecuente | Corrección |
|---|---|---|---|
| N (nitrógeno) | Amarillo general comenzando por hojas viejas | EC baja, solución agotada | Subir EC, añadir KNO₃ |
| Fe (hierro) | Amarillo entre nervios en HOJAS JÓVENES (nervios verdes) | pH > 6.5 o agua alcalina | Bajar pH a 5.8, Fe-EDDHA si persiste |
| Ca (calcio) | Bordes marrones/quemados en hojas nuevas; blossom-end-rot en tomates | pH bajo, exceso K o Mg | Subir pH a 6.0, más Ca(NO₃)₂ |
| Mg (magnesio) | Amarillo internerval en HOJAS VIEJAS (nervios verdes) | pH alto, exceso Ca o K | 5g/L MgSO₄ foliar urgente, equilibrar receta |
| P (fósforo) | Tonos púrpuras/morados en hojas y tallos | Temperatura raíz < 15°C o pH fuera de rango | Subir temperatura del agua, ajustar pH |
| K (potasio) | Bordes amarillos y marrones en hojas viejas | EC alta pero K bajo en la receta | Añadir K₂SO₄ o KNO₃ |
| Mn (manganeso) | Moteado amarillo en hojas jóvenes | pH > 6.5 o exceso Fe | Bajar pH, revisar ratio Fe:Mn |
| Zn (zinc) | Hojas pequeñas, entrenudos cortos, moteado | Poco frecuente si se usa solución completa | Añadir 0.1g/L ZnSO₄ |
