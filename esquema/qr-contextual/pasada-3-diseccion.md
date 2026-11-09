# Pasada 3 — disección (FORMA de cada hoja)

Cada hoja atómica pasa por las 6 preguntas y recibe UNA forma. El reparto es el que
decide después cómo se construye y quién posee el estado.

## Las cinco formas

```
REFLEJO      determinista, sin estado propio: mismo input → mismo output (un test lo afirma)
CUSTODIO     posee estado: es el único dueño de una colección o de un saldo
CONVERSOR    traduce entre representaciones (no decide, no guarda)
PUENTE       conecta con algo de fuera del sujeto (canal, superficie, servicio)
MICRO-AGENTE fuzzy  interpreta/redacta/decide con matices (no determinista)
```

---

## Reparto por hoja

| Hoja | Qué es | FORMA | Por qué |
|---|---|---|---|
| A1 identificador único | genera y garantiza unicidad | **CUSTODIO** | Es el único dueño del espacio de identificadores |
| A2 estado del soporte | activo/pausado/retirado | **CUSTODIO** | Muta y debe persistir |
| A3 zona asociada | qué punto representa | **REFLEJO** | Dato fijo del soporte, lectura pura |
| A4 imagen imprimible | artefacto físico | **CONVERSOR** | Traduce identificador → imagen |
| B1 destino declarado | alta/baja de lo servible | **CUSTODIO** | Colección propia |
| B2 resolución del destino | referencia → respuesta | **PUENTE** | Alcanza algo externo |
| B3 vigencia | si el destino está vivo | **REFLEJO** | Comparación de fechas |
| C1 gramática de condición | forma de «cuándo» | **REFLEJO** | Validación determinista |
| C2 gramática de resultado | forma de «entonces» | **REFLEJO** | Validación determinista |
| C3 prioridad y desempate | orden de evaluación | **REFLEJO** | Cálculo puro |
| C4 validación de regla | la regla no rompe el servicio | **REFLEJO** | Sí/no |
| C5 versionado y activación | qué versión rige | **CUSTODIO** | Estado versionado |
| C6 colección de reglas | el «programa» del soporte | **CUSTODIO** | Único dueño |
| D1 instante | hora y día | **REFLEJO** | Lectura pura |
| D2 zona | ubicación → zona | **CONVERSOR** | Traduce señal a zona |
| D3 idioma | preferencia declarada | **REFLEJO** | Lectura pura |
| D4 recurrencia | cuántas veces ha venido | **REFLEJO** | Consulta a G |
| D5 azar con semilla | sorteo reproducible | **REFLEJO** | Determinista por semilla |
| D6 ensamblado del contexto | junta D1-D5 | **REFLEJO** | Composición |
| E1 catálogo de premios | qué se puede ganar | **CUSTODIO** | Colección |
| E2 probabilidad | uno de cada N | **REFLEJO** | Cálculo |
| E3 tope y coste acumulado | el dinero del día | **CUSTODIO** | Saldo: single-writer |
| E4 derecho emitido | el cupón | **CUSTODIO** | Transaccional |
| E5 consumo del derecho | canje único | **CUSTODIO** | Transaccional |
| E6 caducidad | vigencia del derecho | **REFLEJO** | Comparación |
| F1 asiento de consulta | registro append | **CUSTODIO** | Append-only |
| F2 decisión ganadora | qué regla | **REFLEJO** | Se deriva de la evaluación |
| F3 resultado servido | qué se entregó | **REFLEJO** | Dato del asiento |
| F4 asiento de canje | qué se consumió | **CUSTODIO** | Append-only |
| G1 huella | seudónimo | **CONVERSOR** | Traduce señal → huella |
| G2 ventana temporal | cuánto dura la memoria | **REFLEJO** | Cálculo |
| G3 contador de visitas | cuántas lleva | **CUSTODIO** | Estado por huella |
| G4 límite por huella | corta el abuso | **REFLEJO** | Sí/no |
| H1 agregado por franja | métrica | **REFLEJO** | Agregación |
| H2 agregado por zona | métrica | **REFLEJO** | Agregación |
| H3 agregado por regla | métrica | **REFLEJO** | Agregación |
| H4 embudo consulta→canje | métrica | **REFLEJO** | Agregación |
| H5 comparación de periodos | métrica | **REFLEJO** | Agregación |
| I1 superficie de cambio | dónde se toca | **PUENTE** | Cara exterior |
| I2 vista de estado | qué ve el dueño | **REFLEJO** | Composición |
| I4 confirmación de efecto | el cambio se aplicó | **REFLEJO** | Verificación |
| J1 umbral declarado | cuándo avisar | **REFLEJO** | Comparación |
| J2 canal | por dónde avisar | **PUENTE** | Exterior |
| J3 plantilla de aviso | cómo se redacta | **MICRO-AGENTE fuzzy** | Redacción con matices |
| J4 silencio y agrupación | no convertirse en ruido | **REFLEJO** | Regla |
| L2 alta del negocio | onboarding | **CUSTODIO** | Estado del negocio |
| L3 estado de pago | vigente/impagado | **CUSTODIO** | Estado |
| L4 corte y aviso por impago | degradación comercial | **REFLEJO** | Regla |

---

## Recuento por FORMA

| FORMA | Hojas |
|---|---|
| **REFLEJO** | 26 |
| **CUSTODIO** | 15 |
| **CONVERSOR** | 3 |
| **PUENTE** | 3 |
| **MICRO-AGENTE fuzzy** | 1 |
| **ABIERTO** | 2 |
| **REPETIDO** | 1 |

**La forma dominante es REFLEJO** — el sujeto es mayoritariamente determinista, que es
exactamente lo que exige su restricción 2 (auditable). El fuzzy queda reducido a
**una sola hoja** (redactar el aviso): no decide nada del negocio.

---

## Lo que la disección revela (lecturas)

1. **El estado está concentrado en 15 custodios**, y los tres que tocan dinero o derechos
   (E3, E4, E5) deben ser single-writer y transaccionales. Ahí no se puede improvisar.
2. **Las métricas (H1-H5) son reflejos puros**: no necesitan poseer nada, leen el registro.
   Eso permite reconstruirlas siempre desde los asientos.
3. **Solo hay 3 puentes**, y los tres apuntan fuera del sujeto (destino, canal, superficie).
   El núcleo no depende de nada externo para decidir.
4. **La hoja más peligrosa es E3** (tope y coste acumulado): si falla, el negocio pierde
   dinero. Es la que exige la verificación más dura.
5. **El azar (D5) es reflejo, no azar real**: la semilla hace el sorteo reproducible y
   auditable. Eso permite demostrar que no se está favoreciendo a nadie.
