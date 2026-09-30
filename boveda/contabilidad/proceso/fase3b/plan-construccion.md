# PLAN DE CONSTRUCCIÓN — Vertical "CONTABILIDAD" (Fase 3b · ADAPTADOR)

> **Proyecto:** contabilidad · **Fase:** 3b · ADAPTADOR (traducir diseño OOP → módulos-isla event-driven Enki)
> **Worktree:** `/home/admin/3enki-contabilidad` (rama `vertical/contabilidad`).
>
> **Fuentes:**
> - `fase3/diseno-oop.md` — FASE 3 · PLASMA: **118 clases** OOP, UNA por hoja atómica de F2, con su FORMA (60 REFLEJO · 29 CUSTODIO · 14 PUENTE · 8 MICRO-AGENTE · 7 CONVERSOR) y su **HABLA** declarada (`SUBE` · `PUBLICA` · `ESCUCHA`): **43 clases publican hecho** (29 Custodio + 13 Puente + `P3`), **75 no publican**.
> - `fase2/esquemas/esquema.md` — FASE 2: árbol A–M + N–R, 118 hojas atómicas con su forma (innegociable); 23 `[ABIERTO]`; reparto 32/32/22/32.
> - **Inventario REAL de Enki:** 248 `module.json` leídos en `/home/admin/3enki-contabilidad/modules/` (se juzga por el `module.json` real — name/subscribes/publishes — nunca por el nombre).
>
> **Ley de la unidad respetada:** 118 clases → 118 hojas. Ninguna hoja sin clase, ninguna clase que fusione dos hojas.

---

## 1 · Reglas de traducción aplicadas

| Clase OOP (FORMA) | Traducción Enki |
|---|---|
| `Custodio` (29) — dueño de su parcela | módulo **CUSTODIO** (single-writer + `_shared/pos-persistencia`) |
| `Reflejo` (60) — cálculo puro | módulo **REFLEJO**; la lógica vive en su proyección `_op` |
| `Conversor` (7) — frontera de formato | módulo **CONVERSOR** |
| `Puente` (14) — habla con el exterior | módulo **PUENTE** |
| `MicroAgente` (8) — juicio con lenguaje | módulo **MICRO-AGENTE** |
| Dependencia entre clases | **EVENTO request/response**, nunca `require` |

Formas: `REFLEJO | CUSTODIO | CONVERSOR | PUENTE | MICRO-AGENTE`. Acciones: `CONSTRUIR | ADAPTAR | REUTILIZAR`.
Tópicos del bus en **ASCII** (la vertical y los hechos ya lo son: `analitica`, `anclaje_cierre_declarado`).
Todo flujo cierra su círculo con su par `*.failed`.

### 1.1 · El habla del diseño → eventos (traducción literal)

| Diseño (clase) | Enki (hoja) |
|---|---|
| `PUBLICA:` un **hecho** | `contabilidad.<hecho>` (evento de dominio fire-and-forget) |
| `SUBE:` una **petición** | `<dep>.<op>.request` (la hoja lo publica hacia su dependencia) |
| `ESCUCHA:` un hecho | `contabilidad.<hecho>` en `subscribes` |
| `SUBE:` un hecho propio | `<slug>.<op>.request` (canal RPC que la hoja responde) `→` `<slug>.<op>.response` |

> **El que ESCRIBE anuncia el hecho; el que CALCULA no anuncia** (regla de oro de F3): si una clase publica, su hoja declara el evento; si sólo calcula, su hoja NO inventa hecho — su cara es el resultado.

### 1.2 · 🔴 La regla que hay que dejar escrita (hallazgo del proceso anterior)

El plan de la iteración previa traducía **CADA método a un RPC** (144 handlers `on<Op>Request`) y F6 convertía **TODOS** los RPC en panels (95): resultado, **41 módulos exponían PREGUNTAS** (calcular, listar, saldos) como superficie — deriva.

**En este plan, TODO RPC va clasificado** en la sección `E` de cada hoja y en el mapa `rpc_clase` de la espina:

- **`PREGUNTA` / DERIVACIÓN** (calcular · listar · buscar · saldos · estado · informe · traducir · proponer · derivar · medir) → **va por el BUS**. F6 **NO** debe convertirlo en panel.
- **`ORDEN` HUMANA** (declarar · cerrar · firmar · emitir · asentar · ajustar · encolar · archivar · ratificar · registrar · unificar · rectificar · avanzar · entregar · producir) → **sí es superficie** (panel de captura).

> **Recuento:** de **149 RPC**: **103 son PREGUNTA** (BUS) y **46 son ORDEN** (superficie). Las 60 hojas `REFLEJO`, las 7 `CONVERSOR`, 7 de los 8 `MICRO-AGENTE`, y `Q1` no publican hecho: **todos sus RPC son PREGUNTA**.

---

## 2 · Inventario real: qué se REUTILIZA vs ADAPTA vs CONSTRUYE

> Los 8 candidatos se juzgaron por su `module.json` real. **1 REUTILIZAR · 2 ADAPTAR · 115 CONSTRUIR**.

### 2.1 · REUTILIZAR (1)

| slug (hoja) | módulo real | por qué encaja su contrato |
|---|---|---|
| `puerto-documento-digital` (A5, PUENTE) | `facturacion/fuentes` | Adaptador strategy-pattern de fuentes de entrada (Telegram push / Gmail pull) que ya entrega un documento digital a un pipeline. Es exactamente la recepción digital declarable de A5. |

### 2.2 · ADAPTAR (2)

| slug (hoja) | módulo real | qué se adapta |
|---|---|---|
| `extraccion-dato` (A4.1, MICRO-AGENTE) | `facturas` | Su pipeline real (Intake → Convert → Prepare → OCR → Structure(IA) → Validate → Store) ya abre un documento y lo vuelve dato; se adapta para **proponer** `Propuesta<Hecho>` y emitir el contrato `contabilidad.*` en vez de `factura.*`. |
| `puerto-exportacion` (L1, CONVERSOR) | `facturacion/asesoria` | Ya genera el paquete fiscal (CSV formato español + ZIP de originales) hacia la asesoría contable; se adapta como la frontera de formatos contables estándar del libro. |

### 2.3 · CONSTRUIR (115) y por qué

Ninguna otra clase del diseño tiene un módulo vivo con **ese contrato Y ese dominio Y PosPersistencia per-proyecto**. Los que «se parecen» no valen:

- `inventario` (real, per-proyecto) es el **store de stock** — la hoja `valoracion-existencia` H1 es **capa de valor SOBRE** él y lo declara como base de reutilización (`H1/H3/H4 ← inventario`), no lo duplica.
- `metricas` (real) es instrumentación pasiva genérica (wildcards `*.creado/*.error`), **no** la métrica de cobertura de dominio `A12` → se declara como base de `P1/P2/P4`.
- `credential-manager`, `filesystem`, `project-manager` son **infra/órganos compartidos**: base de cada hoja, no hoja propia (no tienen eje ni clase del diseño).
- `banco` es el **banco de NICHOS** (no banca) → descartado. `pizzepos`, `prisma`, `catalogo`, `recetario-creativo` son de **otro dominio**; adaptarlos rompería su proyecto.

---

## 3 · Contrato de eventos (quién pide / quién responde)

Cada hoja responde a sus propios `<slug>.<op>.request` → `<slug>.<op>.response` (o `.failed`). Las peticiones entre hojas van por `request/response`; **nunca** por `require`. El detalle exacto, hoja por hoja, está en la sección `F` de cada bloque y en el mapa `rpc_clase` de la espina (sección 8).

### 3.1 · La cadena de hechos de dominio (`contabilidad.*`, 43 hechos)

| Hecho | Lo anuncia | Lo ESCUCHAN (principales) |
|---|---|---|
| `contabilidad.hecho_recibido` | `puerto-evento-vertical` | normalizador-hecho · deduplicacion-hecho · completitud-cobertura · contrapartida-asistida · hecho-rectificativo · declaracion-fuente-faltante · escritor-diario · ajuste-inventario · variacion-stock-valorada · cruce-factura-recepcion · etiquetado-analitico · motor-avisos · panel-proceso-contable · historial-proceso-contable · tasa-cobertura-entrada · sello-cobertura |
| `contabilidad.documento_recibido` | `puerto-documento-digital` | normalizador-hecho · captura-documento · expediente-documental |
| `contabilidad.excepcion_encolada` | `encolado-excepcion` | aviso-revision · panel-proceso-contable · historial-proceso-contable · desatasco-entrada · tasa-cobertura-entrada |
| `contabilidad.revision_solicitada` | `aviso-revision` | motor-avisos |
| `contabilidad.contrapartida_regla_declarada` | `regla-contrapartida` | control-calidad-muestreo |
| `contabilidad.contrato_hecho_declarado` | `contrato-hecho-minimo` | puerto-evento-vertical |
| `contabilidad.anclaje_cierre_declarado` | `anclaje-cierre-vertical` | clave-natural |
| `contabilidad.fuente_faltante_declarada` | `declaracion-fuente-faltante` | motor-avisos |
| `contabilidad.hecho_rectificado` | `hecho-rectificativo` | escritor-diario |
| `contabilidad.plan_cuentas_declarado` | `catalogo-cuentas` | contrapartida-asistida |
| `contabilidad.asiento_asentado` | `escritor-diario` | mayor-balanza · traza-asiento · balance-situacion · cuenta-resultados · liquidacion-iva · modelo-303 · retenciones · conciliacion-bancaria · cuadre-cobro-pago · saldo-tesoreria · vista-revisable · expediente-documental · control-calidad-muestreo · cambio-desde-ultima-revision · cuenta-proveedor · estado-cuenta-proveedor · vencimiento-pago · rappel-pronto-pago · antiguedad-de-saldos · historial-proceso-contable · consulta-cuentas-bajo-demanda · informe-accionable |
| `contabilidad.traza_registrada` | `traza-asiento` | marca-borrador-validado |
| `contabilidad.ajuste_entrado` | `asiento-ajuste` | escritor-diario · traza-asiento · cambio-desde-ultima-revision |
| `contabilidad.ejercicio_cerrado` | `cierre-ejercicio` | escritor-diario · balance-situacion · cuenta-resultados · modelo-390 · estimacion-is-irpf · eliminacion-intercompany · consolidacion · margen-analitico · cuadro-mando-contable · comparador-periodos · tablero-margen-dimension · informe-rico · consulta-cuentas-bajo-demanda · narrador-estados |
| `contabilidad.cuadre_no_cuadra` | `aviso-cuadre` | motor-avisos |
| `contabilidad.plazo_declarado` | `calendario-fiscal` | motor-avisos |
| `contabilidad.modelo_exportado` | `generador-modelo` | estado-presentacion-fiscal |
| `contabilidad.factura_encadenada` | `registro-verifactu` | (exigencia de la administración) |
| `contabilidad.obligacion_avanzada` | `estado-presentacion-fiscal` | acuse-presentacion · rectificacion-declaracion |
| `contabilidad.declaracion_justificada` | `acuse-presentacion` | estado-presentacion-fiscal · expediente-documental |
| `contabilidad.declaracion_rectificada` | `rectificacion-declaracion` | estado-presentacion-fiscal |
| `contabilidad.perfil_administrativo_declarado` | `perfil-administrativo` | calendario-fiscal |
| `contabilidad.movimiento_regla_declarada` | `regla-movimiento-bancario` | conciliacion-bancaria · partida-no-identificada |
| `contabilidad.cuenta_bancaria_declarada` | `maestro-cuentas-bancarias` | saldo-tesoreria |
| `contabilidad.activo_alta` | `alta-activo` | baja-activo |
| `contabilidad.cuota_amortizacion_generada` | `plan-amortizacion` | baja-activo · valor-neto-contable |
| `contabilidad.nomina_recibida` | `puerto-nomina` | recibo-nomina · obligacion-seguridad-social · asiento-personal · lineas-nomina · pagos-a-cuenta-empleado · conceptos-extra-nomina · liquidacion-baja-empleado |
| `contabilidad.acceso_nomina_declarado` | `acceso-nomina` | recibo-nomina |
| `contabilidad.negocio_parcela_creada` | `aislamiento-negocio` | onboarding-negocio |
| `contabilidad.presupuesto_fijado` | `presupuesto` | desviacion · comparador-periodos |
| `contabilidad.negocio_registrado` | `onboarding-negocio` | aislamiento-negocio · activacion-vertical |
| `contabilidad.aviso_producido` | `motor-avisos` | aviso-al-negocio · informe-accionable |
| `contabilidad.criterio_fijado` | `cola-declaraciones-criterio` | anclaje-cierre-vertical · prevision-caja · etiquetado-analitico · coste-indirecto · tablero-margen-dimension · vencimiento-pago |
| `contabilidad.revision_firmada` | `flujo-firma` | cambio-desde-ultima-revision · marca-borrador-validado |
| `contabilidad.documento_archivado` | `expediente-documental` | (la inspección lo recupera) |
| `contabilidad.regla_ratificada` | `ratificacion-regla-aprendida` | regla-contrapartida · regla-movimiento-bancario |
| `contabilidad.parcela_reclamada` | `single-writer` | (la ley gobierna cada Custodio) |
| `contabilidad.tercero_actualizado` | `maestro-terceros` | contrapartida-asistida · cuenta-proveedor |
| `contabilidad.tercero_unificado` | `padron-terceros` | maestro-terceros |
| `contabilidad.factura_emitida` | `emision-factura-venta` | registro-verifactu · factura-rectificativa |
| `contabilidad.proceso_anotado` | `historial-proceso-contable` | panel-proceso-contable |
| `contabilidad.excepcion_desatascada` | `desatasco-entrada` | regla-contrapartida · panel-proceso-contable · historial-proceso-contable |
| `contabilidad.aviso_entregado` | `aviso-al-negocio` | (el negocio queda avisado) |

---

## 4 · Máquina de estados (dueño y estado ilegal imposible)

```
hecho_recibido --(A2/A7)--> NORMALIZADO --(A12 cobertura)--> CUBIERTO
  dudoso --> excepcion_encolada (A8.1) --> revision_solicitada (A8.2) --> excepcion_desatascada (P3)
  NORMALIZADO --(A6.1 propone / A6.2 fija)--> asiento_asentado (B2) --> traza_registrada (B4)
asiento_asentado --(C3 periodo)--> ejercicio_cerrado (C4) --> apertura (C5) --> estados (C1/C2)
ejercicio_cerrado --> liquidacion_iva (D1) --> modelo (D2/D3) --> modelo_exportado (D7)
  --> obligacion_avanzada (D12) --> declaracion_justificada (D13)
libro --> revision_solicitada? no: vista_revisable (L2) --> revision_firmada (L3) --> documento_archivado (L7)
```
- **Dueño de cada parcela:** su `Custodio` (B2 el libro, B4 la traza, C4 el cierre, L3 la firma, L7 el expediente…). `M2 single-writer` concede/rechaza; ningún otro muta el estado.
- **Estado ilegal imposible:** no hay `asiento_asentado` sin pasar por la clave natural A7/M3 (`un renglón = un asiento`); no hay `ejercicio_cerrado` reversible sin `AsientoAjuste` B5; no hay `revision_firmada` sin acto del asesor (`L3` — **el sistema NO firma**).

---

## 5 · Los 7 flujos (diseño F3) → hojas

1. **HECHO → ASIENTO → LIBRO** (sin operador): `puerto-evento-vertical` A1 → A2 → A7/A12 → A6.1/A6.2 → `escritor-diario` B2 → B4 → B3.
2. **DOCUMENTO → DATO → ASIENTO**: `puerto-documento` A4.2 → `captura-documento` A3 → `extraccion-dato` A4.1 → `control-cuadre-documento` A4.3 → (cola A8.1 o flujo 1).
3. **CIERRE (dos niveles) → ESTADOS → FISCAL**: día→caja (operación) · mes→`cierre-ejercicio` C4 → C5 → C1/C2 → D1 → D2/D3 → D7 → D13.
4. **TESORERÍA**: `puerto-extracto` E2 → E1 → E3 → (E7/E8) → E9 → E10 · E4 → E5 → K2.
5. **REVISIÓN → FIRMA → EXPORTACIÓN** (medida maestra): B2 → L2 → L8 → L9 → L10 → B5 → L1 → L3 → L7.
6. **AVISO → ENTREGA**: señales (A8.2·C6·D6·E5·J4) → `motor-avisos` K2 → `aviso-al-negocio` R1 → R2 · R3.
7. **CORRECCIÓN (4 planos, no se confunden)**: interno B5 · del hecho A13 · comercial O2 · fiscal D14.

---

## 6 · Hojas (118) — plantilla completa por hoja

> Cada bloque lleva: Clase/hoja F2 · Propósito · Depende de · Eventos que sube · Eventos que publica · Escucha · **A** dependencias · **B** module.json · **C** index.js · **D** proyecciones · **E** handlers RPC (**con su CLASE PREGUNTA/ORDEN**) · **F** eventos · VERIFICACIÓN.

### ▸ EJE `entrada` — GRUPO A·N·O·P — ENTRADA (32)

