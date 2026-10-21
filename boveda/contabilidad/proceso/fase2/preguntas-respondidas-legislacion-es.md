# Respuestas al guion de preguntas abiertas — con la legislación española

> **Quién responde:** Tot (la mente), con autorización explícita del dueño
> (2026-09-28): *"Dime, respóndelas tú según la legislación española y continuemos"*.
> El dueño es operador de negocio, **no contable**: las preguntas legales no son suyas.
>
> **LEY DE CERO SUPUESTOS sigue vigente para los hechos del negocio** — pero para la
> **normativa** el asistente responde con el marco español y marca `[VERIFICAR]` lo que
> cambia por norma, en vez de inventarlo.

---

## ⚖️ EL HALLAZGO QUE GOBIERNA TODAS LAS RESPUESTAS

**Ningún valor legal se cablea en el código.** Tipos, plazos, coeficientes, calendario y
formatos son **DATOS DECLARABLES** (por negocio · por ejercicio · actualizables).

Razón: la ley cambia (tipos de IVA, prórrogas de Verifactu, obligatoriedad B2B), y hay
**cuatro regímenes de territorio** distintos en España. Un sistema que cablea la ley se
queda obsoleto en el primer cambio; uno que la **declara** sigue sirviendo.

```jsonc
// modelo conceptual — cada valor legal es un dato declarable, no una constante
"parametros_fiscales": {
  "territorio": "comun | foral_bizkaia | foral_gipuzkoa | foral_alava | navarra | canarias | ceuta_melilla",
  "regimen_iva": "general | simplificado | recargo_equivalencia | criterio_caja | sii",
  "tipo_impositivo_sociedad": "irpf | is",
  "tipos_iva": [ { "tipo": 21, "vigente_desde": "..." }, { "tipo": 10 }, { "tipo": 4 } ],
  "retencion_profesionales": 15,      // 7 en año de inicio + 2 siguientes
  "plazo_pago_legal_dias": 60,        // Ley 3/2004 morosidad (30 en sector público)
  "calendario_fiscal": [ /* modelos y plazos declarables por ejercicio */ ]
}
```

**Consecuencia de diseño:** los grupos `D` (capa-fiscal) e `I` (grupo) llevan **puerto de
parámetros fiscales declarables**. La ley entra como DATO, no como lógica.

---

## TANDA 4 · FISCAL — el grueso (normativa española)

### Territorio fiscal (4 regímenes, no uno)
| Territorio | Impuesto indirecto | Autoridad |
|---|---|---|
| **Régimen común** (la mayor parte de España) | **IVA** | AEAT (estatal) |
| **País Vasco** — Bizkaia / Gipuzkoa / Álava | IVA (concierto) | **Diputación foral** |
| **Navarra** | IVA (convenio) | **Hacienda Foral de Navarra** |
| **Canarias** | **IGIC** (no IVA) — tipo general 7 % | AEAT (delegación Canarias) |
| **Ceuta y Melilla** | **IPSI** (no IVA) | AEAT |

→ El sistema **no asume IVA**: asume un **impuesto indirecto declarable** con su territorio.

### IVA — tipos (régimen común)
- **General 21 %** · **Reducido 10 %** · **Superreducido 4 %**
- Un producto/servicio **puede tener varios tipos** en su vida → el tipo es dato por línea de factura.
- `[VERIFICAR]` tipos vigentes y sus cambios (hay tipos temporales y modificaciones frecuentes).

### IVA — régimen de declaración
- **General** — modelo **303** trimestral.
- **Simplificado** — 303 (régimen especial simplificado).
- **Recargo de equivalencia** — 303 + el proveedor recarga; el minorista no deduce.
- **Criterio de caja** — 303 especial (IVA se devenga al cobrar/pagar).
- **SII (Suministro Inmediato de Información)** — para grandes (facturación > 6 M€) → libros en 4 días.

### IRPF o IS según forma jurídica
- **Autónomo / persona física** → **IRPF** + pagos fraccionados **130** (estimación directa) o **131** (módulos).
- **Sociedad** → **Impuesto sobre Sociedades** → **200** anual + pagos fraccionados **202**.
- **Un negocio puede ser los dos a la vez** en formas mixtas → parámetro por sociedad.

