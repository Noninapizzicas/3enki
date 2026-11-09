# ESQUEMA MAESTRO — «QR contextual» (todo embebido)

> Sujeto: **un soporte impreso que, al ser consultado, no devuelve una respuesta fija
> sino una decisión.**
> Método: prisma de 5 huecos, recursivo hasta seco, + disección por FORMA.
> Ley: **agnosticismo** — cero tecnologías en el análisis; todo lo del entorno es PUERTO.

---

## La anatomía en una vista

```
                    ┌─────────────────────────────┐
   SOPORTE FÍSICO → │        CONSULTA             │
   (nunca cambia)   │  identificador + contexto   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   LECTURA DEL CONTEXTO      │  D1-D6
                    │  instante · zona · idioma   │
                    │  recurrencia · azar         │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │        LENGUAJE DE DECISIÓN             │  C1-C6
              │   reglas declaradas + prioridad         │
              └────────────────────┬────────────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   LA DECISIÓN     │  → qué se sirve
                         └────┬──────────┬───┘
                              │          │
                   ┌──────────▼──┐   ┌───▼───────────┐
                   │  DESTINO    │   │  RECOMPENSA   │  E1-E6
                   │  B1-B3      │   │  tope · cupón │
                   └──────┬──────┘   └───┬───────────┘
                          │              │
                          └──────┬───────┘
                                 │
                    ┌────────────▼────────────┐
                    │   REGISTRO (append)     │  F1-F4
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        ┌─────▼─────┐     ┌──────▼──────┐    ┌─────▼─────┐
        │  MÉTRICAS │     │   AVISOS    │    │  CONTROL  │
        │  H1-H5    │     │   J1-J4     │    │  I1-I4    │
        └───────────┘     └─────────────┘    └───────────┘
```

Y atravesando todo, tres capas de sostén:

```
SOPORTES (A1-A4)   ·   IDENTIDAD ANÓNIMA (G1-G4)   ·   COBRO (L1-L4)
DEGRADACIÓN (K) — regla transversal: nunca un error delante del cliente
```

---

## El árbol completo

### 1 · IDENTIDAD
Un identificador **físico y estable** que representa un punto de consulta. El soporte
contiene la pregunta, no la respuesta. Resuelve dos trabajos: **caducidad** (lo impreso
dura aunque cambie lo servido) e **intención** (lo servido depende del momento, el lugar,
la repetición y el azar).

**Tensión raíz:** estabilidad física ⟷ variabilidad de la respuesta.

### 2 · RESTRICCIONES (duras, no negociables)

| # | Regla | Si se rompe |
|---|---|---|
| R1 | El soporte no cambia nunca | obliga a reimprimir: el sujeto deja de tener sentido |
| R2 | Toda decisión es reproducible y explicable | no es auditable: no se puede vender |
| R3 | La recompensa no excede el coste autorizado | el negocio pierde dinero |
| R4 | Un derecho se consume una sola vez | fraude |
| R5 | No se identifica a personas | ilegal |
| R6 | Degradación: siempre hay respuesta válida | el cliente final ve un error |
| R7 | El azar no es explotable | se agota el presupuesto de premios |

### 3 · CONTRATO

**Sabe:** identificador · destino base · reglas · contexto · historial de la visita ·
coste acumulado del día.

**Toca:** qué se sirve · cuándo · dónde · a quién · cuánto se premia · cómo se ve.

**Estados del soporte:** borrador → activo → pausado → retirado.
**Estados de la decisión:** base · por_regla · por_azar · limitada.

### 4 · NO-OBJETIVOS
No es acortador · no es app · no es analítica de personas · no es motor probabilístico ·
no es gestor de contenidos · no es fidelización con cuentas.

### 5 · PREGUNTAS ABIERTAS (del dueño — el onboarding)
1. Qué significa «estar en el local»
2. Cuánto vale cada premio
3. Cuántos premios al día
4. Qué franjas horarias
5. Qué idiomas
6. Qué cuenta como «la misma persona»
7. Quién puede pausar
8. Qué pasa si dos reglas empatan
9. Qué es «éxito» de una regla

---

## Los 11 órganos y sus 38 hojas

### A · SOPORTES (4 hojas)
`A1 identificador único` CUSTODIO · `A2 estado` CUSTODIO · `A3 zona` REFLEJO ·
`A4 imagen imprimible` CONVERSOR
> A5 (catálogo por negocio) = **REF** con I (misma colección).