### `puerto-evento-vertical` · `PUENTE` · eje `entrada`
- **Clase / hoja F2:** `PuertoEventoVertical` (HOJA A1) · acción **CONSTRUIR**
- **Propósito:** La puerta: la vertical manda y contabilidad se adapta; recibe el hecho crudo ya emitido.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `puerto-evento-vertical.abrir.response`, `puerto-evento-vertical.abrir.failed`, `puerto-evento-vertical.recibir.response`, `puerto-evento-vertical.recibir.failed`, `contabilidad.hecho_recibido`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"puerto-evento-vertical"` · `subscribes:` ["puerto-evento-vertical.abrir.request", "puerto-evento-vertical.recibir.request"] · `publishes:` ["puerto-evento-vertical.abrir.response", "puerto-evento-vertical.abrir.failed", "puerto-evento-vertical.recibir.response", "puerto-evento-vertical.recibir.failed", "contabilidad.hecho_recibido"]
- **C · index.js:** `class PuertoEventoVertical extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_abrir(input) → { status, data }` · `_recibir(input) → { status, data }`
- **E · handler:** `onAbrirRequest(e) → this._atender(e,'abrir','puerto-evento-vertical.abrir.response', d=>this._abrir(d))` · **CLASE: ORDEN**
- **E · handler:** `onRecibirRequest(e) → this._atender(e,'recibir','puerto-evento-vertical.recibir.response', d=>this._recibir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `puerto-evento-vertical.abrir.response`, `puerto-evento-vertical.abrir.failed`, `puerto-evento-vertical.recibir.response`, `puerto-evento-vertical.recibir.failed`, `contabilidad.hecho_recibido`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `normalizador-hecho` · `CONVERSOR` · eje `entrada`
- **Clase / hoja F2:** `NormalizadorHecho` (HOJA A2) · acción **CONSTRUIR**
- **Propósito:** Única puerta de formato: homogeneiza el hecho de cada vertical a forma asentable.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `normalizador-hecho.entrar.response`, `normalizador-hecho.entrar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.documento_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"normalizador-hecho"` · `subscribes:` ["normalizador-hecho.entrar.request", "contabilidad.hecho_recibido", "contabilidad.documento_recibido"] · `publishes:` ["normalizador-hecho.entrar.response", "normalizador-hecho.entrar.failed"]
- **C · index.js:** `class NormalizadorHecho extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','normalizador-hecho.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `normalizador-hecho.entrar.response`, `normalizador-hecho.entrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `captura-documento` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `CapturaDocumento` (HOJA A3) · acción **CONSTRUIR**
- **Propósito:** Admite y valida el documento recibido; mecánico, cero juicio.
- **Depende de:** `extraccion-dato`, `puerto-documento`
- **Eventos que sube:** `extraccion-dato.juzgar.request`, `puerto-documento.entrar.request`
- **Eventos que publica:** `captura-documento.admitir.response`, `captura-documento.admitir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.documento_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"captura-documento"` · `subscribes:` ["captura-documento.admitir.request", "contabilidad.documento_recibido"] · `publishes:` ["captura-documento.admitir.response", "captura-documento.admitir.failed"]
- **C · index.js:** `class CapturaDocumento extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_admitir(input) → { status, data }`
- **E · handler:** `onAdmitirRequest(e) → this._atender(e,'admitir','captura-documento.admitir.response', d=>this._admitir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `extraccion-dato.juzgar.request`, `puerto-documento.entrar.request` · publica → `captura-documento.admitir.response`, `captura-documento.admitir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `extraccion-dato` · `MICRO-AGENTE` · eje `entrada`
- **Clase / hoja F2:** `ExtraccionDato` (HOJA A4.1) · acción **ADAPTAR**
- **Propósito:** Abre un documento NO estructurado y lo vuelve dato. Interpreta y PROPONE; no asienta.
- **Depende de:** `control-cuadre-documento`, `encolado-excepcion`
- **Eventos que sube:** `control-cuadre-documento.cuadra.request`, `encolado-excepcion.encolar.request`
- **Eventos que publica:** `extraccion-dato.juzgar.response`, `extraccion-dato.juzgar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `facturas`
- **B · module.json:** `name:"extraccion-dato"` · `subscribes:` ["extraccion-dato.juzgar.request"] · `publishes:` ["extraccion-dato.juzgar.response", "extraccion-dato.juzgar.failed"]
- **C · index.js:** `class ExtraccionDato extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','extraccion-dato.juzgar.response', d=>this._juzgar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `control-cuadre-documento.cuadra.request`, `encolado-excepcion.encolar.request` · publica → `extraccion-dato.juzgar.response`, `extraccion-dato.juzgar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **ADAPTA `facturas`:** su pipeline real existe (OCR/IA de documento; paquete fiscal al asesor) pero su contrato emite otro tópico — se adapta a `contabilidad.*` sin romper su proyecto.

### `puerto-documento` · `CONVERSOR` · eje `entrada`
- **Clase / hoja F2:** `PuertoDocumento` (HOJA A4.2) · acción **CONSTRUIR**
- **Propósito:** Frontera de las formas declarables del documento; el adaptador lo pone el sitio.
- **Depende de:** `extraccion-dato`
- **Eventos que sube:** `extraccion-dato.juzgar.request`
- **Eventos que publica:** `puerto-documento.entrar.response`, `puerto-documento.entrar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"puerto-documento"` · `subscribes:` ["puerto-documento.entrar.request"] · `publishes:` ["puerto-documento.entrar.response", "puerto-documento.entrar.failed"]
- **C · index.js:** `class PuertoDocumento extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','puerto-documento.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `extraccion-dato.juzgar.request` · publica → `puerto-documento.entrar.response`, `puerto-documento.entrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `control-cuadre-documento` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `ControlCuadreDocumento` (HOJA A4.3) · acción **CONSTRUIR**
- **Propósito:** Si importe+impuestos no cuadran -> cola; NO se asienta mal. Cálculo determinista.
- **Depende de:** `encolado-excepcion`
- **Eventos que sube:** `encolado-excepcion.encolar.request`
- **Eventos que publica:** `control-cuadre-documento.cuadra.response`, `control-cuadre-documento.cuadra.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"control-cuadre-documento"` · `subscribes:` ["control-cuadre-documento.cuadra.request"] · `publishes:` ["control-cuadre-documento.cuadra.response", "control-cuadre-documento.cuadra.failed"]
- **C · index.js:** `class ControlCuadreDocumento extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_cuadra(input) → { status, data }`
- **E · handler:** `onCuadraRequest(e) → this._atender(e,'cuadra','control-cuadre-documento.cuadra.response', d=>this._cuadra(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `encolado-excepcion.encolar.request` · publica → `control-cuadre-documento.cuadra.response`, `control-cuadre-documento.cuadra.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puerto-documento-digital` · `PUENTE` · eje `entrada`
- **Clase / hoja F2:** `PuertoDocumentoDigital` (HOJA A5) · acción **REUTILIZAR**
- **Propósito:** Recepción digital declarable; conecta con el canal emisor; si no existe, se crea.
- **Depende de:** `normalizador-hecho`, `extraccion-dato`
- **Eventos que sube:** `normalizador-hecho.entrar.request`, `extraccion-dato.juzgar.request`
- **Eventos que publica:** `puerto-documento-digital.recibir.response`, `puerto-documento-digital.recibir.failed`, `contabilidad.documento_recibido`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `facturacion/fuentes` + `credential-manager`
- **B · module.json:** `name:"puerto-documento-digital"` · `subscribes:` ["puerto-documento-digital.recibir.request"] · `publishes:` ["puerto-documento-digital.recibir.response", "puerto-documento-digital.recibir.failed", "contabilidad.documento_recibido"]
- **C · index.js:** `class PuertoDocumentoDigital extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_recibir(input) → { status, data }`
- **E · handler:** `onRecibirRequest(e) → this._atender(e,'recibir','puerto-documento-digital.recibir.response', d=>this._recibir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `normalizador-hecho.entrar.request`, `extraccion-dato.juzgar.request` · publica → `puerto-documento-digital.recibir.response`, `puerto-documento-digital.recibir.failed`, `contabilidad.documento_recibido`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO CONSTRUYE:** reutiliza el `module.json` real de `facturacion/fuentes` (adaptador strategy de fuentes de entrada; contrato real encaja).

### `contrapartida-asistida` · `MICRO-AGENTE` · eje `entrada`
- **Clase / hoja F2:** `ContrapartidaAsistida` (HOJA A6.1) · acción **CONSTRUIR**
- **Propósito:** Propone cuenta/tercero/periodo contra el plan declarado. PROPONE; el corte duro lo fija A6.2.
- **Depende de:** `regla-contrapartida`
- **Eventos que sube:** `regla-contrapartida.aplicar.request`
- **Eventos que publica:** `contrapartida-asistida.juzgar.response`, `contrapartida-asistida.juzgar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.plan_cuentas_declarado`, `contabilidad.tercero_actualizado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"contrapartida-asistida"` · `subscribes:` ["contrapartida-asistida.juzgar.request", "contabilidad.hecho_recibido", "contabilidad.plan_cuentas_declarado", "contabilidad.tercero_actualizado"] · `publishes:` ["contrapartida-asistida.juzgar.response", "contrapartida-asistida.juzgar.failed"]
- **C · index.js:** `class ContrapartidaAsistida extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','contrapartida-asistida.juzgar.response', d=>this._juzgar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `regla-contrapartida.aplicar.request` · publica → `contrapartida-asistida.juzgar.response`, `contrapartida-asistida.juzgar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `regla-contrapartida` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `ReglaContrapartida` (HOJA A6.2) · acción **CONSTRUIR**
- **Propósito:** Parcela de reglas declarables/aprendidas ('este proveedor -> esta cuenta'). UN escritor.
- **Depende de:** `ratificacion-regla-aprendida`
- **Eventos que sube:** `ratificacion-regla-aprendida.ratificar.request`
- **Eventos que publica:** `regla-contrapartida.aplicar.response`, `regla-contrapartida.aplicar.failed`, `regla-contrapartida.proponer.response`, `regla-contrapartida.proponer.failed`, `regla-contrapartida.declarar.response`, `regla-contrapartida.declarar.failed`, `contabilidad.contrapartida_regla_declarada`
- **Escucha (subscribes de dominio):** `contabilidad.regla_ratificada`, `contabilidad.excepcion_desatascada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"regla-contrapartida"` · `subscribes:` ["regla-contrapartida.aplicar.request", "regla-contrapartida.proponer.request", "regla-contrapartida.declarar.request", "contabilidad.regla_ratificada", "contabilidad.excepcion_desatascada"] · `publishes:` ["regla-contrapartida.aplicar.response", "regla-contrapartida.aplicar.failed", "regla-contrapartida.proponer.response", "regla-contrapartida.proponer.failed", "regla-contrapartida.declarar.response", "regla-contrapartida.declarar.failed", "contabilidad.contrapartida_regla_declarada"]
- **C · index.js:** `class ReglaContrapartida extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_aplicar(input) → { status, data }` · `_proponer(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onAplicarRequest(e) → this._atender(e,'aplicar','regla-contrapartida.aplicar.response', d=>this._aplicar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onProponerRequest(e) → this._atender(e,'proponer','regla-contrapartida.proponer.response', d=>this._proponer(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','regla-contrapartida.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `ratificacion-regla-aprendida.ratificar.request` · publica → `regla-contrapartida.aplicar.response`, `regla-contrapartida.aplicar.failed`, `regla-contrapartida.proponer.response`, `regla-contrapartida.proponer.failed`, `regla-contrapartida.declarar.response`, `regla-contrapartida.declarar.failed`, `contabilidad.contrapartida_regla_declarada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `deduplicacion-hecho` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `DeduplicacionHecho` (HOJA A7) · acción **CONSTRUIR**
- **Propósito:** Clave natural del hecho/documento -> no duplica. Idempotencia determinista.
- **Depende de:** `clave-natural`
- **Eventos que sube:** `clave-natural.calcular.request`
- **Eventos que publica:** `deduplicacion-hecho.es_nuevo.response`, `deduplicacion-hecho.es_nuevo.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"deduplicacion-hecho"` · `subscribes:` ["deduplicacion-hecho.es_nuevo.request"] · `publishes:` ["deduplicacion-hecho.es_nuevo.response", "deduplicacion-hecho.es_nuevo.failed"]
- **C · index.js:** `class DeduplicacionHecho extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_es_nuevo(input) → { status, data }`
- **E · handler:** `onEsNuevoRequest(e) → this._atender(e,'es_nuevo','deduplicacion-hecho.es_nuevo.response', d=>this._es_nuevo(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `clave-natural.calcular.request` · publica → `deduplicacion-hecho.es_nuevo.response`, `deduplicacion-hecho.es_nuevo.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `encolado-excepcion` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `EncoladoExcepcion` (HOJA A8.1) · acción **CONSTRUIR**
- **Propósito:** Parcela de lo dudoso. UN escritor. El flujo CONTINÚA; lo dudoso espera.
- **Depende de:** `aviso-revision`
- **Eventos que sube:** `aviso-revision.empujar.request`
- **Eventos que publica:** `encolado-excepcion.encolar.response`, `encolado-excepcion.encolar.failed`, `encolado-excepcion.tomar.response`, `encolado-excepcion.tomar.failed`, `contabilidad.excepcion_encolada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"encolado-excepcion"` · `subscribes:` ["encolado-excepcion.encolar.request", "encolado-excepcion.tomar.request"] · `publishes:` ["encolado-excepcion.encolar.response", "encolado-excepcion.encolar.failed", "encolado-excepcion.tomar.response", "encolado-excepcion.tomar.failed", "contabilidad.excepcion_encolada"]
- **C · index.js:** `class EncoladoExcepcion extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_encolar(input) → { status, data }` · `_tomar(input) → { status, data }`
- **E · handler:** `onEncolarRequest(e) → this._atender(e,'encolar','encolado-excepcion.encolar.response', d=>this._encolar(d))` · **CLASE: ORDEN**
- **E · handler:** `onTomarRequest(e) → this._atender(e,'tomar','encolado-excepcion.tomar.response', d=>this._tomar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `aviso-revision.empujar.request` · publica → `encolado-excepcion.encolar.response`, `encolado-excepcion.encolar.failed`, `encolado-excepcion.tomar.response`, `encolado-excepcion.tomar.failed`, `contabilidad.excepcion_encolada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `aviso-revision` · `PUENTE` · eje `entrada`
- **Clase / hoja F2:** `AvisoRevision` (HOJA A8.2) · acción **CONSTRUIR**
- **Propósito:** Empujón al canal de avisos ('esto necesita revisión'). Una excepción SIEMPRE genera aviso.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `aviso-revision.empujar.response`, `aviso-revision.empujar.failed`, `contabilidad.revision_solicitada`
- **Escucha (subscribes de dominio):** `contabilidad.excepcion_encolada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"aviso-revision"` · `subscribes:` ["aviso-revision.empujar.request", "contabilidad.excepcion_encolada"] · `publishes:` ["aviso-revision.empujar.response", "aviso-revision.empujar.failed", "contabilidad.revision_solicitada"]
- **C · index.js:** `class AvisoRevision extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_empujar(input) → { status, data }`
- **E · handler:** `onEmpujarRequest(e) → this._atender(e,'empujar','aviso-revision.empujar.response', d=>this._empujar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `aviso-revision.empujar.response`, `aviso-revision.empujar.failed`, `contabilidad.revision_solicitada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `lote-admision` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `LoteAdmision` (HOJA A9) · acción **CONSTRUIR**
- **Propósito:** Desacople del cuello: N hechos en paralelo. El paralelismo es de ADMISIÓN; la escritura sigue única.
- **Depende de:** `normalizador-hecho`, `escritor-diario`
- **Eventos que sube:** `normalizador-hecho.entrar.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `lote-admision.admitir.response`, `lote-admision.admitir.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"lote-admision"` · `subscribes:` ["lote-admision.admitir.request"] · `publishes:` ["lote-admision.admitir.response", "lote-admision.admitir.failed"]
- **C · index.js:** `class LoteAdmision extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_admitir(input) → { status, data }`
- **E · handler:** `onAdmitirRequest(e) → this._atender(e,'admitir','lote-admision.admitir.response', d=>this._admitir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `normalizador-hecho.entrar.request`, `escritor-diario.asentar.request` · publica → `lote-admision.admitir.response`, `lote-admision.admitir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `contrato-hecho-minimo` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `ContratoHechoMinimo` (HOJA A11) · acción **CONSTRUIR**
- **Propósito:** Parcela declarable del MÍNIMO exigible: la cara vista desde la fuente. UN escritor.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `contrato-hecho-minimo.exigir.response`, `contrato-hecho-minimo.exigir.failed`, `contrato-hecho-minimo.declarar.response`, `contrato-hecho-minimo.declarar.failed`, `contabilidad.contrato_hecho_declarado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"contrato-hecho-minimo"` · `subscribes:` ["contrato-hecho-minimo.exigir.request", "contrato-hecho-minimo.declarar.request"] · `publishes:` ["contrato-hecho-minimo.exigir.response", "contrato-hecho-minimo.exigir.failed", "contrato-hecho-minimo.declarar.response", "contrato-hecho-minimo.declarar.failed", "contabilidad.contrato_hecho_declarado"]
- **C · index.js:** `class ContratoHechoMinimo extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_exigir(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onExigirRequest(e) → this._atender(e,'exigir','contrato-hecho-minimo.exigir.response', d=>this._exigir(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','contrato-hecho-minimo.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `contrato-hecho-minimo.exigir.response`, `contrato-hecho-minimo.exigir.failed`, `contrato-hecho-minimo.declarar.response`, `contrato-hecho-minimo.declarar.failed`, `contabilidad.contrato_hecho_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `completitud-cobertura` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `CompletitudCobertura` (HOJA A12) · acción **CONSTRUIR**
- **Propósito:** Produce LA métrica única de cobertura; Q3/C6/P4 la LEEN (no la recalculan).
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `completitud-cobertura.medir.response`, `completitud-cobertura.medir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"completitud-cobertura"` · `subscribes:` ["completitud-cobertura.medir.request", "contabilidad.hecho_recibido"] · `publishes:` ["completitud-cobertura.medir.response", "completitud-cobertura.medir.failed"]
- **C · index.js:** `class CompletitudCobertura extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_medir(input) → { status, data }`
- **E · handler:** `onMedirRequest(e) → this._atender(e,'medir','completitud-cobertura.medir.response', d=>this._medir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `completitud-cobertura.medir.response`, `completitud-cobertura.medir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `hecho-rectificativo` · `PUENTE` · eje `entrada`
- **Clase / hoja F2:** `HechoRectificativo` (HOJA A13) · acción **CONSTRUIR**
- **Propósito:** Conecta el hecho posterior que corrige/anula uno anterior por clave natural. NO borra, añade.
- **Depende de:** `clave-natural`, `escritor-diario`
- **Eventos que sube:** `clave-natural.calcular.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `hecho-rectificativo.emparejar.response`, `hecho-rectificativo.emparejar.failed`, `contabilidad.hecho_rectificado`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"hecho-rectificativo"` · `subscribes:` ["hecho-rectificativo.emparejar.request", "contabilidad.hecho_recibido"] · `publishes:` ["hecho-rectificativo.emparejar.response", "hecho-rectificativo.emparejar.failed", "contabilidad.hecho_rectificado"]
- **C · index.js:** `class HechoRectificativo extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_emparejar(input) → { status, data }`
- **E · handler:** `onEmparejarRequest(e) → this._atender(e,'emparejar','hecho-rectificativo.emparejar.response', d=>this._emparejar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `clave-natural.calcular.request`, `escritor-diario.asentar.request` · publica → `hecho-rectificativo.emparejar.response`, `hecho-rectificativo.emparejar.failed`, `contabilidad.hecho_rectificado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `anclaje-cierre-vertical` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `AnclajeCierreVertical` (HOJA A14) · acción **CONSTRUIR**
- **Propósito:** Parcela declarable POR VERTICAL de qué es 'un cierre' y cómo se identifica. UN escritor.
- **Depende de:** `clave-natural`, `cola-declaraciones-criterio`
- **Eventos que sube:** `clave-natural.calcular.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `anclaje-cierre-vertical.anclar.response`, `anclaje-cierre-vertical.anclar.failed`, `anclaje-cierre-vertical.declarar.response`, `anclaje-cierre-vertical.declarar.failed`, `contabilidad.anclaje_cierre_declarado`
- **Escucha (subscribes de dominio):** `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"anclaje-cierre-vertical"` · `subscribes:` ["anclaje-cierre-vertical.anclar.request", "anclaje-cierre-vertical.declarar.request", "contabilidad.criterio_fijado"] · `publishes:` ["anclaje-cierre-vertical.anclar.response", "anclaje-cierre-vertical.anclar.failed", "anclaje-cierre-vertical.declarar.response", "anclaje-cierre-vertical.declarar.failed", "contabilidad.anclaje_cierre_declarado"]
- **C · index.js:** `class AnclajeCierreVertical extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_anclar(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onAnclarRequest(e) → this._atender(e,'anclar','anclaje-cierre-vertical.anclar.response', d=>this._anclar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','anclaje-cierre-vertical.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `clave-natural.calcular.request`, `cola-declaraciones-criterio.fijar.request` · publica → `anclaje-cierre-vertical.anclar.response`, `anclaje-cierre-vertical.anclar.failed`, `anclaje-cierre-vertical.declarar.response`, `anclaje-cierre-vertical.declarar.failed`, `contabilidad.anclaje_cierre_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `declaracion-fuente-faltante` · `PUENTE` · eje `entrada`
- **Clase / hoja F2:** `DeclaracionFuenteFaltante` (HOJA A15) · acción **CONSTRUIR**
- **Propósito:** Detecta que una vertical NO publica un hecho necesario y lo DECLARA. NO la obliga a producirlo.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed`, `contabilidad.fuente_faltante_declarada`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"declaracion-fuente-faltante"` · `subscribes:` ["declaracion-fuente-faltante.declarar.request", "contabilidad.hecho_recibido"] · `publishes:` ["declaracion-fuente-faltante.declarar.response", "declaracion-fuente-faltante.declarar.failed", "contabilidad.fuente_faltante_declarada"]
- **C · index.js:** `class DeclaracionFuenteFaltante extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_declarar(input) → { status, data }`
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','declaracion-fuente-faltante.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed`, `contabilidad.fuente_faltante_declarada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `maestro-terceros` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `MaestroTerceros` (HOJA N1) · acción **CONSTRUIR**
- **Propósito:** Ficha única de cliente/proveedor. UN solo maestro con roles (conflicto 1 resuelto). UN escritor.
- **Depende de:** `padron-terceros`, `expediente-documental`
- **Eventos que sube:** `padron-terceros.unificar.request`, `expediente-documental.archivar.request`
- **Eventos que publica:** `maestro-terceros.ficha.response`, `maestro-terceros.ficha.failed`, `maestro-terceros.upsert.response`, `maestro-terceros.upsert.failed`, `contabilidad.tercero_actualizado`
- **Escucha (subscribes de dominio):** `contabilidad.tercero_unificado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"maestro-terceros"` · `subscribes:` ["maestro-terceros.ficha.request", "maestro-terceros.upsert.request", "contabilidad.tercero_unificado"] · `publishes:` ["maestro-terceros.ficha.response", "maestro-terceros.ficha.failed", "maestro-terceros.upsert.response", "maestro-terceros.upsert.failed", "contabilidad.tercero_actualizado"]
- **C · index.js:** `class MaestroTerceros extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_ficha(input) → { status, data }` · `_upsert(input) → { status, data }`
- **E · handler:** `onFichaRequest(e) → this._atender(e,'ficha','maestro-terceros.ficha.response', d=>this._ficha(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onUpsertRequest(e) → this._atender(e,'upsert','maestro-terceros.upsert.response', d=>this._upsert(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `padron-terceros.unificar.request`, `expediente-documental.archivar.request` · publica → `maestro-terceros.ficha.response`, `maestro-terceros.ficha.failed`, `maestro-terceros.upsert.response`, `maestro-terceros.upsert.failed`, `contabilidad.tercero_actualizado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `padron-terceros` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `PadronTerceros` (HOJA N2) · acción **CONSTRUIR**
- **Propósito:** Identidad única por número fiscal: un proveedor escrito de tres formas sigue siendo uno.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `padron-terceros.unificar.response`, `padron-terceros.unificar.failed`, `contabilidad.tercero_unificado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"padron-terceros"` · `subscribes:` ["padron-terceros.unificar.request"] · `publishes:` ["padron-terceros.unificar.response", "padron-terceros.unificar.failed", "contabilidad.tercero_unificado"]
- **C · index.js:** `class PadronTerceros extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_unificar(input) → { status, data }`
- **E · handler:** `onUnificarRequest(e) → this._atender(e,'unificar','padron-terceros.unificar.response', d=>this._unificar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `padron-terceros.unificar.response`, `padron-terceros.unificar.failed`, `contabilidad.tercero_unificado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cuenta-proveedor` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `CuentaProveedor` (HOJA N3) · acción **CONSTRUIR**
- **Propósito:** Mayor auxiliar del tercero (cada factura de compra viva y su saldo), DERIVADO del diario.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `mayor-balanza.saldos.request`
- **Eventos que publica:** `cuenta-proveedor.saldo.response`, `cuenta-proveedor.saldo.failed`, `cuenta-proveedor.facturas_vivas.response`, `cuenta-proveedor.facturas_vivas.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.tercero_actualizado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cuenta-proveedor"` · `subscribes:` ["cuenta-proveedor.saldo.request", "cuenta-proveedor.facturas_vivas.request", "contabilidad.asiento_asentado", "contabilidad.tercero_actualizado"] · `publishes:` ["cuenta-proveedor.saldo.response", "cuenta-proveedor.saldo.failed", "cuenta-proveedor.facturas_vivas.response", "cuenta-proveedor.facturas_vivas.failed"]
- **C · index.js:** `class CuentaProveedor extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_saldo(input) → { status, data }` · `_facturas_vivas(input) → { status, data }`
- **E · handler:** `onSaldoRequest(e) → this._atender(e,'saldo','cuenta-proveedor.saldo.response', d=>this._saldo(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onFacturasVivasRequest(e) → this._atender(e,'facturas_vivas','cuenta-proveedor.facturas_vivas.response', d=>this._facturas_vivas(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request` · publica → `cuenta-proveedor.saldo.response`, `cuenta-proveedor.saldo.failed`, `cuenta-proveedor.facturas_vivas.response`, `cuenta-proveedor.facturas_vivas.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `estado-cuenta-proveedor` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `EstadoCuentaProveedor` (HOJA N4) · acción **CONSTRUIR**
- **Propósito:** Extracto CONFRONTABLE con el proveedor (conciliación de saldos). Derivación determinista.
- **Depende de:** `cuenta-proveedor`
- **Eventos que sube:** `cuenta-proveedor.saldo.request`
- **Eventos que publica:** `estado-cuenta-proveedor.extracto.response`, `estado-cuenta-proveedor.extracto.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"estado-cuenta-proveedor"` · `subscribes:` ["estado-cuenta-proveedor.extracto.request", "contabilidad.asiento_asentado"] · `publishes:` ["estado-cuenta-proveedor.extracto.response", "estado-cuenta-proveedor.extracto.failed"]
- **C · index.js:** `class EstadoCuentaProveedor extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_extracto(input) → { status, data }`
- **E · handler:** `onExtractoRequest(e) → this._atender(e,'extracto','estado-cuenta-proveedor.extracto.response', d=>this._extracto(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cuenta-proveedor.saldo.request` · publica → `estado-cuenta-proveedor.extracto.response`, `estado-cuenta-proveedor.extracto.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cruce-factura-recepcion` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `CruceFacturaRecepcion` (HOJA N5) · acción **CONSTRUIR**
- **Propósito:** Coteja pedido <-> recepción <-> factura ANTES de asentar; lo que no cuadra -> cola.
- **Depende de:** `encolado-excepcion`, `escritor-diario`
- **Eventos que sube:** `encolado-excepcion.encolar.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `cruce-factura-recepcion.cotejar.response`, `cruce-factura-recepcion.cotejar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cruce-factura-recepcion"` · `subscribes:` ["cruce-factura-recepcion.cotejar.request", "contabilidad.hecho_recibido"] · `publishes:` ["cruce-factura-recepcion.cotejar.response", "cruce-factura-recepcion.cotejar.failed"]
- **C · index.js:** `class CruceFacturaRecepcion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_cotejar(input) → { status, data }`
- **E · handler:** `onCotejarRequest(e) → this._atender(e,'cotejar','cruce-factura-recepcion.cotejar.response', d=>this._cotejar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `encolado-excepcion.encolar.request`, `escritor-diario.asentar.request` · publica → `cruce-factura-recepcion.cotejar.response`, `cruce-factura-recepcion.cotejar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `vencimiento-pago` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `VencimientoPago` (HOJA N6) · acción **CONSTRUIR**
- **Propósito:** Fecha de vencimiento por factura desde la política declarada; alimenta E5 y K2.
- **Depende de:** `maestro-terceros`, `motor-avisos`
- **Eventos que sube:** `maestro-terceros.ficha.request`, `motor-avisos.producir.request`
- **Eventos que publica:** `vencimiento-pago.calcular.response`, `vencimiento-pago.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"vencimiento-pago"` · `subscribes:` ["vencimiento-pago.calcular.request", "contabilidad.asiento_asentado", "contabilidad.criterio_fijado"] · `publishes:` ["vencimiento-pago.calcular.response", "vencimiento-pago.calcular.failed"]
- **C · index.js:** `class VencimientoPago extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','vencimiento-pago.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `maestro-terceros.ficha.request`, `motor-avisos.producir.request` · publica → `vencimiento-pago.calcular.response`, `vencimiento-pago.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `rappel-pronto-pago` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `RappelProntoPago` (HOJA N7) · acción **CONSTRUIR**
- **Propósito:** Descuentos/rappels/anticipos que ajustan el coste REAL de la compra a lo pagado.
- **Depende de:** `cuenta-proveedor`, `escritor-diario`
- **Eventos que sube:** `cuenta-proveedor.saldo.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `rappel-pronto-pago.ajustar.response`, `rappel-pronto-pago.ajustar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"rappel-pronto-pago"` · `subscribes:` ["rappel-pronto-pago.ajustar.request", "contabilidad.asiento_asentado"] · `publishes:` ["rappel-pronto-pago.ajustar.response", "rappel-pronto-pago.ajustar.failed"]
- **C · index.js:** `class RappelProntoPago extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_ajustar(input) → { status, data }`
- **E · handler:** `onAjustarRequest(e) → this._atender(e,'ajustar','rappel-pronto-pago.ajustar.response', d=>this._ajustar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cuenta-proveedor.saldo.request`, `escritor-diario.asentar.request` · publica → `rappel-pronto-pago.ajustar.response`, `rappel-pronto-pago.ajustar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `antiguedad-de-saldos` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `AntiguedadSaldos` (HOJA N8) · acción **CONSTRUIR**
- **Propósito:** Lo pendiente clasificado por vencimiento: quién y cuánto está vencido (espejo de N6 del cobro).
- **Depende de:** `vencimiento-pago`, `motor-avisos`
- **Eventos que sube:** `vencimiento-pago.calcular.request`, `motor-avisos.producir.request`
- **Eventos que publica:** `antiguedad-de-saldos.clasificar.response`, `antiguedad-de-saldos.clasificar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"antiguedad-de-saldos"` · `subscribes:` ["antiguedad-de-saldos.clasificar.request", "contabilidad.asiento_asentado"] · `publishes:` ["antiguedad-de-saldos.clasificar.response", "antiguedad-de-saldos.clasificar.failed"]
- **C · index.js:** `class AntiguedadSaldos extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_clasificar(input) → { status, data }`
- **E · handler:** `onClasificarRequest(e) → this._atender(e,'clasificar','antiguedad-de-saldos.clasificar.response', d=>this._clasificar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `vencimiento-pago.calcular.request`, `motor-avisos.producir.request` · publica → `antiguedad-de-saldos.clasificar.response`, `antiguedad-de-saldos.clasificar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `emision-factura-venta` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `EmisionFacturaVenta` (HOJA O1) · acción **CONSTRUIR**
- **Propósito:** Cara emitida con serie/numeración. Número duplicado = corrupción -> UN escritor.
- **Depende de:** `registro-verifactu`, `factura-electronica`, `escritor-diario`, `maestro-terceros`, `expediente-documental`
- **Eventos que sube:** `registro-verifactu.encadenar.request`, `factura-electronica.entrar.request`, `escritor-diario.asentar.request`, `maestro-terceros.ficha.request`, `expediente-documental.archivar.request`
- **Eventos que publica:** `emision-factura-venta.emitir.response`, `emision-factura-venta.emitir.failed`, `contabilidad.factura_emitida`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"emision-factura-venta"` · `subscribes:` ["emision-factura-venta.emitir.request"] · `publishes:` ["emision-factura-venta.emitir.response", "emision-factura-venta.emitir.failed", "contabilidad.factura_emitida"]
- **C · index.js:** `class EmisionFacturaVenta extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_emitir(input) → { status, data }`
- **E · handler:** `onEmitirRequest(e) → this._atender(e,'emitir','emision-factura-venta.emitir.response', d=>this._emitir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `registro-verifactu.encadenar.request`, `factura-electronica.entrar.request`, `escritor-diario.asentar.request`, `maestro-terceros.ficha.request`, `expediente-documental.archivar.request` · publica → `emision-factura-venta.emitir.response`, `emision-factura-venta.emitir.failed`, `contabilidad.factura_emitida`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `factura-rectificativa` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `FacturaRectificativa` (HOJA O2) · acción **CONSTRUIR**
- **Propósito:** Corrección comercial POSTERIOR a la emisión (abono/devolución/descuento) que NO borra nada.
- **Depende de:** `emision-factura-venta`, `escritor-diario`
- **Eventos que sube:** `emision-factura-venta.emitir.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `factura-rectificativa.calcular.response`, `factura-rectificativa.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.factura_emitida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"factura-rectificativa"` · `subscribes:` ["factura-rectificativa.calcular.request", "contabilidad.factura_emitida"] · `publishes:` ["factura-rectificativa.calcular.response", "factura-rectificativa.calcular.failed"]
- **C · index.js:** `class FacturaRectificativa extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','factura-rectificativa.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `emision-factura-venta.emitir.request`, `escritor-diario.asentar.request` · publica → `factura-rectificativa.calcular.response`, `factura-rectificativa.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `panel-proceso-contable` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `PanelProcesoContable` (HOJA P1) · acción **CONSTRUIR**
- **Propósito:** Qué entra, qué se procesa, qué está en cola, qué falla. El 'display de cocina' de la contabilidad.
- **Depende de:** `encolado-excepcion`, `historial-proceso-contable`, `tasa-cobertura-entrada`
- **Eventos que sube:** `encolado-excepcion.encolar.request`, `historial-proceso-contable.anotar.request`, `tasa-cobertura-entrada.calcular.request`
- **Eventos que publica:** `panel-proceso-contable.latido.response`, `panel-proceso-contable.latido.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.excepcion_encolada`, `contabilidad.excepcion_desatascada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `metricas`
- **B · module.json:** `name:"panel-proceso-contable"` · `subscribes:` ["panel-proceso-contable.latido.request", "contabilidad.hecho_recibido", "contabilidad.excepcion_encolada", "contabilidad.excepcion_desatascada"] · `publishes:` ["panel-proceso-contable.latido.response", "panel-proceso-contable.latido.failed"]
- **C · index.js:** `class PanelProcesoContable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_latido(input) → { status, data }`
- **E · handler:** `onLatidoRequest(e) → this._atender(e,'latido','panel-proceso-contable.latido.response', d=>this._latido(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `encolado-excepcion.encolar.request`, `historial-proceso-contable.anotar.request`, `tasa-cobertura-entrada.calcular.request` · publica → `panel-proceso-contable.latido.response`, `panel-proceso-contable.latido.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `historial-proceso-contable` · `CUSTODIO` · eje `entrada`
- **Clase / hoja F2:** `HistorialProcesoContable` (HOJA P2) · acción **CONSTRUIR**
- **Propósito:** Registro append-only de lo procesado y lo fallado con su rastro. UN escritor.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `historial-proceso-contable.anotar.response`, `historial-proceso-contable.anotar.failed`, `contabilidad.proceso_anotado`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.excepcion_encolada`, `contabilidad.excepcion_desatascada`, `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager` + `metricas`
- **B · module.json:** `name:"historial-proceso-contable"` · `subscribes:` ["historial-proceso-contable.anotar.request", "contabilidad.hecho_recibido", "contabilidad.excepcion_encolada", "contabilidad.excepcion_desatascada", "contabilidad.asiento_asentado"] · `publishes:` ["historial-proceso-contable.anotar.response", "historial-proceso-contable.anotar.failed", "contabilidad.proceso_anotado"]
- **C · index.js:** `class HistorialProcesoContable extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_anotar(input) → { status, data }`
- **E · handler:** `onAnotarRequest(e) → this._atender(e,'anotar','historial-proceso-contable.anotar.response', d=>this._anotar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `historial-proceso-contable.anotar.response`, `historial-proceso-contable.anotar.failed`, `contabilidad.proceso_anotado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `desatasco-entrada` · `MICRO-AGENTE` · eje `entrada`
- **Clase / hoja F2:** `DesatascoEntrada` (HOJA P3) · acción **CONSTRUIR**
- **Propósito:** Resolver/reencolar/descartar una excepción CON motivo. Es la ACCIÓN que completa A8. ÚNICO MicroAgente que publica.
- **Depende de:** `escritor-diario`, `encolado-excepcion`, `regla-contrapartida`, `historial-proceso-contable`
- **Eventos que sube:** `escritor-diario.asentar.request`, `encolado-excepcion.encolar.request`, `regla-contrapartida.aplicar.request`, `historial-proceso-contable.anotar.request`
- **Eventos que publica:** `desatasco-entrada.juzgar.response`, `desatasco-entrada.juzgar.failed`, `contabilidad.excepcion_desatascada`
- **Escucha (subscribes de dominio):** `contabilidad.excepcion_encolada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"desatasco-entrada"` · `subscribes:` ["desatasco-entrada.juzgar.request", "contabilidad.excepcion_encolada"] · `publishes:` ["desatasco-entrada.juzgar.response", "desatasco-entrada.juzgar.failed", "contabilidad.excepcion_desatascada"]
- **C · index.js:** `class DesatascoEntrada extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','desatasco-entrada.juzgar.response', d=>this._juzgar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `encolado-excepcion.encolar.request`, `regla-contrapartida.aplicar.request`, `historial-proceso-contable.anotar.request` · publica → `desatasco-entrada.juzgar.response`, `desatasco-entrada.juzgar.failed`, `contabilidad.excepcion_desatascada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `tasa-cobertura-entrada` · `REFLEJO` · eje `entrada`
- **Clase / hoja F2:** `TasaCoberturaEntrada` (HOJA P4) · acción **CONSTRUIR**
- **Propósito:** Proporción de hechos que entran SIN intervención vs caen a cola. LEE la métrica única.
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `completitud-cobertura.medir.request`
- **Eventos que publica:** `tasa-cobertura-entrada.calcular.response`, `tasa-cobertura-entrada.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.excepcion_encolada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `metricas` + `completitud-cobertura`
- **B · module.json:** `name:"tasa-cobertura-entrada"` · `subscribes:` ["tasa-cobertura-entrada.calcular.request", "contabilidad.hecho_recibido", "contabilidad.excepcion_encolada"] · `publishes:` ["tasa-cobertura-entrada.calcular.response", "tasa-cobertura-entrada.calcular.failed"]
- **C · index.js:** `class TasaCoberturaEntrada extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','tasa-cobertura-entrada.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `completitud-cobertura.medir.request` · publica → `tasa-cobertura-entrada.calcular.response`, `tasa-cobertura-entrada.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### ▸ EJE `libro` — GRUPO B·C·E·L·M — LIBRO (32)

### `catalogo-cuentas` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `CatalogoCuentas` (HOJA B1) · acción **CONSTRUIR**
- **Propósito:** Plan contable declarable/importable del asesor. UN escritor.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `catalogo-cuentas.anadir.response`, `catalogo-cuentas.anadir.failed`, `catalogo-cuentas.buscar.response`, `catalogo-cuentas.buscar.failed`, `contabilidad.plan_cuentas_declarado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"catalogo-cuentas"` · `subscribes:` ["catalogo-cuentas.anadir.request", "catalogo-cuentas.buscar.request"] · `publishes:` ["catalogo-cuentas.anadir.response", "catalogo-cuentas.anadir.failed", "catalogo-cuentas.buscar.response", "catalogo-cuentas.buscar.failed", "contabilidad.plan_cuentas_declarado"]
- **C · index.js:** `class CatalogoCuentas extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_anadir(input) → { status, data }` · `_buscar(input) → { status, data }`
- **E · handler:** `onAnadirRequest(e) → this._atender(e,'anadir','catalogo-cuentas.anadir.response', d=>this._anadir(d))` · **CLASE: ORDEN**
- **E · handler:** `onBuscarRequest(e) → this._atender(e,'buscar','catalogo-cuentas.buscar.response', d=>this._buscar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `catalogo-cuentas.anadir.response`, `catalogo-cuentas.anadir.failed`, `catalogo-cuentas.buscar.response`, `catalogo-cuentas.buscar.failed`, `contabilidad.plan_cuentas_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `escritor-diario` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `EscritorDiario` (HOJA B2) · acción **CONSTRUIR**
- **Propósito:** ES EL custodio del libro. Single-writer por parcela. Rechaza si suma debe <> suma haber.
- **Depende de:** `traza-asiento`, `frontera-planos`, `periodificacion`, `deduplicacion-hecho`
- **Eventos que sube:** `traza-asiento.registrar.request`, `frontera-planos.verificar.request`, `periodificacion.imputar.request`, `deduplicacion-hecho.es_nuevo.request`
- **Eventos que publica:** `escritor-diario.asentar.response`, `escritor-diario.asentar.failed`, `contabilidad.asiento_asentado`
- **Escucha (subscribes de dominio):** `contabilidad.ajuste_entrado`, `contabilidad.hecho_recibido`, `contabilidad.hecho_rectificado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"escritor-diario"` · `subscribes:` ["escritor-diario.asentar.request", "contabilidad.ajuste_entrado", "contabilidad.hecho_recibido", "contabilidad.hecho_rectificado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["escritor-diario.asentar.response", "escritor-diario.asentar.failed", "contabilidad.asiento_asentado"]
- **C · index.js:** `class EscritorDiario extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_asentar(input) → { status, data }`
- **E · handler:** `onAsentarRequest(e) → this._atender(e,'asentar','escritor-diario.asentar.response', d=>this._asentar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `traza-asiento.registrar.request`, `frontera-planos.verificar.request`, `periodificacion.imputar.request`, `deduplicacion-hecho.es_nuevo.request` · publica → `escritor-diario.asentar.response`, `escritor-diario.asentar.failed`, `contabilidad.asiento_asentado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `mayor-balanza` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `MayorBalanza` (HOJA B3) · acción **CONSTRUIR**
- **Propósito:** Saldos por cuenta DERIVADOS del diario. Cálculo determinista; un test lo afirma.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `escritor-diario.asentar.request`
- **Eventos que publica:** `mayor-balanza.saldos.response`, `mayor-balanza.saldos.failed`, `mayor-balanza.balanza.response`, `mayor-balanza.balanza.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"mayor-balanza"` · `subscribes:` ["mayor-balanza.saldos.request", "mayor-balanza.balanza.request", "contabilidad.asiento_asentado"] · `publishes:` ["mayor-balanza.saldos.response", "mayor-balanza.saldos.failed", "mayor-balanza.balanza.response", "mayor-balanza.balanza.failed"]
- **C · index.js:** `class MayorBalanza extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_saldos(input) → { status, data }` · `_balanza(input) → { status, data }`
- **E · handler:** `onSaldosRequest(e) → this._atender(e,'saldos','mayor-balanza.saldos.response', d=>this._saldos(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onBalanzaRequest(e) → this._atender(e,'balanza','mayor-balanza.balanza.response', d=>this._balanza(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request` · publica → `mayor-balanza.saldos.response`, `mayor-balanza.saldos.failed`, `mayor-balanza.balanza.response`, `mayor-balanza.balanza.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `traza-asiento` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `TrazaAsiento` (HOJA B4) · acción **CONSTRUIR**
- **Propósito:** Registro inmutable (quién/cuándo creó cada asiento), append-only. UN escritor.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `traza-asiento.registrar.response`, `traza-asiento.registrar.failed`, `contabilidad.traza_registrada`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ajuste_entrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"traza-asiento"` · `subscribes:` ["traza-asiento.registrar.request", "contabilidad.asiento_asentado", "contabilidad.ajuste_entrado"] · `publishes:` ["traza-asiento.registrar.response", "traza-asiento.registrar.failed", "contabilidad.traza_registrada"]
- **C · index.js:** `class TrazaAsiento extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_registrar(input) → { status, data }`
- **E · handler:** `onRegistrarRequest(e) → this._atender(e,'registrar','traza-asiento.registrar.response', d=>this._registrar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `traza-asiento.registrar.response`, `traza-asiento.registrar.failed`, `contabilidad.traza_registrada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `asiento-ajuste` · `PUENTE` · eje `libro`
- **Clase / hoja F2:** `AsientoAjuste` (HOJA B5) · acción **CONSTRUIR**
- **Propósito:** Camino por el que la corrección del asesor ENTRA al libro sin borrar. Traza intacta.
- **Depende de:** `escritor-diario`, `traza-asiento`
- **Eventos que sube:** `escritor-diario.asentar.request`, `traza-asiento.registrar.request`
- **Eventos que publica:** `asiento-ajuste.entrar.response`, `asiento-ajuste.entrar.failed`, `contabilidad.ajuste_entrado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"asiento-ajuste"` · `subscribes:` ["asiento-ajuste.entrar.request"] · `publishes:` ["asiento-ajuste.entrar.response", "asiento-ajuste.entrar.failed", "contabilidad.ajuste_entrado"]
- **C · index.js:** `class AsientoAjuste extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','asiento-ajuste.entrar.response', d=>this._entrar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `traza-asiento.registrar.request` · publica → `asiento-ajuste.entrar.response`, `asiento-ajuste.entrar.failed`, `contabilidad.ajuste_entrado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puerto-plan-contable` · `CONVERSOR` · eje `libro`
- **Clase / hoja F2:** `PuertoPlanContable` (HOJA B6) · acción **CONSTRUIR**
- **Propósito:** Frontera de codificación del plan (import/export). Cruce de formatos.
- **Depende de:** `catalogo-cuentas`
- **Eventos que sube:** `catalogo-cuentas.buscar.request`
- **Eventos que publica:** `puerto-plan-contable.entrar.response`, `puerto-plan-contable.entrar.failed`, `puerto-plan-contable.salir.response`, `puerto-plan-contable.salir.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"puerto-plan-contable"` · `subscribes:` ["puerto-plan-contable.entrar.request", "puerto-plan-contable.salir.request"] · `publishes:` ["puerto-plan-contable.entrar.response", "puerto-plan-contable.entrar.failed", "puerto-plan-contable.salir.response", "puerto-plan-contable.salir.failed"]
- **C · index.js:** `class PuertoPlanContable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }` · `_salir(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','puerto-plan-contable.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onSalirRequest(e) → this._atender(e,'salir','puerto-plan-contable.salir.response', d=>this._salir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `catalogo-cuentas.buscar.request` · publica → `puerto-plan-contable.entrar.response`, `puerto-plan-contable.entrar.failed`, `puerto-plan-contable.salir.response`, `puerto-plan-contable.salir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `balance-situacion` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `BalanceSituacion` (HOJA C1) · acción **CONSTRUIR**
- **Propósito:** Activo/pasivo/patrimonio derivado del mayor. Invariante: ACTIVO = PASIVO + PATRIMONIO.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `mayor-balanza.saldos.request`
- **Eventos que publica:** `balance-situacion.calcular.response`, `balance-situacion.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"balance-situacion"` · `subscribes:` ["balance-situacion.calcular.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["balance-situacion.calcular.response", "balance-situacion.calcular.failed"]
- **C · index.js:** `class BalanceSituacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','balance-situacion.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request` · publica → `balance-situacion.calcular.response`, `balance-situacion.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cuenta-resultados` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `CuentaResultados` (HOJA C2) · acción **CONSTRUIR**
- **Propósito:** Ingresos/gastos/resultado derivado del mayor. Determinista.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `mayor-balanza.saldos.request`
- **Eventos que publica:** `cuenta-resultados.calcular.response`, `cuenta-resultados.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cuenta-resultados"` · `subscribes:` ["cuenta-resultados.calcular.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["cuenta-resultados.calcular.response", "cuenta-resultados.calcular.failed"]
- **C · index.js:** `class CuentaResultados extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','cuenta-resultados.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request` · publica → `cuenta-resultados.calcular.response`, `cuenta-resultados.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `periodificacion` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `Periodificacion` (HOJA C3) · acción **CONSTRUIR**
- **Propósito:** Imputa cada hecho a su periodo con el criterio declarado; CONSERVA fecha operación y fecha valor.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `periodificacion.imputar.response`, `periodificacion.imputar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"periodificacion"` · `subscribes:` ["periodificacion.imputar.request"] · `publishes:` ["periodificacion.imputar.response", "periodificacion.imputar.failed"]
- **C · index.js:** `class Periodificacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_imputar(input) → { status, data }`
- **E · handler:** `onImputarRequest(e) → this._atender(e,'imputar','periodificacion.imputar.response', d=>this._imputar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `periodificacion.imputar.response`, `periodificacion.imputar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cierre-ejercicio` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `CierreEjercicio` (HOJA C4) · acción **CONSTRUIR**
- **Propósito:** Cierra el periodo con ajustes. IRREVERSIBLE salvo ajuste. El DÍA cierra la caja; el MES la contabilidad.
- **Depende de:** `plan-amortizacion`, `escritor-diario`, `aviso-cuadre`
- **Eventos que sube:** `plan-amortizacion.cuota_del_periodo.request`, `escritor-diario.asentar.request`, `aviso-cuadre.avisar.request`
- **Eventos que publica:** `cierre-ejercicio.cerrar.response`, `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed`, `contabilidad.ejercicio_cerrado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cierre-ejercicio"` · `subscribes:` ["cierre-ejercicio.cerrar.request", "cierre-ejercicio.reabrir.request"] · `publishes:` ["cierre-ejercicio.cerrar.response", "cierre-ejercicio.cerrar.failed", "cierre-ejercicio.reabrir.response", "cierre-ejercicio.reabrir.failed", "contabilidad.ejercicio_cerrado"]
- **C · index.js:** `class CierreEjercicio extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_cerrar(input) → { status, data }` · `_reabrir(input) → { status, data }`
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','cierre-ejercicio.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN**
- **E · handler:** `onReabrirRequest(e) → this._atender(e,'reabrir','cierre-ejercicio.reabrir.response', d=>this._reabrir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `plan-amortizacion.cuota_del_periodo.request`, `escritor-diario.asentar.request`, `aviso-cuadre.avisar.request` · publica → `cierre-ejercicio.cerrar.response`, `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed`, `contabilidad.ejercicio_cerrado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `apertura-ejercicio` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `AperturaEjercicio` (HOJA C5) · acción **CONSTRUIR**
- **Propósito:** Asientos de apertura DERIVADOS del cierre anterior. Quien ESCRIBE y anuncia es B2.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `escritor-diario.asentar.request`
- **Eventos que publica:** `apertura-ejercicio.generar.response`, `apertura-ejercicio.generar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"apertura-ejercicio"` · `subscribes:` ["apertura-ejercicio.generar.request", "contabilidad.ejercicio_cerrado"] · `publishes:` ["apertura-ejercicio.generar.response", "apertura-ejercicio.generar.failed"]
- **C · index.js:** `class AperturaEjercicio extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_generar(input) → { status, data }`
- **E · handler:** `onGenerarRequest(e) → this._atender(e,'generar','apertura-ejercicio.generar.response', d=>this._generar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request` · publica → `apertura-ejercicio.generar.response`, `apertura-ejercicio.generar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `aviso-cuadre` · `PUENTE` · eje `libro`
- **Clase / hoja F2:** `AvisoCuadre` (HOJA C6) · acción **CONSTRUIR**
- **Propósito:** NO finge el cuadre: si falta cobertura, avisa. LEE la métrica única; no la recalcula.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `aviso-cuadre.avisar.response`, `aviso-cuadre.avisar.failed`, `contabilidad.cuadre_no_cuadra`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"aviso-cuadre"` · `subscribes:` ["aviso-cuadre.avisar.request"] · `publishes:` ["aviso-cuadre.avisar.response", "aviso-cuadre.avisar.failed", "contabilidad.cuadre_no_cuadra"]
- **C · index.js:** `class AvisoCuadre extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_avisar(input) → { status, data }`
- **E · handler:** `onAvisarRequest(e) → this._atender(e,'avisar','aviso-cuadre.avisar.response', d=>this._avisar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `aviso-cuadre.avisar.response`, `aviso-cuadre.avisar.failed`, `contabilidad.cuadre_no_cuadra`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `conciliacion-bancaria` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `ConciliacionBancaria` (HOJA E1) · acción **CONSTRUIR**
- **Propósito:** Cruce extracto <-> libro por clave natural y reglas. El JUICIO vive en E7/E8, no se duplica aquí.
- **Depende de:** `escritor-diario`, `partida-no-identificada`, `partida-conciliatoria`
- **Eventos que sube:** `escritor-diario.asentar.request`, `partida-no-identificada.juzgar.request`, `partida-conciliatoria.desfase.request`
- **Eventos que publica:** `conciliacion-bancaria.cruzar.response`, `conciliacion-bancaria.cruzar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.movimiento_regla_declarada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"conciliacion-bancaria"` · `subscribes:` ["conciliacion-bancaria.cruzar.request", "contabilidad.asiento_asentado", "contabilidad.movimiento_regla_declarada"] · `publishes:` ["conciliacion-bancaria.cruzar.response", "conciliacion-bancaria.cruzar.failed"]
- **C · index.js:** `class ConciliacionBancaria extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_cruzar(input) → { status, data }`
- **E · handler:** `onCruzarRequest(e) → this._atender(e,'cruzar','conciliacion-bancaria.cruzar.response', d=>this._cruzar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `partida-no-identificada.juzgar.request`, `partida-conciliatoria.desfase.request` · publica → `conciliacion-bancaria.cruzar.response`, `conciliacion-bancaria.cruzar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puerto-extracto` · `CONVERSOR` · eje `libro`
- **Clase / hoja F2:** `PuertoExtracto` (HOJA E2) · acción **CONSTRUIR**
- **Propósito:** Frontera de canal/formato del extracto; un adaptador por banco; si falta, se crea.
- **Depende de:** `conciliacion-bancaria`
- **Eventos que sube:** `conciliacion-bancaria.cruzar.request`
- **Eventos que publica:** `puerto-extracto.entrar.response`, `puerto-extracto.entrar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `credential-manager`
- **B · module.json:** `name:"puerto-extracto"` · `subscribes:` ["puerto-extracto.entrar.request"] · `publishes:` ["puerto-extracto.entrar.response", "puerto-extracto.entrar.failed"]
- **C · index.js:** `class PuertoExtracto extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','puerto-extracto.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `conciliacion-bancaria.cruzar.request` · publica → `puerto-extracto.entrar.response`, `puerto-extracto.entrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cuadre-cobro-pago` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `CuadreCobroPago` (HOJA E3) · acción **CONSTRUIR**
- **Propósito:** Clave natural compartida: un movimiento bancario = un cobro/pago. Determinista.
- **Depende de:** `escritor-diario`, `partida-no-identificada`
- **Eventos que sube:** `escritor-diario.asentar.request`, `partida-no-identificada.juzgar.request`
- **Eventos que publica:** `cuadre-cobro-pago.cuadrar.response`, `cuadre-cobro-pago.cuadrar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cuadre-cobro-pago"` · `subscribes:` ["cuadre-cobro-pago.cuadrar.request", "contabilidad.asiento_asentado"] · `publishes:` ["cuadre-cobro-pago.cuadrar.response", "cuadre-cobro-pago.cuadrar.failed"]
- **C · index.js:** `class CuadreCobroPago extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_cuadrar(input) → { status, data }`
- **E · handler:** `onCuadrarRequest(e) → this._atender(e,'cuadrar','cuadre-cobro-pago.cuadrar.response', d=>this._cuadrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `partida-no-identificada.juzgar.request` · publica → `cuadre-cobro-pago.cuadrar.response`, `cuadre-cobro-pago.cuadrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `saldo-tesoreria` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `SaldoTesoreria` (HOJA E4) · acción **CONSTRUIR**
- **Propósito:** Posición real de dinero por cuenta. Derivación determinista.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `mayor-balanza.saldos.request`
- **Eventos que publica:** `saldo-tesoreria.calcular.response`, `saldo-tesoreria.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.cuenta_bancaria_declarada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"saldo-tesoreria"` · `subscribes:` ["saldo-tesoreria.calcular.request", "contabilidad.asiento_asentado", "contabilidad.cuenta_bancaria_declarada"] · `publishes:` ["saldo-tesoreria.calcular.response", "saldo-tesoreria.calcular.failed"]
- **C · index.js:** `class SaldoTesoreria extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','saldo-tesoreria.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request` · publica → `saldo-tesoreria.calcular.response`, `saldo-tesoreria.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `prevision-caja` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `PrevisionCaja` (HOJA E5) · acción **CONSTRUIR**
- **Propósito:** Proyecta entradas/salidas desde los compromisos con la política declarada. Determinista.
- **Depende de:** `saldo-tesoreria`, `motor-avisos`
- **Eventos que sube:** `saldo-tesoreria.calcular.request`, `motor-avisos.producir.request`
- **Eventos que publica:** `prevision-caja.proyectar.response`, `prevision-caja.proyectar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"prevision-caja"` · `subscribes:` ["prevision-caja.proyectar.request", "contabilidad.asiento_asentado", "contabilidad.criterio_fijado"] · `publishes:` ["prevision-caja.proyectar.response", "prevision-caja.proyectar.failed"]
- **C · index.js:** `class PrevisionCaja extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_proyectar(input) → { status, data }`
- **E · handler:** `onProyectarRequest(e) → this._atender(e,'proyectar','prevision-caja.proyectar.response', d=>this._proyectar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `saldo-tesoreria.calcular.request`, `motor-avisos.producir.request` · publica → `prevision-caja.proyectar.response`, `prevision-caja.proyectar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `partida-no-identificada` · `MICRO-AGENTE` · eje `libro`
- **Clase / hoja F2:** `PartidaNoIdentificada` (HOJA E7) · acción **CONSTRUIR**
- **Propósito:** Reconoce y clasifica el movimiento sin contrapartida (comisión/interés/devolución). PROPONE.
- **Depende de:** `regla-movimiento-bancario`, `encolado-excepcion`
- **Eventos que sube:** `regla-movimiento-bancario.aplicar.request`, `encolado-excepcion.encolar.request`
- **Eventos que publica:** `partida-no-identificada.juzgar.response`, `partida-no-identificada.juzgar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.movimiento_regla_declarada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"partida-no-identificada"` · `subscribes:` ["partida-no-identificada.juzgar.request", "contabilidad.movimiento_regla_declarada"] · `publishes:` ["partida-no-identificada.juzgar.response", "partida-no-identificada.juzgar.failed"]
- **C · index.js:** `class PartidaNoIdentificada extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','partida-no-identificada.juzgar.response', d=>this._juzgar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `regla-movimiento-bancario.aplicar.request`, `encolado-excepcion.encolar.request` · publica → `partida-no-identificada.juzgar.response`, `partida-no-identificada.juzgar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `regla-movimiento-bancario` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `ReglaMovimientoBancario` (HOJA E8) · acción **CONSTRUIR**
- **Propósito:** Parcela de reglas declarables/aprendidas ('esta comisión -> esta cuenta'). Ratificación ÚNICA por L10.
- **Depende de:** `ratificacion-regla-aprendida`, `escritor-diario`
- **Eventos que sube:** `ratificacion-regla-aprendida.ratificar.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `regla-movimiento-bancario.aplicar.response`, `regla-movimiento-bancario.aplicar.failed`, `regla-movimiento-bancario.proponer.response`, `regla-movimiento-bancario.proponer.failed`, `regla-movimiento-bancario.declarar.response`, `regla-movimiento-bancario.declarar.failed`, `contabilidad.movimiento_regla_declarada`
- **Escucha (subscribes de dominio):** `contabilidad.regla_ratificada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"regla-movimiento-bancario"` · `subscribes:` ["regla-movimiento-bancario.aplicar.request", "regla-movimiento-bancario.proponer.request", "regla-movimiento-bancario.declarar.request", "contabilidad.regla_ratificada"] · `publishes:` ["regla-movimiento-bancario.aplicar.response", "regla-movimiento-bancario.aplicar.failed", "regla-movimiento-bancario.proponer.response", "regla-movimiento-bancario.proponer.failed", "regla-movimiento-bancario.declarar.response", "regla-movimiento-bancario.declarar.failed", "contabilidad.movimiento_regla_declarada"]
- **C · index.js:** `class ReglaMovimientoBancario extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_aplicar(input) → { status, data }` · `_proponer(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onAplicarRequest(e) → this._atender(e,'aplicar','regla-movimiento-bancario.aplicar.response', d=>this._aplicar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onProponerRequest(e) → this._atender(e,'proponer','regla-movimiento-bancario.proponer.response', d=>this._proponer(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','regla-movimiento-bancario.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `ratificacion-regla-aprendida.ratificar.request`, `escritor-diario.asentar.request` · publica → `regla-movimiento-bancario.aplicar.response`, `regla-movimiento-bancario.aplicar.failed`, `regla-movimiento-bancario.proponer.response`, `regla-movimiento-bancario.proponer.failed`, `regla-movimiento-bancario.declarar.response`, `regla-movimiento-bancario.declarar.failed`, `contabilidad.movimiento_regla_declarada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `partida-conciliatoria` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `PartidaConciliatoria` (HOJA E9) · acción **CONSTRUIR**
- **Propósito:** Partidas en tránsito que explican el desfase. El desfase se EXPLICA, no se esconde.
- **Depende de:** `saldo-tesoreria`
- **Eventos que sube:** `saldo-tesoreria.calcular.request`
- **Eventos que publica:** `partida-conciliatoria.desfase.response`, `partida-conciliatoria.desfase.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"partida-conciliatoria"` · `subscribes:` ["partida-conciliatoria.desfase.request", "contabilidad.asiento_asentado"] · `publishes:` ["partida-conciliatoria.desfase.response", "partida-conciliatoria.desfase.failed"]
- **C · index.js:** `class PartidaConciliatoria extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_desfase(input) → { status, data }`
- **E · handler:** `onDesfaseRequest(e) → this._atender(e,'desfase','partida-conciliatoria.desfase.response', d=>this._desfase(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `saldo-tesoreria.calcular.request` · publica → `partida-conciliatoria.desfase.response`, `partida-conciliatoria.desfase.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `informe-conciliacion` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `InformeConciliacion` (HOJA E10) · acción **CONSTRUIR**
- **Propósito:** Documento de cuadre saldo banco <-> saldo contable ajustado. La PRUEBA de que cuadra.
- **Depende de:** `conciliacion-bancaria`, `partida-conciliatoria`
- **Eventos que sube:** `conciliacion-bancaria.cruzar.request`, `partida-conciliatoria.desfase.request`
- **Eventos que publica:** `informe-conciliacion.componer.response`, `informe-conciliacion.componer.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"informe-conciliacion"` · `subscribes:` ["informe-conciliacion.componer.request", "contabilidad.asiento_asentado"] · `publishes:` ["informe-conciliacion.componer.response", "informe-conciliacion.componer.failed"]
- **C · index.js:** `class InformeConciliacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handler:** `onComponerRequest(e) → this._atender(e,'componer','informe-conciliacion.componer.response', d=>this._componer(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `conciliacion-bancaria.cruzar.request`, `partida-conciliatoria.desfase.request` · publica → `informe-conciliacion.componer.response`, `informe-conciliacion.componer.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `maestro-cuentas-bancarias` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `MaestroCuentasBancarias` (HOJA E11) · acción **CONSTRUIR**
- **Propósito:** Parcela declarable de cuentas y su moneda. UN escritor. Sin él, 'el banco' es un número falso.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `maestro-cuentas-bancarias.declarar.response`, `maestro-cuentas-bancarias.declarar.failed`, `maestro-cuentas-bancarias.listar.response`, `maestro-cuentas-bancarias.listar.failed`, `contabilidad.cuenta_bancaria_declarada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"maestro-cuentas-bancarias"` · `subscribes:` ["maestro-cuentas-bancarias.declarar.request", "maestro-cuentas-bancarias.listar.request"] · `publishes:` ["maestro-cuentas-bancarias.declarar.response", "maestro-cuentas-bancarias.declarar.failed", "maestro-cuentas-bancarias.listar.response", "maestro-cuentas-bancarias.listar.failed", "contabilidad.cuenta_bancaria_declarada"]
- **C · index.js:** `class MaestroCuentasBancarias extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_declarar(input) → { status, data }` · `_listar(input) → { status, data }`
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','maestro-cuentas-bancarias.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **E · handler:** `onListarRequest(e) → this._atender(e,'listar','maestro-cuentas-bancarias.listar.response', d=>this._listar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `maestro-cuentas-bancarias.declarar.response`, `maestro-cuentas-bancarias.declarar.failed`, `maestro-cuentas-bancarias.listar.response`, `maestro-cuentas-bancarias.listar.failed`, `contabilidad.cuenta_bancaria_declarada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puerto-exportacion` · `CONVERSOR` · eje `libro`
- **Clase / hoja F2:** `PuertoExportacion` (HOJA L1) · acción **ADAPTAR**
- **Propósito:** Frontera de formatos contables estándar hacia el programa del asesor; si falta, se crea.
- **Depende de:** `asiento-ajuste`
- **Eventos que sube:** `asiento-ajuste.entrar.request`
- **Eventos que publica:** `puerto-exportacion.salir.response`, `puerto-exportacion.salir.failed`, `puerto-exportacion.entrar.response`, `puerto-exportacion.entrar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `facturacion/asesoria`
- **B · module.json:** `name:"puerto-exportacion"` · `subscribes:` ["puerto-exportacion.salir.request", "puerto-exportacion.entrar.request"] · `publishes:` ["puerto-exportacion.salir.response", "puerto-exportacion.salir.failed", "puerto-exportacion.entrar.response", "puerto-exportacion.entrar.failed"]
- **C · index.js:** `class PuertoExportacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_salir(input) → { status, data }` · `_entrar(input) → { status, data }`
- **E · handler:** `onSalirRequest(e) → this._atender(e,'salir','puerto-exportacion.salir.response', d=>this._salir(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','puerto-exportacion.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `asiento-ajuste.entrar.request` · publica → `puerto-exportacion.salir.response`, `puerto-exportacion.salir.failed`, `puerto-exportacion.entrar.response`, `puerto-exportacion.entrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **ADAPTA `facturacion/asesoria`:** su pipeline real existe (OCR/IA de documento; paquete fiscal al asesor) pero su contrato emite otro tópico — se adapta a `contabilidad.*` sin romper su proyecto.

### `vista-revisable` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `VistaRevisable` (HOJA L2) · acción **CONSTRUIR**
- **Propósito:** Muestra cada asiento/cálculo CON su origen: composición determinista de la traza. NO caja negra.
- **Depende de:** `traza-asiento`, `mayor-balanza`
- **Eventos que sube:** `traza-asiento.registrar.request`, `mayor-balanza.saldos.request`
- **Eventos que publica:** `vista-revisable.explicar.response`, `vista-revisable.explicar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"vista-revisable"` · `subscribes:` ["vista-revisable.explicar.request", "contabilidad.asiento_asentado"] · `publishes:` ["vista-revisable.explicar.response", "vista-revisable.explicar.failed"]
- **C · index.js:** `class VistaRevisable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_explicar(input) → { status, data }`
- **E · handler:** `onExplicarRequest(e) → this._atender(e,'explicar','vista-revisable.explicar.response', d=>this._explicar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `traza-asiento.registrar.request`, `mayor-balanza.saldos.request` · publica → `vista-revisable.explicar.response`, `vista-revisable.explicar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `flujo-firma` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `FlujoFirma` (HOJA L3) · acción **CONSTRUIR**
- **Propósito:** Parcela de estado revisado/firmado del asesor. El sistema NO firma: vence -> expira y RE-PREGUNTA.
- **Depende de:** `traza-asiento`
- **Eventos que sube:** `traza-asiento.registrar.request`
- **Eventos que publica:** `flujo-firma.firmar.response`, `flujo-firma.firmar.failed`, `flujo-firma.estado.response`, `flujo-firma.estado.failed`, `contabilidad.revision_firmada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"flujo-firma"` · `subscribes:` ["flujo-firma.firmar.request", "flujo-firma.estado.request"] · `publishes:` ["flujo-firma.firmar.response", "flujo-firma.firmar.failed", "flujo-firma.estado.response", "flujo-firma.estado.failed", "contabilidad.revision_firmada"]
- **C · index.js:** `class FlujoFirma extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_firmar(input) → { status, data }` · `_estado(input) → { status, data }`
- **E · handler:** `onFirmarRequest(e) → this._atender(e,'firmar','flujo-firma.firmar.response', d=>this._firmar(d))` · **CLASE: ORDEN**
- **E · handler:** `onEstadoRequest(e) → this._atender(e,'estado','flujo-firma.estado.response', d=>this._estado(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `traza-asiento.registrar.request` · publica → `flujo-firma.firmar.response`, `flujo-firma.firmar.failed`, `flujo-firma.estado.response`, `flujo-firma.estado.failed`, `contabilidad.revision_firmada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `expediente-documental` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `ExpedienteDocumental` (HOJA L7) · acción **CONSTRUIR**
- **Propósito:** Cada cifra con el documento origen ARCHIVADO y ENLAZADO. Registro inmutable, UN escritor.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `expediente-documental.archivar.response`, `expediente-documental.archivar.failed`, `expediente-documental.recuperar.response`, `expediente-documental.recuperar.failed`, `contabilidad.documento_archivado`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.documento_recibido`, `contabilidad.declaracion_justificada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"expediente-documental"` · `subscribes:` ["expediente-documental.archivar.request", "expediente-documental.recuperar.request", "contabilidad.asiento_asentado", "contabilidad.documento_recibido", "contabilidad.declaracion_justificada"] · `publishes:` ["expediente-documental.archivar.response", "expediente-documental.archivar.failed", "expediente-documental.recuperar.response", "expediente-documental.recuperar.failed", "contabilidad.documento_archivado"]
- **C · index.js:** `class ExpedienteDocumental extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_archivar(input) → { status, data }` · `_recuperar(input) → { status, data }`
- **E · handler:** `onArchivarRequest(e) → this._atender(e,'archivar','expediente-documental.archivar.response', d=>this._archivar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRecuperarRequest(e) → this._atender(e,'recuperar','expediente-documental.recuperar.response', d=>this._recuperar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `expediente-documental.archivar.response`, `expediente-documental.archivar.failed`, `expediente-documental.recuperar.response`, `expediente-documental.recuperar.failed`, `contabilidad.documento_archivado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `control-calidad-muestreo` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `ControlCalidadMuestreo` (HOJA L8) · acción **CONSTRUIR**
- **Propósito:** Selecciona lo que exige ojo humano por señales DURAS. Excepción + muestra, NO revisar todo.
- **Depende de:** `escritor-diario`, `regla-contrapartida`
- **Eventos que sube:** `escritor-diario.asentar.request`, `regla-contrapartida.aplicar.request`
- **Eventos que publica:** `control-calidad-muestreo.seleccionar.response`, `control-calidad-muestreo.seleccionar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.contrapartida_regla_declarada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"control-calidad-muestreo"` · `subscribes:` ["control-calidad-muestreo.seleccionar.request", "contabilidad.asiento_asentado", "contabilidad.contrapartida_regla_declarada"] · `publishes:` ["control-calidad-muestreo.seleccionar.response", "control-calidad-muestreo.seleccionar.failed"]
- **C · index.js:** `class ControlCalidadMuestreo extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_seleccionar(input) → { status, data }`
- **E · handler:** `onSeleccionarRequest(e) → this._atender(e,'seleccionar','control-calidad-muestreo.seleccionar.response', d=>this._seleccionar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `regla-contrapartida.aplicar.request` · publica → `control-calidad-muestreo.seleccionar.response`, `control-calidad-muestreo.seleccionar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cambio-desde-ultima-revision` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `CambioDesdeUltimaRevision` (HOJA L9) · acción **CONSTRUIR**
- **Propósito:** Asientos nuevos, ajustes y reglas cambiadas desde el último visto bueno. Cálculo de diferencia.
- **Depende de:** `escritor-diario`, `asiento-ajuste`, `flujo-firma`
- **Eventos que sube:** `escritor-diario.asentar.request`, `asiento-ajuste.entrar.request`, `flujo-firma.estado.request`
- **Eventos que publica:** `cambio-desde-ultima-revision.delta.response`, `cambio-desde-ultima-revision.delta.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ajuste_entrado`, `contabilidad.revision_firmada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cambio-desde-ultima-revision"` · `subscribes:` ["cambio-desde-ultima-revision.delta.request", "contabilidad.asiento_asentado", "contabilidad.ajuste_entrado", "contabilidad.revision_firmada"] · `publishes:` ["cambio-desde-ultima-revision.delta.response", "cambio-desde-ultima-revision.delta.failed"]
- **C · index.js:** `class CambioDesdeUltimaRevision extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_delta(input) → { status, data }`
- **E · handler:** `onDeltaRequest(e) → this._atender(e,'delta','cambio-desde-ultima-revision.delta.response', d=>this._delta(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `asiento-ajuste.entrar.request`, `flujo-firma.estado.request` · publica → `cambio-desde-ultima-revision.delta.response`, `cambio-desde-ultima-revision.delta.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `ratificacion-regla-aprendida` · `PUENTE` · eje `libro`
- **Clase / hoja F2:** `RatificacionReglaAprendida` (HOJA L10) · acción **CONSTRUIR**
- **Propósito:** El asesor ratifica o bloquea la regla ANTES de que actúe sobre el volumen. Gate humano ÚNICO para A6.2 y E8.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `ratificacion-regla-aprendida.ratificar.response`, `ratificacion-regla-aprendida.ratificar.failed`, `contabilidad.regla_ratificada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"ratificacion-regla-aprendida"` · `subscribes:` ["ratificacion-regla-aprendida.ratificar.request"] · `publishes:` ["ratificacion-regla-aprendida.ratificar.response", "ratificacion-regla-aprendida.ratificar.failed", "contabilidad.regla_ratificada"]
- **C · index.js:** `class RatificacionReglaAprendida extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_ratificar(input) → { status, data }`
- **E · handler:** `onRatificarRequest(e) → this._atender(e,'ratificar','ratificacion-regla-aprendida.ratificar.response', d=>this._ratificar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `ratificacion-regla-aprendida.ratificar.response`, `ratificacion-regla-aprendida.ratificar.failed`, `contabilidad.regla_ratificada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `frontera-planos` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `FronteraPlanos` (HOJA M1) · acción **CONSTRUIR**
- **Propósito:** Guarda verificable de que SÓLO se emiten cálculos, NUNCA hechos de negocio. Un test lo afirma.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `frontera-planos.verificar.response`, `frontera-planos.verificar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"frontera-planos"` · `subscribes:` ["frontera-planos.verificar.request"] · `publishes:` ["frontera-planos.verificar.response", "frontera-planos.verificar.failed"]
- **C · index.js:** `class FronteraPlanos extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_verificar(input) → { status, data }`
- **E · handler:** `onVerificarRequest(e) → this._atender(e,'verificar','frontera-planos.verificar.response', d=>this._verificar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `frontera-planos.verificar.response`, `frontera-planos.verificar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `single-writer` · `CUSTODIO` · eje `libro`
- **Clase / hoja F2:** `SingleWriter` (HOJA M2) · acción **CONSTRUIR**
- **Propósito:** La LEY que gobierna cada custodio: un solo escritor por parcela. Segundo escritor = corrupción.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `single-writer.reclamar.response`, `single-writer.reclamar.failed`, `single-writer.es_escritor.response`, `single-writer.es_escritor.failed`, `contabilidad.parcela_reclamada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"single-writer"` · `subscribes:` ["single-writer.reclamar.request", "single-writer.es_escritor.request"] · `publishes:` ["single-writer.reclamar.response", "single-writer.reclamar.failed", "single-writer.es_escritor.response", "single-writer.es_escritor.failed", "contabilidad.parcela_reclamada"]
- **C · index.js:** `class SingleWriter extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_reclamar(input) → { status, data }` · `_es_escritor(input) → { status, data }`
- **E · handler:** `onReclamarRequest(e) → this._atender(e,'reclamar','single-writer.reclamar.response', d=>this._reclamar(d))` · **CLASE: ORDEN**
- **E · handler:** `onEsEscritorRequest(e) → this._atender(e,'es_escritor','single-writer.es_escritor.response', d=>this._es_escritor(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `single-writer.reclamar.response`, `single-writer.reclamar.failed`, `single-writer.es_escritor.response`, `single-writer.es_escritor.failed`, `contabilidad.parcela_reclamada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `clave-natural` · `REFLEJO` · eje `libro`
- **Clase / hoja F2:** `ClaveNatural` (HOJA M3) · acción **CONSTRUIR**
- **Propósito:** Idempotencia determinista: reprocesar NO duplica ('un cierre = un asiento'). Un test lo afirma.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `clave-natural.calcular.response`, `clave-natural.calcular.failed`, `clave-natural.coincide.response`, `clave-natural.coincide.failed`
- **Escucha (subscribes de dominio):** `contabilidad.anclaje_cierre_declarado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"clave-natural"` · `subscribes:` ["clave-natural.calcular.request", "clave-natural.coincide.request", "contabilidad.anclaje_cierre_declarado"] · `publishes:` ["clave-natural.calcular.response", "clave-natural.calcular.failed", "clave-natural.coincide.response", "clave-natural.coincide.failed"]
- **C · index.js:** `class ClaveNatural extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }` · `_coincide(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','clave-natural.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCoincideRequest(e) → this._atender(e,'coincide','clave-natural.coincide.response', d=>this._coincide(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `clave-natural.calcular.response`, `clave-natural.calcular.failed`, `clave-natural.coincide.response`, `clave-natural.coincide.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### ▸ EJE `fiscal` — GRUPO D·G — FISCAL (22)

### `liquidacion-iva` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `LiquidacionIva` (HOJA D1) · acción **CONSTRUIR**
- **Propósito:** IVA devengado/soportado DERIVADO del libro. Tipos = dato. El IVA va por DEVENGO; C3 separa.
- **Depende de:** `mayor-balanza`, `perfil-administrativo`
- **Eventos que sube:** `mayor-balanza.saldos.request`, `perfil-administrativo.obligaciones.request`
- **Eventos que publica:** `liquidacion-iva.calcular.response`, `liquidacion-iva.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"liquidacion-iva"` · `subscribes:` ["liquidacion-iva.calcular.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["liquidacion-iva.calcular.response", "liquidacion-iva.calcular.failed"]
- **C · index.js:** `class LiquidacionIva extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','liquidacion-iva.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request`, `perfil-administrativo.obligaciones.request` · publica → `liquidacion-iva.calcular.response`, `liquidacion-iva.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `modelo-303` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `Modelo303` (HOJA D2) · acción **CONSTRUIR**
- **Propósito:** Construye el modelo trimestral desde la liquidación. Determinista.
- **Depende de:** `liquidacion-iva`
- **Eventos que sube:** `liquidacion-iva.calcular.request`
- **Eventos que publica:** `modelo-303.construir.response`, `modelo-303.construir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"modelo-303"` · `subscribes:` ["modelo-303.construir.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["modelo-303.construir.response", "modelo-303.construir.failed"]
- **C · index.js:** `class Modelo303 extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handler:** `onConstruirRequest(e) → this._atender(e,'construir','modelo-303.construir.response', d=>this._construir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `liquidacion-iva.calcular.request` · publica → `modelo-303.construir.response`, `modelo-303.construir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `modelo-390` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `Modelo390` (HOJA D3) · acción **CONSTRUIR**
- **Propósito:** Ídem anual; construcción determinista desde el libro.
- **Depende de:** `liquidacion-iva`
- **Eventos que sube:** `liquidacion-iva.calcular.request`
- **Eventos que publica:** `modelo-390.construir.response`, `modelo-390.construir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"modelo-390"` · `subscribes:` ["modelo-390.construir.request", "contabilidad.ejercicio_cerrado"] · `publishes:` ["modelo-390.construir.response", "modelo-390.construir.failed"]
- **C · index.js:** `class Modelo390 extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handler:** `onConstruirRequest(e) → this._atender(e,'construir','modelo-390.construir.response', d=>this._construir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `liquidacion-iva.calcular.request` · publica → `modelo-390.construir.response`, `modelo-390.construir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `retenciones` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `Retenciones` (HOJA D4) · acción **CONSTRUIR**
- **Propósito:** Retenciones practicadas/soportadas calculadas desde los asientos. Determinista.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `mayor-balanza.saldos.request`
- **Eventos que publica:** `retenciones.calcular.response`, `retenciones.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"retenciones"` · `subscribes:` ["retenciones.calcular.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["retenciones.calcular.response", "retenciones.calcular.failed"]
- **C · index.js:** `class Retenciones extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','retenciones.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request` · publica → `retenciones.calcular.response`, `retenciones.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `estimacion-is-irpf` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `EstimacionIsIrpf` (HOJA D5) · acción **CONSTRUIR**
- **Propósito:** Estimación del resultado fiscal con base DECLARADA. Nada se estima sin base.
- **Depende de:** `cuenta-resultados`, `perfil-administrativo`
- **Eventos que sube:** `cuenta-resultados.calcular.request`, `perfil-administrativo.obligaciones.request`
- **Eventos que publica:** `estimacion-is-irpf.estimar.response`, `estimacion-is-irpf.estimar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"estimacion-is-irpf"` · `subscribes:` ["estimacion-is-irpf.estimar.request", "contabilidad.ejercicio_cerrado"] · `publishes:` ["estimacion-is-irpf.estimar.response", "estimacion-is-irpf.estimar.failed"]
- **C · index.js:** `class EstimacionIsIrpf extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_estimar(input) → { status, data }`
- **E · handler:** `onEstimarRequest(e) → this._atender(e,'estimar','estimacion-is-irpf.estimar.response', d=>this._estimar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cuenta-resultados.calcular.request`, `perfil-administrativo.obligaciones.request` · publica → `estimacion-is-irpf.estimar.response`, `estimacion-is-irpf.estimar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `calendario-fiscal` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `CalendarioFiscal` (HOJA D6) · acción **CONSTRUIR**
- **Propósito:** Parcela de plazos declarables -> dispara aviso proactivo. La ley entra como dato. UN escritor.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `calendario-fiscal.proximos.response`, `calendario-fiscal.proximos.failed`, `calendario-fiscal.declarar.response`, `calendario-fiscal.declarar.failed`, `contabilidad.plazo_declarado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"calendario-fiscal"` · `subscribes:` ["calendario-fiscal.proximos.request", "calendario-fiscal.declarar.request"] · `publishes:` ["calendario-fiscal.proximos.response", "calendario-fiscal.proximos.failed", "calendario-fiscal.declarar.response", "calendario-fiscal.declarar.failed", "contabilidad.plazo_declarado"]
- **C · index.js:** `class CalendarioFiscal extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_proximos(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onProximosRequest(e) → this._atender(e,'proximos','calendario-fiscal.proximos.response', d=>this._proximos(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','calendario-fiscal.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `calendario-fiscal.proximos.response`, `calendario-fiscal.proximos.failed`, `calendario-fiscal.declarar.response`, `calendario-fiscal.declarar.failed`, `contabilidad.plazo_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `generador-modelo` · `PUENTE` · eje `fiscal`
- **Clase / hoja F2:** `GeneradorModelo` (HOJA D7) · acción **CONSTRUIR**
- **Propósito:** Salida al programa del asesor. Conecta por puerto. Formato ABIERTO. Aquí PREPARA, no presenta.
- **Depende de:** `estado-presentacion-fiscal`
- **Eventos que sube:** `estado-presentacion-fiscal.avanzar.request`
- **Eventos que publica:** `generador-modelo.exportar.response`, `generador-modelo.exportar.failed`, `contabilidad.modelo_exportado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"generador-modelo"` · `subscribes:` ["generador-modelo.exportar.request"] · `publishes:` ["generador-modelo.exportar.response", "generador-modelo.exportar.failed", "contabilidad.modelo_exportado"]
- **C · index.js:** `class GeneradorModelo extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_exportar(input) → { status, data }`
- **E · handler:** `onExportarRequest(e) → this._atender(e,'exportar','generador-modelo.exportar.response', d=>this._exportar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `estado-presentacion-fiscal.avanzar.request` · publica → `generador-modelo.exportar.response`, `generador-modelo.exportar.failed`, `contabilidad.modelo_exportado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `registro-verifactu` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `RegistroVerifactu` (HOJA D8) · acción **CONSTRUIR**
- **Propósito:** Huella/cadena INALTERABLE de la facturación, registro encadenado. UN escritor.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `registro-verifactu.encadenar.response`, `registro-verifactu.encadenar.failed`, `contabilidad.factura_encadenada`
- **Escucha (subscribes de dominio):** `contabilidad.factura_emitida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"registro-verifactu"` · `subscribes:` ["registro-verifactu.encadenar.request", "contabilidad.factura_emitida"] · `publishes:` ["registro-verifactu.encadenar.response", "registro-verifactu.encadenar.failed", "contabilidad.factura_encadenada"]
- **C · index.js:** `class RegistroVerifactu extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_encadenar(input) → { status, data }`
- **E · handler:** `onEncadenarRequest(e) → this._atender(e,'encadenar','registro-verifactu.encadenar.response', d=>this._encadenar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `registro-verifactu.encadenar.response`, `registro-verifactu.encadenar.failed`, `contabilidad.factura_encadenada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `factura-electronica` · `CONVERSOR` · eje `fiscal`
- **Clase / hoja F2:** `FacturaElectronica` (HOJA D9) · acción **CONSTRUIR**
- **Propósito:** Frontera de formato estructurado de la factura.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `factura-electronica.entrar.response`, `factura-electronica.entrar.failed`, `factura-electronica.salir.response`, `factura-electronica.salir.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `credential-manager`
- **B · module.json:** `name:"factura-electronica"` · `subscribes:` ["factura-electronica.entrar.request", "factura-electronica.salir.request"] · `publishes:` ["factura-electronica.entrar.response", "factura-electronica.entrar.failed", "factura-electronica.salir.response", "factura-electronica.salir.failed"]
- **C · index.js:** `class FacturaElectronica extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }` · `_salir(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','factura-electronica.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onSalirRequest(e) → this._atender(e,'salir','factura-electronica.salir.response', d=>this._salir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `factura-electronica.entrar.response`, `factura-electronica.entrar.failed`, `factura-electronica.salir.response`, `factura-electronica.salir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `estado-presentacion-fiscal` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `EstadoPresentacionFiscal` (HOJA D12) · acción **CONSTRUIR**
- **Propósito:** Ciclo de vida de cada obligación (pendiente->generada->presentada->justificada->atrasada). UN escritor.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `motor-avisos.producir.request`
- **Eventos que publica:** `estado-presentacion-fiscal.avanzar.response`, `estado-presentacion-fiscal.avanzar.failed`, `contabilidad.obligacion_avanzada`
- **Escucha (subscribes de dominio):** `contabilidad.modelo_exportado`, `contabilidad.declaracion_justificada`, `contabilidad.declaracion_rectificada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"estado-presentacion-fiscal"` · `subscribes:` ["estado-presentacion-fiscal.avanzar.request", "contabilidad.modelo_exportado", "contabilidad.declaracion_justificada", "contabilidad.declaracion_rectificada"] · `publishes:` ["estado-presentacion-fiscal.avanzar.response", "estado-presentacion-fiscal.avanzar.failed", "contabilidad.obligacion_avanzada"]
- **C · index.js:** `class EstadoPresentacionFiscal extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_avanzar(input) → { status, data }`
- **E · handler:** `onAvanzarRequest(e) → this._atender(e,'avanzar','estado-presentacion-fiscal.avanzar.response', d=>this._avanzar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `motor-avisos.producir.request` · publica → `estado-presentacion-fiscal.avanzar.response`, `estado-presentacion-fiscal.avanzar.failed`, `contabilidad.obligacion_avanzada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `acuse-presentacion` · `PUENTE` · eje `fiscal`
- **Clase / hoja F2:** `AcusePresentacion` (HOJA D13) · acción **CONSTRUIR**
- **Propósito:** Recoge y liga el justificante/acuse de la administración a su modelo y a su asiento. Cierra el bucle hacia fuera.
- **Depende de:** `estado-presentacion-fiscal`, `escritor-diario`, `expediente-documental`
- **Eventos que sube:** `estado-presentacion-fiscal.avanzar.request`, `escritor-diario.asentar.request`, `expediente-documental.archivar.request`
- **Eventos que publica:** `acuse-presentacion.ligar.response`, `acuse-presentacion.ligar.failed`, `contabilidad.declaracion_justificada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `credential-manager`
- **B · module.json:** `name:"acuse-presentacion"` · `subscribes:` ["acuse-presentacion.ligar.request"] · `publishes:` ["acuse-presentacion.ligar.response", "acuse-presentacion.ligar.failed", "contabilidad.declaracion_justificada"]
- **C · index.js:** `class AcusePresentacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_ligar(input) → { status, data }`
- **E · handler:** `onLigarRequest(e) → this._atender(e,'ligar','acuse-presentacion.ligar.response', d=>this._ligar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `estado-presentacion-fiscal.avanzar.request`, `escritor-diario.asentar.request`, `expediente-documental.archivar.request` · publica → `acuse-presentacion.ligar.response`, `acuse-presentacion.ligar.failed`, `contabilidad.declaracion_justificada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `rectificacion-declaracion` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `RectificacionDeclaracion` (HOJA D14) · acción **CONSTRUIR**
- **Propósito:** Camino de corrección POSTERIOR a la presentación (complementaria/sustitutiva). UN escritor. <> B5.
- **Depende de:** `estado-presentacion-fiscal`
- **Eventos que sube:** `estado-presentacion-fiscal.avanzar.request`
- **Eventos que publica:** `rectificacion-declaracion.rectificar.response`, `rectificacion-declaracion.rectificar.failed`, `contabilidad.declaracion_rectificada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"rectificacion-declaracion"` · `subscribes:` ["rectificacion-declaracion.rectificar.request"] · `publishes:` ["rectificacion-declaracion.rectificar.response", "rectificacion-declaracion.rectificar.failed", "contabilidad.declaracion_rectificada"]
- **C · index.js:** `class RectificacionDeclaracion extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_rectificar(input) → { status, data }`
- **E · handler:** `onRectificarRequest(e) → this._atender(e,'rectificar','rectificacion-declaracion.rectificar.response', d=>this._rectificar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `estado-presentacion-fiscal.avanzar.request` · publica → `rectificacion-declaracion.rectificar.response`, `rectificacion-declaracion.rectificar.failed`, `contabilidad.declaracion_rectificada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `perfil-administrativo` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `PerfilAdministrativo` (HOJA D15) · acción **CONSTRUIR**
- **Propósito:** Parcela declarable de qué administraciones y obligaciones aplican (territorio y régimen). UN escritor.
- **Depende de:** `calendario-fiscal`, `cola-declaraciones-criterio`
- **Eventos que sube:** `calendario-fiscal.declarar.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `perfil-administrativo.obligaciones.response`, `perfil-administrativo.obligaciones.failed`, `perfil-administrativo.declarar.response`, `perfil-administrativo.declarar.failed`, `contabilidad.perfil_administrativo_declarado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"perfil-administrativo"` · `subscribes:` ["perfil-administrativo.obligaciones.request", "perfil-administrativo.declarar.request"] · `publishes:` ["perfil-administrativo.obligaciones.response", "perfil-administrativo.obligaciones.failed", "perfil-administrativo.declarar.response", "perfil-administrativo.declarar.failed", "contabilidad.perfil_administrativo_declarado"]
- **C · index.js:** `class PerfilAdministrativo extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_obligaciones(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onObligacionesRequest(e) → this._atender(e,'obligaciones','perfil-administrativo.obligaciones.response', d=>this._obligaciones(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','perfil-administrativo.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `calendario-fiscal.declarar.request`, `cola-declaraciones-criterio.fijar.request` · publica → `perfil-administrativo.obligaciones.response`, `perfil-administrativo.obligaciones.failed`, `perfil-administrativo.declarar.response`, `perfil-administrativo.declarar.failed`, `contabilidad.perfil_administrativo_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `recibo-nomina` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `ReciboNomina` (HOJA G1) · acción **CONSTRUIR**
- **Propósito:** Admite y da forma asentable al hecho de nómina. Mecánico, cero juicio.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `recibo-nomina.dar_forma.response`, `recibo-nomina.dar_forma.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"recibo-nomina"` · `subscribes:` ["recibo-nomina.dar_forma.request", "contabilidad.nomina_recibida"] · `publishes:` ["recibo-nomina.dar_forma.response", "recibo-nomina.dar_forma.failed"]
- **C · index.js:** `class ReciboNomina extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_dar_forma(input) → { status, data }`
- **E · handler:** `onDarFormaRequest(e) → this._atender(e,'dar_forma','recibo-nomina.dar_forma.response', d=>this._dar_forma(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `recibo-nomina.dar_forma.response`, `recibo-nomina.dar_forma.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `obligacion-seguridad-social` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `ObligacionSeguridadSocial` (HOJA G2) · acción **CONSTRUIR**
- **Propósito:** Gasto de empresa + obligación con la TGSS desde el recibo. Tipos = dato.
- **Depende de:** `recibo-nomina`, `calendario-fiscal`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`, `calendario-fiscal.declarar.request`
- **Eventos que publica:** `obligacion-seguridad-social.calcular.response`, `obligacion-seguridad-social.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"obligacion-seguridad-social"` · `subscribes:` ["obligacion-seguridad-social.calcular.request", "contabilidad.nomina_recibida"] · `publishes:` ["obligacion-seguridad-social.calcular.response", "obligacion-seguridad-social.calcular.failed"]
- **C · index.js:** `class ObligacionSeguridadSocial extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','obligacion-seguridad-social.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request`, `calendario-fiscal.declarar.request` · publica → `obligacion-seguridad-social.calcular.response`, `obligacion-seguridad-social.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `asiento-personal` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `AsientoPersonal` (HOJA G3) · acción **CONSTRUIR**
- **Propósito:** Gasto de personal, retención y pago -> asiento EQUILIBRADO. Determinista.
- **Depende de:** `recibo-nomina`, `obligacion-seguridad-social`, `escritor-diario`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`, `obligacion-seguridad-social.calcular.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `asiento-personal.construir.response`, `asiento-personal.construir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"asiento-personal"` · `subscribes:` ["asiento-personal.construir.request", "contabilidad.nomina_recibida"] · `publishes:` ["asiento-personal.construir.response", "asiento-personal.construir.failed"]
- **C · index.js:** `class AsientoPersonal extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handler:** `onConstruirRequest(e) → this._atender(e,'construir','asiento-personal.construir.response', d=>this._construir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request`, `obligacion-seguridad-social.calcular.request`, `escritor-diario.asentar.request` · publica → `asiento-personal.construir.response`, `asiento-personal.construir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puerto-nomina` · `PUENTE` · eje `fiscal`
- **Clase / hoja F2:** `PuertoNomina` (HOJA G4) · acción **CONSTRUIR**
- **Propósito:** Origen declarable del dato de nómina: conecta con el sistema de personal; si no existe, se crea.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`
- **Eventos que publica:** `puerto-nomina.recibir.response`, `puerto-nomina.recibir.failed`, `contabilidad.nomina_recibida`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"puerto-nomina"` · `subscribes:` ["puerto-nomina.recibir.request"] · `publishes:` ["puerto-nomina.recibir.response", "puerto-nomina.recibir.failed", "contabilidad.nomina_recibida"]
- **C · index.js:** `class PuertoNomina extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_recibir(input) → { status, data }`
- **E · handler:** `onRecibirRequest(e) → this._atender(e,'recibir','puerto-nomina.recibir.response', d=>this._recibir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request` · publica → `puerto-nomina.recibir.response`, `puerto-nomina.recibir.failed`, `contabilidad.nomina_recibida`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `lineas-nomina` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `LineasNomina` (HOJA G6) · acción **CONSTRUIR**
- **Propósito:** Desglose bruto/retención/cotización del trabajador/neto. Hace la nómina EXPLICABLE.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`
- **Eventos que publica:** `lineas-nomina.desglosar.response`, `lineas-nomina.desglosar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"lineas-nomina"` · `subscribes:` ["lineas-nomina.desglosar.request", "contabilidad.nomina_recibida"] · `publishes:` ["lineas-nomina.desglosar.response", "lineas-nomina.desglosar.failed"]
- **C · index.js:** `class LineasNomina extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_desglosar(input) → { status, data }`
- **E · handler:** `onDesglosarRequest(e) → this._atender(e,'desglosar','lineas-nomina.desglosar.response', d=>this._desglosar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request` · publica → `lineas-nomina.desglosar.response`, `lineas-nomina.desglosar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `acceso-nomina` · `CUSTODIO` · eje `fiscal`
- **Clase / hoja F2:** `AccesoNomina` (HOJA G7) · acción **CONSTRUIR**
- **Propósito:** Gobernanza de quién ve qué nómina: cada uno ve la suya. UN escritor. Complementa I4 (eje persona).
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `acceso-nomina.autorizar.response`, `acceso-nomina.autorizar.failed`, `acceso-nomina.declarar.response`, `acceso-nomina.declarar.failed`, `contabilidad.acceso_nomina_declarado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"acceso-nomina"` · `subscribes:` ["acceso-nomina.autorizar.request", "acceso-nomina.declarar.request"] · `publishes:` ["acceso-nomina.autorizar.response", "acceso-nomina.autorizar.failed", "acceso-nomina.declarar.response", "acceso-nomina.declarar.failed", "contabilidad.acceso_nomina_declarado"]
- **C · index.js:** `class AccesoNomina extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_autorizar(input) → { status, data }` · `_declarar(input) → { status, data }`
- **E · handler:** `onAutorizarRequest(e) → this._atender(e,'autorizar','acceso-nomina.autorizar.response', d=>this._autorizar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','acceso-nomina.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `acceso-nomina.autorizar.response`, `acceso-nomina.autorizar.failed`, `acceso-nomina.declarar.response`, `acceso-nomina.declarar.failed`, `contabilidad.acceso_nomina_declarado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `pagos-a-cuenta-empleado` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `PagosACuentaEmpleado` (HOJA G8) · acción **CONSTRUIR**
- **Propósito:** Anticipos/adelantos y su impacto en el neto y el IRPF. No todo es sueldo fijo.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`
- **Eventos que publica:** `pagos-a-cuenta-empleado.impacto.response`, `pagos-a-cuenta-empleado.impacto.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"pagos-a-cuenta-empleado"` · `subscribes:` ["pagos-a-cuenta-empleado.impacto.request", "contabilidad.nomina_recibida"] · `publishes:` ["pagos-a-cuenta-empleado.impacto.response", "pagos-a-cuenta-empleado.impacto.failed"]
- **C · index.js:** `class PagosACuentaEmpleado extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_impacto(input) → { status, data }`
- **E · handler:** `onImpactoRequest(e) → this._atender(e,'impacto','pagos-a-cuenta-empleado.impacto.response', d=>this._impacto(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request` · publica → `pagos-a-cuenta-empleado.impacto.response`, `pagos-a-cuenta-empleado.impacto.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `conceptos-extra-nomina` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `ConceptosExtraNomina` (HOJA G9) · acción **CONSTRUIR**
- **Propósito:** Dietas, especie, finiquito, paga extra: cálculo de su imputación. Determinista.
- **Depende de:** `recibo-nomina`, `escritor-diario`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `conceptos-extra-nomina.imputar.response`, `conceptos-extra-nomina.imputar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"conceptos-extra-nomina"` · `subscribes:` ["conceptos-extra-nomina.imputar.request", "contabilidad.nomina_recibida"] · `publishes:` ["conceptos-extra-nomina.imputar.response", "conceptos-extra-nomina.imputar.failed"]
- **C · index.js:** `class ConceptosExtraNomina extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_imputar(input) → { status, data }`
- **E · handler:** `onImputarRequest(e) → this._atender(e,'imputar','conceptos-extra-nomina.imputar.response', d=>this._imputar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `recibo-nomina.dar_forma.request`, `escritor-diario.asentar.request` · publica → `conceptos-extra-nomina.imputar.response`, `conceptos-extra-nomina.imputar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `liquidacion-baja-empleado` · `REFLEJO` · eje `fiscal`
- **Clase / hoja F2:** `LiquidacionBajaEmpleado` (HOJA G10) · acción **CONSTRUIR**
- **Propósito:** Cierre de la cuenta del trabajador (finiquito/indemnización), para que NO quede un acreedor abierto.
- **Depende de:** `escritor-diario`, `cuenta-proveedor`
- **Eventos que sube:** `escritor-diario.asentar.request`, `cuenta-proveedor.saldo.request`
- **Eventos que publica:** `liquidacion-baja-empleado.liquidar.response`, `liquidacion-baja-empleado.liquidar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.nomina_recibida`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"liquidacion-baja-empleado"` · `subscribes:` ["liquidacion-baja-empleado.liquidar.request", "contabilidad.nomina_recibida"] · `publishes:` ["liquidacion-baja-empleado.liquidar.response", "liquidacion-baja-empleado.liquidar.failed"]
- **C · index.js:** `class LiquidacionBajaEmpleado extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_liquidar(input) → { status, data }`
- **E · handler:** `onLiquidarRequest(e) → this._atender(e,'liquidar','liquidacion-baja-empleado.liquidar.response', d=>this._liquidar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `cuenta-proveedor.saldo.request` · publica → `liquidacion-baja-empleado.liquidar.response`, `liquidacion-baja-empleado.liquidar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### ▸ EJE `analitica` — GRUPO F·H·I·J·K·Q·R — ANALÍTICA (32)

### `alta-activo` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `AltaActivo` (HOJA F1) · acción **CONSTRUIR**
- **Propósito:** Parcela del inmovilizado. UN escritor. La valoración del alta es reflejo hidratador.
- **Depende de:** `escritor-diario`, `plan-amortizacion`, `expediente-documental`
- **Eventos que sube:** `escritor-diario.asentar.request`, `plan-amortizacion.cuota_del_periodo.request`, `expediente-documental.archivar.request`
- **Eventos que publica:** `alta-activo.registrar.response`, `alta-activo.registrar.failed`, `contabilidad.activo_alta`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"alta-activo"` · `subscribes:` ["alta-activo.registrar.request"] · `publishes:` ["alta-activo.registrar.response", "alta-activo.registrar.failed", "contabilidad.activo_alta"]
- **C · index.js:** `class AltaActivo extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_registrar(input) → { status, data }`
- **E · handler:** `onRegistrarRequest(e) → this._atender(e,'registrar','alta-activo.registrar.response', d=>this._registrar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `plan-amortizacion.cuota_del_periodo.request`, `expediente-documental.archivar.request` · publica → `alta-activo.registrar.response`, `alta-activo.registrar.failed`, `contabilidad.activo_alta`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `plan-amortizacion` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `PlanAmortizacion` (HOJA F2) · acción **CONSTRUIR**
- **Propósito:** Genera la cuota cuando toca (dispara en el CIERRE). Método/coeficiente = dato. UN escritor.
- **Depende de:** `escritor-diario`, `cola-declaraciones-criterio`
- **Eventos que sube:** `escritor-diario.asentar.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `plan-amortizacion.cuota_del_periodo.response`, `plan-amortizacion.cuota_del_periodo.failed`, `plan-amortizacion.generar_cuota.response`, `plan-amortizacion.generar_cuota.failed`, `contabilidad.cuota_amortizacion_generada`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"plan-amortizacion"` · `subscribes:` ["plan-amortizacion.cuota_del_periodo.request", "plan-amortizacion.generar_cuota.request"] · `publishes:` ["plan-amortizacion.cuota_del_periodo.response", "plan-amortizacion.cuota_del_periodo.failed", "plan-amortizacion.generar_cuota.response", "plan-amortizacion.generar_cuota.failed", "contabilidad.cuota_amortizacion_generada"]
- **C · index.js:** `class PlanAmortizacion extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_cuota_del_periodo(input) → { status, data }` · `_generar_cuota(input) → { status, data }`
- **E · handler:** `onCuotaDelPeriodoRequest(e) → this._atender(e,'cuota_del_periodo','plan-amortizacion.cuota_del_periodo.response', d=>this._cuota_del_periodo(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onGenerarCuotaRequest(e) → this._atender(e,'generar_cuota','plan-amortizacion.generar_cuota.response', d=>this._generar_cuota(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `cola-declaraciones-criterio.fijar.request` · publica → `plan-amortizacion.cuota_del_periodo.response`, `plan-amortizacion.cuota_del_periodo.failed`, `plan-amortizacion.generar_cuota.response`, `plan-amortizacion.generar_cuota.failed`, `contabilidad.cuota_amortizacion_generada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `baja-activo` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `BajaActivo` (HOJA F3) · acción **CONSTRUIR**
- **Propósito:** Retira el bien y calcula el resultado (pérdida/beneficio) y lo imputa. El asiento lo escribe B2.
- **Depende de:** `valor-neto-contable`, `escritor-diario`
- **Eventos que sube:** `valor-neto-contable.calcular.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `baja-activo.calcular.response`, `baja-activo.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.activo_alta`, `contabilidad.cuota_amortizacion_generada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"baja-activo"` · `subscribes:` ["baja-activo.calcular.request", "contabilidad.activo_alta", "contabilidad.cuota_amortizacion_generada"] · `publishes:` ["baja-activo.calcular.response", "baja-activo.calcular.failed"]
- **C · index.js:** `class BajaActivo extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','baja-activo.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `valor-neto-contable.calcular.request`, `escritor-diario.asentar.request` · publica → `baja-activo.calcular.response`, `baja-activo.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `valor-neto-contable` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `ValorNetoContable` (HOJA F4) · acción **CONSTRUIR**
- **Propósito:** Coste - amortización acumulada. Determinista, al balance.
- **Depende de:** `plan-amortizacion`
- **Eventos que sube:** `plan-amortizacion.cuota_del_periodo.request`
- **Eventos que publica:** `valor-neto-contable.calcular.response`, `valor-neto-contable.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.cuota_amortizacion_generada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"valor-neto-contable"` · `subscribes:` ["valor-neto-contable.calcular.request", "contabilidad.cuota_amortizacion_generada"] · `publishes:` ["valor-neto-contable.calcular.response", "valor-neto-contable.calcular.failed"]
- **C · index.js:** `class ValorNetoContable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','valor-neto-contable.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `plan-amortizacion.cuota_del_periodo.request` · publica → `valor-neto-contable.calcular.response`, `valor-neto-contable.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `valoracion-existencia` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `ValoracionExistencia` (HOJA H1) · acción **CONSTRUIR**
- **Propósito:** Capa de valor SOBRE el inventario existente (no lo duplica). Método = dato.
- **Depende de:** `frontera-ficha-producto`
- **Eventos que sube:** `frontera-ficha-producto.entrar.request`
- **Eventos que publica:** `valoracion-existencia.valorar.response`, `valoracion-existencia.valorar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `inventario`
- **B · module.json:** `name:"valoracion-existencia"` · `subscribes:` ["valoracion-existencia.valorar.request"] · `publishes:` ["valoracion-existencia.valorar.response", "valoracion-existencia.valorar.failed"]
- **C · index.js:** `class ValoracionExistencia extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_valorar(input) → { status, data }`
- **E · handler:** `onValorarRequest(e) → this._atender(e,'valorar','valoracion-existencia.valorar.response', d=>this._valorar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `frontera-ficha-producto.entrar.request` · publica → `valoracion-existencia.valorar.response`, `valoracion-existencia.valorar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `frontera-ficha-producto` · `CONVERSOR` · eje `analitica`
- **Clase / hoja F2:** `FronteraFichaProducto` (HOJA H2) · acción **CONSTRUIR**
- **Propósito:** Puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al dato interno.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `frontera-ficha-producto.entrar.response`, `frontera-ficha-producto.entrar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"frontera-ficha-producto"` · `subscribes:` ["frontera-ficha-producto.entrar.request"] · `publishes:` ["frontera-ficha-producto.entrar.response", "frontera-ficha-producto.entrar.failed"]
- **C · index.js:** `class FronteraFichaProducto extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handler:** `onEntrarRequest(e) → this._atender(e,'entrar','frontera-ficha-producto.entrar.response', d=>this._entrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `frontera-ficha-producto.entrar.response`, `frontera-ficha-producto.entrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `ajuste-inventario` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `AjusteInventario` (HOJA H3) · acción **CONSTRUIR**
- **Propósito:** Regulariza merma/rotura con asiento Y aviso. Cálculo de la diferencia. Determinista.
- **Depende de:** `escritor-diario`, `motor-avisos`
- **Eventos que sube:** `escritor-diario.asentar.request`, `motor-avisos.producir.request`
- **Eventos que publica:** `ajuste-inventario.diferencia.response`, `ajuste-inventario.diferencia.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `inventario`
- **B · module.json:** `name:"ajuste-inventario"` · `subscribes:` ["ajuste-inventario.diferencia.request", "contabilidad.hecho_recibido"] · `publishes:` ["ajuste-inventario.diferencia.response", "ajuste-inventario.diferencia.failed"]
- **C · index.js:** `class AjusteInventario extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_diferencia(input) → { status, data }`
- **E · handler:** `onDiferenciaRequest(e) → this._atender(e,'diferencia','ajuste-inventario.diferencia.response', d=>this._diferencia(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `escritor-diario.asentar.request`, `motor-avisos.producir.request` · publica → `ajuste-inventario.diferencia.response`, `ajuste-inventario.diferencia.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `variacion-stock-valorada` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `VariacionStockValorada` (HOJA H4) · acción **CONSTRUIR**
- **Propósito:** Entrada por compra / salida por consumo, VALORADAS. Determinista.
- **Depende de:** `valoracion-existencia`, `escritor-diario`
- **Eventos que sube:** `valoracion-existencia.valorar.request`, `escritor-diario.asentar.request`
- **Eventos que publica:** `variacion-stock-valorada.variacion.response`, `variacion-stock-valorada.variacion.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager` + `inventario`
- **B · module.json:** `name:"variacion-stock-valorada"` · `subscribes:` ["variacion-stock-valorada.variacion.request", "contabilidad.hecho_recibido"] · `publishes:` ["variacion-stock-valorada.variacion.response", "variacion-stock-valorada.variacion.failed"]
- **C · index.js:** `class VariacionStockValorada extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_variacion(input) → { status, data }`
- **E · handler:** `onVariacionRequest(e) → this._atender(e,'variacion','variacion-stock-valorada.variacion.response', d=>this._variacion(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `valoracion-existencia.valorar.request`, `escritor-diario.asentar.request` · publica → `variacion-stock-valorada.variacion.response`, `variacion-stock-valorada.variacion.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `marca-sociedad` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `MarcaSociedad` (HOJA I1) · acción **CONSTRUIR**
- **Propósito:** Etiqueta cada asiento con su sociedad. Mecánico, cero juicio.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `marca-sociedad.marcar.response`, `marca-sociedad.marcar.failed`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"marca-sociedad"` · `subscribes:` ["marca-sociedad.marcar.request"] · `publishes:` ["marca-sociedad.marcar.response", "marca-sociedad.marcar.failed"]
- **C · index.js:** `class MarcaSociedad extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_marcar(input) → { status, data }`
- **E · handler:** `onMarcarRequest(e) → this._atender(e,'marcar','marca-sociedad.marcar.response', d=>this._marcar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `marca-sociedad.marcar.response`, `marca-sociedad.marcar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `eliminacion-intercompany` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `EliminacionIntercompany` (HOJA I2) · acción **CONSTRUIR**
- **Propósito:** Detecta y elimina el cruce interno en la consolidación. La traza de lo eliminado queda visible.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `eliminacion-intercompany.eliminar.response`, `eliminacion-intercompany.eliminar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"eliminacion-intercompany"` · `subscribes:` ["eliminacion-intercompany.eliminar.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["eliminacion-intercompany.eliminar.response", "eliminacion-intercompany.eliminar.failed"]
- **C · index.js:** `class EliminacionIntercompany extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_eliminar(input) → { status, data }`
- **E · handler:** `onEliminarRequest(e) → this._atender(e,'eliminar','eliminacion-intercompany.eliminar.response', d=>this._eliminar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `eliminacion-intercompany.eliminar.response`, `eliminacion-intercompany.eliminar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `consolidacion` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `Consolidacion` (HOJA I3) · acción **CONSTRUIR**
- **Propósito:** Estados del conjunto con criterio DECLARADO. Grupo COMPLETO (multi-sociedad). La consolidación es AL CIERRE.
- **Depende de:** `mayor-balanza`, `balance-situacion`, `cuenta-resultados`, `eliminacion-intercompany`, `cola-declaraciones-criterio`
- **Eventos que sube:** `mayor-balanza.saldos.request`, `balance-situacion.calcular.request`, `cuenta-resultados.calcular.request`, `eliminacion-intercompany.eliminar.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `consolidacion.estados.response`, `consolidacion.estados.failed`
- **Escucha (subscribes de dominio):** `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"consolidacion"` · `subscribes:` ["consolidacion.estados.request", "contabilidad.ejercicio_cerrado"] · `publishes:` ["consolidacion.estados.response", "consolidacion.estados.failed"]
- **C · index.js:** `class Consolidacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_estados(input) → { status, data }`
- **E · handler:** `onEstadosRequest(e) → this._atender(e,'estados','consolidacion.estados.response', d=>this._estados(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request`, `balance-situacion.calcular.request`, `cuenta-resultados.calcular.request`, `eliminacion-intercompany.eliminar.request`, `cola-declaraciones-criterio.fijar.request` · publica → `consolidacion.estados.response`, `consolidacion.estados.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `aislamiento-negocio` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `AislamientoNegocio` (HOJA I4) · acción **CONSTRUIR**
- **Propósito:** Multi-negocio sin fuga. UN dueño por parcela. Los negocios NO se fugan. (Espejo de G7: eje negocio <-> persona.)
- **Depende de:** `single-writer`
- **Eventos que sube:** `single-writer.reclamar.request`
- **Eventos que publica:** `aislamiento-negocio.parcela.response`, `aislamiento-negocio.parcela.failed`, `aislamiento-negocio.escritor.response`, `aislamiento-negocio.escritor.failed`, `aislamiento-negocio.crear_parcela.response`, `aislamiento-negocio.crear_parcela.failed`, `contabilidad.negocio_parcela_creada`
- **Escucha (subscribes de dominio):** `contabilidad.negocio_registrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"aislamiento-negocio"` · `subscribes:` ["aislamiento-negocio.parcela.request", "aislamiento-negocio.escritor.request", "aislamiento-negocio.crear_parcela.request", "contabilidad.negocio_registrado"] · `publishes:` ["aislamiento-negocio.parcela.response", "aislamiento-negocio.parcela.failed", "aislamiento-negocio.escritor.response", "aislamiento-negocio.escritor.failed", "aislamiento-negocio.crear_parcela.response", "aislamiento-negocio.crear_parcela.failed", "contabilidad.negocio_parcela_creada"]
- **C · index.js:** `class AislamientoNegocio extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_parcela(input) → { status, data }` · `_escritor(input) → { status, data }` · `_crear_parcela(input) → { status, data }`
- **E · handler:** `onParcelaRequest(e) → this._atender(e,'parcela','aislamiento-negocio.parcela.response', d=>this._parcela(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onEscritorRequest(e) → this._atender(e,'escritor','aislamiento-negocio.escritor.response', d=>this._escritor(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCrearParcelaRequest(e) → this._atender(e,'crear_parcela','aislamiento-negocio.crear_parcela.response', d=>this._crear_parcela(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `single-writer.reclamar.request` · publica → `aislamiento-negocio.parcela.response`, `aislamiento-negocio.parcela.failed`, `aislamiento-negocio.escritor.response`, `aislamiento-negocio.escritor.failed`, `aislamiento-negocio.crear_parcela.response`, `aislamiento-negocio.crear_parcela.failed`, `contabilidad.negocio_parcela_creada`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `etiquetado-analitico` · `MICRO-AGENTE` · eje `analitica`
- **Clase / hoja F2:** `EtiquetadoAnalitico` (HOJA J1) · acción **CONSTRUIR**
- **Propósito:** Asigna centro/línea/producto a cada hecho con regla declarable; cuando la regla no cubre, lo dudoso va a cola. PROPONE.
- **Depende de:** `encolado-excepcion`, `cola-declaraciones-criterio`
- **Eventos que sube:** `encolado-excepcion.encolar.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `etiquetado-analitico.juzgar.response`, `etiquetado-analitico.juzgar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`, `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"etiquetado-analitico"` · `subscribes:` ["etiquetado-analitico.juzgar.request", "contabilidad.hecho_recibido", "contabilidad.criterio_fijado"] · `publishes:` ["etiquetado-analitico.juzgar.response", "etiquetado-analitico.juzgar.failed"]
- **C · index.js:** `class EtiquetadoAnalitico extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','etiquetado-analitico.juzgar.response', d=>this._juzgar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `encolado-excepcion.encolar.request`, `cola-declaraciones-criterio.fijar.request` · publica → `etiquetado-analitico.juzgar.response`, `etiquetado-analitico.juzgar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `margen-analitico` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `MargenAnalitico` (HOJA J2) · acción **CONSTRUIR**
- **Propósito:** Ingreso - coste imputado por dimensión. Determinista.
- **Depende de:** `mayor-balanza`, `valoracion-existencia`, `coste-indirecto`
- **Eventos que sube:** `mayor-balanza.saldos.request`, `valoracion-existencia.valorar.request`, `coste-indirecto.repartir.request`
- **Eventos que publica:** `margen-analitico.calcular.response`, `margen-analitico.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"margen-analitico"` · `subscribes:` ["margen-analitico.calcular.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["margen-analitico.calcular.response", "margen-analitico.calcular.failed"]
- **C · index.js:** `class MargenAnalitico extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','margen-analitico.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request`, `valoracion-existencia.valorar.request`, `coste-indirecto.repartir.request` · publica → `margen-analitico.calcular.response`, `margen-analitico.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `presupuesto` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `Presupuesto` (HOJA J3) · acción **CONSTRUIR**
- **Propósito:** Cifra objetivo por dimensión declarable. UN escritor.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `presupuesto.fijar.response`, `presupuesto.fijar.failed`, `presupuesto.objetivo.response`, `presupuesto.objetivo.failed`, `contabilidad.presupuesto_fijado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"presupuesto"` · `subscribes:` ["presupuesto.fijar.request", "presupuesto.objetivo.request"] · `publishes:` ["presupuesto.fijar.response", "presupuesto.fijar.failed", "presupuesto.objetivo.response", "presupuesto.objetivo.failed", "contabilidad.presupuesto_fijado"]
- **C · index.js:** `class Presupuesto extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_fijar(input) → { status, data }` · `_objetivo(input) → { status, data }`
- **E · handler:** `onFijarRequest(e) → this._atender(e,'fijar','presupuesto.fijar.response', d=>this._fijar(d))` · **CLASE: ORDEN**
- **E · handler:** `onObjetivoRequest(e) → this._atender(e,'objetivo','presupuesto.objetivo.response', d=>this._objetivo(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `cola-declaraciones-criterio.fijar.request` · publica → `presupuesto.fijar.response`, `presupuesto.fijar.failed`, `presupuesto.objetivo.response`, `presupuesto.objetivo.failed`, `contabilidad.presupuesto_fijado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `desviacion` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `Desviacion` (HOJA J4) · acción **CONSTRUIR**
- **Propósito:** Real vs presupuesto -> dispara aviso SI se sale del umbral declarado. Determinista.
- **Depende de:** `margen-analitico`, `presupuesto`, `motor-avisos`
- **Eventos que sube:** `margen-analitico.calcular.request`, `presupuesto.objetivo.request`, `motor-avisos.producir.request`
- **Eventos que publica:** `desviacion.calcular.response`, `desviacion.calcular.failed`
- **Escucha (subscribes de dominio):** `contabilidad.presupuesto_fijado`, `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"desviacion"` · `subscribes:` ["desviacion.calcular.request", "contabilidad.presupuesto_fijado", "contabilidad.asiento_asentado"] · `publishes:` ["desviacion.calcular.response", "desviacion.calcular.failed"]
- **C · index.js:** `class Desviacion extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handler:** `onCalcularRequest(e) → this._atender(e,'calcular','desviacion.calcular.response', d=>this._calcular(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `margen-analitico.calcular.request`, `presupuesto.objetivo.request`, `motor-avisos.producir.request` · publica → `desviacion.calcular.response`, `desviacion.calcular.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `coste-indirecto` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `CosteIndirecto` (HOJA J5) · acción **CONSTRUIR**
- **Propósito:** Aplica el reparto DECLARADO de gastos no directos. Cubre lo que la pieza existente no cubre para grupo.
- **Depende de:** `mayor-balanza`, `cola-declaraciones-criterio`
- **Eventos que sube:** `mayor-balanza.saldos.request`, `cola-declaraciones-criterio.fijar.request`
- **Eventos que publica:** `coste-indirecto.repartir.response`, `coste-indirecto.repartir.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"coste-indirecto"` · `subscribes:` ["coste-indirecto.repartir.request", "contabilidad.asiento_asentado", "contabilidad.criterio_fijado"] · `publishes:` ["coste-indirecto.repartir.response", "coste-indirecto.repartir.failed"]
- **C · index.js:** `class CosteIndirecto extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_repartir(input) → { status, data }`
- **E · handler:** `onRepartirRequest(e) → this._atender(e,'repartir','coste-indirecto.repartir.response', d=>this._repartir(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `mayor-balanza.saldos.request`, `cola-declaraciones-criterio.fijar.request` · publica → `coste-indirecto.repartir.response`, `coste-indirecto.repartir.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cuadro-mando-contable` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `CuadroMandoContable` (HOJA J8) · acción **CONSTRUIR**
- **Propósito:** Agregación de conjunto (caja·resultado·margen·desviación·ejercicio) SIN bajar al asiento. Lente del jefe.
- **Depende de:** `saldo-tesoreria`, `cuenta-resultados`, `margen-analitico`, `desviacion`
- **Eventos que sube:** `saldo-tesoreria.calcular.request`, `cuenta-resultados.calcular.request`, `margen-analitico.calcular.request`, `desviacion.calcular.request`
- **Eventos que publica:** `cuadro-mando-contable.componer.response`, `cuadro-mando-contable.componer.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cuadro-mando-contable"` · `subscribes:` ["cuadro-mando-contable.componer.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["cuadro-mando-contable.componer.response", "cuadro-mando-contable.componer.failed"]
- **C · index.js:** `class CuadroMandoContable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handler:** `onComponerRequest(e) → this._atender(e,'componer','cuadro-mando-contable.componer.response', d=>this._componer(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `saldo-tesoreria.calcular.request`, `cuenta-resultados.calcular.request`, `margen-analitico.calcular.request`, `desviacion.calcular.request` · publica → `cuadro-mando-contable.componer.response`, `cuadro-mando-contable.componer.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `comparador-periodos` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `ComparadorPeriodos` (HOJA J9) · acción **CONSTRUIR**
- **Propósito:** Ejercicio vs ejercicio, mes vs mes, real vs presupuesto. REUTILIZA J3/J4, no los duplica.
- **Depende de:** `presupuesto`, `desviacion`
- **Eventos que sube:** `presupuesto.objetivo.request`, `desviacion.calcular.request`
- **Eventos que publica:** `comparador-periodos.comparar.response`, `comparador-periodos.comparar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.presupuesto_fijado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"comparador-periodos"` · `subscribes:` ["comparador-periodos.comparar.request", "contabilidad.presupuesto_fijado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["comparador-periodos.comparar.response", "comparador-periodos.comparar.failed"]
- **C · index.js:** `class ComparadorPeriodos extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_comparar(input) → { status, data }`
- **E · handler:** `onCompararRequest(e) → this._atender(e,'comparar','comparador-periodos.comparar.response', d=>this._comparar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `presupuesto.objetivo.request`, `desviacion.calcular.request` · publica → `comparador-periodos.comparar.response`, `comparador-periodos.comparar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `tablero-margen-dimension` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `TableroMargenDimension` (HOJA J10) · acción **CONSTRUIR**
- **Propósito:** Cruce margen x dimensión bajo lente de conjunto: por centro, familia o sociedad.
- **Depende de:** `margen-analitico`
- **Eventos que sube:** `margen-analitico.calcular.request`
- **Eventos que publica:** `tablero-margen-dimension.cruzar.response`, `tablero-margen-dimension.cruzar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.criterio_fijado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"tablero-margen-dimension"` · `subscribes:` ["tablero-margen-dimension.cruzar.request", "contabilidad.asiento_asentado", "contabilidad.criterio_fijado"] · `publishes:` ["tablero-margen-dimension.cruzar.response", "tablero-margen-dimension.cruzar.failed"]
- **C · index.js:** `class TableroMargenDimension extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_cruzar(input) → { status, data }`
- **E · handler:** `onCruzarRequest(e) → this._atender(e,'cruzar','tablero-margen-dimension.cruzar.response', d=>this._cruzar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `margen-analitico.calcular.request` · publica → `tablero-margen-dimension.cruzar.response`, `tablero-margen-dimension.cruzar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `onboarding-negocio` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `OnboardingNegocio` (HOJA K1) · acción **CONSTRUIR**
- **Propósito:** Recoge los datos declarables del negocio nuevo (plan, fuentes, parámetros). UN escritor.
- **Depende de:** `aislamiento-negocio`, `catalogo-cuentas`
- **Eventos que sube:** `aislamiento-negocio.parcela.request`, `catalogo-cuentas.buscar.request`
- **Eventos que publica:** `onboarding-negocio.recoger.response`, `onboarding-negocio.recoger.failed`, `onboarding-negocio.leer.response`, `onboarding-negocio.leer.failed`, `contabilidad.negocio_registrado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"onboarding-negocio"` · `subscribes:` ["onboarding-negocio.recoger.request", "onboarding-negocio.leer.request"] · `publishes:` ["onboarding-negocio.recoger.response", "onboarding-negocio.recoger.failed", "onboarding-negocio.leer.response", "onboarding-negocio.leer.failed", "contabilidad.negocio_registrado"]
- **C · index.js:** `class OnboardingNegocio extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_recoger(input) → { status, data }` · `_leer(input) → { status, data }`
- **E · handler:** `onRecogerRequest(e) → this._atender(e,'recoger','onboarding-negocio.recoger.response', d=>this._recoger(d))` · **CLASE: ORDEN**
- **E · handler:** `onLeerRequest(e) → this._atender(e,'leer','onboarding-negocio.leer.response', d=>this._leer(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `aislamiento-negocio.parcela.request`, `catalogo-cuentas.buscar.request` · publica → `onboarding-negocio.recoger.response`, `onboarding-negocio.recoger.failed`, `onboarding-negocio.leer.response`, `onboarding-negocio.leer.failed`, `contabilidad.negocio_registrado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `motor-avisos` · `PUENTE` · eje `analitica`
- **Clase / hoja F2:** `MotorAvisos` (HOJA K2) · acción **CONSTRUIR**
- **Propósito:** PRODUCE el aviso (requisito 4 del dueño). Conecta por evento. La ENTREGA es R1.
- **Depende de:** `aviso-al-negocio`
- **Eventos que sube:** `aviso-al-negocio.entregar.request`
- **Eventos que publica:** `motor-avisos.producir.response`, `motor-avisos.producir.failed`, `contabilidad.aviso_producido`
- **Escucha (subscribes de dominio):** `contabilidad.revision_solicitada`, `contabilidad.cuadre_no_cuadra`, `contabilidad.plazo_declarado`, `contabilidad.presupuesto_fijado`, `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"motor-avisos"` · `subscribes:` ["motor-avisos.producir.request", "contabilidad.revision_solicitada", "contabilidad.cuadre_no_cuadra", "contabilidad.plazo_declarado", "contabilidad.presupuesto_fijado", "contabilidad.hecho_recibido"] · `publishes:` ["motor-avisos.producir.response", "motor-avisos.producir.failed", "contabilidad.aviso_producido"]
- **C · index.js:** `class MotorAvisos extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_producir(input) → { status, data }`
- **E · handler:** `onProducirRequest(e) → this._atender(e,'producir','motor-avisos.producir.response', d=>this._producir(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `aviso-al-negocio.entregar.request` · publica → `motor-avisos.producir.response`, `motor-avisos.producir.failed`, `contabilidad.aviso_producido`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `informe-rico` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `InformeRico` (HOJA K3) · acción **CONSTRUIR**
- **Propósito:** COMPONE la cifra ya calculada con el contexto declarado. La NARRACIÓN fuzzy vive en R3; el 'qué hacer' en R2.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `informe-rico.componer.response`, `informe-rico.componer.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"informe-rico"` · `subscribes:` ["informe-rico.componer.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["informe-rico.componer.response", "informe-rico.componer.failed"]
- **C · index.js:** `class InformeRico extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handler:** `onComponerRequest(e) → this._atender(e,'componer','informe-rico.componer.response', d=>this._componer(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `informe-rico.componer.response`, `informe-rico.componer.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `activacion-vertical` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `ActivacionVertical` (HOJA K4) · acción **CONSTRUIR**
- **Propósito:** Enciende la vertical por la configuración declarada. Si contabilidad no está activada, la vertical funciona igual.
- **Depende de:** `onboarding-negocio`
- **Eventos que sube:** `onboarding-negocio.recoger.request`
- **Eventos que publica:** `activacion-vertical.activar.response`, `activacion-vertical.activar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.negocio_registrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"activacion-vertical"` · `subscribes:` ["activacion-vertical.activar.request", "contabilidad.negocio_registrado"] · `publishes:` ["activacion-vertical.activar.response", "activacion-vertical.activar.failed"]
- **C · index.js:** `class ActivacionVertical extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_activar(input) → { status, data }`
- **E · handler:** `onActivarRequest(e) → this._atender(e,'activar','activacion-vertical.activar.response', d=>this._activar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `onboarding-negocio.recoger.request` · publica → `activacion-vertical.activar.response`, `activacion-vertical.activar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `cola-declaraciones-criterio` · `CUSTODIO` · eje `analitica`
- **Clase / hoja F2:** `ColaDeclaracionesCriterio` (HOJA K9) · acción **CONSTRUIR**
- **Propósito:** UNA sola cola donde el jefe fija/ratifica TODOS los criterios. UN escritor. Cierra B1/B7·C7·E6·F5·J6·D11·I5.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `cola-declaraciones-criterio.fijar.response`, `cola-declaraciones-criterio.fijar.failed`, `cola-declaraciones-criterio.ratificar.response`, `cola-declaraciones-criterio.ratificar.failed`, `contabilidad.criterio_fijado`
- **Escucha (subscribes de dominio):** — (ninguno)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `_shared/pos-persistencia` + `filesystem` + `project-manager`
- **B · module.json:** `name:"cola-declaraciones-criterio"` · `subscribes:` ["cola-declaraciones-criterio.fijar.request", "cola-declaraciones-criterio.ratificar.request"] · `publishes:` ["cola-declaraciones-criterio.fijar.response", "cola-declaraciones-criterio.fijar.failed", "cola-declaraciones-criterio.ratificar.response", "cola-declaraciones-criterio.ratificar.failed", "contabilidad.criterio_fijado"]
- **C · index.js:** `class ColaDeclaracionesCriterio extends ModuloHibridoReflejo + PosPersistencia (project.activated / onUnload flush)`
- **D · proyecciones:** `_fijar(input) → { status, data }` · `_ratificar(input) → { status, data }`
- **E · handler:** `onFijarRequest(e) → this._atender(e,'fijar','cola-declaraciones-criterio.fijar.response', d=>this._fijar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRatificarRequest(e) → this._atender(e,'ratificar','cola-declaraciones-criterio.ratificar.response', d=>this._ratificar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → — · publica → `cola-declaraciones-criterio.fijar.response`, `cola-declaraciones-criterio.fijar.failed`, `cola-declaraciones-criterio.ratificar.response`, `cola-declaraciones-criterio.ratificar.failed`, `contabilidad.criterio_fijado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista + gate `scripts/validate-hibridos.js`.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `consulta-cuentas-bajo-demanda` · `PUENTE` · eje `analitica`
- **Clase / hoja F2:** `ConsultaCuentasBajoDemanda` (HOJA Q1) · acción **CONSTRUIR**
- **Propósito:** Puerta pull: conecta la pregunta del dueño con el cálculo por petición. NO impone cadencia.
- **Depende de:** `puente-lenguaje-dueno`, `mayor-balanza`, `saldo-tesoreria`, `cuenta-resultados`, `sello-cobertura`, `marca-borrador-validado`
- **Eventos que sube:** `puente-lenguaje-dueno.a_consulta.request`, `mayor-balanza.saldos.request`, `saldo-tesoreria.calcular.request`, `cuenta-resultados.calcular.request`, `sello-cobertura.sellar.request`, `marca-borrador-validado.estado.request`
- **Eventos que publica:** `consulta-cuentas-bajo-demanda.preguntar.response`, `consulta-cuentas-bajo-demanda.preguntar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"consulta-cuentas-bajo-demanda"` · `subscribes:` ["consulta-cuentas-bajo-demanda.preguntar.request", "contabilidad.asiento_asentado", "contabilidad.ejercicio_cerrado"] · `publishes:` ["consulta-cuentas-bajo-demanda.preguntar.response", "consulta-cuentas-bajo-demanda.preguntar.failed"]
- **C · index.js:** `class ConsultaCuentasBajoDemanda extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_preguntar(input) → { status, data }`
- **E · handler:** `onPreguntarRequest(e) → this._atender(e,'preguntar','consulta-cuentas-bajo-demanda.preguntar.response', d=>this._preguntar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `puente-lenguaje-dueno.a_consulta.request`, `mayor-balanza.saldos.request`, `saldo-tesoreria.calcular.request`, `cuenta-resultados.calcular.request`, `sello-cobertura.sellar.request`, `marca-borrador-validado.estado.request` · publica → `consulta-cuentas-bajo-demanda.preguntar.response`, `consulta-cuentas-bajo-demanda.preguntar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `puente-lenguaje-dueno` · `MICRO-AGENTE` · eje `analitica`
- **Clase / hoja F2:** `PuenteLenguajeDueno` (HOJA Q2) · acción **CONSTRUIR**
- **Propósito:** Traductor BIDIRECCIONAL: su pregunta -> consulta contable; cálculo -> cifra en su idioma. Lenguaje -> juicio.
- **Depende de:** — (raíz: nadie)
- **Eventos que sube:** —
- **Eventos que publica:** `puente-lenguaje-dueno.a_consulta.response`, `puente-lenguaje-dueno.a_consulta.failed`, `puente-lenguaje-dueno.a_cifra.response`, `puente-lenguaje-dueno.a_cifra.failed`
- **Escucha (subscribes de dominio):** `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"puente-lenguaje-dueno"` · `subscribes:` ["puente-lenguaje-dueno.a_consulta.request", "puente-lenguaje-dueno.a_cifra.request", "contabilidad.asiento_asentado"] · `publishes:` ["puente-lenguaje-dueno.a_consulta.response", "puente-lenguaje-dueno.a_consulta.failed", "puente-lenguaje-dueno.a_cifra.response", "puente-lenguaje-dueno.a_cifra.failed"]
- **C · index.js:** `class PuenteLenguajeDueno extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_a_consulta(input) → { status, data }` · `_a_cifra(input) → { status, data }`
- **E · handler:** `onAConsultaRequest(e) → this._atender(e,'a_consulta','puente-lenguaje-dueno.a_consulta.response', d=>this._a_consulta(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onACifraRequest(e) → this._atender(e,'a_cifra','puente-lenguaje-dueno.a_cifra.response', d=>this._a_cifra(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → — · publica → `puente-lenguaje-dueno.a_consulta.response`, `puente-lenguaje-dueno.a_consulta.failed`, `puente-lenguaje-dueno.a_cifra.response`, `puente-lenguaje-dueno.a_cifra.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `sello-cobertura` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `SelloCobertura` (HOJA Q3) · acción **CONSTRUIR**
- **Propósito:** Marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES de que decida.
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `completitud-cobertura.medir.request`
- **Eventos que publica:** `sello-cobertura.sellar.response`, `sello-cobertura.sellar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.hecho_recibido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"sello-cobertura"` · `subscribes:` ["sello-cobertura.sellar.request", "contabilidad.hecho_recibido"] · `publishes:` ["sello-cobertura.sellar.response", "sello-cobertura.sellar.failed"]
- **C · index.js:** `class SelloCobertura extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_sellar(input) → { status, data }`
- **E · handler:** `onSellarRequest(e) → this._atender(e,'sellar','sello-cobertura.sellar.response', d=>this._sellar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `completitud-cobertura.medir.request` · publica → `sello-cobertura.sellar.response`, `sello-cobertura.sellar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `marca-borrador-validado` · `REFLEJO` · eje `analitica`
- **Clase / hoja F2:** `MarcaBorradorValidado` (HOJA Q4) · acción **CONSTRUIR**
- **Propósito:** Sello del punto en que está lo que ve (en curso/revisado/firmado), para no decidir sobre un borrador vivo.
- **Depende de:** `traza-asiento`, `flujo-firma`
- **Eventos que sube:** `traza-asiento.registrar.request`, `flujo-firma.estado.request`
- **Eventos que publica:** `marca-borrador-validado.estado.response`, `marca-borrador-validado.estado.failed`
- **Escucha (subscribes de dominio):** `contabilidad.traza_registrada`, `contabilidad.revision_firmada`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"marca-borrador-validado"` · `subscribes:` ["marca-borrador-validado.estado.request", "contabilidad.traza_registrada", "contabilidad.revision_firmada"] · `publishes:` ["marca-borrador-validado.estado.response", "marca-borrador-validado.estado.failed"]
- **C · index.js:** `class MarcaBorradorValidado extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_estado(input) → { status, data }`
- **E · handler:** `onEstadoRequest(e) → this._atender(e,'estado','marca-borrador-validado.estado.response', d=>this._estado(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `traza-asiento.registrar.request`, `flujo-firma.estado.request` · publica → `marca-borrador-validado.estado.response`, `marca-borrador-validado.estado.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `aviso-al-negocio` · `PUENTE` · eje `analitica`
- **Clase / hoja F2:** `AvisoAlNegocio` (HOJA R1) · acción **CONSTRUIR**
- **Propósito:** El aviso ENTREGADO y CONFIRMADO al negocio cliente. Cara de entrega; completa K2, que sólo PRODUCE.
- **Depende de:** `informe-accionable`, `narrador-estados`
- **Eventos que sube:** `informe-accionable.juzgar.request`, `narrador-estados.narrar.request`
- **Eventos que publica:** `aviso-al-negocio.entregar.response`, `aviso-al-negocio.entregar.failed`, `contabilidad.aviso_entregado`
- **Escucha (subscribes de dominio):** `contabilidad.aviso_producido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"aviso-al-negocio"` · `subscribes:` ["aviso-al-negocio.entregar.request", "contabilidad.aviso_producido"] · `publishes:` ["aviso-al-negocio.entregar.response", "aviso-al-negocio.entregar.failed", "contabilidad.aviso_entregado"]
- **C · index.js:** `class AvisoAlNegocio extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_entregar(input) → { status, data }`
- **E · handler:** `onEntregarRequest(e) → this._atender(e,'entregar','aviso-al-negocio.entregar.response', d=>this._entregar(d))` · **CLASE: ORDEN**
- **F · eventos:** sube → `informe-accionable.juzgar.request`, `narrador-estados.narrar.request` · publica → `aviso-al-negocio.entregar.response`, `aviso-al-negocio.entregar.failed`, `contabilidad.aviso_entregado`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `informe-accionable` · `MICRO-AGENTE` · eje `analitica`
- **Clase / hoja F2:** `InformeAccionable` (HOJA R2) · acción **CONSTRUIR**
- **Propósito:** Todo informe que recibe el cliente lleva QUÉ HACER con él. La recomendación es juicio.
- **Depende de:** `informe-rico`
- **Eventos que sube:** `informe-rico.componer.request`
- **Eventos que publica:** `informe-accionable.juzgar.response`, `informe-accionable.juzgar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.aviso_producido`, `contabilidad.asiento_asentado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"informe-accionable"` · `subscribes:` ["informe-accionable.juzgar.request", "contabilidad.aviso_producido", "contabilidad.asiento_asentado"] · `publishes:` ["informe-accionable.juzgar.response", "informe-accionable.juzgar.failed"]
- **C · index.js:** `class InformeAccionable extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_juzgar(input) → { status, data }`
- **E · handler:** `onJuzgarRequest(e) → this._atender(e,'juzgar','informe-accionable.juzgar.response', d=>this._juzgar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `informe-rico.componer.request` · publica → `informe-accionable.juzgar.response`, `informe-accionable.juzgar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

### `narrador-estados` · `MICRO-AGENTE` · eje `analitica`
- **Clase / hoja F2:** `NarradorEstados` (HOJA R3) · acción **CONSTRUIR**
- **Propósito:** Traduce balance/resultado al LENGUAJE del negocio cliente. Lenguaje -> juicio.
- **Depende de:** `balance-situacion`, `cuenta-resultados`
- **Eventos que sube:** `balance-situacion.calcular.request`, `cuenta-resultados.calcular.request`
- **Eventos que publica:** `narrador-estados.narrar.response`, `narrador-estados.narrar.failed`
- **Escucha (subscribes de dominio):** `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca import. Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` + `project-manager`
- **B · module.json:** `name:"narrador-estados"` · `subscribes:` ["narrador-estados.narrar.request", "contabilidad.ejercicio_cerrado"] · `publishes:` ["narrador-estados.narrar.response", "narrador-estados.narrar.failed"]
- **C · index.js:** `class NarradorEstados extends ModuloHibridoReflejo (sin store propio)`
- **D · proyecciones:** `_narrar(input) → { status, data }`
- **E · handler:** `onNarrarRequest(e) → this._atender(e,'narrar','narrador-estados.narrar.response', d=>this._narrar(d))` · **CLASE: PREGUNTA**
- **F · eventos:** sube → `balance-situacion.calcular.request`, `cuenta-resultados.calcular.request` · publica → `narrador-estados.narrar.response`, `narrador-estados.narrar.failed`
- **VERIFICACIÓN:** ficheros en disco (module.json/index.js) + smoke del RPC + par `*.failed` determinista.
- **NO REUTILIZA:** ninguna clase con estado de este dominio existe en el inventario con PosPersistencia per-proyecto; se toma el patrón (`_shared` + instancias vivas) y se CONSTRUYE.

---

## 7 · Resumen de decisión

- **118 hojas** = las **118 clases** del diseño (una por hoja atómica de F2).
- Por acción: **115 CONSTRUIR** · **2 ADAPTAR** · **1 REUTILIZAR**.
- Por forma: **60 REFLEJO** · **29 CUSTODIO** · **14 PUENTE** · **8 MICRO-AGENTE** · **7 CONVERSOR**.
- Por eje: **entrada 32** · **libro 32** · **fiscal 22** · **analítica 32**.
- **RPC: 103 PREGUNTA (BUS) · 46 ORDEN (superficie)** — el dato que faltaba para que F6 no convierta todas en panel.
- **43 hechos de dominio** `contabilidad.*` (29 Custodio + 13 Puente + `P3`); las 75 hojas restantes no inventan hecho.
- **Infra reutilizada como base** (no hoja): `filesystem`, `project-manager`, `credential-manager`, `metricas`, `inventario`.

---

## 8 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos`)

```json enki-plan
{
  "proyecto": "contabilidad",
  "proyecto_id": "contabilidad",
  "origen": "fase3/diseno-oop.md (118 clases con SUBE/PUBLICA/ESCUCHA) + fase2/esquemas/esquema.md (arbol 118 hojas atomicas, formas) + inventario real modules/ (module.json real)",
  "regla": "modulos-isla event-driven: CLASE con estado->CUSTODIO; solo calcula->REFLEJO (proyeccion _op interna); frontera de formato->CONVERSOR; habla con el exterior->PUENTE; juicio con lenguaje->MICRO-AGENTE. Dependencia->EVENTO request/response, nunca import. Todo RPC se clasifica PREGUNTA (va por el BUS) u ORDEN (superficie/panel).",
  "inventario": "248 module.json reales en modules/ (leidos; no por nombre). Candidatos evaluados: facturas, facturacion/fuentes, facturacion/asesoria, inventario, metricas, filesystem, project-manager, credential-manager.",
  "rpc_clase_regla": "PREGUNTA/DERIVACION (calcular·listar·buscar·saldos·estado·informe·traducir·proponer·derivar·medir) -> BUS, NUNCA panel. ORDEN HUMANA/ESCRITURA (declarar·cerrar·firmar·emitir·asentar·ajustar·encolar·archivar·ratificar·registrar·unificar·rectificar·avanzar·entregar·producir) -> superficie (panel).",
  "hojas": [
    {
      "slug": "puerto-evento-vertical",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "entrada",
      "depende_de": [],
      "sube": [],
      "publica": [
        "puerto-evento-vertical.abrir.response",
        "puerto-evento-vertical.abrir.failed",
        "puerto-evento-vertical.recibir.response",
        "puerto-evento-vertical.recibir.failed",
        "contabilidad.hecho_recibido"
      ],
      "rpc_clase": {
        "abrir": "ORDEN",
        "recibir": "ORDEN"
      }
    },
    {
      "slug": "normalizador-hecho",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "entrada",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "normalizador-hecho.entrar.response",
        "normalizador-hecho.entrar.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA"
      }
    },
    {
      "slug": "captura-documento",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "extraccion-dato",
        "puerto-documento"
      ],
      "sube": [
        "extraccion-dato.juzgar.request",
        "puerto-documento.entrar.request"
      ],
      "publica": [
        "captura-documento.admitir.response",
        "captura-documento.admitir.failed"
      ],
      "rpc_clase": {
        "admitir": "PREGUNTA"
      }
    },
    {
      "slug": "extraccion-dato",
      "accion": "ADAPTAR",
      "forma": "micro-agente",
      "eje": "entrada",
      "depende_de": [
        "control-cuadre-documento",
        "encolado-excepcion"
      ],
      "sube": [
        "control-cuadre-documento.cuadra.request",
        "encolado-excepcion.encolar.request"
      ],
      "publica": [
        "extraccion-dato.juzgar.response",
        "extraccion-dato.juzgar.failed"
      ],
      "rpc_clase": {
        "juzgar": "PREGUNTA"
      }
    },
    {
      "slug": "puerto-documento",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "entrada",
      "depende_de": [
        "extraccion-dato"
      ],
      "sube": [
        "extraccion-dato.juzgar.request"
      ],
      "publica": [
        "puerto-documento.entrar.response",
        "puerto-documento.entrar.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA"
      }
    },
    {
      "slug": "control-cuadre-documento",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "encolado-excepcion"
      ],
      "sube": [
        "encolado-excepcion.encolar.request"
      ],
      "publica": [
        "control-cuadre-documento.cuadra.response",
        "control-cuadre-documento.cuadra.failed"
      ],
      "rpc_clase": {
        "cuadra": "PREGUNTA"
      }
    },
    {
      "slug": "puerto-documento-digital",
      "accion": "REUTILIZAR",
      "forma": "puente",
      "eje": "entrada",
      "depende_de": [
        "normalizador-hecho",
        "extraccion-dato"
      ],
      "sube": [
        "normalizador-hecho.entrar.request",
        "extraccion-dato.juzgar.request"
      ],
      "publica": [
        "puerto-documento-digital.recibir.response",
        "puerto-documento-digital.recibir.failed",
        "contabilidad.documento_recibido"
      ],
      "rpc_clase": {
        "recibir": "ORDEN"
      }
    },
    {
      "slug": "contrapartida-asistida",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "entrada",
      "depende_de": [
        "regla-contrapartida"
      ],
      "sube": [
        "regla-contrapartida.aplicar.request"
      ],
      "publica": [
        "contrapartida-asistida.juzgar.response",
        "contrapartida-asistida.juzgar.failed"
      ],
      "rpc_clase": {
        "juzgar": "PREGUNTA"
      }
    },
    {
      "slug": "regla-contrapartida",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "ratificacion-regla-aprendida"
      ],
      "sube": [
        "ratificacion-regla-aprendida.ratificar.request"
      ],
      "publica": [
        "regla-contrapartida.aplicar.response",
        "regla-contrapartida.aplicar.failed",
        "regla-contrapartida.proponer.response",
        "regla-contrapartida.proponer.failed",
        "regla-contrapartida.declarar.response",
        "regla-contrapartida.declarar.failed",
        "contabilidad.contrapartida_regla_declarada"
      ],
      "rpc_clase": {
        "aplicar": "PREGUNTA",
        "proponer": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "deduplicacion-hecho",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "clave-natural"
      ],
      "sube": [
        "clave-natural.calcular.request"
      ],
      "publica": [
        "deduplicacion-hecho.es_nuevo.response",
        "deduplicacion-hecho.es_nuevo.failed"
      ],
      "rpc_clase": {
        "es_nuevo": "PREGUNTA"
      }
    },
    {
      "slug": "encolado-excepcion",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "aviso-revision"
      ],
      "sube": [
        "aviso-revision.empujar.request"
      ],
      "publica": [
        "encolado-excepcion.encolar.response",
        "encolado-excepcion.encolar.failed",
        "encolado-excepcion.tomar.response",
        "encolado-excepcion.tomar.failed",
        "contabilidad.excepcion_encolada"
      ],
      "rpc_clase": {
        "encolar": "ORDEN",
        "tomar": "PREGUNTA"
      }
    },
    {
      "slug": "aviso-revision",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "entrada",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "aviso-revision.empujar.response",
        "aviso-revision.empujar.failed",
        "contabilidad.revision_solicitada"
      ],
      "rpc_clase": {
        "empujar": "ORDEN"
      }
    },
    {
      "slug": "lote-admision",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "normalizador-hecho",
        "escritor-diario"
      ],
      "sube": [
        "normalizador-hecho.entrar.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "lote-admision.admitir.response",
        "lote-admision.admitir.failed"
      ],
      "rpc_clase": {
        "admitir": "PREGUNTA"
      }
    },
    {
      "slug": "contrato-hecho-minimo",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "contrato-hecho-minimo.exigir.response",
        "contrato-hecho-minimo.exigir.failed",
        "contrato-hecho-minimo.declarar.response",
        "contrato-hecho-minimo.declarar.failed",
        "contabilidad.contrato_hecho_declarado"
      ],
      "rpc_clase": {
        "exigir": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "completitud-cobertura",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "completitud-cobertura.medir.response",
        "completitud-cobertura.medir.failed"
      ],
      "rpc_clase": {
        "medir": "PREGUNTA"
      }
    },
    {
      "slug": "hecho-rectificativo",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "entrada",
      "depende_de": [
        "clave-natural",
        "escritor-diario"
      ],
      "sube": [
        "clave-natural.calcular.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "hecho-rectificativo.emparejar.response",
        "hecho-rectificativo.emparejar.failed",
        "contabilidad.hecho_rectificado"
      ],
      "rpc_clase": {
        "emparejar": "ORDEN"
      }
    },
    {
      "slug": "anclaje-cierre-vertical",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "clave-natural",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "clave-natural.calcular.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "anclaje-cierre-vertical.anclar.response",
        "anclaje-cierre-vertical.anclar.failed",
        "anclaje-cierre-vertical.declarar.response",
        "anclaje-cierre-vertical.declarar.failed",
        "contabilidad.anclaje_cierre_declarado"
      ],
      "rpc_clase": {
        "anclar": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "declaracion-fuente-faltante",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "entrada",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "declaracion-fuente-faltante.declarar.response",
        "declaracion-fuente-faltante.declarar.failed",
        "contabilidad.fuente_faltante_declarada"
      ],
      "rpc_clase": {
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "maestro-terceros",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "padron-terceros",
        "expediente-documental"
      ],
      "sube": [
        "padron-terceros.unificar.request",
        "expediente-documental.archivar.request"
      ],
      "publica": [
        "maestro-terceros.ficha.response",
        "maestro-terceros.ficha.failed",
        "maestro-terceros.upsert.response",
        "maestro-terceros.upsert.failed",
        "contabilidad.tercero_actualizado"
      ],
      "rpc_clase": {
        "ficha": "PREGUNTA",
        "upsert": "ORDEN"
      }
    },
    {
      "slug": "padron-terceros",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [],
      "sube": [],
      "publica": [
        "padron-terceros.unificar.response",
        "padron-terceros.unificar.failed",
        "contabilidad.tercero_unificado"
      ],
      "rpc_clase": {
        "unificar": "ORDEN"
      }
    },
    {
      "slug": "cuenta-proveedor",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "mayor-balanza"
      ],
      "sube": [
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "cuenta-proveedor.saldo.response",
        "cuenta-proveedor.saldo.failed",
        "cuenta-proveedor.facturas_vivas.response",
        "cuenta-proveedor.facturas_vivas.failed"
      ],
      "rpc_clase": {
        "saldo": "PREGUNTA",
        "facturas_vivas": "PREGUNTA"
      }
    },
    {
      "slug": "estado-cuenta-proveedor",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "cuenta-proveedor"
      ],
      "sube": [
        "cuenta-proveedor.saldo.request"
      ],
      "publica": [
        "estado-cuenta-proveedor.extracto.response",
        "estado-cuenta-proveedor.extracto.failed"
      ],
      "rpc_clase": {
        "extracto": "PREGUNTA"
      }
    },
    {
      "slug": "cruce-factura-recepcion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "encolado-excepcion",
        "escritor-diario"
      ],
      "sube": [
        "encolado-excepcion.encolar.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "cruce-factura-recepcion.cotejar.response",
        "cruce-factura-recepcion.cotejar.failed"
      ],
      "rpc_clase": {
        "cotejar": "PREGUNTA"
      }
    },
    {
      "slug": "vencimiento-pago",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "maestro-terceros",
        "motor-avisos"
      ],
      "sube": [
        "maestro-terceros.ficha.request",
        "motor-avisos.producir.request"
      ],
      "publica": [
        "vencimiento-pago.calcular.response",
        "vencimiento-pago.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "rappel-pronto-pago",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "cuenta-proveedor",
        "escritor-diario"
      ],
      "sube": [
        "cuenta-proveedor.saldo.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "rappel-pronto-pago.ajustar.response",
        "rappel-pronto-pago.ajustar.failed"
      ],
      "rpc_clase": {
        "ajustar": "PREGUNTA"
      }
    },
    {
      "slug": "antiguedad-de-saldos",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "vencimiento-pago",
        "motor-avisos"
      ],
      "sube": [
        "vencimiento-pago.calcular.request",
        "motor-avisos.producir.request"
      ],
      "publica": [
        "antiguedad-de-saldos.clasificar.response",
        "antiguedad-de-saldos.clasificar.failed"
      ],
      "rpc_clase": {
        "clasificar": "PREGUNTA"
      }
    },
    {
      "slug": "emision-factura-venta",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [
        "registro-verifactu",
        "factura-electronica",
        "escritor-diario",
        "maestro-terceros",
        "expediente-documental"
      ],
      "sube": [
        "registro-verifactu.encadenar.request",
        "factura-electronica.entrar.request",
        "escritor-diario.asentar.request",
        "maestro-terceros.ficha.request",
        "expediente-documental.archivar.request"
      ],
      "publica": [
        "emision-factura-venta.emitir.response",
        "emision-factura-venta.emitir.failed",
        "contabilidad.factura_emitida"
      ],
      "rpc_clase": {
        "emitir": "ORDEN"
      }
    },
    {
      "slug": "factura-rectificativa",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "emision-factura-venta",
        "escritor-diario"
      ],
      "sube": [
        "emision-factura-venta.emitir.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "factura-rectificativa.calcular.response",
        "factura-rectificativa.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "panel-proceso-contable",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "encolado-excepcion",
        "historial-proceso-contable",
        "tasa-cobertura-entrada"
      ],
      "sube": [
        "encolado-excepcion.encolar.request",
        "historial-proceso-contable.anotar.request",
        "tasa-cobertura-entrada.calcular.request"
      ],
      "publica": [
        "panel-proceso-contable.latido.response",
        "panel-proceso-contable.latido.failed"
      ],
      "rpc_clase": {
        "latido": "PREGUNTA"
      }
    },
    {
      "slug": "historial-proceso-contable",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "entrada",
      "depende_de": [],
      "sube": [],
      "publica": [
        "historial-proceso-contable.anotar.response",
        "historial-proceso-contable.anotar.failed",
        "contabilidad.proceso_anotado"
      ],
      "rpc_clase": {
        "anotar": "ORDEN"
      }
    },
    {
      "slug": "desatasco-entrada",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "entrada",
      "depende_de": [
        "escritor-diario",
        "encolado-excepcion",
        "regla-contrapartida",
        "historial-proceso-contable"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "encolado-excepcion.encolar.request",
        "regla-contrapartida.aplicar.request",
        "historial-proceso-contable.anotar.request"
      ],
      "publica": [
        "desatasco-entrada.juzgar.response",
        "desatasco-entrada.juzgar.failed",
        "contabilidad.excepcion_desatascada"
      ],
      "rpc_clase": {
        "juzgar": "ORDEN"
      }
    },
    {
      "slug": "tasa-cobertura-entrada",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "entrada",
      "depende_de": [
        "completitud-cobertura"
      ],
      "sube": [
        "completitud-cobertura.medir.request"
      ],
      "publica": [
        "tasa-cobertura-entrada.calcular.response",
        "tasa-cobertura-entrada.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "catalogo-cuentas",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "catalogo-cuentas.anadir.response",
        "catalogo-cuentas.anadir.failed",
        "catalogo-cuentas.buscar.response",
        "catalogo-cuentas.buscar.failed",
        "contabilidad.plan_cuentas_declarado"
      ],
      "rpc_clase": {
        "anadir": "ORDEN",
        "buscar": "PREGUNTA"
      }
    },
    {
      "slug": "escritor-diario",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "traza-asiento",
        "frontera-planos",
        "periodificacion",
        "deduplicacion-hecho"
      ],
      "sube": [
        "traza-asiento.registrar.request",
        "frontera-planos.verificar.request",
        "periodificacion.imputar.request",
        "deduplicacion-hecho.es_nuevo.request"
      ],
      "publica": [
        "escritor-diario.asentar.response",
        "escritor-diario.asentar.failed",
        "contabilidad.asiento_asentado"
      ],
      "rpc_clase": {
        "asentar": "ORDEN"
      }
    },
    {
      "slug": "mayor-balanza",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario"
      ],
      "sube": [
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "mayor-balanza.saldos.response",
        "mayor-balanza.saldos.failed",
        "mayor-balanza.balanza.response",
        "mayor-balanza.balanza.failed"
      ],
      "rpc_clase": {
        "saldos": "PREGUNTA",
        "balanza": "PREGUNTA"
      }
    },
    {
      "slug": "traza-asiento",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [],
      "sube": [],
      "publica": [
        "traza-asiento.registrar.response",
        "traza-asiento.registrar.failed",
        "contabilidad.traza_registrada"
      ],
      "rpc_clase": {
        "registrar": "ORDEN"
      }
    },
    {
      "slug": "asiento-ajuste",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "libro",
      "depende_de": [
        "escritor-diario",
        "traza-asiento"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "traza-asiento.registrar.request"
      ],
      "publica": [
        "asiento-ajuste.entrar.response",
        "asiento-ajuste.entrar.failed",
        "contabilidad.ajuste_entrado"
      ],
      "rpc_clase": {
        "entrar": "ORDEN"
      }
    },
    {
      "slug": "puerto-plan-contable",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "libro",
      "depende_de": [
        "catalogo-cuentas"
      ],
      "sube": [
        "catalogo-cuentas.buscar.request"
      ],
      "publica": [
        "puerto-plan-contable.entrar.response",
        "puerto-plan-contable.entrar.failed",
        "puerto-plan-contable.salir.response",
        "puerto-plan-contable.salir.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA",
        "salir": "PREGUNTA"
      }
    },
    {
      "slug": "balance-situacion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "mayor-balanza"
      ],
      "sube": [
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "balance-situacion.calcular.response",
        "balance-situacion.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "cuenta-resultados",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "mayor-balanza"
      ],
      "sube": [
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "cuenta-resultados.calcular.response",
        "cuenta-resultados.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "periodificacion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "periodificacion.imputar.response",
        "periodificacion.imputar.failed"
      ],
      "rpc_clase": {
        "imputar": "PREGUNTA"
      }
    },
    {
      "slug": "cierre-ejercicio",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "plan-amortizacion",
        "escritor-diario",
        "aviso-cuadre"
      ],
      "sube": [
        "plan-amortizacion.cuota_del_periodo.request",
        "escritor-diario.asentar.request",
        "aviso-cuadre.avisar.request"
      ],
      "publica": [
        "cierre-ejercicio.cerrar.response",
        "cierre-ejercicio.cerrar.failed",
        "cierre-ejercicio.reabrir.response",
        "cierre-ejercicio.reabrir.failed",
        "contabilidad.ejercicio_cerrado"
      ],
      "rpc_clase": {
        "cerrar": "ORDEN",
        "reabrir": "ORDEN"
      }
    },
    {
      "slug": "apertura-ejercicio",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario"
      ],
      "sube": [
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "apertura-ejercicio.generar.response",
        "apertura-ejercicio.generar.failed"
      ],
      "rpc_clase": {
        "generar": "PREGUNTA"
      }
    },
    {
      "slug": "aviso-cuadre",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "libro",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "aviso-cuadre.avisar.response",
        "aviso-cuadre.avisar.failed",
        "contabilidad.cuadre_no_cuadra"
      ],
      "rpc_clase": {
        "avisar": "ORDEN"
      }
    },
    {
      "slug": "conciliacion-bancaria",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario",
        "partida-no-identificada",
        "partida-conciliatoria"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "partida-no-identificada.juzgar.request",
        "partida-conciliatoria.desfase.request"
      ],
      "publica": [
        "conciliacion-bancaria.cruzar.response",
        "conciliacion-bancaria.cruzar.failed"
      ],
      "rpc_clase": {
        "cruzar": "PREGUNTA"
      }
    },
    {
      "slug": "puerto-extracto",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "libro",
      "depende_de": [
        "conciliacion-bancaria"
      ],
      "sube": [
        "conciliacion-bancaria.cruzar.request"
      ],
      "publica": [
        "puerto-extracto.entrar.response",
        "puerto-extracto.entrar.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA"
      }
    },
    {
      "slug": "cuadre-cobro-pago",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario",
        "partida-no-identificada"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "partida-no-identificada.juzgar.request"
      ],
      "publica": [
        "cuadre-cobro-pago.cuadrar.response",
        "cuadre-cobro-pago.cuadrar.failed"
      ],
      "rpc_clase": {
        "cuadrar": "PREGUNTA"
      }
    },
    {
      "slug": "saldo-tesoreria",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "mayor-balanza"
      ],
      "sube": [
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "saldo-tesoreria.calcular.response",
        "saldo-tesoreria.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "prevision-caja",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "saldo-tesoreria",
        "motor-avisos"
      ],
      "sube": [
        "saldo-tesoreria.calcular.request",
        "motor-avisos.producir.request"
      ],
      "publica": [
        "prevision-caja.proyectar.response",
        "prevision-caja.proyectar.failed"
      ],
      "rpc_clase": {
        "proyectar": "PREGUNTA"
      }
    },
    {
      "slug": "partida-no-identificada",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "libro",
      "depende_de": [
        "regla-movimiento-bancario",
        "encolado-excepcion"
      ],
      "sube": [
        "regla-movimiento-bancario.aplicar.request",
        "encolado-excepcion.encolar.request"
      ],
      "publica": [
        "partida-no-identificada.juzgar.response",
        "partida-no-identificada.juzgar.failed"
      ],
      "rpc_clase": {
        "juzgar": "PREGUNTA"
      }
    },
    {
      "slug": "regla-movimiento-bancario",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "ratificacion-regla-aprendida",
        "escritor-diario"
      ],
      "sube": [
        "ratificacion-regla-aprendida.ratificar.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "regla-movimiento-bancario.aplicar.response",
        "regla-movimiento-bancario.aplicar.failed",
        "regla-movimiento-bancario.proponer.response",
        "regla-movimiento-bancario.proponer.failed",
        "regla-movimiento-bancario.declarar.response",
        "regla-movimiento-bancario.declarar.failed",
        "contabilidad.movimiento_regla_declarada"
      ],
      "rpc_clase": {
        "aplicar": "PREGUNTA",
        "proponer": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "partida-conciliatoria",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "saldo-tesoreria"
      ],
      "sube": [
        "saldo-tesoreria.calcular.request"
      ],
      "publica": [
        "partida-conciliatoria.desfase.response",
        "partida-conciliatoria.desfase.failed"
      ],
      "rpc_clase": {
        "desfase": "PREGUNTA"
      }
    },
    {
      "slug": "informe-conciliacion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "conciliacion-bancaria",
        "partida-conciliatoria"
      ],
      "sube": [
        "conciliacion-bancaria.cruzar.request",
        "partida-conciliatoria.desfase.request"
      ],
      "publica": [
        "informe-conciliacion.componer.response",
        "informe-conciliacion.componer.failed"
      ],
      "rpc_clase": {
        "componer": "PREGUNTA"
      }
    },
    {
      "slug": "maestro-cuentas-bancarias",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "maestro-cuentas-bancarias.declarar.response",
        "maestro-cuentas-bancarias.declarar.failed",
        "maestro-cuentas-bancarias.listar.response",
        "maestro-cuentas-bancarias.listar.failed",
        "contabilidad.cuenta_bancaria_declarada"
      ],
      "rpc_clase": {
        "declarar": "ORDEN",
        "listar": "PREGUNTA"
      }
    },
    {
      "slug": "puerto-exportacion",
      "accion": "ADAPTAR",
      "forma": "conversor",
      "eje": "libro",
      "depende_de": [
        "asiento-ajuste"
      ],
      "sube": [
        "asiento-ajuste.entrar.request"
      ],
      "publica": [
        "puerto-exportacion.salir.response",
        "puerto-exportacion.salir.failed",
        "puerto-exportacion.entrar.response",
        "puerto-exportacion.entrar.failed"
      ],
      "rpc_clase": {
        "salir": "PREGUNTA",
        "entrar": "PREGUNTA"
      }
    },
    {
      "slug": "vista-revisable",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "traza-asiento",
        "mayor-balanza"
      ],
      "sube": [
        "traza-asiento.registrar.request",
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "vista-revisable.explicar.response",
        "vista-revisable.explicar.failed"
      ],
      "rpc_clase": {
        "explicar": "PREGUNTA"
      }
    },
    {
      "slug": "flujo-firma",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [
        "traza-asiento"
      ],
      "sube": [
        "traza-asiento.registrar.request"
      ],
      "publica": [
        "flujo-firma.firmar.response",
        "flujo-firma.firmar.failed",
        "flujo-firma.estado.response",
        "flujo-firma.estado.failed",
        "contabilidad.revision_firmada"
      ],
      "rpc_clase": {
        "firmar": "ORDEN",
        "estado": "PREGUNTA"
      }
    },
    {
      "slug": "expediente-documental",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [],
      "sube": [],
      "publica": [
        "expediente-documental.archivar.response",
        "expediente-documental.archivar.failed",
        "expediente-documental.recuperar.response",
        "expediente-documental.recuperar.failed",
        "contabilidad.documento_archivado"
      ],
      "rpc_clase": {
        "archivar": "ORDEN",
        "recuperar": "PREGUNTA"
      }
    },
    {
      "slug": "control-calidad-muestreo",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario",
        "regla-contrapartida"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "regla-contrapartida.aplicar.request"
      ],
      "publica": [
        "control-calidad-muestreo.seleccionar.response",
        "control-calidad-muestreo.seleccionar.failed"
      ],
      "rpc_clase": {
        "seleccionar": "PREGUNTA"
      }
    },
    {
      "slug": "cambio-desde-ultima-revision",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "escritor-diario",
        "asiento-ajuste",
        "flujo-firma"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "asiento-ajuste.entrar.request",
        "flujo-firma.estado.request"
      ],
      "publica": [
        "cambio-desde-ultima-revision.delta.response",
        "cambio-desde-ultima-revision.delta.failed"
      ],
      "rpc_clase": {
        "delta": "PREGUNTA"
      }
    },
    {
      "slug": "ratificacion-regla-aprendida",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "libro",
      "depende_de": [],
      "sube": [],
      "publica": [
        "ratificacion-regla-aprendida.ratificar.response",
        "ratificacion-regla-aprendida.ratificar.failed",
        "contabilidad.regla_ratificada"
      ],
      "rpc_clase": {
        "ratificar": "ORDEN"
      }
    },
    {
      "slug": "frontera-planos",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [],
      "sube": [],
      "publica": [
        "frontera-planos.verificar.response",
        "frontera-planos.verificar.failed"
      ],
      "rpc_clase": {
        "verificar": "PREGUNTA"
      }
    },
    {
      "slug": "single-writer",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "libro",
      "depende_de": [],
      "sube": [],
      "publica": [
        "single-writer.reclamar.response",
        "single-writer.reclamar.failed",
        "single-writer.es_escritor.response",
        "single-writer.es_escritor.failed",
        "contabilidad.parcela_reclamada"
      ],
      "rpc_clase": {
        "reclamar": "ORDEN",
        "es_escritor": "PREGUNTA"
      }
    },
    {
      "slug": "clave-natural",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "clave-natural.calcular.response",
        "clave-natural.calcular.failed",
        "clave-natural.coincide.response",
        "clave-natural.coincide.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA",
        "coincide": "PREGUNTA"
      }
    },
    {
      "slug": "liquidacion-iva",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "mayor-balanza",
        "perfil-administrativo"
      ],
      "sube": [
        "mayor-balanza.saldos.request",
        "perfil-administrativo.obligaciones.request"
      ],
      "publica": [
        "liquidacion-iva.calcular.response",
        "liquidacion-iva.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "modelo-303",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "liquidacion-iva"
      ],
      "sube": [
        "liquidacion-iva.calcular.request"
      ],
      "publica": [
        "modelo-303.construir.response",
        "modelo-303.construir.failed"
      ],
      "rpc_clase": {
        "construir": "PREGUNTA"
      }
    },
    {
      "slug": "modelo-390",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "liquidacion-iva"
      ],
      "sube": [
        "liquidacion-iva.calcular.request"
      ],
      "publica": [
        "modelo-390.construir.response",
        "modelo-390.construir.failed"
      ],
      "rpc_clase": {
        "construir": "PREGUNTA"
      }
    },
    {
      "slug": "retenciones",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "mayor-balanza"
      ],
      "sube": [
        "mayor-balanza.saldos.request"
      ],
      "publica": [
        "retenciones.calcular.response",
        "retenciones.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "estimacion-is-irpf",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "cuenta-resultados",
        "perfil-administrativo"
      ],
      "sube": [
        "cuenta-resultados.calcular.request",
        "perfil-administrativo.obligaciones.request"
      ],
      "publica": [
        "estimacion-is-irpf.estimar.response",
        "estimacion-is-irpf.estimar.failed"
      ],
      "rpc_clase": {
        "estimar": "PREGUNTA"
      }
    },
    {
      "slug": "calendario-fiscal",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "calendario-fiscal.proximos.response",
        "calendario-fiscal.proximos.failed",
        "calendario-fiscal.declarar.response",
        "calendario-fiscal.declarar.failed",
        "contabilidad.plazo_declarado"
      ],
      "rpc_clase": {
        "proximos": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "generador-modelo",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "fiscal",
      "depende_de": [
        "estado-presentacion-fiscal"
      ],
      "sube": [
        "estado-presentacion-fiscal.avanzar.request"
      ],
      "publica": [
        "generador-modelo.exportar.response",
        "generador-modelo.exportar.failed",
        "contabilidad.modelo_exportado"
      ],
      "rpc_clase": {
        "exportar": "ORDEN"
      }
    },
    {
      "slug": "registro-verifactu",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [],
      "sube": [],
      "publica": [
        "registro-verifactu.encadenar.response",
        "registro-verifactu.encadenar.failed",
        "contabilidad.factura_encadenada"
      ],
      "rpc_clase": {
        "encadenar": "ORDEN"
      }
    },
    {
      "slug": "factura-electronica",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "fiscal",
      "depende_de": [],
      "sube": [],
      "publica": [
        "factura-electronica.entrar.response",
        "factura-electronica.entrar.failed",
        "factura-electronica.salir.response",
        "factura-electronica.salir.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA",
        "salir": "PREGUNTA"
      }
    },
    {
      "slug": "estado-presentacion-fiscal",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [
        "motor-avisos"
      ],
      "sube": [
        "motor-avisos.producir.request"
      ],
      "publica": [
        "estado-presentacion-fiscal.avanzar.response",
        "estado-presentacion-fiscal.avanzar.failed",
        "contabilidad.obligacion_avanzada"
      ],
      "rpc_clase": {
        "avanzar": "ORDEN"
      }
    },
    {
      "slug": "acuse-presentacion",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "fiscal",
      "depende_de": [
        "estado-presentacion-fiscal",
        "escritor-diario",
        "expediente-documental"
      ],
      "sube": [
        "estado-presentacion-fiscal.avanzar.request",
        "escritor-diario.asentar.request",
        "expediente-documental.archivar.request"
      ],
      "publica": [
        "acuse-presentacion.ligar.response",
        "acuse-presentacion.ligar.failed",
        "contabilidad.declaracion_justificada"
      ],
      "rpc_clase": {
        "ligar": "ORDEN"
      }
    },
    {
      "slug": "rectificacion-declaracion",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [
        "estado-presentacion-fiscal"
      ],
      "sube": [
        "estado-presentacion-fiscal.avanzar.request"
      ],
      "publica": [
        "rectificacion-declaracion.rectificar.response",
        "rectificacion-declaracion.rectificar.failed",
        "contabilidad.declaracion_rectificada"
      ],
      "rpc_clase": {
        "rectificar": "ORDEN"
      }
    },
    {
      "slug": "perfil-administrativo",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [
        "calendario-fiscal",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "calendario-fiscal.declarar.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "perfil-administrativo.obligaciones.response",
        "perfil-administrativo.obligaciones.failed",
        "perfil-administrativo.declarar.response",
        "perfil-administrativo.declarar.failed",
        "contabilidad.perfil_administrativo_declarado"
      ],
      "rpc_clase": {
        "obligaciones": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "recibo-nomina",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [],
      "sube": [],
      "publica": [
        "recibo-nomina.dar_forma.response",
        "recibo-nomina.dar_forma.failed"
      ],
      "rpc_clase": {
        "dar_forma": "PREGUNTA"
      }
    },
    {
      "slug": "obligacion-seguridad-social",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina",
        "calendario-fiscal"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request",
        "calendario-fiscal.declarar.request"
      ],
      "publica": [
        "obligacion-seguridad-social.calcular.response",
        "obligacion-seguridad-social.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "asiento-personal",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina",
        "obligacion-seguridad-social",
        "escritor-diario"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request",
        "obligacion-seguridad-social.calcular.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "asiento-personal.construir.response",
        "asiento-personal.construir.failed"
      ],
      "rpc_clase": {
        "construir": "PREGUNTA"
      }
    },
    {
      "slug": "puerto-nomina",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request"
      ],
      "publica": [
        "puerto-nomina.recibir.response",
        "puerto-nomina.recibir.failed",
        "contabilidad.nomina_recibida"
      ],
      "rpc_clase": {
        "recibir": "ORDEN"
      }
    },
    {
      "slug": "lineas-nomina",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request"
      ],
      "publica": [
        "lineas-nomina.desglosar.response",
        "lineas-nomina.desglosar.failed"
      ],
      "rpc_clase": {
        "desglosar": "PREGUNTA"
      }
    },
    {
      "slug": "acceso-nomina",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "fiscal",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "acceso-nomina.autorizar.response",
        "acceso-nomina.autorizar.failed",
        "acceso-nomina.declarar.response",
        "acceso-nomina.declarar.failed",
        "contabilidad.acceso_nomina_declarado"
      ],
      "rpc_clase": {
        "autorizar": "PREGUNTA",
        "declarar": "ORDEN"
      }
    },
    {
      "slug": "pagos-a-cuenta-empleado",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request"
      ],
      "publica": [
        "pagos-a-cuenta-empleado.impacto.response",
        "pagos-a-cuenta-empleado.impacto.failed"
      ],
      "rpc_clase": {
        "impacto": "PREGUNTA"
      }
    },
    {
      "slug": "conceptos-extra-nomina",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "recibo-nomina",
        "escritor-diario"
      ],
      "sube": [
        "recibo-nomina.dar_forma.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "conceptos-extra-nomina.imputar.response",
        "conceptos-extra-nomina.imputar.failed"
      ],
      "rpc_clase": {
        "imputar": "PREGUNTA"
      }
    },
    {
      "slug": "liquidacion-baja-empleado",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "fiscal",
      "depende_de": [
        "escritor-diario",
        "cuenta-proveedor"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "cuenta-proveedor.saldo.request"
      ],
      "publica": [
        "liquidacion-baja-empleado.liquidar.response",
        "liquidacion-baja-empleado.liquidar.failed"
      ],
      "rpc_clase": {
        "liquidar": "PREGUNTA"
      }
    },
    {
      "slug": "alta-activo",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [
        "escritor-diario",
        "plan-amortizacion",
        "expediente-documental"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "plan-amortizacion.cuota_del_periodo.request",
        "expediente-documental.archivar.request"
      ],
      "publica": [
        "alta-activo.registrar.response",
        "alta-activo.registrar.failed",
        "contabilidad.activo_alta"
      ],
      "rpc_clase": {
        "registrar": "ORDEN"
      }
    },
    {
      "slug": "plan-amortizacion",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [
        "escritor-diario",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "plan-amortizacion.cuota_del_periodo.response",
        "plan-amortizacion.cuota_del_periodo.failed",
        "plan-amortizacion.generar_cuota.response",
        "plan-amortizacion.generar_cuota.failed",
        "contabilidad.cuota_amortizacion_generada"
      ],
      "rpc_clase": {
        "cuota_del_periodo": "PREGUNTA",
        "generar_cuota": "ORDEN"
      }
    },
    {
      "slug": "baja-activo",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "valor-neto-contable",
        "escritor-diario"
      ],
      "sube": [
        "valor-neto-contable.calcular.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "baja-activo.calcular.response",
        "baja-activo.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "valor-neto-contable",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "plan-amortizacion"
      ],
      "sube": [
        "plan-amortizacion.cuota_del_periodo.request"
      ],
      "publica": [
        "valor-neto-contable.calcular.response",
        "valor-neto-contable.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "valoracion-existencia",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "frontera-ficha-producto"
      ],
      "sube": [
        "frontera-ficha-producto.entrar.request"
      ],
      "publica": [
        "valoracion-existencia.valorar.response",
        "valoracion-existencia.valorar.failed"
      ],
      "rpc_clase": {
        "valorar": "PREGUNTA"
      }
    },
    {
      "slug": "frontera-ficha-producto",
      "accion": "CONSTRUIR",
      "forma": "conversor",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "frontera-ficha-producto.entrar.response",
        "frontera-ficha-producto.entrar.failed"
      ],
      "rpc_clase": {
        "entrar": "PREGUNTA"
      }
    },
    {
      "slug": "ajuste-inventario",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "escritor-diario",
        "motor-avisos"
      ],
      "sube": [
        "escritor-diario.asentar.request",
        "motor-avisos.producir.request"
      ],
      "publica": [
        "ajuste-inventario.diferencia.response",
        "ajuste-inventario.diferencia.failed"
      ],
      "rpc_clase": {
        "diferencia": "PREGUNTA"
      }
    },
    {
      "slug": "variacion-stock-valorada",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "valoracion-existencia",
        "escritor-diario"
      ],
      "sube": [
        "valoracion-existencia.valorar.request",
        "escritor-diario.asentar.request"
      ],
      "publica": [
        "variacion-stock-valorada.variacion.response",
        "variacion-stock-valorada.variacion.failed"
      ],
      "rpc_clase": {
        "variacion": "PREGUNTA"
      }
    },
    {
      "slug": "marca-sociedad",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "marca-sociedad.marcar.response",
        "marca-sociedad.marcar.failed"
      ],
      "rpc_clase": {
        "marcar": "PREGUNTA"
      }
    },
    {
      "slug": "eliminacion-intercompany",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "eliminacion-intercompany.eliminar.response",
        "eliminacion-intercompany.eliminar.failed"
      ],
      "rpc_clase": {
        "eliminar": "PREGUNTA"
      }
    },
    {
      "slug": "consolidacion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "mayor-balanza",
        "balance-situacion",
        "cuenta-resultados",
        "eliminacion-intercompany",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "mayor-balanza.saldos.request",
        "balance-situacion.calcular.request",
        "cuenta-resultados.calcular.request",
        "eliminacion-intercompany.eliminar.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "consolidacion.estados.response",
        "consolidacion.estados.failed"
      ],
      "rpc_clase": {
        "estados": "PREGUNTA"
      }
    },
    {
      "slug": "aislamiento-negocio",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [
        "single-writer"
      ],
      "sube": [
        "single-writer.reclamar.request"
      ],
      "publica": [
        "aislamiento-negocio.parcela.response",
        "aislamiento-negocio.parcela.failed",
        "aislamiento-negocio.escritor.response",
        "aislamiento-negocio.escritor.failed",
        "aislamiento-negocio.crear_parcela.response",
        "aislamiento-negocio.crear_parcela.failed",
        "contabilidad.negocio_parcela_creada"
      ],
      "rpc_clase": {
        "parcela": "PREGUNTA",
        "escritor": "PREGUNTA",
        "crear_parcela": "ORDEN"
      }
    },
    {
      "slug": "etiquetado-analitico",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "analitica",
      "depende_de": [
        "encolado-excepcion",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "encolado-excepcion.encolar.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "etiquetado-analitico.juzgar.response",
        "etiquetado-analitico.juzgar.failed"
      ],
      "rpc_clase": {
        "juzgar": "PREGUNTA"
      }
    },
    {
      "slug": "margen-analitico",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "mayor-balanza",
        "valoracion-existencia",
        "coste-indirecto"
      ],
      "sube": [
        "mayor-balanza.saldos.request",
        "valoracion-existencia.valorar.request",
        "coste-indirecto.repartir.request"
      ],
      "publica": [
        "margen-analitico.calcular.response",
        "margen-analitico.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "presupuesto",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "presupuesto.fijar.response",
        "presupuesto.fijar.failed",
        "presupuesto.objetivo.response",
        "presupuesto.objetivo.failed",
        "contabilidad.presupuesto_fijado"
      ],
      "rpc_clase": {
        "fijar": "ORDEN",
        "objetivo": "PREGUNTA"
      }
    },
    {
      "slug": "desviacion",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "margen-analitico",
        "presupuesto",
        "motor-avisos"
      ],
      "sube": [
        "margen-analitico.calcular.request",
        "presupuesto.objetivo.request",
        "motor-avisos.producir.request"
      ],
      "publica": [
        "desviacion.calcular.response",
        "desviacion.calcular.failed"
      ],
      "rpc_clase": {
        "calcular": "PREGUNTA"
      }
    },
    {
      "slug": "coste-indirecto",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "mayor-balanza",
        "cola-declaraciones-criterio"
      ],
      "sube": [
        "mayor-balanza.saldos.request",
        "cola-declaraciones-criterio.fijar.request"
      ],
      "publica": [
        "coste-indirecto.repartir.response",
        "coste-indirecto.repartir.failed"
      ],
      "rpc_clase": {
        "repartir": "PREGUNTA"
      }
    },
    {
      "slug": "cuadro-mando-contable",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "saldo-tesoreria",
        "cuenta-resultados",
        "margen-analitico",
        "desviacion"
      ],
      "sube": [
        "saldo-tesoreria.calcular.request",
        "cuenta-resultados.calcular.request",
        "margen-analitico.calcular.request",
        "desviacion.calcular.request"
      ],
      "publica": [
        "cuadro-mando-contable.componer.response",
        "cuadro-mando-contable.componer.failed"
      ],
      "rpc_clase": {
        "componer": "PREGUNTA"
      }
    },
    {
      "slug": "comparador-periodos",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "presupuesto",
        "desviacion"
      ],
      "sube": [
        "presupuesto.objetivo.request",
        "desviacion.calcular.request"
      ],
      "publica": [
        "comparador-periodos.comparar.response",
        "comparador-periodos.comparar.failed"
      ],
      "rpc_clase": {
        "comparar": "PREGUNTA"
      }
    },
    {
      "slug": "tablero-margen-dimension",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "margen-analitico"
      ],
      "sube": [
        "margen-analitico.calcular.request"
      ],
      "publica": [
        "tablero-margen-dimension.cruzar.response",
        "tablero-margen-dimension.cruzar.failed"
      ],
      "rpc_clase": {
        "cruzar": "PREGUNTA"
      }
    },
    {
      "slug": "onboarding-negocio",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [
        "aislamiento-negocio",
        "catalogo-cuentas"
      ],
      "sube": [
        "aislamiento-negocio.parcela.request",
        "catalogo-cuentas.buscar.request"
      ],
      "publica": [
        "onboarding-negocio.recoger.response",
        "onboarding-negocio.recoger.failed",
        "onboarding-negocio.leer.response",
        "onboarding-negocio.leer.failed",
        "contabilidad.negocio_registrado"
      ],
      "rpc_clase": {
        "recoger": "ORDEN",
        "leer": "PREGUNTA"
      }
    },
    {
      "slug": "motor-avisos",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "analitica",
      "depende_de": [
        "aviso-al-negocio"
      ],
      "sube": [
        "aviso-al-negocio.entregar.request"
      ],
      "publica": [
        "motor-avisos.producir.response",
        "motor-avisos.producir.failed",
        "contabilidad.aviso_producido"
      ],
      "rpc_clase": {
        "producir": "ORDEN"
      }
    },
    {
      "slug": "informe-rico",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "informe-rico.componer.response",
        "informe-rico.componer.failed"
      ],
      "rpc_clase": {
        "componer": "PREGUNTA"
      }
    },
    {
      "slug": "activacion-vertical",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "onboarding-negocio"
      ],
      "sube": [
        "onboarding-negocio.recoger.request"
      ],
      "publica": [
        "activacion-vertical.activar.response",
        "activacion-vertical.activar.failed"
      ],
      "rpc_clase": {
        "activar": "PREGUNTA"
      }
    },
    {
      "slug": "cola-declaraciones-criterio",
      "accion": "CONSTRUIR",
      "forma": "custodio",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "cola-declaraciones-criterio.fijar.response",
        "cola-declaraciones-criterio.fijar.failed",
        "cola-declaraciones-criterio.ratificar.response",
        "cola-declaraciones-criterio.ratificar.failed",
        "contabilidad.criterio_fijado"
      ],
      "rpc_clase": {
        "fijar": "ORDEN",
        "ratificar": "ORDEN"
      }
    },
    {
      "slug": "consulta-cuentas-bajo-demanda",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "analitica",
      "depende_de": [
        "puente-lenguaje-dueno",
        "mayor-balanza",
        "saldo-tesoreria",
        "cuenta-resultados",
        "sello-cobertura",
        "marca-borrador-validado"
      ],
      "sube": [
        "puente-lenguaje-dueno.a_consulta.request",
        "mayor-balanza.saldos.request",
        "saldo-tesoreria.calcular.request",
        "cuenta-resultados.calcular.request",
        "sello-cobertura.sellar.request",
        "marca-borrador-validado.estado.request"
      ],
      "publica": [
        "consulta-cuentas-bajo-demanda.preguntar.response",
        "consulta-cuentas-bajo-demanda.preguntar.failed"
      ],
      "rpc_clase": {
        "preguntar": "PREGUNTA"
      }
    },
    {
      "slug": "puente-lenguaje-dueno",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "analitica",
      "depende_de": [],
      "sube": [],
      "publica": [
        "puente-lenguaje-dueno.a_consulta.response",
        "puente-lenguaje-dueno.a_consulta.failed",
        "puente-lenguaje-dueno.a_cifra.response",
        "puente-lenguaje-dueno.a_cifra.failed"
      ],
      "rpc_clase": {
        "a_consulta": "PREGUNTA",
        "a_cifra": "PREGUNTA"
      }
    },
    {
      "slug": "sello-cobertura",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "completitud-cobertura"
      ],
      "sube": [
        "completitud-cobertura.medir.request"
      ],
      "publica": [
        "sello-cobertura.sellar.response",
        "sello-cobertura.sellar.failed"
      ],
      "rpc_clase": {
        "sellar": "PREGUNTA"
      }
    },
    {
      "slug": "marca-borrador-validado",
      "accion": "CONSTRUIR",
      "forma": "reflejo",
      "eje": "analitica",
      "depende_de": [
        "traza-asiento",
        "flujo-firma"
      ],
      "sube": [
        "traza-asiento.registrar.request",
        "flujo-firma.estado.request"
      ],
      "publica": [
        "marca-borrador-validado.estado.response",
        "marca-borrador-validado.estado.failed"
      ],
      "rpc_clase": {
        "estado": "PREGUNTA"
      }
    },
    {
      "slug": "aviso-al-negocio",
      "accion": "CONSTRUIR",
      "forma": "puente",
      "eje": "analitica",
      "depende_de": [
        "informe-accionable",
        "narrador-estados"
      ],
      "sube": [
        "informe-accionable.juzgar.request",
        "narrador-estados.narrar.request"
      ],
      "publica": [
        "aviso-al-negocio.entregar.response",
        "aviso-al-negocio.entregar.failed",
        "contabilidad.aviso_entregado"
      ],
      "rpc_clase": {
        "entregar": "ORDEN"
      }
    },
    {
      "slug": "informe-accionable",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "analitica",
      "depende_de": [
        "informe-rico"
      ],
      "sube": [
        "informe-rico.componer.request"
      ],
      "publica": [
        "informe-accionable.juzgar.response",
        "informe-accionable.juzgar.failed"
      ],
      "rpc_clase": {
        "juzgar": "PREGUNTA"
      }
    },
    {
      "slug": "narrador-estados",
      "accion": "CONSTRUIR",
      "forma": "micro-agente",
      "eje": "analitica",
      "depende_de": [
        "balance-situacion",
        "cuenta-resultados"
      ],
      "sube": [
        "balance-situacion.calcular.request",
        "cuenta-resultados.calcular.request"
      ],
      "publica": [
        "narrador-estados.narrar.response",
        "narrador-estados.narrar.failed"
      ],
      "rpc_clase": {
        "narrar": "PREGUNTA"
      }
    }
  ],
  "orden": [
    "cola-declaraciones-criterio",
    "eliminacion-intercompany",
    "expediente-documental",
    "factura-electronica",
    "frontera-ficha-producto",
    "frontera-planos",
    "historial-proceso-contable",
    "informe-rico",
    "marca-sociedad",
    "padron-terceros",
    "puente-lenguaje-dueno",
    "puerto-evento-vertical",
    "ratificacion-regla-aprendida",
    "recibo-nomina",
    "registro-verifactu",
    "single-writer",
    "traza-asiento",
    "acceso-nomina",
    "catalogo-cuentas",
    "clave-natural",
    "contrato-hecho-minimo",
    "maestro-cuentas-bancarias",
    "normalizador-hecho",
    "periodificacion",
    "presupuesto",
    "valoracion-existencia",
    "informe-accionable",
    "maestro-terceros",
    "regla-contrapartida",
    "lineas-nomina",
    "pagos-a-cuenta-empleado",
    "puerto-nomina",
    "aislamiento-negocio",
    "flujo-firma",
    "puerto-plan-contable",
    "anclaje-cierre-vertical",
    "deduplicacion-hecho",
    "contrapartida-asistida",
    "onboarding-negocio",
    "marca-borrador-validado",
    "escritor-diario",
    "activacion-vertical",
    "apertura-ejercicio",
    "asiento-ajuste",
    "conceptos-extra-nomina",
    "control-calidad-muestreo",
    "emision-factura-venta",
    "hecho-rectificativo",
    "lote-admision",
    "mayor-balanza",
    "plan-amortizacion",
    "regla-movimiento-bancario",
    "variacion-stock-valorada",
    "cambio-desde-ultima-revision",
    "puerto-exportacion",
    "factura-rectificativa",
    "balance-situacion",
    "coste-indirecto",
    "cuenta-proveedor",
    "cuenta-resultados",
    "retenciones",
    "saldo-tesoreria",
    "vista-revisable",
    "alta-activo",
    "valor-neto-contable",
    "margen-analitico",
    "estado-cuenta-proveedor",
    "liquidacion-baja-empleado",
    "rappel-pronto-pago",
    "consolidacion",
    "narrador-estados",
    "partida-conciliatoria",
    "baja-activo",
    "tablero-margen-dimension",
    "aviso-al-negocio",
    "motor-avisos",
    "ajuste-inventario",
    "aviso-cuadre",
    "aviso-revision",
    "calendario-fiscal",
    "completitud-cobertura",
    "declaracion-fuente-faltante",
    "desviacion",
    "estado-presentacion-fiscal",
    "prevision-caja",
    "vencimiento-pago",
    "cierre-ejercicio",
    "encolado-excepcion",
    "obligacion-seguridad-social",
    "perfil-administrativo",
    "sello-cobertura",
    "tasa-cobertura-entrada",
    "comparador-periodos",
    "cuadro-mando-contable",
    "acuse-presentacion",
    "generador-modelo",
    "rectificacion-declaracion",
    "antiguedad-de-saldos",
    "control-cuadre-documento",
    "cruce-factura-recepcion",
    "desatasco-entrada",
    "etiquetado-analitico",
    "partida-no-identificada",
    "asiento-personal",
    "estimacion-is-irpf",
    "liquidacion-iva",
    "consulta-cuentas-bajo-demanda",
    "panel-proceso-contable",
    "extraccion-dato",
    "conciliacion-bancaria",
    "cuadre-cobro-pago",
    "modelo-303",
    "modelo-390",
    "puerto-documento",
    "puerto-documento-digital",
    "informe-conciliacion",
    "puerto-extracto",
    "captura-documento"
  ],
  "counts": {
    "hojas": 118,
    "por_eje": {
      "entrada": 32,
      "libro": 32,
      "fiscal": 22,
      "analitica": 32
    },
    "por_forma": {
      "puente": 14,
      "conversor": 7,
      "reflejo": 60,
      "micro-agente": 8,
      "custodio": 29
    },
    "por_accion": {
      "CONSTRUIR": 115,
      "ADAPTAR": 2,
      "REUTILIZAR": 1
    },
    "rpc_pregunta": 103,
    "rpc_orden": 46
  },
  "reutiliza_infra": [
    "filesystem",
    "project-manager",
    "credential-manager",
    "metricas",
    "inventario"
  ],
  "nota": "118 hojas = las 118 clases del diseno (una por hoja atomica F2). Infra (filesystem, project-manager, credential-manager, metricas, inventario) se declara como base de reutilizacion dentro de cada hoja, no como hoja propia: no tiene eje ni clase."
}
```
