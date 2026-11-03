# Q41 · El coste del rider — resuelto

> Respuesta a la pregunta que bloqueaba la F3: sin estos dos números,
> `MedidaCobra` devolvía `NO_CONSTA` y el mercado no proponía nada.

---

## Los dos números

```
coste por km     0,140 €/km     moto de reparto, España 2026
coste por min    0,257 €/min    lo que DEJA DE GANAR mientras espera
```

### De dónde sale el €/km

```
0,047 €/km   combustible       3 L/100 km × 1,55 €/L
0,030 €/km   revisiones        360 €/año ÷ 12.000 km
0,010 €/km   neumáticos        150 € cada 15.000 km
0,021 €/km   seguro            250 €/año ÷ 12.000 km
0,007 €/km   ITV + impuesto
0,025 €/km   depreciación      1.500 € ÷ 60.000 km
──────────────────────────────
0,140 €/km
```

### De dónde sale el €/min

**No es un salario.** Es el coste de oportunidad: lo que el rider deja de
ganar mientras está parado en vez de repartiendo.

```
3,50 € por reparto de 12 minutos  →  0,292 €/min brutos
menos la moto en esos 12 min (3 km × 0,140 = 0,42 €)
                                  →  0,257 €/min netos
```

---

## El umbral que ya estaba escrito en la F2

```
margen = cobra − (km_desvío × 0,140 + min_espera × 0,257)

margen > 0  →  se le propone
margen ≤ 0  →  no se le propone
```

### Tres casos, con los números reales

```
enlace bueno   300 m, 3 min    cobra 3,50 €   cuesta 0,81 €   margen +2,69 €   ✅
enlace justo   700 m, 5 min    cobra 2,50 €   cuesta 1,38 €   margen +1,12 €   ✅
enlace malo    1,2 km, 8 min   cobra 2,00 €   cuesta 2,22 €   margen −0,22 €   ❌
```

**El tercero es el que importa.** Con el umbral en «cobra > 0» (bruto), ese
pedido se habría propuesto — y el rider habría perdido 22 céntimos por
aceptarlo. **Con el umbral en neto, no se le propone.** Esa es toda la
diferencia entre que el enlazado sea su palanca o su trampa.

---

## Los dos números son configuración del proyecto, no constantes

```
0,140 €/km   moto
0,250 €/km   coche
0,020 €/km   bici

el €/min no se configura: se DERIVA
  €/min = (precio medio del reparto en la zona − km medios × €/km) ÷ minutos medios
```

**Por qué el minuto se deriva y no se fija:** porque depende de lo que se pague
en ese barrio. En un barrio con repartos de 4,50 € el minuto vale más que en
uno de 2,50 €. Si lo fijas, el umbral miente en uno de los dos.

---

## Lo que esto deja abierto (y es del dueño)

```
1 · ¿el rider declara su vehículo y su coste al darse de alta?
    (si no lo declara, el sistema usa el default de moto)

2 · ¿los 0,140 €/km se actualizan solos con el precio del combustible?
    (o se revisan a mano cada temporada)

3 · ¿el rider ve este cálculo cuando recibe la propuesta?
    ("te lo ofrezco porque ganas 2,69 € netos" — la Directiva UE 2024/2831
     exige que la decisión sea explicable, y esto ES la explicación)
```

La **3** es la más importante, y no es un detalle de interfaz: **es la prueba
de que el rider no acepta a ciegas.** Si el rider ve el margen antes de decir
que sí, el enlazado deja de ser una imposición disfrazada y pasa a ser una
oferta de verdad.