### B · DESTINOS (3)
`B1 destino declarado` CUSTODIO · `B2 resolución` PUENTE · `B3 vigencia` REFLEJO

### C · LENGUAJE DE DECISIÓN (6)
`C1 condición` REFLEJO · `C2 resultado` REFLEJO · `C3 prioridad/desempate` REFLEJO ·
`C4 validación` REFLEJO · `C5 versionado` CUSTODIO · `C6 colección de reglas` CUSTODIO

### D · CONTEXTO (6)
`D1 instante` REFLEJO · `D2 zona` CONVERSOR · `D3 idioma` REFLEJO ·
`D4 recurrencia` REFLEJO (usa G) · `D5 azar con semilla` REFLEJO ·
`D6 ensamblado` REFLEJO

### E · RECOMPENSA (6)
`E1 catálogo` CUSTODIO · `E2 probabilidad` REFLEJO · **`E3 tope y coste` CUSTODIO
(single-writer, dinero)** · `E4 derecho emitido` CUSTODIO · `E5 consumo` CUSTODIO ·
`E6 caducidad` REFLEJO

### F · REGISTRO (4)
`F1 asiento de consulta` CUSTODIO · `F2 decisión ganadora` REFLEJO ·
`F3 resultado` REFLEJO · `F4 asiento de canje` CUSTODIO

### G · IDENTIDAD ANÓNIMA (4)
`G1 huella` CONVERSOR · `G2 ventana` REFLEJO · `G3 contador` CUSTODIO ·
`G4 límite` REFLEJO

### H · MÉTRICAS (5)
`H1 franja` · `H2 zona` · `H3 regla` · `H4 embudo` · `H5 comparación` — todas **REFLEJO**

### I · CONTROL (4, uno ABIERTO)
`I1 superficie` PUENTE · `I2 vista` REFLEJO · **`I3 permiso` [ABIERTO]** ·
`I4 confirmación` REFLEJO

### J · AVISOS (4)
`J1 umbral` REFLEJO · `J2 canal` PUENTE · **`J3 plantilla` MICRO-AGENTE fuzzy** ·
`J4 silencio/agrupación` REFLEJO

### K · DEGRADACIÓN (transversal, ATÓMICO)
Regla: si la decisión no se completa → destino base + asiento de fallo.

### L · COBRO (3 + 1 ABIERTO)
**`L1 plan` [ABIERTO: precios]** · `L2 alta` CUSTODIO · `L3 estado de pago` CUSTODIO ·
`L4 corte por impago` REFLEJO

---

## Recuento final

| Métrica | Valor |
|---|---|
| Rondas del prisma | 2 (la 2ª tocó suelo) |
| Órganos | 11 (+1 transversal) |
| Hojas atómicas | **38** |
| Hojas ABIERTAS | **2** (`I3` permiso, `L1` precios) |
| Hojas REF | **1** (`A5`) |
| REFLEJO | 26 |
| CUSTODIO | 15 |
| CONVERSOR | 3 |
| PUENTE | 3 |
| MICRO-AGENTE fuzzy | 1 |
| Tecnologías nombradas | **0** ✅ |

---

## Las cinco lecturas que da el esquema

1. **El sujeto es 68 % determinista.** La restricción de auditabilidad no es un adorno:
   la forma dominante es REFLEJO. Un motor probabilístico lo rompería.
2. **Solo una hoja es fuzzy** (redactar el aviso). El negocio no se decide con IA.
3. **Tres piezas tocan dinero o derechos** (E3, E4, E5) y exigen single-writer y
   transacción. Son las únicas que pueden hundir el negocio si fallan.
4. **El registro (F) es la fuente de verdad**; las métricas (H) se reconstruyen de él.
   Nada de contadores paralelos que puedan mentir.
5. **El núcleo no depende de nada externo**: los 3 puentes están en el borde (destino,
   canal, superficie). Eso significa que la misma anatomía sirve para cualquier sitio
   donde aterrice.

---

## Lo que queda abierto para el dueño

- Qué significa «estar en el local» (define la zona)
- Precio de cada premio y tope diario (define el riesgo)
- Franjas horarias y idiomas (define la operación)
- Qué cuenta como «la misma persona» (define el antifraude)
- Precio del plan (define el negocio)

**Estos cinco no se inventan: son el onboarding.**