### Modelos y calendario (régimen común)
| Modelo | Qué | Cadencia | Plazo orientativo |
|---|---|---|---|
| **303** | IVA (autoliquidación) | trimestral | días 1–20 de abr / jul / oct / ene |
| **390** | Resumen anual IVA | anual | enero |
| **130 / 131** | Pago fraccionado IRPF | trimestral | 1–20 (abr/jul/oct/ene) |
| **111 / 115** | Retenciones trabajo / alquileres | trimestral | 1–20 |
| **190 / 180** | Resumen anual de retenciones | anual | enero |
| **347** | Operaciones con terceros > 3.005,06 € | anual | febrero |
| **349** | Operaciones intracomunitarias | (recapitulativa) | mensual / trimestral |
| **200 / 202** | Impuesto Sociedades / pagos fraccionados | anual / 3 al año | julio / abr-oct-dic |
| **100** | Renta (IRPF) | anual | abr–jun |
| **Cuentas anuales** | Depósito Registro Mercantil | anual | mes siguiente a la aprobación |

→ **`[VERIFICAR]` siempre los plazos exactos del ejercicio**: cambian (domiciliación, prórrogas, festivos). El **calendario es declarable por ejercicio**, no fijo.

### Retenciones
- **Profesionales / actividad profesional**: **15 %** *(7 % el año de inicio y los 2 siguientes)*.
- **Trabajo (nóminas)**: según tablas (mínimo personal y familiar) — a declarar por el asesor.
- **Alquileres**: 19 %.
- **`[VERIFICAR]` porcentajes y casos por ejercicio.**

### Verifactu
- **Norma**: RD 1007/2023 (Reglamento de requisitos de los sistemas de facturación).
- Exige: registro **inalterable** de facturas, **huella/hash**, encadenamiento, **QR**, envío de registros a la AEAT.
- **`[VERIFICAR]` FECHAS DE OBLIGATORIEDAD** — es un calendario **prorrogado** (fabricantes y usuarios tienen plazos distintos y han sufrido aplazamientos). **No se fijan de memoria.**

### Factura electrónica
- **Formato**: **Facturae** (XML) — el estándar español; **FACe** para el sector público.
- **B2B obligatoria**: prevista por la **Ley 18/2022 (Crea y Crece)** — **`[VERIFICAR]` el reglamento y la fecha de entrada en vigor** (ha ido con retraso).
- El sistema debe: **recibir** Facturae, **emitir** Facturae, y **guardar el registro** de ambos.

### Series y numeración
- **Numeración correlativa** dentro de cada **serie**, sin saltos (requisito de Verifactu).
- Práctica: **serie separada por ejercicio y por tipo** (venta / rectificativa).
- **No reiniciar** la numeración dentro de una serie sin abrir serie nueva.

### Ticket vs factura
- **Factura simplificada** (ticket) — hasta **400 €** (3.000 € en ciertos sectores) `[VERIFICAR]`.
- **Factura completa** — obligatoria cuando el cliente la pide, cuando supera el límite, o en operaciones B2B con IVA deducible (necesita NIF y datos completos).
- **El sistema emite las dos**; el tipo es dato del hecho.

### Plazo legal de pago (Ley 3/2004 de morosidad)
- **Máximo 60 días** entre empresas (salvo pacto dentro del límite legal).
- **Sector público: 30 días**.
- → alimenta los avisos de vencimiento (`vencimiento-pago`).

---

## TANDA 6 · DATOS OPERATIVOS

### Métodos de amortización (inmovilizado, grupo F)
- **Lineal** — el estándar; con **tabla simplificada de amortización** (coeficiente máximo y período máximo por elemento) `[VERIFICAR coeficientes]`.
- **Degresiva / acelerada** y **fiscal** — según caso `[VERIFICAR]`.
- → **Parámetros declarables** (método + coeficiente + años por tipo de activo).

### Valoración de existencias (grupo H)
- **Permitidos por el PGC (RD 1514/2007)**: **FIFO**, **coste medio ponderado (PMP)**, y **PMP por grupos homogéneos**.
- **LIFO NO está permitido** en contabilidad española.
- → **Declarable por negocio**, con FIFO y PMP por defecto.

### Multi-moneda (grupo E/I)
- **Sí** — proveedores y clientes extranjeros, banco en divisa.
- Necesita: **tipo de cambio a fecha de operación**, **diferencia de cambio** al cierre (`diferencia-cambio`, ya detectada como pieza `[ABIERTO]` → **se activa**).

### Correcciones / ajustes
- **SUMAN, nunca borran.** El asiento original queda; el ajuste se añade encima (`asiento-ajuste`, B5).
- **Traza intacta** = requisito de auditoría y de Verifactu (inalterabilidad).

### Cobros y pagos: ¿ejecuta o sólo registra?
- **Registra y observa por defecto.**
- **Ejecuta sólo si hay pasarela de pago declarada** (remesa/tarjeta/Domiciliación SEPA). Es **capacidad declarable**, no comportamiento fijo.

### Nóminas: ¿calcula o recibe?
- **Recibe el hecho** (recibo de nómina con sus líneas) por defecto.
- **Calcula** como capacidad opcional `[VERIFICAR]` (tablas de retención y cotización cambian cada año; el cálculo es módulo aparte).

### Formato de exportación al asesor
- **No se fija de memoria**: es la **frontera con su programa** (A3, Sage, etc.).
- Formatos: **CSV/Excel normalizado**, **Facturae (XML)**, y **exportación contable estándar**.
- → `formato-exportacion` (L6) queda **declarable**, a cerrar con el asesor concreto.

---

## TANDA 5 · GRUPO Y USO

### Multi-sociedad y consolidación — **SÍ, completo**
Decidido: `marca-sociedad` · `consolidacion` · `eliminacion-intercompany` · `aislamiento-negocio` · `vista agregada`.

### Vista agregada
- **Dos niveles**: (a) **por negocio** (cada uno su contabilidad, aislada), (b) **del grupo** (consolidada, con eliminación de operaciones internas).

### Momento de uso (ritmo)
| Nivel | Quién | Cuándo |
|---|---|---|
| **Día** | el negocio | al cerrar caja — cuadre diario |
| **Mes** | el asesor + el dueño | cierre mensual: IVA, ajustes, amortizaciones |
| **Trimestre** | el asesor | modelos 303 / 130 |
| **Año** | el asesor | 390 / 190 / 200 / cuentas anuales |

### Catálogo de avisos (requisito 4 del dueño: *"información rica que te avise"*)
| Aviso | Se dispara por |
|---|---|
| **Descuadre de cobertura** | falta un hecho esperado (entrada incompleta) |
| **Excepción en cola** | documento ilegible / dato que no cuadra (va a cola asesor o dueño) |
| **IVA que no cuadra** | devengado ≠ esperado en el periodo |
| **Vencimiento de pago** | plazo legal/declarado próximo (Ley 3/2004) |
| **Plazo fiscal** | calendario del ejercicio (303, 130…) |
| **Presupuesto desviado** | desviación sobre el umbral declarado |
| **Cierre pendiente** | jornada o mes sin cerrar |
| **Amortización a aplicar** | toca cuota del periodo |
| **Rectificación necesaria** | factura/declaración que hay que corregir |

### Contrato de hechos con las otras verticales (`contrato-hecho-minimo`)
Lo que contabilidad **necesita** de cada vertical (declarable, no impuesto):
- **Venta** → fecha, líneas (producto, cantidad, precio, tipo de IVA), cliente, forma de cobro.
- **Cobro/pago** → fecha, importe, medio, cuenta.
- **Compra** → proveedor, líneas, impuestos, recepción.
- **Consumo/stock** → producto, cantidad, fecha.
- **Cierre de jornada** → totales, medios de pago, descuadre.
- **Si falta** → **no se inventa**: se **declara la fuente faltante** y se **avisa**.

---

## TANDA 3 · ENTRADA (eslabón limitante)

### Recepción digital de facturas
- **Canales declarables**: email (buzón dedicado), FACe (sector público), plataformas de intercambio, carpeta/API.
- **Formatos**: **Facturae (XML)** = el digital estructurado · **PDF/imagen** = digitalizado (OCR).
- **Dos caminos, no uno**: el XML entra sin interpretación; el PDF entra por extracción (juicio → micro-agente).

### Rol del trabajador — **no existe como rol humano**
El trabajo contable lo hace la máquina; el humano entra por las **dos colas** (asesor / dueño). No se fabrica un rol que no hay.

### Colas de revisión — **dos, según naturaleza**
- **Cola asesor** — excepciones contables.
- **Cola dueño** — excepciones del negocio.
- **El flujo nunca se bloquea**: lo dudoso va a cola y la operación continúa.

---

## Resumen de estado

| Tanda | Estado |
|---|---|
| 1 · Conflictos que cambian piezas | ✅ 3/3 resueltos por el dueño |
| 2 · El cierre | ✅ resuelto (dos niveles + al vuelo + colas) |
| 3 · La entrada | ✅ respondida |
| 4 · Fiscal | ✅ respondida — **`[VERIFICAR]` fechas y tipos por ejercicio** |
| 5 · Grupo y uso | ✅ respondida (sin recorte) |
| 6 · Datos operativos | ✅ respondida |

**Pendiente real (no bloquea F3):** los valores concretos `[VERIFICAR]` son **datos
declarables** que se rellenan al operar cada negocio (y se actualizan cuando cambie la
norma). Su sitio no es el diseño: es la tabla de parámetros.
