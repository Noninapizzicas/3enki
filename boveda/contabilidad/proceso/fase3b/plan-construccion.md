# Plan de construcción — CONTABILIDAD (Fase 3b · ADAPTADOR)

> **Proyecto:** `contabilidad` (capacidad transversal observadora VENDIBLE) · **Fase:** 3b · ADAPTADOR
> **Fecha:** 2026-09-29 · **Modelo:** prisma-universal en lente de ADAPTADOR
> **Entrada:** `boveda/contabilidad/proceso/fase3/diseno-oop.md` (118 clases OOP) ·
> `boveda/contabilidad/proceso/fase2/esquemas/esquema.md` (118 hojas atómicas, 18 grupos, 7 conflictos, partición 32/32/22/32) ·
> `boveda/contabilidad/proceso/fase3b/inventario-modulos-enki.json` (**INVENTARIO REAL: 248 módulos**, contrato leído del `module.json`)
> **Patrones vivos:** `arquitectura/cabecera/patron/modulo-real.md` · `modulo-hibrido.md`
>
> **LEY DE LA UNIDAD (inviolable):** **118 clases → 118 hojas. UNA clase = UN módulo.**
> Ninguna hoja agrupa dos clases. Donde el diseño vio parentesco (N1/N2 · N6/N8 · tipos transversales),
> se conservan **dos hojas** y se dirige `[ABIERTO]` al dueño. **La decisión de fusionar es del dueño, no de esta fase.**

## Totales

| Métrica | Valor |
|---|---|
| Clases OOP traducidas | **118** |
| Hojas emitidas | **118** (= CONSTRUIR + REUTILIZAR) |
| **CONSTRUIR** | **116** |
| **ADAPTAR** | **0** (ver §2 — los módulos mono-negocio no se adaptan: se toma su patrón) |
| **REUTILIZAR** | **2** (`extraccion-dato` ← `facturas` · `puerto-documento-digital` ← `facturacion/fuentes`) |
| Reparto por ejes | entrada 32 · libro 32 · fiscal 22 · analítica 32 |
| Órden topológico (`orden`) | **118 slugs** |

---

## §1 · Reglas de traducción (innegociables)

| Clase del diseño OOP | Traducción Enki |
|---|---|
| CLASE con estado (`FORMA: CUSTODIO`) | módulo **CUSTODIO** (single-writer de su store, `PosPersistencia`) |
| CLASE que solo calcula (`FORMA: REFLEJO`) | módulo **REFLEJO** (`ModuloHibridoReflejo`, proyección `_op` determinista) — si el diseño dice que es proyección interna de otra clase, no lleva módulo propio |
| CLASE que orquesta / ejerce juicio (`FORMA: MICRO-AGENTE`) | módulo **MICRO-AGENTE** (reflejo + blueprint; propone, nunca escribe) |
| CLASE que cruza formatos (`FORMA: CONVERSOR`) | módulo **CONVERSOR** (frontera única de formato) |
| CLASE que habla con el exterior (`FORMA: PUENTE`) | módulo **PUENTE** (canal declarable; no impone, no pisa lo manual) |
| Dependencia entre clases | **EVENTO request/response**, nunca `import` |
| Lógica de negocio | DENTRO del módulo como proyección `_op`; `_shared/` SOLO infraestructura |

**Reglas operativas:**

1. **Slug de la hoja = slug del módulo** (el de la hoja atómica F2). ASCII, sin tildes ni ñ.
2. **Tópicos del bus en ASCII** (`nomina`, `anadir`, `senales`). Cada módulo sirve `<slug>.<op>.request`
   y publica el par `<slug>.<op>.response` + `<slug>.<op>.failed` (**todo flujo cierra su círculo**).
3. **Persistencia:** toda hoja `CUSTODIO` extiende `ModuloHibridoReflejo` + `PosPersistencia` y declara
   `project.activated` en `subscribes` (restaura estado del proyecto).
4. **MICRO-AGENTE:** el reflejo sirve lo determinista; el blueprint (cajones) hace lo fuzzy y **delega** al
   reflejo (`blueprint → reflejo`, nunca `blueprint → blueprint`). **Propone** (`Propuesta<Confianza>`);
   la escritura la hace siempre el `CUSTODIO` dueño de la parcela.
5. **`_shared/` SOLO infraestructura** (`modulo-hibrido-reflejo.js`, `pos-persistencia.js`). Ninguna hoja mete
   lógica de negocio en `_shared`.
6. **Acciones:** `CONSTRUIR` (módulo nuevo) · `ADAPTAR` (módulo existente modificado) · `REUTILIZAR`
   (módulo existente cubre el contrato exacto → sin módulo nuevo). Cada `CONSTRUIR` justifica por qué no reutiliza (§2).
7. **Los 26 tipos de soporte** (`Hecho`, `Asiento`, `Apunte`, `Cuenta`, `Tercero`, `Vencimiento`…) **NO son hojas**:
   son value objects que viven en `_shared/` o como contrato de payload. No llevan módulo.

---

## §2 · Inventario — REUTILIZAR / ADAPTAR / CONSTRUIR y descartados

> **Método:** se juzga por el **`module.json` REAL** (name/description/subscribes/publishes/tools del
> inventario de 248 módulos), **nunca por el nombre**. `REUTILIZAR` exige que el contrato real **cubra
> exactamente** la clase; si no, se **CONSTRUYE** y se documenta el motivo.

### 2.1 · REUTILIZAR (justificado clase a clase)

#### R1 · `extraccion-dato` (HOJA A4.1 · MICRO-AGENTE · eje `entrada`) ← módulo **`facturas`**

- **Clase:** `ExtraccionDato` — `juzgar(doc:Documento):Propuesta<Hecho>`; *abre un documento NO estructurado y lo
  vuelve dato; interpretar lo ilegible es juicio; no asienta: PROPONE.*
- **Contrato REAL de `facturas` (v3.0.0):**
  - `subscribes`: `["factura.entrada"]`
  - `publishes`: `["factura.recibida","factura.procesada","factura.error","factura.exportada","telegram.send_message.request"]`
  - `tools`: `["facturas.procesar","facturas.listar","facturas.estadisticas"]`
  - `description`: *pipeline step-based (Intake → Convert → Prepare → OCR → Structure (IA) → Validate → Store)*.
- **Cobertura exacta:** el módulo **ya es** la puerta "documento no estructurado → dato": su paso
  **OCR + Structure (IA)** interpreta el documento (juicio) y **`facturas.procesar`** entrega el dato estructurado.
  **No asienta en ningún libro contable** (guarda "procesada"): eso satisface literalmente *"no asienta: PROPONE"*.
  Es **genérico** (procesamiento comercial de facturas — no está atado a una vertical en su `module.json`).
- **Justificación individual:** el contrato REAL cubre la responsabilidad de la clase sin construir nada nuevo.
  La conformación del dato extraído a `Hecho` asentable es competencia de **A2 `normalizador-hecho`** (frontera única de formato),
  no de A4.1 — por eso la reutilización **no** desplaza responsabilidad a esta clase.
- **Frontera declarada:** A4.1 conserva su puerto (`documento → dato`); su implementación se apoya en `facturas.procesar`.

#### R2 · `puerto-documento-digital` (HOJA A5 · PUENTE · eje `entrada`) ← módulo **`facturacion/fuentes`**

- **Clase:** `PuertoDocumentoDigital` — `recibir():Flujo<Documento>`; *recepción digital declarable;
  conecta con el canal emisor; si no existe, se crea.*
- **Contrato REAL de `facturacion/fuentes` (v2.0.0):**
  - `subscribes`: `["telegram.document.received","telegram.photo.received"]`
  - `publishes`: `["factura.entrada"]`
  - `description`: *adaptador **strategy-pattern** de fuentes de entrada de facturas (Telegram push, Gmail pull, **extensible**);
    dispatch a strategies; emite `factura.entrada` con shape canónico.*
- **Cobertura exacta:** es exactamente el **PUENTE de recepción digital declarable y extensible** que la clase define:
  varios canales intercambiables por estrategia, que normalizan la entrada y la emiten al bus. El diseño dice
  *"si no existe, se crea"* — **ya existe**, luego se reutiliza.
- **Justificación individual:** contrato real = recepción digital multi-canal declarable = contrato de A5. Un solo módulo cubre la clase.
- **Frontera declarada:** A5 no impone canal; los canales se declaran por estrategia (declarable por negocio).

> **Total REUTILIZAR: 2 clases.** Ninguna otra clase de las 118 queda cubierta exactamente por un módulo existente
> (evaluación individual abajo).

### 2.2 · ADAPTAR — **0 clases**

Ninguna clase se resuelve adaptando un módulo existente. **Por qué:** los módulos candidatos del inventario son
**mono-negocio** (`pizzepos/*`, taller 3D, radar) o **infraestructura de plataforma**; el diseño de contabilidad es
una vertical **nueva y transversal**. Por regla explícita (`pizzepos/escandallo` es mono-negocio → **NO se adapta, se toma su patrón**),
la vía es **CONSTRUIR copiando patrón**, no adaptar. `ADAPTAR = 0`.

### 2.3 · CONSTRUIR — **116 clases**

Toda clase que no esté cubierta exactamente por un módulo existente se construye como módulo-isla.
**Total: 116.** Desglose por eje (sólo CONSTRUIR): entrada 30 · libro 32 · fiscal 22 · analítica 32.

### 2.4 · Descartados con motivo (evaluados uno a uno)

| Candidato del inventario | Clase(s) que parecía cubrir | Veredicto | **Motivo** |
|---|---|---|---|
| `facturación/asesoria` (v2.0.0) | `puerto-exportacion` L1 · `generador-modelo` D7 | **DESCARTADO** | Empaqueta **facturas procesadas** en CSV+ZIP para el asesor; **no exporta el libro** (L1) ni **construye modelos fiscales** (D7). `publishes` `asesoria.paquete.generado` ≠ contrato de L1/D7. Se **CONSTRUYEN** L1 y D7. |
| `inventario` (v1.0.0) | `valoracion-existencia` H1 · `variacion-stock-valorada` H4 | **DESCARTADO como clase** | Es el **CUSTODIO del stock** (`consultar/reservar/confirmar/liberar/ajustar`), parcela que el diseño **NO re-clasea** (H1 es una **capa de valor SOBRE** ese inventario). No cubre H1/H4 (valoración/variación). Se reutiliza como **FUENTE EXTERNA** (H1/H4 dependen de `inventario`). |
| `metricas` (v2.0.0) | (ninguna) | **DESCARTADO** | Instrumentación **del sistema** (wildcards `*.creado/…`, `metricas.snapshot`). Ninguna clase mide métricas del sistema; `tasa-cobertura-entrada` P4 mide **cobertura de la entrada** (contrato distinto, LEE la métrica única A12). |
| `banco` (v0.2.0) | (ninguna de tesorería) | **DESCARTADO** | ⚠️ **NO es banca**: es el **banco de nichos del radar**. Cero relación con tesorería/conciliación. |
| `filesystem` (v2.4.0) | — | **INFRA reutilizada** | Infraestructura de plataforma (store de todo módulo vía `fs.*`); **no corresponde a ninguna clase**. Usada por todas las hojas que persisten. |
| `project-manager` (v4.2.0) | — | **INFRA reutilizada** | Emite `project.activated` (obligatorio para restaurar estado). No es clase; es ciclo de vida. |
| `credential-manager` (v2.2.0) | — | **INFRA reutilizada** | Credenciales/OAuth de los puertos externos (bancos, TGSS, administración). No es clase. |
| `pizzepos/escandallo` (v2.3.0) | `valoracion-existencia` H1 | **DESCARTADO (patrón)** | Mono-negocio (vertical pizzepos). **NO se adapta** — se **toma su patrón** de reflejo determinista de coste (`_costear`) como referencia de H1/H4. |
| `prisma/cierre` (v1.0.0) | `cierre-ejercicio` C4 | **DESCARTADO (patrón/fuente)** | Cierra la **caja diaria** (cuadre del día por método) — **≠** cierre de **ejercicio contable** con ajustes (C4). Se reutiliza como **hecho fuente** del cierre operativo (`cierre de jornada`), no como C4. |
| `adaptador-avisos` (v0.1.0) | `aviso-al-negocio` R1 | **DESCARTADO (patrón)** | PUENTE "aviso + confirmación" **del taller 3D** (mono-negocio) → se toma su **patrón** para R1. R1 se **CONSTRUYE**. |
| `cartero` · `telegram-service` · `channel-manager` | `aviso-al-negocio` R1 | **DESCARTADO (infra de canal)** | Son **cañería de canales** (Gmail/Telegram/registro de canales), no la cara "aviso entregado y confirmado al negocio". R1 se **CONSTRUYE** sobre ellos como canales declarables. |
| `ocr4rs` (órgano OCR Rust) | `extraccion-dato` A4.1 | **DEPENDENCIA del reutilizado** | Órgano OCR (imagen/PDF → texto); es el **motor** que consume `facturas`/A4.1. No es clase. |
| `agentes/bitacora` · `propiocepcion` · `log-manager` | `historial-proceso-contable` P2 | **DESCARTADO** | Son bitácoras **del motor de agentes / del sistema**, no el registro append-only del **proceso de entrada contable** (P2). P2 se **CONSTRUYE**. |

### 2.5 · `[ABIERTO]` — parentescos que NO se fusionan (decisión del dueño)

> Ley de la unidad: si dos clases parecen poder vivir en un módulo, **NO se juntan**: se emiten **dos hojas**
> y se dirige `[ABIERTO]` al dueño. **Ninguna se ha fusionado.** Estos parentescos vienen del propio diseño (§10.4)
> y se respetan sin excepción:

| # | Pareja / tipo | Por qué NO se fusiona | `[ABIERTO]` al dueño |
|---|---|---|---|
| 1 | `maestro-terceros` N1 vs `padron-terceros` N2 | Dos facetas del **mismo maestro** (ficha funcional + identidad por nº fiscal); la fusión de **clase** es del dueño, no del adaptador | ¿Se fusionan N1/N2 en una sola clase? (conflicto ① ya decidido como *un solo maestro con roles*; la fusión de clase pende del dueño) |
| 2 | `vencimiento-pago` N6 vs `antiguedad-de-saldos` N8 | Simétricas (pago/cobro) sobre el tipo `Vencimiento`; la hoja atómica no se trocea ni se agrupa | ¿Una sola lógica de vencimientos con dos lados? |
| 3 | tipo `Vencimiento` (transversal a N6·N8·E5) | Es **tipo de soporte**, no clase → no pertenece a ninguna hoja | ¿Confirma el dueño el molde (tipo transversal, sin módulo)? |
| 4 | `marca-borrador-validado` Q4 LEE `flujo-firma` L3 + `traza-asiento` B4 | Deriva el estado sin almacenarlo | ¿Almacén de marca por dato o derivación pura? |
| 5 | tipo `SolicitudDecision` (14 puntos de decisión) | Es **tipo**, no hoja; 14 puntos lo comparten | ¿Puerto propio para la decisión, o cada clase gestiona la suya? |
| 6 | 20 puertos abiertos | Ninguno tiene formato declarado; "los cablea el sitio" | ¿Cuáles entran en la **primera entrega**? (Q12/K7) |

---

## §3 · Las HOJAS CONSTRUIR (116)

> Una hoja por clase. Cada hoja describe su **slug**, **forma**, **propósito**, **dependencias**, **eventos** y las
> **7 etapas** (A dependencias · B `module.json` · C `index.js` · D proyecciones · E handlers RPC · F eventos · VERIFICACIÓN).
> Las 2 hojas REUTILIZAR se documentan en §2. No se agrupa ninguna clase.


### `puerto-evento-vertical` · `PUENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `PuertoEventoVertical` (HOJA A1)
- **Propósito:** Abre el puerto por el que cada vertical manda sus hechos ya emitidos; contabilidad se adapta, no impone formato ni obliga a emitir.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `puerto-evento-vertical.recibir.request`, `vertical.hecho.emitido`
- **Eventos que publica:** `puerto-evento-vertical.recibir.response`, `puerto-evento-vertical.recibir.failed`, `contabilidad.hecho_crudo`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-evento-vertical` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoEventoVertical extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_recibir(input) → { status, data }`
- **E · handlers RPC:** `onRecibirRequest(e) → this._atender(e, 'recibir', 'puerto-evento-vertical.recibir.response', d => this._recibir(d))`
- **F · eventos:** **sube** → `puerto-evento-vertical.recibir.request`, `vertical.hecho.emitido` · **publica** → `puerto-evento-vertical.recibir.response`, `puerto-evento-vertical.recibir.failed`, `contabilidad.hecho_crudo` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `normalizador-hecho` · `CONVERSOR` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `NormalizadorHecho` (HOJA A2)
- **Propósito:** Unica puerta de formato: homogeneiza el hecho de cada vertical a forma asentable.
- **Depende de:** `puerto-evento-vertical`
- **Eventos que sube:** `normalizador-hecho.normalizar.request`, `contabilidad.hecho_crudo`
- **Eventos que publica:** `normalizador-hecho.normalizar.response`, `normalizador-hecho.normalizar.failed`, `contabilidad.hecho_normalizado`
- **A · dependencias:** deps de módulo: puerto-evento-vertical · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `normalizador-hecho` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class NormalizadorHecho extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_normalizar(input) → { status, data }`
- **E · handlers RPC:** `onNormalizarRequest(e) → this._atender(e, 'normalizar', 'normalizador-hecho.normalizar.response', d => this._normalizar(d))`
- **F · eventos:** **sube** → `normalizador-hecho.normalizar.request`, `contabilidad.hecho_crudo` · **publica** → `normalizador-hecho.normalizar.response`, `normalizador-hecho.normalizar.failed`, `contabilidad.hecho_normalizado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `captura-documento` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `CapturaDocumento` (HOJA A3)
- **Propósito:** Admite el documento (digitalizado o recibido) y valida campos; mecanico, cero juicio.
- **Depende de:** `puerto-documento`, `puerto-documento-digital`
- **Eventos que sube:** `captura-documento.admitir.request`
- **Eventos que publica:** `captura-documento.admitir.response`, `captura-documento.admitir.failed`, `contabilidad.documento_admitido`
- **A · dependencias:** deps de módulo: puerto-documento, puerto-documento-digital · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `captura-documento` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CapturaDocumento extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_admitir(input) → { status, data }`
- **E · handlers RPC:** `onAdmitirRequest(e) → this._atender(e, 'admitir', 'captura-documento.admitir.response', d => this._admitir(d))`
- **F · eventos:** **sube** → `captura-documento.admitir.request` · **publica** → `captura-documento.admitir.response`, `captura-documento.admitir.failed`, `contabilidad.documento_admitido` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `puerto-documento` · `CONVERSOR` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `PuertoDocumento` (HOJA A4.2)
- **Propósito:** Frontera de las formas declarables del documento; el adaptador lo pone el sitio.
- **Depende de:** `puerto-documento-digital`
- **Eventos que sube:** `puerto-documento.entrar.request`
- **Eventos que publica:** `puerto-documento.entrar.response`, `puerto-documento.entrar.failed`, `contabilidad.documento_normalizado`
- **A · dependencias:** deps de módulo: puerto-documento-digital · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-documento` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoDocumento extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'puerto-documento.entrar.response', d => this._entrar(d))`
- **F · eventos:** **sube** → `puerto-documento.entrar.request` · **publica** → `puerto-documento.entrar.response`, `puerto-documento.entrar.failed`, `contabilidad.documento_normalizado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `control-cuadre-documento` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `ControlCuadreDocumento` (HOJA A4.3)
- **Propósito:** Si importe+impuestos no cuadran -> cola, NO se asienta mal; calculo determinista.
- **Depende de:** `puerto-documento`
- **Eventos que sube:** `control-cuadre-documento.cuadra.request`
- **Eventos que publica:** `control-cuadre-documento.cuadra.response`, `control-cuadre-documento.cuadra.failed`, `contabilidad.documento_descuadrado`
- **A · dependencias:** deps de módulo: puerto-documento · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `control-cuadre-documento` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ControlCuadreDocumento extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cuadra(input) → { status, data }`
- **E · handlers RPC:** `onCuadraRequest(e) → this._atender(e, 'cuadra', 'control-cuadre-documento.cuadra.response', d => this._cuadra(d))`
- **F · eventos:** **sube** → `control-cuadre-documento.cuadra.request` · **publica** → `control-cuadre-documento.cuadra.response`, `control-cuadre-documento.cuadra.failed`, `contabilidad.documento_descuadrado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `contrapartida-asistida` · `MICRO-AGENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `ContrapartidaAsistida` (HOJA A6.1)
- **Propósito:** Propone cuenta/tercero/periodo contra el plan declarado; PROPONE, no escribe; el corte duro lo fija A6.2.
- **Depende de:** `catalogo-cuentas`, `maestro-terceros`
- **Eventos que sube:** `contrapartida-asistida.juzgar.request`
- **Eventos que publica:** `contrapartida-asistida.juzgar.response`, `contrapartida-asistida.juzgar.failed`, `contabilidad.contrapartida_propuesta`
- **A · dependencias:** deps de módulo: catalogo-cuentas, maestro-terceros · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `contrapartida-asistida` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class ContrapartidaAsistida extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_juzgar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onJuzgarRequest(e) → this._atender(e, 'juzgar', 'contrapartida-asistida.juzgar.response', d => this._juzgar(d))`
- **F · eventos:** **sube** → `contrapartida-asistida.juzgar.request` · **publica** → `contrapartida-asistida.juzgar.response`, `contrapartida-asistida.juzgar.failed`, `contabilidad.contrapartida_propuesta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `regla-contrapartida` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `ReglaContrapartida` (HOJA A6.2)
- **Propósito:** Parcela de reglas declarables/aprendidas (proveedor -> cuenta); un solo escritor; entra hidratada de L10.
- **Depende de:** `catalogo-cuentas`
- **Eventos que sube:** `regla-contrapartida.aplicar.request`, `regla-contrapartida.proponer.request`, `project.activated`
- **Eventos que publica:** `regla-contrapartida.aplicar.response`, `regla-contrapartida.aplicar.failed`, `regla-contrapartida.proponer.response`, `regla-contrapartida.proponer.failed`, `contabilidad.regla_contrapartida_propuesta`
- **A · dependencias:** deps de módulo: catalogo-cuentas · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `regla-contrapartida` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class ReglaContrapartida extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_aplicar(input) → { status, data }` · + 1 proyección(es) más (una por op): _proponer
- **E · handlers RPC:** `onAplicarRequest(e) → this._atender(e, 'aplicar', 'regla-contrapartida.aplicar.response', d => this._aplicar(d))` · `onProponerRequest(e) → this._atender(e, 'proponer', 'regla-contrapartida.proponer.response', d => this._proponer(d))`
- **F · eventos:** **sube** → `regla-contrapartida.aplicar.request`, `regla-contrapartida.proponer.request`, `project.activated` · **publica** → `regla-contrapartida.aplicar.response`, `regla-contrapartida.aplicar.failed`, `regla-contrapartida.proponer.response`, `regla-contrapartida.proponer.failed`, `contabilidad.regla_contrapartida_propuesta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `deduplicacion-hecho` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `DeduplicacionHecho` (HOJA A7)
- **Propósito:** Aplica la clave natural del hecho/documento -> no duplica; idempotencia determinista.
- **Depende de:** `clave-natural`
- **Eventos que sube:** `deduplicacion-hecho.es_nuevo.request`, `contabilidad.hecho_normalizado`
- **Eventos que publica:** `deduplicacion-hecho.es_nuevo.response`, `deduplicacion-hecho.es_nuevo.failed`
- **A · dependencias:** deps de módulo: clave-natural · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `deduplicacion-hecho` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class DeduplicacionHecho extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_es_nuevo(input) → { status, data }`
- **E · handlers RPC:** `onEsNuevoRequest(e) → this._atender(e, 'es_nuevo', 'deduplicacion-hecho.es_nuevo.response', d => this._es_nuevo(d))`
- **F · eventos:** **sube** → `deduplicacion-hecho.es_nuevo.request`, `contabilidad.hecho_normalizado` · **publica** → `deduplicacion-hecho.es_nuevo.response`, `deduplicacion-hecho.es_nuevo.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `encolado-excepcion` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `EncoladoExcepcion` (HOJA A8.1)
- **Propósito:** Parcela de lo dudoso; el flujo CONTINUA, lo dudoso espera; un solo escritor.
- **Depende de:** `control-cuadre-documento`
- **Eventos que sube:** `encolado-excepcion.encolar.request`, `encolado-excepcion.tomar.request`, `project.activated`
- **Eventos que publica:** `encolado-excepcion.encolar.response`, `encolado-excepcion.encolar.failed`, `encolado-excepcion.tomar.response`, `encolado-excepcion.tomar.failed`, `contabilidad.excepcion_encolada`
- **A · dependencias:** deps de módulo: control-cuadre-documento · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `encolado-excepcion` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class EncoladoExcepcion extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_encolar(input) → { status, data }` · + 1 proyección(es) más (una por op): _tomar
- **E · handlers RPC:** `onEncolarRequest(e) → this._atender(e, 'encolar', 'encolado-excepcion.encolar.response', d => this._encolar(d))` · `onTomarRequest(e) → this._atender(e, 'tomar', 'encolado-excepcion.tomar.response', d => this._tomar(d))`
- **F · eventos:** **sube** → `encolado-excepcion.encolar.request`, `encolado-excepcion.tomar.request`, `project.activated` · **publica** → `encolado-excepcion.encolar.response`, `encolado-excepcion.encolar.failed`, `encolado-excepcion.tomar.response`, `encolado-excepcion.tomar.failed`, `contabilidad.excepcion_encolada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `aviso-revision` · `PUENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `AvisoRevision` (HOJA A8.2)
- **Propósito:** Empejon al canal de avisos: esto necesita revision; conecta por evento.
- **Depende de:** `encolado-excepcion`
- **Eventos que sube:** `aviso-revision.empujar.request`, `contabilidad.excepcion_encolada`
- **Eventos que publica:** `aviso-revision.empujar.response`, `aviso-revision.empujar.failed`, `contabilidad.aviso_revision`
- **A · dependencias:** deps de módulo: encolado-excepcion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `aviso-revision` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AvisoRevision extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_empujar(input) → { status, data }`
- **E · handlers RPC:** `onEmpujarRequest(e) → this._atender(e, 'empujar', 'aviso-revision.empujar.response', d => this._empujar(d))`
- **F · eventos:** **sube** → `aviso-revision.empujar.request`, `contabilidad.excepcion_encolada` · **publica** → `aviso-revision.empujar.response`, `aviso-revision.empujar.failed`, `contabilidad.aviso_revision` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `lote-admision` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `LoteAdmision` (HOJA A9)
- **Propósito:** Desacople del cuello: N hechos en paralelo (la admision no se serializa).
- **Depende de:** `normalizador-hecho`
- **Eventos que sube:** `lote-admision.admitir.request`, `contabilidad.hecho_normalizado`
- **Eventos que publica:** `lote-admision.admitir.response`, `lote-admision.admitir.failed`
- **A · dependencias:** deps de módulo: normalizador-hecho · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `lote-admision` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class LoteAdmision extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_admitir(input) → { status, data }`
- **E · handlers RPC:** `onAdmitirRequest(e) → this._atender(e, 'admitir', 'lote-admision.admitir.response', d => this._admitir(d))`
- **F · eventos:** **sube** → `lote-admision.admitir.request`, `contabilidad.hecho_normalizado` · **publica** → `lote-admision.admitir.response`, `lote-admision.admitir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `contrato-hecho-minimo` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `ContratoHechoMinimo` (HOJA A11)
- **Propósito:** Parcela declarable del minimo exigible a cada fuente; la cara vista desde la fuente: un minimo, no un formato impuesto.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `contrato-hecho-minimo.exigir.request`, `contrato-hecho-minimo.declarar.request`, `project.activated`
- **Eventos que publica:** `contrato-hecho-minimo.exigir.response`, `contrato-hecho-minimo.exigir.failed`, `contrato-hecho-minimo.declarar.response`, `contrato-hecho-minimo.declarar.failed`, `contabilidad.contrato_declarado`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `contrato-hecho-minimo` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class ContratoHechoMinimo extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_exigir(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onExigirRequest(e) → this._atender(e, 'exigir', 'contrato-hecho-minimo.exigir.response', d => this._exigir(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'contrato-hecho-minimo.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `contrato-hecho-minimo.exigir.request`, `contrato-hecho-minimo.declarar.request`, `project.activated` · **publica** → `contrato-hecho-minimo.exigir.response`, `contrato-hecho-minimo.exigir.failed`, `contrato-hecho-minimo.declarar.response`, `contrato-hecho-minimo.declarar.failed`, `contabilidad.contrato_declarado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `completitud-cobertura` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `CompletitudCobertura` (HOJA A12)
- **Propósito:** Mide que hechos publico una vertical y cuales NO llegaron; produce LA metrica unica; las demas senales la LEEN.
- **Depende de:** `contrato-hecho-minimo`
- **Eventos que sube:** `completitud-cobertura.medir.request`
- **Eventos que publica:** `completitud-cobertura.medir.response`, `completitud-cobertura.medir.failed`, `contabilidad.cobertura_medida`
- **A · dependencias:** deps de módulo: contrato-hecho-minimo · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `completitud-cobertura` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CompletitudCobertura extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_medir(input) → { status, data }`
- **E · handlers RPC:** `onMedirRequest(e) → this._atender(e, 'medir', 'completitud-cobertura.medir.response', d => this._medir(d))`
- **F · eventos:** **sube** → `completitud-cobertura.medir.request` · **publica** → `completitud-cobertura.medir.response`, `completitud-cobertura.medir.failed`, `contabilidad.cobertura_medida` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `hecho-rectificativo` · `PUENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `HechoRectificativo` (HOJA A13)
- **Propósito:** Conecta el hecho posterior que corrige/anula uno anterior por clave natural; NO borra, anade.
- **Depende de:** `clave-natural`
- **Eventos que sube:** `hecho-rectificativo.emparejar.request`
- **Eventos que publica:** `hecho-rectificativo.emparejar.response`, `hecho-rectificativo.emparejar.failed`, `contabilidad.hecho_rectificado`
- **A · dependencias:** deps de módulo: clave-natural · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `hecho-rectificativo` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class HechoRectificativo extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_emparejar(input) → { status, data }`
- **E · handlers RPC:** `onEmparejarRequest(e) → this._atender(e, 'emparejar', 'hecho-rectificativo.emparejar.response', d => this._emparejar(d))`
- **F · eventos:** **sube** → `hecho-rectificativo.emparejar.request` · **publica** → `hecho-rectificativo.emparejar.response`, `hecho-rectificativo.emparejar.failed`, `contabilidad.hecho_rectificado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `anclaje-cierre-vertical` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `AnclajeCierreVertical` (HOJA A14)
- **Propósito:** Parcela declarable POR VERTICAL de que es "un cierre" y como se identifica; pende de unidad_de_cierre (dato del dueno).
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `anclaje-cierre-vertical.anclar.request`, `anclaje-cierre-vertical.declarar.request`, `project.activated`
- **Eventos que publica:** `anclaje-cierre-vertical.anclar.response`, `anclaje-cierre-vertical.anclar.failed`, `anclaje-cierre-vertical.declarar.response`, `anclaje-cierre-vertical.declarar.failed`, `contabilidad.cierre_anclado`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `anclaje-cierre-vertical` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class AnclajeCierreVertical extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_anclar(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onAnclarRequest(e) → this._atender(e, 'anclar', 'anclaje-cierre-vertical.anclar.response', d => this._anclar(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'anclaje-cierre-vertical.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `anclaje-cierre-vertical.anclar.request`, `anclaje-cierre-vertical.declarar.request`, `project.activated` · **publica** → `anclaje-cierre-vertical.anclar.response`, `anclaje-cierre-vertical.anclar.failed`, `anclaje-cierre-vertical.declarar.response`, `anclaje-cierre-vertical.declarar.failed`, `contabilidad.cierre_anclado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `declaracion-fuente-faltante` · `PUENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `DeclaracionFuenteFaltante` (HOJA A15)
- **Propósito:** Detecta que una vertical NO publica un hecho necesario y lo DECLARA (abierto + aviso); no obliga a producirlo.
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `declaracion-fuente-faltante.declarar.request`, `contabilidad.cobertura_medida`
- **Eventos que publica:** `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed`, `contabilidad.fuente_faltante`
- **A · dependencias:** deps de módulo: completitud-cobertura · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `declaracion-fuente-faltante` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class DeclaracionFuenteFaltante extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_declarar(input) → { status, data }`
- **E · handlers RPC:** `onDeclararRequest(e) → this._atender(e, 'declarar', 'declaracion-fuente-faltante.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `declaracion-fuente-faltante.declarar.request`, `contabilidad.cobertura_medida` · **publica** → `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed`, `contabilidad.fuente_faltante` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `catalogo-cuentas` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `CatalogoCuentas` (HOJA B1)
- **Propósito:** Plan contable declarable/importable del asesor; un solo escritor.
- **Depende de:** `puerto-plan-contable`
- **Eventos que sube:** `catalogo-cuentas.anadir.request`, `catalogo-cuentas.buscar.request`, `project.activated`
- **Eventos que publica:** `catalogo-cuentas.anadir.response`, `catalogo-cuentas.anadir.failed`, `catalogo-cuentas.buscar.response`, `catalogo-cuentas.buscar.failed`
- **A · dependencias:** deps de módulo: puerto-plan-contable · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `catalogo-cuentas` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class CatalogoCuentas extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_anadir(input) → { status, data }` · + 1 proyección(es) más (una por op): _buscar
- **E · handlers RPC:** `onAnadirRequest(e) → this._atender(e, 'anadir', 'catalogo-cuentas.anadir.response', d => this._anadir(d))` · `onBuscarRequest(e) → this._atender(e, 'buscar', 'catalogo-cuentas.buscar.response', d => this._buscar(d))`
- **F · eventos:** **sube** → `catalogo-cuentas.anadir.request`, `catalogo-cuentas.buscar.request`, `project.activated` · **publica** → `catalogo-cuentas.anadir.response`, `catalogo-cuentas.anadir.failed`, `catalogo-cuentas.buscar.response`, `catalogo-cuentas.buscar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `escritor-diario` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `EscritorDiario` (HOJA B2)
- **Propósito:** ES el custodio del libro; single-writer por parcela; rechaza si suma debe != suma haber.
- **Depende de:** `clave-natural`, `single-writer`
- **Eventos que sube:** `escritor-diario.asentar.request`, `project.activated`
- **Eventos que publica:** `escritor-diario.asentar.response`, `escritor-diario.asentar.failed`, `contabilidad.asiento_registrado`
- **A · dependencias:** deps de módulo: clave-natural, single-writer · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `escritor-diario` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class EscritorDiario extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_asentar(input) → { status, data }`
- **E · handlers RPC:** `onAsentarRequest(e) → this._atender(e, 'asentar', 'escritor-diario.asentar.response', d => this._asentar(d))`
- **F · eventos:** **sube** → `escritor-diario.asentar.request`, `project.activated` · **publica** → `escritor-diario.asentar.response`, `escritor-diario.asentar.failed`, `contabilidad.asiento_registrado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `mayor-balanza` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `MayorBalanza` (HOJA B3)
- **Propósito:** Saldos por cuenta derivados del diario; calculo determinista, un test lo afirma.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `mayor-balanza.saldos.request`, `mayor-balanza.balanza.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `mayor-balanza.saldos.response`, `mayor-balanza.saldos.failed`, `mayor-balanza.balanza.response`, `mayor-balanza.balanza.failed`
- **A · dependencias:** deps de módulo: escritor-diario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `mayor-balanza` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class MayorBalanza extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_saldos(input) → { status, data }` · + 1 proyección(es) más (una por op): _balanza
- **E · handlers RPC:** `onSaldosRequest(e) → this._atender(e, 'saldos', 'mayor-balanza.saldos.response', d => this._saldos(d))` · `onBalanzaRequest(e) → this._atender(e, 'balanza', 'mayor-balanza.balanza.response', d => this._balanza(d))`
- **F · eventos:** **sube** → `mayor-balanza.saldos.request`, `mayor-balanza.balanza.request`, `contabilidad.asiento_registrado` · **publica** → `mayor-balanza.saldos.response`, `mayor-balanza.saldos.failed`, `mayor-balanza.balanza.response`, `mayor-balanza.balanza.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `traza-asiento` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `TrazaAsiento` (HOJA B4)
- **Propósito:** Registro inmutable (quien/cuando creo cada asiento), append-only; un solo escritor.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `traza-asiento.registrar.request`, `project.activated`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `traza-asiento.registrar.response`, `traza-asiento.registrar.failed`, `contabilidad.traza_registrada`
- **A · dependencias:** deps de módulo: escritor-diario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `traza-asiento` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class TrazaAsiento extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_registrar(input) → { status, data }`
- **E · handlers RPC:** `onRegistrarRequest(e) → this._atender(e, 'registrar', 'traza-asiento.registrar.response', d => this._registrar(d))`
- **F · eventos:** **sube** → `traza-asiento.registrar.request`, `project.activated`, `contabilidad.asiento_registrado` · **publica** → `traza-asiento.registrar.response`, `traza-asiento.registrar.failed`, `contabilidad.traza_registrada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `asiento-ajuste` · `PUENTE` · eje `contabilidad-libro`
- **Clase / hoja F2:** `AsientoAjuste` (HOJA B5)
- **Propósito:** Camino por el que la correccion del asesor ENTRA al libro sin borrar; la traza queda intacta; el almacen es B2/B4.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `asiento-ajuste.entrar.request`, `contabilidad.firma_registrada`
- **Eventos que publica:** `asiento-ajuste.entrar.response`, `asiento-ajuste.entrar.failed`, `contabilidad.asiento_ajuste_recibido`
- **A · dependencias:** deps de módulo: escritor-diario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `asiento-ajuste` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AsientoAjuste extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'asiento-ajuste.entrar.response', d => this._entrar(d))`
- **F · eventos:** **sube** → `asiento-ajuste.entrar.request`, `contabilidad.firma_registrada` · **publica** → `asiento-ajuste.entrar.response`, `asiento-ajuste.entrar.failed`, `contabilidad.asiento_ajuste_recibido` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `puerto-plan-contable` · `CONVERSOR` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PuertoPlanContable` (HOJA B6)
- **Propósito:** Frontera de codificacion del plan contable (import/export); cruce de formatos.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `puerto-plan-contable.entrar.request`, `puerto-plan-contable.salir.request`
- **Eventos que publica:** `puerto-plan-contable.entrar.response`, `puerto-plan-contable.entrar.failed`, `puerto-plan-contable.salir.response`, `puerto-plan-contable.salir.failed`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-plan-contable` · `subscribes`: 2 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoPlanContable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }` · + 1 proyección(es) más (una por op): _salir
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'puerto-plan-contable.entrar.response', d => this._entrar(d))` · `onSalirRequest(e) → this._atender(e, 'salir', 'puerto-plan-contable.salir.response', d => this._salir(d))`
- **F · eventos:** **sube** → `puerto-plan-contable.entrar.request`, `puerto-plan-contable.salir.request` · **publica** → `puerto-plan-contable.entrar.response`, `puerto-plan-contable.entrar.failed`, `puerto-plan-contable.salir.response`, `puerto-plan-contable.salir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `balance-situacion` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `BalanceSituacion` (HOJA C1)
- **Propósito:** Activo/pasivo/patrimonio derivado del mayor; invariante ACTIVO = PASIVO + PATRIMONIO; descuadre = ERROR.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `balance-situacion.calcular.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `balance-situacion.calcular.response`, `balance-situacion.calcular.failed`
- **A · dependencias:** deps de módulo: mayor-balanza · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `balance-situacion` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class BalanceSituacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'balance-situacion.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `balance-situacion.calcular.request`, `contabilidad.asiento_registrado` · **publica** → `balance-situacion.calcular.response`, `balance-situacion.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cuenta-resultados` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `CuentaResultados` (HOJA C2)
- **Propósito:** Ingresos/gastos/resultado derivado del mayor; determinista.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `cuenta-resultados.calcular.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `cuenta-resultados.calcular.response`, `cuenta-resultados.calcular.failed`
- **A · dependencias:** deps de módulo: mayor-balanza · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cuenta-resultados` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CuentaResultados extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'cuenta-resultados.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `cuenta-resultados.calcular.request`, `contabilidad.asiento_registrado` · **publica** → `cuenta-resultados.calcular.response`, `cuenta-resultados.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `periodificacion` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `Periodificacion` (HOJA C3)
- **Propósito:** Imputa cada hecho a su periodo con el criterio declarado; conserva fecha operacion y fecha valor, NO elige.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `periodificacion.imputar.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `periodificacion.imputar.response`, `periodificacion.imputar.failed`
- **A · dependencias:** deps de módulo: escritor-diario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `periodificacion` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Periodificacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_imputar(input) → { status, data }`
- **E · handlers RPC:** `onImputarRequest(e) → this._atender(e, 'imputar', 'periodificacion.imputar.response', d => this._imputar(d))`
- **F · eventos:** **sube** → `periodificacion.imputar.request`, `contabilidad.asiento_registrado` · **publica** → `periodificacion.imputar.response`, `periodificacion.imputar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cierre-ejercicio` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `CierreEjercicio` (HOJA C4)
- **Propósito:** Cierra el periodo con ajustes; IRREVERSIBLE salvo ajuste (reabrir solo con asiento-ajuste); un solo escritor.
- **Depende de:** `balance-situacion`, `cuenta-resultados`, `asiento-ajuste`
- **Eventos que sube:** `cierre-ejercicio.cerrar.request`, `cierre-ejercicio.reabrir.request`, `project.activated`
- **Eventos que publica:** `cierre-ejercicio.cerrar.response`, `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed`, `contabilidad.ejercicio_cerrado`
- **A · dependencias:** deps de módulo: balance-situacion, cuenta-resultados, asiento-ajuste · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cierre-ejercicio` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class CierreEjercicio extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cerrar(input) → { status, data }` · + 1 proyección(es) más (una por op): _reabrir
- **E · handlers RPC:** `onCerrarRequest(e) → this._atender(e, 'cerrar', 'cierre-ejercicio.cerrar.response', d => this._cerrar(d))` · `onReabrirRequest(e) → this._atender(e, 'reabrir', 'cierre-ejercicio.reabrir.response', d => this._reabrir(d))`
- **F · eventos:** **sube** → `cierre-ejercicio.cerrar.request`, `cierre-ejercicio.reabrir.request`, `project.activated` · **publica** → `cierre-ejercicio.cerrar.response`, `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed`, `contabilidad.ejercicio_cerrado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `apertura-ejercicio` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `AperturaEjercicio` (HOJA C5)
- **Propósito:** Asientos de apertura DERIVADOS del cierre anterior; determinista.
- **Depende de:** `cierre-ejercicio`
- **Eventos que sube:** `apertura-ejercicio.generar.request`, `contabilidad.ejercicio_cerrado`
- **Eventos que publica:** `apertura-ejercicio.generar.response`, `apertura-ejercicio.generar.failed`
- **A · dependencias:** deps de módulo: cierre-ejercicio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `apertura-ejercicio` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AperturaEjercicio extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_generar(input) → { status, data }`
- **E · handlers RPC:** `onGenerarRequest(e) → this._atender(e, 'generar', 'apertura-ejercicio.generar.response', d => this._generar(d))`
- **F · eventos:** **sube** → `apertura-ejercicio.generar.request`, `contabilidad.ejercicio_cerrado` · **publica** → `apertura-ejercicio.generar.response`, `apertura-ejercicio.generar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `aviso-cuadre` · `PUENTE` · eje `contabilidad-libro`
- **Clase / hoja F2:** `AvisoCuadre` (HOJA C6)
- **Propósito:** NO finge el cuadre: si falta cobertura, avisa; LEE la metrica unica, no la recalcula.
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `aviso-cuadre.avisar.request`, `contabilidad.cobertura_medida`
- **Eventos que publica:** `aviso-cuadre.avisar.response`, `aviso-cuadre.avisar.failed`, `contabilidad.aviso_cuadre`
- **A · dependencias:** deps de módulo: completitud-cobertura · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `aviso-cuadre` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AvisoCuadre extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_avisar(input) → { status, data }`
- **E · handlers RPC:** `onAvisarRequest(e) → this._atender(e, 'avisar', 'aviso-cuadre.avisar.response', d => this._avisar(d))`
- **F · eventos:** **sube** → `aviso-cuadre.avisar.request`, `contabilidad.cobertura_medida` · **publica** → `aviso-cuadre.avisar.response`, `aviso-cuadre.avisar.failed`, `contabilidad.aviso_cuadre` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `liquidacion-iva` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `LiquidacionIva` (HOJA D1)
- **Propósito:** IVA devengado/soportado DERIVADO del libro; los tipos son dato, no constante.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `liquidacion-iva.calcular.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `liquidacion-iva.calcular.response`, `liquidacion-iva.calcular.failed`
- **A · dependencias:** deps de módulo: mayor-balanza · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `liquidacion-iva` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class LiquidacionIva extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'liquidacion-iva.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `liquidacion-iva.calcular.request`, `contabilidad.asiento_registrado` · **publica** → `liquidacion-iva.calcular.response`, `liquidacion-iva.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `modelo-303` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `Modelo303` (HOJA D2)
- **Propósito:** Construye el modelo 303 desde la liquidacion; determinista.
- **Depende de:** `liquidacion-iva`
- **Eventos que sube:** `modelo-303.construir.request`
- **Eventos que publica:** `modelo-303.construir.response`, `modelo-303.construir.failed`
- **A · dependencias:** deps de módulo: liquidacion-iva · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `modelo-303` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Modelo303 extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handlers RPC:** `onConstruirRequest(e) → this._atender(e, 'construir', 'modelo-303.construir.response', d => this._construir(d))`
- **F · eventos:** **sube** → `modelo-303.construir.request` · **publica** → `modelo-303.construir.response`, `modelo-303.construir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `modelo-390` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `Modelo390` (HOJA D3)
- **Propósito:** Idem anual (390) construido desde las liquidaciones del ejercicio; determinista.
- **Depende de:** `liquidacion-iva`
- **Eventos que sube:** `modelo-390.construir.request`
- **Eventos que publica:** `modelo-390.construir.response`, `modelo-390.construir.failed`
- **A · dependencias:** deps de módulo: liquidacion-iva · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `modelo-390` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Modelo390 extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handlers RPC:** `onConstruirRequest(e) → this._atender(e, 'construir', 'modelo-390.construir.response', d => this._construir(d))`
- **F · eventos:** **sube** → `modelo-390.construir.request` · **publica** → `modelo-390.construir.response`, `modelo-390.construir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `retenciones` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `Retenciones` (HOJA D4)
- **Propósito:** Retenciones practicadas/soportadas calculadas desde los asientos; determinista.
- **Depende de:** `mayor-balanza`
- **Eventos que sube:** `retenciones.calcular.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `retenciones.calcular.response`, `retenciones.calcular.failed`
- **A · dependencias:** deps de módulo: mayor-balanza · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `retenciones` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Retenciones extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'retenciones.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `retenciones.calcular.request`, `contabilidad.asiento_registrado` · **publica** → `retenciones.calcular.response`, `retenciones.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `estimacion-is-irpf` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `EstimacionIsIrpf` (HOJA D5)
- **Propósito:** Estimacion del resultado fiscal con base DECLARADA; nada se estima sin base.
- **Depende de:** `cuenta-resultados`
- **Eventos que sube:** `estimacion-is-irpf.estimar.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `estimacion-is-irpf.estimar.response`, `estimacion-is-irpf.estimar.failed`
- **A · dependencias:** deps de módulo: cuenta-resultados · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `estimacion-is-irpf` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class EstimacionIsIrpf extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_estimar(input) → { status, data }`
- **E · handlers RPC:** `onEstimarRequest(e) → this._atender(e, 'estimar', 'estimacion-is-irpf.estimar.response', d => this._estimar(d))`
- **F · eventos:** **sube** → `estimacion-is-irpf.estimar.request`, `contabilidad.asiento_registrado` · **publica** → `estimacion-is-irpf.estimar.response`, `estimacion-is-irpf.estimar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `calendario-fiscal` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `CalendarioFiscal` (HOJA D6)
- **Propósito:** Parcela de plazos declarables -> dispara aviso proactivo; la ley entra como dato; un solo escritor.
- **Depende de:** `perfil-administrativo`
- **Eventos que sube:** `calendario-fiscal.proximos.request`, `calendario-fiscal.declarar.request`, `project.activated`
- **Eventos que publica:** `calendario-fiscal.proximos.response`, `calendario-fiscal.proximos.failed`, `calendario-fiscal.declarar.response`, `calendario-fiscal.declarar.failed`, `contabilidad.vencimiento_fiscal`
- **A · dependencias:** deps de módulo: perfil-administrativo · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `calendario-fiscal` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class CalendarioFiscal extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_proximos(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onProximosRequest(e) → this._atender(e, 'proximos', 'calendario-fiscal.proximos.response', d => this._proximos(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'calendario-fiscal.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `calendario-fiscal.proximos.request`, `calendario-fiscal.declarar.request`, `project.activated` · **publica** → `calendario-fiscal.proximos.response`, `calendario-fiscal.proximos.failed`, `calendario-fiscal.declarar.response`, `calendario-fiscal.declarar.failed`, `contabilidad.vencimiento_fiscal` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `generador-modelo` · `PUENTE` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `GeneradorModelo` (HOJA D7)
- **Propósito:** Salida al programa del asesor; conecta por puerto; formato ABIERTO (no declarado aun).
- **Depende de:** `modelo-303`, `modelo-390`, `estado-presentacion-fiscal`
- **Eventos que sube:** `generador-modelo.exportar.request`
- **Eventos que publica:** `generador-modelo.exportar.response`, `generador-modelo.exportar.failed`, `contabilidad.modelo_exportado`
- **A · dependencias:** deps de módulo: modelo-303, modelo-390, estado-presentacion-fiscal · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `generador-modelo` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class GeneradorModelo extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_exportar(input) → { status, data }`
- **E · handlers RPC:** `onExportarRequest(e) → this._atender(e, 'exportar', 'generador-modelo.exportar.response', d => this._exportar(d))`
- **F · eventos:** **sube** → `generador-modelo.exportar.request` · **publica** → `generador-modelo.exportar.response`, `generador-modelo.exportar.failed`, `contabilidad.modelo_exportado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `registro-verifactu` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `RegistroVerifactu` (HOJA D8)
- **Propósito:** Huella/cadena INALTERABLE de la facturacion; registro encadenado; un solo escritor.
- **Depende de:** `emision-factura-venta`
- **Eventos que sube:** `registro-verifactu.encadenar.request`, `project.activated`, `contabilidad.factura_emitida`
- **Eventos que publica:** `registro-verifactu.encadenar.response`, `registro-verifactu.encadenar.failed`, `contabilidad.huella_encadenada`
- **A · dependencias:** deps de módulo: emision-factura-venta · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `registro-verifactu` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class RegistroVerifactu extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_encadenar(input) → { status, data }`
- **E · handlers RPC:** `onEncadenarRequest(e) → this._atender(e, 'encadenar', 'registro-verifactu.encadenar.response', d => this._encadenar(d))`
- **F · eventos:** **sube** → `registro-verifactu.encadenar.request`, `project.activated`, `contabilidad.factura_emitida` · **publica** → `registro-verifactu.encadenar.response`, `registro-verifactu.encadenar.failed`, `contabilidad.huella_encadenada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `factura-electronica` · `CONVERSOR` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `FacturaElectronica` (HOJA D9)
- **Propósito:** Frontera de formato estructurado de la factura.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `factura-electronica.entrar.request`, `factura-electronica.salir.request`
- **Eventos que publica:** `factura-electronica.entrar.response`, `factura-electronica.entrar.failed`, `factura-electronica.salir.response`, `factura-electronica.salir.failed`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `factura-electronica` · `subscribes`: 2 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class FacturaElectronica extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }` · + 1 proyección(es) más (una por op): _salir
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'factura-electronica.entrar.response', d => this._entrar(d))` · `onSalirRequest(e) → this._atender(e, 'salir', 'factura-electronica.salir.response', d => this._salir(d))`
- **F · eventos:** **sube** → `factura-electronica.entrar.request`, `factura-electronica.salir.request` · **publica** → `factura-electronica.entrar.response`, `factura-electronica.entrar.failed`, `factura-electronica.salir.response`, `factura-electronica.salir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `estado-presentacion-fiscal` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `EstadoPresentacionFiscal` (HOJA D12)
- **Propósito:** Ciclo de vida de cada obligacion (pendiente->generada->presentada->justificada->atrasada); un solo escritor.
- **Depende de:** `calendario-fiscal`
- **Eventos que sube:** `estado-presentacion-fiscal.avanzar.request`, `estado-presentacion-fiscal.estado.request`, `project.activated`
- **Eventos que publica:** `estado-presentacion-fiscal.avanzar.response`, `estado-presentacion-fiscal.avanzar.failed`, `estado-presentacion-fiscal.estado.response`, `estado-presentacion-fiscal.estado.failed`, `contabilidad.obligacion_avanzada`
- **A · dependencias:** deps de módulo: calendario-fiscal · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `estado-presentacion-fiscal` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class EstadoPresentacionFiscal extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_avanzar(input) → { status, data }` · + 1 proyección(es) más (una por op): _estado
- **E · handlers RPC:** `onAvanzarRequest(e) → this._atender(e, 'avanzar', 'estado-presentacion-fiscal.avanzar.response', d => this._avanzar(d))` · `onEstadoRequest(e) → this._atender(e, 'estado', 'estado-presentacion-fiscal.estado.response', d => this._estado(d))`
- **F · eventos:** **sube** → `estado-presentacion-fiscal.avanzar.request`, `estado-presentacion-fiscal.estado.request`, `project.activated` · **publica** → `estado-presentacion-fiscal.avanzar.response`, `estado-presentacion-fiscal.avanzar.failed`, `estado-presentacion-fiscal.estado.response`, `estado-presentacion-fiscal.estado.failed`, `contabilidad.obligacion_avanzada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `acuse-presentacion` · `PUENTE` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `AcusePresentacion` (HOJA D13)
- **Propósito:** Recoge y liga el justificante/acuse que devuelve la administracion a su modelo y a su asiento; cierra el bucle hacia fuera.
- **Depende de:** `estado-presentacion-fiscal`
- **Eventos que sube:** `acuse-presentacion.ligar.request`
- **Eventos que publica:** `acuse-presentacion.ligar.response`, `acuse-presentacion.ligar.failed`, `contabilidad.acuse_ligado`
- **A · dependencias:** deps de módulo: estado-presentacion-fiscal · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `acuse-presentacion` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AcusePresentacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_ligar(input) → { status, data }`
- **E · handlers RPC:** `onLigarRequest(e) → this._atender(e, 'ligar', 'acuse-presentacion.ligar.response', d => this._ligar(d))`
- **F · eventos:** **sube** → `acuse-presentacion.ligar.request` · **publica** → `acuse-presentacion.ligar.response`, `acuse-presentacion.ligar.failed`, `contabilidad.acuse_ligado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `rectificacion-declaracion` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `RectificacionDeclaracion` (HOJA D14)
- **Propósito:** Camino de correccion POSTERIOR a la presentacion (complementaria/sustitutiva); != asiento-ajuste B5; un solo escritor.
- **Depende de:** `estado-presentacion-fiscal`
- **Eventos que sube:** `rectificacion-declaracion.rectificar.request`, `project.activated`
- **Eventos que publica:** `rectificacion-declaracion.rectificar.response`, `rectificacion-declaracion.rectificar.failed`, `contabilidad.declaracion_rectificada`
- **A · dependencias:** deps de módulo: estado-presentacion-fiscal · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `rectificacion-declaracion` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class RectificacionDeclaracion extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_rectificar(input) → { status, data }`
- **E · handlers RPC:** `onRectificarRequest(e) → this._atender(e, 'rectificar', 'rectificacion-declaracion.rectificar.response', d => this._rectificar(d))`
- **F · eventos:** **sube** → `rectificacion-declaracion.rectificar.request`, `project.activated` · **publica** → `rectificacion-declaracion.rectificar.response`, `rectificacion-declaracion.rectificar.failed`, `contabilidad.declaracion_rectificada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `perfil-administrativo` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `PerfilAdministrativo` (HOJA D15)
- **Propósito:** Parcela declarable de que administraciones y obligaciones aplican (territorio y regimen); un solo escritor.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `perfil-administrativo.obligaciones.request`, `perfil-administrativo.declarar.request`, `project.activated`
- **Eventos que publica:** `perfil-administrativo.obligaciones.response`, `perfil-administrativo.obligaciones.failed`, `perfil-administrativo.declarar.response`, `perfil-administrativo.declarar.failed`, `contabilidad.perfil_fiscal_declarado`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `perfil-administrativo` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class PerfilAdministrativo extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_obligaciones(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onObligacionesRequest(e) → this._atender(e, 'obligaciones', 'perfil-administrativo.obligaciones.response', d => this._obligaciones(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'perfil-administrativo.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `perfil-administrativo.obligaciones.request`, `perfil-administrativo.declarar.request`, `project.activated` · **publica** → `perfil-administrativo.obligaciones.response`, `perfil-administrativo.obligaciones.failed`, `perfil-administrativo.declarar.response`, `perfil-administrativo.declarar.failed`, `contabilidad.perfil_fiscal_declarado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `conciliacion-bancaria` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `ConciliacionBancaria` (HOJA E1)
- **Propósito:** Cruce extracto <-> libro por clave natural y reglas; determinista; el juicio vive en E7/E8.
- **Depende de:** `escritor-diario`, `puerto-extracto`, `regla-movimiento-bancario`
- **Eventos que sube:** `conciliacion-bancaria.cruzar.request`
- **Eventos que publica:** `conciliacion-bancaria.cruzar.response`, `conciliacion-bancaria.cruzar.failed`, `contabilidad.conciliacion_cruzada`
- **A · dependencias:** deps de módulo: escritor-diario, puerto-extracto, regla-movimiento-bancario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `conciliacion-bancaria` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ConciliacionBancaria extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cruzar(input) → { status, data }`
- **E · handlers RPC:** `onCruzarRequest(e) → this._atender(e, 'cruzar', 'conciliacion-bancaria.cruzar.response', d => this._cruzar(d))`
- **F · eventos:** **sube** → `conciliacion-bancaria.cruzar.request` · **publica** → `conciliacion-bancaria.cruzar.response`, `conciliacion-bancaria.cruzar.failed`, `contabilidad.conciliacion_cruzada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `puerto-extracto` · `CONVERSOR` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PuertoExtracto` (HOJA E2)
- **Propósito:** Frontera de canal/formato del extracto; un adaptador por banco; si falta, se crea.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `puerto-extracto.entrar.request`
- **Eventos que publica:** `puerto-extracto.entrar.response`, `puerto-extracto.entrar.failed`, `contabilidad.movimiento_bancario`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-extracto` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoExtracto extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'puerto-extracto.entrar.response', d => this._entrar(d))`
- **F · eventos:** **sube** → `puerto-extracto.entrar.request` · **publica** → `puerto-extracto.entrar.response`, `puerto-extracto.entrar.failed`, `contabilidad.movimiento_bancario` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cuadre-cobro-pago` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `CuadreCobroPago` (HOJA E3)
- **Propósito:** Clave natural compartida: un movimiento bancario = un cobro/pago; determinista.
- **Depende de:** `escritor-diario`, `puerto-extracto`
- **Eventos que sube:** `cuadre-cobro-pago.cuadrar.request`, `contabilidad.movimiento_bancario`
- **Eventos que publica:** `cuadre-cobro-pago.cuadrar.response`, `cuadre-cobro-pago.cuadrar.failed`
- **A · dependencias:** deps de módulo: escritor-diario, puerto-extracto · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cuadre-cobro-pago` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CuadreCobroPago extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cuadrar(input) → { status, data }`
- **E · handlers RPC:** `onCuadrarRequest(e) → this._atender(e, 'cuadrar', 'cuadre-cobro-pago.cuadrar.response', d => this._cuadrar(d))`
- **F · eventos:** **sube** → `cuadre-cobro-pago.cuadrar.request`, `contabilidad.movimiento_bancario` · **publica** → `cuadre-cobro-pago.cuadrar.response`, `cuadre-cobro-pago.cuadrar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `saldo-tesoreria` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `SaldoTesoreria` (HOJA E4)
- **Propósito:** Posicion real de dinero por cuenta; derivacion determinista.
- **Depende de:** `maestro-cuentas-bancarias`, `mayor-balanza`
- **Eventos que sube:** `saldo-tesoreria.calcular.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `saldo-tesoreria.calcular.response`, `saldo-tesoreria.calcular.failed`
- **A · dependencias:** deps de módulo: maestro-cuentas-bancarias, mayor-balanza · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `saldo-tesoreria` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class SaldoTesoreria extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'saldo-tesoreria.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `saldo-tesoreria.calcular.request`, `contabilidad.asiento_registrado` · **publica** → `saldo-tesoreria.calcular.response`, `saldo-tesoreria.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `prevision-caja` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PrevisionCaja` (HOJA E5)
- **Propósito:** Proyecta entradas/salidas desde los compromisos con la politica declarada; determinista.
- **Depende de:** `vencimiento-pago`, `saldo-tesoreria`
- **Eventos que sube:** `prevision-caja.proyectar.request`
- **Eventos que publica:** `prevision-caja.proyectar.response`, `prevision-caja.proyectar.failed`, `contabilidad.vencimiento_proximo`
- **A · dependencias:** deps de módulo: vencimiento-pago, saldo-tesoreria · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `prevision-caja` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PrevisionCaja extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_proyectar(input) → { status, data }`
- **E · handlers RPC:** `onProyectarRequest(e) → this._atender(e, 'proyectar', 'prevision-caja.proyectar.response', d => this._proyectar(d))`
- **F · eventos:** **sube** → `prevision-caja.proyectar.request` · **publica** → `prevision-caja.proyectar.response`, `prevision-caja.proyectar.failed`, `contabilidad.vencimiento_proximo` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `partida-no-identificada` · `MICRO-AGENTE` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PartidaNoIdentificada` (HOJA E7)
- **Propósito:** Reconoce y clasifica el movimiento sin contrapartida (comision/interes/devolucion); PROPONE, no escribe.
- **Depende de:** `regla-movimiento-bancario`
- **Eventos que sube:** `partida-no-identificada.juzgar.request`
- **Eventos que publica:** `partida-no-identificada.juzgar.response`, `partida-no-identificada.juzgar.failed`, `contabilidad.partida_propuesta`
- **A · dependencias:** deps de módulo: regla-movimiento-bancario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `partida-no-identificada` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class PartidaNoIdentificada extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_juzgar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onJuzgarRequest(e) → this._atender(e, 'juzgar', 'partida-no-identificada.juzgar.response', d => this._juzgar(d))`
- **F · eventos:** **sube** → `partida-no-identificada.juzgar.request` · **publica** → `partida-no-identificada.juzgar.response`, `partida-no-identificada.juzgar.failed`, `contabilidad.partida_propuesta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `regla-movimiento-bancario` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `ReglaMovimientoBancario` (HOJA E8)
- **Propósito:** Parcela de reglas declarables/aprendidas de movimientos bancarios; ratificacion unica por L10.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `regla-movimiento-bancario.aplicar.request`, `regla-movimiento-bancario.proponer.request`, `project.activated`
- **Eventos que publica:** `regla-movimiento-bancario.aplicar.response`, `regla-movimiento-bancario.aplicar.failed`, `regla-movimiento-bancario.proponer.response`, `regla-movimiento-bancario.proponer.failed`, `contabilidad.regla_bancaria_propuesta`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `regla-movimiento-bancario` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class ReglaMovimientoBancario extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_aplicar(input) → { status, data }` · + 1 proyección(es) más (una por op): _proponer
- **E · handlers RPC:** `onAplicarRequest(e) → this._atender(e, 'aplicar', 'regla-movimiento-bancario.aplicar.response', d => this._aplicar(d))` · `onProponerRequest(e) → this._atender(e, 'proponer', 'regla-movimiento-bancario.proponer.response', d => this._proponer(d))`
- **F · eventos:** **sube** → `regla-movimiento-bancario.aplicar.request`, `regla-movimiento-bancario.proponer.request`, `project.activated` · **publica** → `regla-movimiento-bancario.aplicar.response`, `regla-movimiento-bancario.aplicar.failed`, `regla-movimiento-bancario.proponer.response`, `regla-movimiento-bancario.proponer.failed`, `contabilidad.regla_bancaria_propuesta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `partida-conciliatoria` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PartidaConciliatoria` (HOJA E9)
- **Propósito:** Partidas en transito que explican el desfase (cheque no cobrado, cobro no apuntado); determinista.
- **Depende de:** `conciliacion-bancaria`
- **Eventos que sube:** `partida-conciliatoria.desfase.request`
- **Eventos que publica:** `partida-conciliatoria.desfase.response`, `partida-conciliatoria.desfase.failed`
- **A · dependencias:** deps de módulo: conciliacion-bancaria · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `partida-conciliatoria` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PartidaConciliatoria extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_desfase(input) → { status, data }`
- **E · handlers RPC:** `onDesfaseRequest(e) → this._atender(e, 'desfase', 'partida-conciliatoria.desfase.response', d => this._desfase(d))`
- **F · eventos:** **sube** → `partida-conciliatoria.desfase.request` · **publica** → `partida-conciliatoria.desfase.response`, `partida-conciliatoria.desfase.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `informe-conciliacion` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `InformeConciliacion` (HOJA E10)
- **Propósito:** Documento de cuadre saldo banco <-> saldo contable ajustado; la PRUEBA de que cuadra.
- **Depende de:** `conciliacion-bancaria`, `partida-conciliatoria`
- **Eventos que sube:** `informe-conciliacion.componer.request`
- **Eventos que publica:** `informe-conciliacion.componer.response`, `informe-conciliacion.componer.failed`
- **A · dependencias:** deps de módulo: conciliacion-bancaria, partida-conciliatoria · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `informe-conciliacion` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class InformeConciliacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handlers RPC:** `onComponerRequest(e) → this._atender(e, 'componer', 'informe-conciliacion.componer.response', d => this._componer(d))`
- **F · eventos:** **sube** → `informe-conciliacion.componer.request` · **publica** → `informe-conciliacion.componer.response`, `informe-conciliacion.componer.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `maestro-cuentas-bancarias` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `MaestroCuentasBancarias` (HOJA E11)
- **Propósito:** Parcela declarable de cuentas y su moneda; sin el, "el banco" es un numero falso.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `maestro-cuentas-bancarias.declarar.request`, `maestro-cuentas-bancarias.listar.request`, `project.activated`
- **Eventos que publica:** `maestro-cuentas-bancarias.declarar.response`, `maestro-cuentas-bancarias.declarar.failed`, `maestro-cuentas-bancarias.listar.response`, `maestro-cuentas-bancarias.listar.failed`, `contabilidad.cuenta_bancaria_declarada`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `maestro-cuentas-bancarias` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class MaestroCuentasBancarias extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_declarar(input) → { status, data }` · + 1 proyección(es) más (una por op): _listar
- **E · handlers RPC:** `onDeclararRequest(e) → this._atender(e, 'declarar', 'maestro-cuentas-bancarias.declarar.response', d => this._declarar(d))` · `onListarRequest(e) → this._atender(e, 'listar', 'maestro-cuentas-bancarias.listar.response', d => this._listar(d))`
- **F · eventos:** **sube** → `maestro-cuentas-bancarias.declarar.request`, `maestro-cuentas-bancarias.listar.request`, `project.activated` · **publica** → `maestro-cuentas-bancarias.declarar.response`, `maestro-cuentas-bancarias.declarar.failed`, `maestro-cuentas-bancarias.listar.response`, `maestro-cuentas-bancarias.listar.failed`, `contabilidad.cuenta_bancaria_declarada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `alta-activo` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `AltaActivo` (HOJA F1)
- **Propósito:** Parcela del inmovilizado; un solo escritor; la valoracion del alta es reflejo hidratador.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `alta-activo.registrar.request`, `project.activated`
- **Eventos que publica:** `alta-activo.registrar.response`, `alta-activo.registrar.failed`, `contabilidad.activo_registrado`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `alta-activo` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class AltaActivo extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_registrar(input) → { status, data }`
- **E · handlers RPC:** `onRegistrarRequest(e) → this._atender(e, 'registrar', 'alta-activo.registrar.response', d => this._registrar(d))`
- **F · eventos:** **sube** → `alta-activo.registrar.request`, `project.activated` · **publica** → `alta-activo.registrar.response`, `alta-activo.registrar.failed`, `contabilidad.activo_registrado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `plan-amortizacion` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `PlanAmortizacion` (HOJA F2)
- **Propósito:** Genera la cuota cuando toca (dispara en el cierre); metodo/coeficiente = dato; un solo escritor.
- **Depende de:** `alta-activo`, `cola-declaraciones-criterio`
- **Eventos que sube:** `plan-amortizacion.cuota_del_periodo.request`, `plan-amortizacion.declarar.request`, `project.activated`
- **Eventos que publica:** `plan-amortizacion.cuota_del_periodo.response`, `plan-amortizacion.cuota_del_periodo.failed`, `plan-amortizacion.declarar.response`, `plan-amortizacion.declarar.failed`, `contabilidad.cuota_amortizacion`
- **A · dependencias:** deps de módulo: alta-activo, cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `plan-amortizacion` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class PlanAmortizacion extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cuota_del_periodo(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onCuotaDelPeriodoRequest(e) → this._atender(e, 'cuota_del_periodo', 'plan-amortizacion.cuota_del_periodo.response', d => this._cuota_del_periodo(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'plan-amortizacion.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `plan-amortizacion.cuota_del_periodo.request`, `plan-amortizacion.declarar.request`, `project.activated` · **publica** → `plan-amortizacion.cuota_del_periodo.response`, `plan-amortizacion.cuota_del_periodo.failed`, `plan-amortizacion.declarar.response`, `plan-amortizacion.declarar.failed`, `contabilidad.cuota_amortizacion` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `baja-activo` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `BajaActivo` (HOJA F3)
- **Propósito:** Retira el bien y calcula el resultado (perdida/beneficio) y lo imputa; determinista.
- **Depende de:** `alta-activo`, `valor-neto-contable`
- **Eventos que sube:** `baja-activo.calcular.request`
- **Eventos que publica:** `baja-activo.calcular.response`, `baja-activo.calcular.failed`
- **A · dependencias:** deps de módulo: alta-activo, valor-neto-contable · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `baja-activo` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class BajaActivo extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'baja-activo.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `baja-activo.calcular.request` · **publica** → `baja-activo.calcular.response`, `baja-activo.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `valor-neto-contable` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ValorNetoContable` (HOJA F4)
- **Propósito:** Coste - amortizacion acumulada; determinista, al balance.
- **Depende de:** `plan-amortizacion`
- **Eventos que sube:** `valor-neto-contable.calcular.request`
- **Eventos que publica:** `valor-neto-contable.calcular.response`, `valor-neto-contable.calcular.failed`
- **A · dependencias:** deps de módulo: plan-amortizacion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `valor-neto-contable` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ValorNetoContable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'valor-neto-contable.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `valor-neto-contable.calcular.request` · **publica** → `valor-neto-contable.calcular.response`, `valor-neto-contable.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `recibo-nomina` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `ReciboNomina` (HOJA G1)
- **Propósito:** Admite y da forma asentable al hecho de nomina (hecho o documento); mecanico, cero juicio.
- **Depende de:** `puerto-nomina`
- **Eventos que sube:** `recibo-nomina.dar_forma.request`, `contabilidad.nomina_recibida`
- **Eventos que publica:** `recibo-nomina.dar_forma.response`, `recibo-nomina.dar_forma.failed`, `contabilidad.nomina_formada`
- **A · dependencias:** deps de módulo: puerto-nomina · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `recibo-nomina` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ReciboNomina extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_dar_forma(input) → { status, data }`
- **E · handlers RPC:** `onDarFormaRequest(e) → this._atender(e, 'dar_forma', 'recibo-nomina.dar_forma.response', d => this._dar_forma(d))`
- **F · eventos:** **sube** → `recibo-nomina.dar_forma.request`, `contabilidad.nomina_recibida` · **publica** → `recibo-nomina.dar_forma.response`, `recibo-nomina.dar_forma.failed`, `contabilidad.nomina_formada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `obligacion-seguridad-social` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `ObligacionSeguridadSocial` (HOJA G2)
- **Propósito:** Gasto de empresa + obligacion con la TGSS desde el recibo; tipos = dato; determinista.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `obligacion-seguridad-social.calcular.request`
- **Eventos que publica:** `obligacion-seguridad-social.calcular.response`, `obligacion-seguridad-social.calcular.failed`
- **A · dependencias:** deps de módulo: recibo-nomina · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `obligacion-seguridad-social` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ObligacionSeguridadSocial extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'obligacion-seguridad-social.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `obligacion-seguridad-social.calcular.request` · **publica** → `obligacion-seguridad-social.calcular.response`, `obligacion-seguridad-social.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `asiento-personal` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `AsientoPersonal` (HOJA G3)
- **Propósito:** Gasto de personal, retencion y pago -> asiento EQUILIBRADO; determinista.
- **Depende de:** `recibo-nomina`, `obligacion-seguridad-social`
- **Eventos que sube:** `asiento-personal.construir.request`
- **Eventos que publica:** `asiento-personal.construir.response`, `asiento-personal.construir.failed`
- **A · dependencias:** deps de módulo: recibo-nomina, obligacion-seguridad-social · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `asiento-personal` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AsientoPersonal extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_construir(input) → { status, data }`
- **E · handlers RPC:** `onConstruirRequest(e) → this._atender(e, 'construir', 'asiento-personal.construir.response', d => this._construir(d))`
- **F · eventos:** **sube** → `asiento-personal.construir.request` · **publica** → `asiento-personal.construir.response`, `asiento-personal.construir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `puerto-nomina` · `PUENTE` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `PuertoNomina` (HOJA G4)
- **Propósito:** Origen declarable del dato de nomina: conecta con el sistema de personal por evento; si no existe, se crea.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `puerto-nomina.recibir.request`, `nomina.recibida`, `nomina.emitida`
- **Eventos que publica:** `puerto-nomina.recibir.response`, `puerto-nomina.recibir.failed`, `contabilidad.nomina_recibida`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-nomina` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoNomina extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_recibir(input) → { status, data }`
- **E · handlers RPC:** `onRecibirRequest(e) → this._atender(e, 'recibir', 'puerto-nomina.recibir.response', d => this._recibir(d))`
- **F · eventos:** **sube** → `puerto-nomina.recibir.request`, `nomina.recibida`, `nomina.emitida` · **publica** → `puerto-nomina.recibir.response`, `puerto-nomina.recibir.failed`, `contabilidad.nomina_recibida` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `lineas-nomina` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `LineasNomina` (HOJA G6)
- **Propósito:** Desglose bruto/retencion/cotizacion del trabajador/neto; hace la nomina EXPLICABLE, no un numero pelado.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `lineas-nomina.desglosar.request`
- **Eventos que publica:** `lineas-nomina.desglosar.response`, `lineas-nomina.desglosar.failed`
- **A · dependencias:** deps de módulo: recibo-nomina · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `lineas-nomina` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class LineasNomina extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_desglosar(input) → { status, data }`
- **E · handlers RPC:** `onDesglosarRequest(e) → this._atender(e, 'desglosar', 'lineas-nomina.desglosar.response', d => this._desglosar(d))`
- **F · eventos:** **sube** → `lineas-nomina.desglosar.request` · **publica** → `lineas-nomina.desglosar.response`, `lineas-nomina.desglosar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `acceso-nomina` · `CUSTODIO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `AccesoNomina` (HOJA G7)
- **Propósito:** Gobernanza de quien ve que nomina (dato personal): cada uno ve la suya; eje persona; un solo escritor.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `acceso-nomina.autorizar.request`, `acceso-nomina.declarar.request`, `project.activated`
- **Eventos que publica:** `acceso-nomina.autorizar.response`, `acceso-nomina.autorizar.failed`, `acceso-nomina.declarar.response`, `acceso-nomina.declarar.failed`, `contabilidad.acceso_nomina`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `acceso-nomina` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class AccesoNomina extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_autorizar(input) → { status, data }` · + 1 proyección(es) más (una por op): _declarar
- **E · handlers RPC:** `onAutorizarRequest(e) → this._atender(e, 'autorizar', 'acceso-nomina.autorizar.response', d => this._autorizar(d))` · `onDeclararRequest(e) → this._atender(e, 'declarar', 'acceso-nomina.declarar.response', d => this._declarar(d))`
- **F · eventos:** **sube** → `acceso-nomina.autorizar.request`, `acceso-nomina.declarar.request`, `project.activated` · **publica** → `acceso-nomina.autorizar.response`, `acceso-nomina.autorizar.failed`, `acceso-nomina.declarar.response`, `acceso-nomina.declarar.failed`, `contabilidad.acceso_nomina` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `pagos-a-cuenta-empleado` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `PagosACuentaEmpleado` (HOJA G8)
- **Propósito:** Anticipos/adelantos y su impacto en el neto y el IRPF; no todo es sueldo fijo; determinista.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `pagos-a-cuenta-empleado.impacto.request`
- **Eventos que publica:** `pagos-a-cuenta-empleado.impacto.response`, `pagos-a-cuenta-empleado.impacto.failed`
- **A · dependencias:** deps de módulo: recibo-nomina · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `pagos-a-cuenta-empleado` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PagosACuentaEmpleado extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_impacto(input) → { status, data }`
- **E · handlers RPC:** `onImpactoRequest(e) → this._atender(e, 'impacto', 'pagos-a-cuenta-empleado.impacto.response', d => this._impacto(d))`
- **F · eventos:** **sube** → `pagos-a-cuenta-empleado.impacto.request` · **publica** → `pagos-a-cuenta-empleado.impacto.response`, `pagos-a-cuenta-empleado.impacto.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `conceptos-extra-nomina` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `ConceptosExtraNomina` (HOJA G9)
- **Propósito:** Dietas, especie, finiquito, paga extra: calculo de su imputacion; determinista.
- **Depende de:** `recibo-nomina`
- **Eventos que sube:** `conceptos-extra-nomina.imputar.request`
- **Eventos que publica:** `conceptos-extra-nomina.imputar.response`, `conceptos-extra-nomina.imputar.failed`
- **A · dependencias:** deps de módulo: recibo-nomina · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `conceptos-extra-nomina` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ConceptosExtraNomina extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_imputar(input) → { status, data }`
- **E · handlers RPC:** `onImputarRequest(e) → this._atender(e, 'imputar', 'conceptos-extra-nomina.imputar.response', d => this._imputar(d))`
- **F · eventos:** **sube** → `conceptos-extra-nomina.imputar.request` · **publica** → `conceptos-extra-nomina.imputar.response`, `conceptos-extra-nomina.imputar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `liquidacion-baja-empleado` · `REFLEJO` · eje `contabilidad-fiscal`
- **Clase / hoja F2:** `LiquidacionBajaEmpleado` (HOJA G10)
- **Propósito:** Cierre de la cuenta del trabajador (finiquito/indemnizacion) para que no quede un acreedor abierto; determinista.
- **Depende de:** `recibo-nomina`, `pagos-a-cuenta-empleado`
- **Eventos que sube:** `liquidacion-baja-empleado.liquidar.request`
- **Eventos que publica:** `liquidacion-baja-empleado.liquidar.response`, `liquidacion-baja-empleado.liquidar.failed`
- **A · dependencias:** deps de módulo: recibo-nomina, pagos-a-cuenta-empleado · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `liquidacion-baja-empleado` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class LiquidacionBajaEmpleado extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_liquidar(input) → { status, data }`
- **E · handlers RPC:** `onLiquidarRequest(e) → this._atender(e, 'liquidar', 'liquidacion-baja-empleado.liquidar.response', d => this._liquidar(d))`
- **F · eventos:** **sube** → `liquidacion-baja-empleado.liquidar.request` · **publica** → `liquidacion-baja-empleado.liquidar.response`, `liquidacion-baja-empleado.liquidar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `valoracion-existencia` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ValoracionExistencia` (HOJA H1)
- **Propósito:** Capa de valor SOBRE el inventario existente (no lo duplica); metodo = dato (FIFO/medio).
- **Depende de:** `inventario`, `frontera-ficha-producto`
- **Eventos que sube:** `valoracion-existencia.valorar.request`
- **Eventos que publica:** `valoracion-existencia.valorar.response`, `valoracion-existencia.valorar.failed`
- **A · dependencias:** deps de módulo: inventario, frontera-ficha-producto · deps externas (plataforma): inventario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `valoracion-existencia` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ValoracionExistencia extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_valorar(input) → { status, data }`
- **E · handlers RPC:** `onValorarRequest(e) → this._atender(e, 'valorar', 'valoracion-existencia.valorar.response', d => this._valorar(d))`
- **F · eventos:** **sube** → `valoracion-existencia.valorar.request` · **publica** → `valoracion-existencia.valorar.response`, `valoracion-existencia.valorar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `frontera-ficha-producto` · `CONVERSOR` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `FronteraFichaProducto` (HOJA H2)
- **Propósito:** Puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al dato interno; si falta, se crea.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `frontera-ficha-producto.entrar.request`
- **Eventos que publica:** `frontera-ficha-producto.entrar.response`, `frontera-ficha-producto.entrar.failed`, `contabilidad.coste_interno`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `frontera-ficha-producto` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class FronteraFichaProducto extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entrar(input) → { status, data }`
- **E · handlers RPC:** `onEntrarRequest(e) → this._atender(e, 'entrar', 'frontera-ficha-producto.entrar.response', d => this._entrar(d))`
- **F · eventos:** **sube** → `frontera-ficha-producto.entrar.request` · **publica** → `frontera-ficha-producto.entrar.response`, `frontera-ficha-producto.entrar.failed`, `contabilidad.coste_interno` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `ajuste-inventario` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `AjusteInventario` (HOJA H3)
- **Propósito:** Regulariza merma/rotura con asiento Y aviso; calculo de la diferencia; determinista.
- **Depende de:** `valoracion-existencia`
- **Eventos que sube:** `ajuste-inventario.diferencia.request`
- **Eventos que publica:** `ajuste-inventario.diferencia.response`, `ajuste-inventario.diferencia.failed`
- **A · dependencias:** deps de módulo: valoracion-existencia · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `ajuste-inventario` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AjusteInventario extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_diferencia(input) → { status, data }`
- **E · handlers RPC:** `onDiferenciaRequest(e) → this._atender(e, 'diferencia', 'ajuste-inventario.diferencia.response', d => this._diferencia(d))`
- **F · eventos:** **sube** → `ajuste-inventario.diferencia.request` · **publica** → `ajuste-inventario.diferencia.response`, `ajuste-inventario.diferencia.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `variacion-stock-valorada` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `VariacionStockValorada` (HOJA H4)
- **Propósito:** Entrada por compra / salida por consumo, VALORADAS; determinista.
- **Depende de:** `valoracion-existencia`, `inventario`
- **Eventos que sube:** `variacion-stock-valorada.variacion.request`, `inventario.ajustado`, `inventario.reserva.creada`
- **Eventos que publica:** `variacion-stock-valorada.variacion.response`, `variacion-stock-valorada.variacion.failed`
- **A · dependencias:** deps de módulo: valoracion-existencia, inventario · deps externas (plataforma): inventario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `variacion-stock-valorada` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class VariacionStockValorada extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_variacion(input) → { status, data }`
- **E · handlers RPC:** `onVariacionRequest(e) → this._atender(e, 'variacion', 'variacion-stock-valorada.variacion.response', d => this._variacion(d))`
- **F · eventos:** **sube** → `variacion-stock-valorada.variacion.request`, `inventario.ajustado`, `inventario.reserva.creada` · **publica** → `variacion-stock-valorada.variacion.response`, `variacion-stock-valorada.variacion.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `marca-sociedad` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `MarcaSociedad` (HOJA I1)
- **Propósito:** Etiqueta cada asiento con su sociedad; mecanico, cero juicio.
- **Depende de:** `escritor-diario`
- **Eventos que sube:** `marca-sociedad.marcar.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `marca-sociedad.marcar.response`, `marca-sociedad.marcar.failed`
- **A · dependencias:** deps de módulo: escritor-diario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `marca-sociedad` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class MarcaSociedad extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_marcar(input) → { status, data }`
- **E · handlers RPC:** `onMarcarRequest(e) → this._atender(e, 'marcar', 'marca-sociedad.marcar.response', d => this._marcar(d))`
- **F · eventos:** **sube** → `marca-sociedad.marcar.request`, `contabilidad.asiento_registrado` · **publica** → `marca-sociedad.marcar.response`, `marca-sociedad.marcar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `eliminacion-intercompany` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `EliminacionIntercompany` (HOJA I2)
- **Propósito:** Detecta y elimina el cruce interno en la consolidacion; determinista.
- **Depende de:** `marca-sociedad`
- **Eventos que sube:** `eliminacion-intercompany.eliminar.request`
- **Eventos que publica:** `eliminacion-intercompany.eliminar.response`, `eliminacion-intercompany.eliminar.failed`
- **A · dependencias:** deps de módulo: marca-sociedad · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `eliminacion-intercompany` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class EliminacionIntercompany extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_eliminar(input) → { status, data }`
- **E · handlers RPC:** `onEliminarRequest(e) → this._atender(e, 'eliminar', 'eliminacion-intercompany.eliminar.response', d => this._eliminar(d))`
- **F · eventos:** **sube** → `eliminacion-intercompany.eliminar.request` · **publica** → `eliminacion-intercompany.eliminar.response`, `eliminacion-intercompany.eliminar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `consolidacion` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `Consolidacion` (HOJA I3)
- **Propósito:** Estados del conjunto con criterio DECLARADO; agregacion determinista; grupo COMPLETO.
- **Depende de:** `eliminacion-intercompany`
- **Eventos que sube:** `consolidacion.estados.request`
- **Eventos que publica:** `consolidacion.estados.response`, `consolidacion.estados.failed`
- **A · dependencias:** deps de módulo: eliminacion-intercompany · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `consolidacion` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Consolidacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_estados(input) → { status, data }`
- **E · handlers RPC:** `onEstadosRequest(e) → this._atender(e, 'estados', 'consolidacion.estados.response', d => this._estados(d))`
- **F · eventos:** **sube** → `consolidacion.estados.request` · **publica** → `consolidacion.estados.response`, `consolidacion.estados.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `aislamiento-negocio` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `AislamientoNegocio` (HOJA I4)
- **Propósito:** Multi-negocio sin fuga: un dueno por parcela; los negocios NO se fugan (eje negocio).
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `aislamiento-negocio.parcela.request`, `aislamiento-negocio.escritor.request`, `project.activated`
- **Eventos que publica:** `aislamiento-negocio.parcela.response`, `aislamiento-negocio.parcela.failed`, `aislamiento-negocio.escritor.response`, `aislamiento-negocio.escritor.failed`, `contabilidad.parcela_reclamada`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `aislamiento-negocio` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class AislamientoNegocio extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_parcela(input) → { status, data }` · + 1 proyección(es) más (una por op): _escritor
- **E · handlers RPC:** `onParcelaRequest(e) → this._atender(e, 'parcela', 'aislamiento-negocio.parcela.response', d => this._parcela(d))` · `onEscritorRequest(e) → this._atender(e, 'escritor', 'aislamiento-negocio.escritor.response', d => this._escritor(d))`
- **F · eventos:** **sube** → `aislamiento-negocio.parcela.request`, `aislamiento-negocio.escritor.request`, `project.activated` · **publica** → `aislamiento-negocio.parcela.response`, `aislamiento-negocio.parcela.failed`, `aislamiento-negocio.escritor.response`, `aislamiento-negocio.escritor.failed`, `contabilidad.parcela_reclamada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `etiquetado-analitico` · `MICRO-AGENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `EtiquetadoAnalitico` (HOJA J1)
- **Propósito:** Asigna centro/linea/producto a cada hecho con regla declarable; cuando la regla no cubre, PROPONE y lo dudoso va a cola.
- **Depende de:** `cola-declaraciones-criterio`
- **Eventos que sube:** `etiquetado-analitico.juzgar.request`
- **Eventos que publica:** `etiquetado-analitico.juzgar.response`, `etiquetado-analitico.juzgar.failed`, `contabilidad.dimension_propuesta`
- **A · dependencias:** deps de módulo: cola-declaraciones-criterio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `etiquetado-analitico` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class EtiquetadoAnalitico extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_juzgar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onJuzgarRequest(e) → this._atender(e, 'juzgar', 'etiquetado-analitico.juzgar.response', d => this._juzgar(d))`
- **F · eventos:** **sube** → `etiquetado-analitico.juzgar.request` · **publica** → `etiquetado-analitico.juzgar.response`, `etiquetado-analitico.juzgar.failed`, `contabilidad.dimension_propuesta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `margen-analitico` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `MargenAnalitico` (HOJA J2)
- **Propósito:** Ingreso - coste imputado por dimension; determinista.
- **Depende de:** `etiquetado-analitico`
- **Eventos que sube:** `margen-analitico.calcular.request`
- **Eventos que publica:** `margen-analitico.calcular.response`, `margen-analitico.calcular.failed`
- **A · dependencias:** deps de módulo: etiquetado-analitico · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `margen-analitico` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class MargenAnalitico extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'margen-analitico.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `margen-analitico.calcular.request` · **publica** → `margen-analitico.calcular.response`, `margen-analitico.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `presupuesto` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `Presupuesto` (HOJA J3)
- **Propósito:** Cifra objetivo por dimension declarable; un solo escritor.
- **Depende de:** `etiquetado-analitico`
- **Eventos que sube:** `presupuesto.fijar.request`, `presupuesto.objetivo.request`, `project.activated`
- **Eventos que publica:** `presupuesto.fijar.response`, `presupuesto.fijar.failed`, `presupuesto.objetivo.response`, `presupuesto.objetivo.failed`, `contabilidad.presupuesto_fijado`
- **A · dependencias:** deps de módulo: etiquetado-analitico · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `presupuesto` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class Presupuesto extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_fijar(input) → { status, data }` · + 1 proyección(es) más (una por op): _objetivo
- **E · handlers RPC:** `onFijarRequest(e) → this._atender(e, 'fijar', 'presupuesto.fijar.response', d => this._fijar(d))` · `onObjetivoRequest(e) → this._atender(e, 'objetivo', 'presupuesto.objetivo.response', d => this._objetivo(d))`
- **F · eventos:** **sube** → `presupuesto.fijar.request`, `presupuesto.objetivo.request`, `project.activated` · **publica** → `presupuesto.fijar.response`, `presupuesto.fijar.failed`, `presupuesto.objetivo.response`, `presupuesto.objetivo.failed`, `contabilidad.presupuesto_fijado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `desviacion` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `Desviacion` (HOJA J4)
- **Propósito:** Real vs presupuesto -> dispara aviso SI se sale del umbral declarado; determinista.
- **Depende de:** `presupuesto`
- **Eventos que sube:** `desviacion.calcular.request`, `contabilidad.presupuesto_fijado`
- **Eventos que publica:** `desviacion.calcular.response`, `desviacion.calcular.failed`, `contabilidad.desviacion`
- **A · dependencias:** deps de módulo: presupuesto · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `desviacion` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class Desviacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'desviacion.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `desviacion.calcular.request`, `contabilidad.presupuesto_fijado` · **publica** → `desviacion.calcular.response`, `desviacion.calcular.failed`, `contabilidad.desviacion` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `coste-indirecto` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `CosteIndirecto` (HOJA J5)
- **Propósito:** Aplica el reparto DECLARADO de gastos no directos; determinista; cubre lo que la pieza existente no cubre para grupo.
- **Depende de:** `etiquetado-analitico`
- **Eventos que sube:** `coste-indirecto.repartir.request`
- **Eventos que publica:** `coste-indirecto.repartir.response`, `coste-indirecto.repartir.failed`
- **A · dependencias:** deps de módulo: etiquetado-analitico · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `coste-indirecto` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CosteIndirecto extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_repartir(input) → { status, data }`
- **E · handlers RPC:** `onRepartirRequest(e) → this._atender(e, 'repartir', 'coste-indirecto.repartir.response', d => this._repartir(d))`
- **F · eventos:** **sube** → `coste-indirecto.repartir.request` · **publica** → `coste-indirecto.repartir.response`, `coste-indirecto.repartir.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cuadro-mando-contable` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `CuadroMandoContable` (HOJA J8)
- **Propósito:** Agregacion de conjunto (caja·resultado·margen·desviacion·ejercicio) SIN bajar al asiento; lente del jefe; determinista.
- **Depende de:** `saldo-tesoreria`, `cuenta-resultados`, `margen-analitico`, `desviacion`
- **Eventos que sube:** `cuadro-mando-contable.componer.request`
- **Eventos que publica:** `cuadro-mando-contable.componer.response`, `cuadro-mando-contable.componer.failed`
- **A · dependencias:** deps de módulo: saldo-tesoreria, cuenta-resultados, margen-analitico, desviacion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cuadro-mando-contable` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CuadroMandoContable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handlers RPC:** `onComponerRequest(e) → this._atender(e, 'componer', 'cuadro-mando-contable.componer.response', d => this._componer(d))`
- **F · eventos:** **sube** → `cuadro-mando-contable.componer.request` · **publica** → `cuadro-mando-contable.componer.response`, `cuadro-mando-contable.componer.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `comparador-periodos` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ComparadorPeriodos` (HOJA J9)
- **Propósito:** Ejercicio vs ejercicio, mes vs mes, real vs presupuesto; REUTILIZA J3/J4, no los duplica.
- **Depende de:** `presupuesto`, `desviacion`
- **Eventos que sube:** `comparador-periodos.comparar.request`
- **Eventos que publica:** `comparador-periodos.comparar.response`, `comparador-periodos.comparar.failed`
- **A · dependencias:** deps de módulo: presupuesto, desviacion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `comparador-periodos` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ComparadorPeriodos extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_comparar(input) → { status, data }`
- **E · handlers RPC:** `onCompararRequest(e) → this._atender(e, 'comparar', 'comparador-periodos.comparar.response', d => this._comparar(d))`
- **F · eventos:** **sube** → `comparador-periodos.comparar.request` · **publica** → `comparador-periodos.comparar.response`, `comparador-periodos.comparar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `tablero-margen-dimension` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `TableroMargenDimension` (HOJA J10)
- **Propósito:** Cruce margen x dimension bajo lente de conjunto: por centro, familia o sociedad.
- **Depende de:** `margen-analitico`, `etiquetado-analitico`
- **Eventos que sube:** `tablero-margen-dimension.cruzar.request`
- **Eventos que publica:** `tablero-margen-dimension.cruzar.response`, `tablero-margen-dimension.cruzar.failed`
- **A · dependencias:** deps de módulo: margen-analitico, etiquetado-analitico · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `tablero-margen-dimension` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class TableroMargenDimension extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cruzar(input) → { status, data }`
- **E · handlers RPC:** `onCruzarRequest(e) → this._atender(e, 'cruzar', 'tablero-margen-dimension.cruzar.response', d => this._cruzar(d))`
- **F · eventos:** **sube** → `tablero-margen-dimension.cruzar.request` · **publica** → `tablero-margen-dimension.cruzar.response`, `tablero-margen-dimension.cruzar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `onboarding-negocio` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `OnboardingNegocio` (HOJA K1)
- **Propósito:** Recoge los datos declarables del negocio nuevo (plan, fuentes, parametros); un solo escritor.
- **Depende de:** `project-manager`
- **Eventos que sube:** `onboarding-negocio.recoger.request`, `onboarding-negocio.leer.request`, `project.activated`
- **Eventos que publica:** `onboarding-negocio.recoger.response`, `onboarding-negocio.recoger.failed`, `onboarding-negocio.leer.response`, `onboarding-negocio.leer.failed`, `contabilidad.negocio_onboarded`
- **A · dependencias:** deps de módulo: project-manager · deps externas (plataforma): project-manager · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `onboarding-negocio` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class OnboardingNegocio extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_recoger(input) → { status, data }` · + 1 proyección(es) más (una por op): _leer
- **E · handlers RPC:** `onRecogerRequest(e) → this._atender(e, 'recoger', 'onboarding-negocio.recoger.response', d => this._recoger(d))` · `onLeerRequest(e) → this._atender(e, 'leer', 'onboarding-negocio.leer.response', d => this._leer(d))`
- **F · eventos:** **sube** → `onboarding-negocio.recoger.request`, `onboarding-negocio.leer.request`, `project.activated` · **publica** → `onboarding-negocio.recoger.response`, `onboarding-negocio.recoger.failed`, `onboarding-negocio.leer.response`, `onboarding-negocio.leer.failed`, `contabilidad.negocio_onboarded` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `motor-avisos` · `PUENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `MotorAvisos` (HOJA K2)
- **Propósito:** PRODUCE el aviso (requisito 4 del dueno); conecta por evento; la ENTREGA es R1.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `motor-avisos.producir.request`, `contabilidad.aviso_revision`, `contabilidad.aviso_cuadre`, `contabilidad.vencimiento_fiscal`, `contabilidad.vencimiento_proximo`, `contabilidad.desviacion`, `contabilidad.fuente_faltante`
- **Eventos que publica:** `motor-avisos.producir.response`, `motor-avisos.producir.failed`, `contabilidad.aviso_producido`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `motor-avisos` · `subscribes`: 7 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class MotorAvisos extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_producir(input) → { status, data }`
- **E · handlers RPC:** `onProducirRequest(e) → this._atender(e, 'producir', 'motor-avisos.producir.response', d => this._producir(d))`
- **F · eventos:** **sube** → `motor-avisos.producir.request`, `contabilidad.aviso_revision`, `contabilidad.aviso_cuadre`, `contabilidad.vencimiento_fiscal`, `contabilidad.vencimiento_proximo`, `contabilidad.desviacion`, `contabilidad.fuente_faltante` · **publica** → `motor-avisos.producir.response`, `motor-avisos.producir.failed`, `contabilidad.aviso_producido` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `informe-rico` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `InformeRico` (HOJA K3)
- **Propósito:** COMPONE la cifra ya calculada con el contexto declarado (periodo, origen, comparativas); mecanico.
- **Depende de:** `informe-conciliacion`
- **Eventos que sube:** `informe-rico.componer.request`
- **Eventos que publica:** `informe-rico.componer.response`, `informe-rico.componer.failed`
- **A · dependencias:** deps de módulo: informe-conciliacion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `informe-rico` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class InformeRico extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_componer(input) → { status, data }`
- **E · handlers RPC:** `onComponerRequest(e) → this._atender(e, 'componer', 'informe-rico.componer.response', d => this._componer(d))`
- **F · eventos:** **sube** → `informe-rico.componer.request` · **publica** → `informe-rico.componer.response`, `informe-rico.componer.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `activacion-vertical` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ActivacionVertical` (HOJA K4)
- **Propósito:** Enciende la vertical por la configuracion declarada; mecanico, cero juicio.
- **Depende de:** `onboarding-negocio`
- **Eventos que sube:** `activacion-vertical.activar.request`, `contabilidad.negocio_onboarded`
- **Eventos que publica:** `activacion-vertical.activar.response`, `activacion-vertical.activar.failed`, `contabilidad.vertical_activada`
- **A · dependencias:** deps de módulo: onboarding-negocio · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `activacion-vertical` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ActivacionVertical extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_activar(input) → { status, data }`
- **E · handlers RPC:** `onActivarRequest(e) → this._atender(e, 'activar', 'activacion-vertical.activar.response', d => this._activar(d))`
- **F · eventos:** **sube** → `activacion-vertical.activar.request`, `contabilidad.negocio_onboarded` · **publica** → `activacion-vertical.activar.response`, `activacion-vertical.activar.failed`, `contabilidad.vertical_activada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cola-declaraciones-criterio` · `CUSTODIO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ColaDeclaracionesCriterio` (HOJA K9)
- **Propósito:** UNA sola cola donde el jefe fija/ratifica TODOS los criterios; cierra declarativamente B1/B7·C7·E6·F5·J6·D11·I5.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `cola-declaraciones-criterio.fijar.request`, `cola-declaraciones-criterio.ratificar.request`, `project.activated`
- **Eventos que publica:** `cola-declaraciones-criterio.fijar.response`, `cola-declaraciones-criterio.fijar.failed`, `cola-declaraciones-criterio.ratificar.response`, `cola-declaraciones-criterio.ratificar.failed`, `contabilidad.criterio_ratificado`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cola-declaraciones-criterio` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class ColaDeclaracionesCriterio extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_fijar(input) → { status, data }` · + 1 proyección(es) más (una por op): _ratificar
- **E · handlers RPC:** `onFijarRequest(e) → this._atender(e, 'fijar', 'cola-declaraciones-criterio.fijar.response', d => this._fijar(d))` · `onRatificarRequest(e) → this._atender(e, 'ratificar', 'cola-declaraciones-criterio.ratificar.response', d => this._ratificar(d))`
- **F · eventos:** **sube** → `cola-declaraciones-criterio.fijar.request`, `cola-declaraciones-criterio.ratificar.request`, `project.activated` · **publica** → `cola-declaraciones-criterio.fijar.response`, `cola-declaraciones-criterio.fijar.failed`, `cola-declaraciones-criterio.ratificar.response`, `cola-declaraciones-criterio.ratificar.failed`, `contabilidad.criterio_ratificado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `puerto-exportacion` · `CONVERSOR` · eje `contabilidad-libro`
- **Clase / hoja F2:** `PuertoExportacion` (HOJA L1)
- **Propósito:** Frontera de formatos contables estandar hacia el programa del asesor; si falta, se crea.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `puerto-exportacion.salir.request`, `puerto-exportacion.entrar.request`
- **Eventos que publica:** `puerto-exportacion.salir.response`, `puerto-exportacion.salir.failed`, `puerto-exportacion.entrar.response`, `puerto-exportacion.entrar.failed`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puerto-exportacion` · `subscribes`: 2 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PuertoExportacion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_salir(input) → { status, data }` · + 1 proyección(es) más (una por op): _entrar
- **E · handlers RPC:** `onSalirRequest(e) → this._atender(e, 'salir', 'puerto-exportacion.salir.response', d => this._salir(d))` · `onEntrarRequest(e) → this._atender(e, 'entrar', 'puerto-exportacion.entrar.response', d => this._entrar(d))`
- **F · eventos:** **sube** → `puerto-exportacion.salir.request`, `puerto-exportacion.entrar.request` · **publica** → `puerto-exportacion.salir.response`, `puerto-exportacion.salir.failed`, `puerto-exportacion.entrar.response`, `puerto-exportacion.entrar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `vista-revisable` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `VistaRevisable` (HOJA L2)
- **Propósito:** Muestra cada asiento/calculo CON su origen: composicion determinista de la traza; NO caja negra.
- **Depende de:** `traza-asiento`
- **Eventos que sube:** `vista-revisable.explicar.request`, `contabilidad.traza_registrada`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `vista-revisable.explicar.response`, `vista-revisable.explicar.failed`
- **A · dependencias:** deps de módulo: traza-asiento · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `vista-revisable` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class VistaRevisable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_explicar(input) → { status, data }`
- **E · handlers RPC:** `onExplicarRequest(e) → this._atender(e, 'explicar', 'vista-revisable.explicar.response', d => this._explicar(d))`
- **F · eventos:** **sube** → `vista-revisable.explicar.request`, `contabilidad.traza_registrada`, `contabilidad.asiento_registrado` · **publica** → `vista-revisable.explicar.response`, `vista-revisable.explicar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `flujo-firma` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `FlujoFirma` (HOJA L3)
- **Propósito:** Parcela de estado revisado/firmado del asesor; El sistema NO firma; vence -> expira y RE-PREGUNTA, jamas asume.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `flujo-firma.firmar.request`, `flujo-firma.estado.request`, `project.activated`
- **Eventos que publica:** `flujo-firma.firmar.response`, `flujo-firma.firmar.failed`, `flujo-firma.estado.response`, `flujo-firma.estado.failed`, `contabilidad.firma_registrada`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `flujo-firma` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class FlujoFirma extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_firmar(input) → { status, data }` · + 1 proyección(es) más (una por op): _estado
- **E · handlers RPC:** `onFirmarRequest(e) → this._atender(e, 'firmar', 'flujo-firma.firmar.response', d => this._firmar(d))` · `onEstadoRequest(e) → this._atender(e, 'estado', 'flujo-firma.estado.response', d => this._estado(d))`
- **F · eventos:** **sube** → `flujo-firma.firmar.request`, `flujo-firma.estado.request`, `project.activated` · **publica** → `flujo-firma.firmar.response`, `flujo-firma.firmar.failed`, `flujo-firma.estado.response`, `flujo-firma.estado.failed`, `contabilidad.firma_registrada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `expediente-documental` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `ExpedienteDocumental` (HOJA L7)
- **Propósito:** Cada cifra con el documento origen ARCHIVADO y ENLAZADO; registro inmutable, un solo escritor; L2 explica, el expediente CONSERVA.
- **Depende de:** `puerto-documento`
- **Eventos que sube:** `expediente-documental.archivar.request`, `expediente-documental.recuperar.request`, `project.activated`
- **Eventos que publica:** `expediente-documental.archivar.response`, `expediente-documental.archivar.failed`, `expediente-documental.recuperar.response`, `expediente-documental.recuperar.failed`, `contabilidad.cifra_archivada`
- **A · dependencias:** deps de módulo: puerto-documento · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `expediente-documental` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class ExpedienteDocumental extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_archivar(input) → { status, data }` · + 1 proyección(es) más (una por op): _recuperar
- **E · handlers RPC:** `onArchivarRequest(e) → this._atender(e, 'archivar', 'expediente-documental.archivar.response', d => this._archivar(d))` · `onRecuperarRequest(e) → this._atender(e, 'recuperar', 'expediente-documental.recuperar.response', d => this._recuperar(d))`
- **F · eventos:** **sube** → `expediente-documental.archivar.request`, `expediente-documental.recuperar.request`, `project.activated` · **publica** → `expediente-documental.archivar.response`, `expediente-documental.archivar.failed`, `expediente-documental.recuperar.response`, `expediente-documental.recuperar.failed`, `contabilidad.cifra_archivada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `control-calidad-muestreo` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `ControlCalidadMuestreo` (HOJA L8)
- **Propósito:** Selecciona lo que exige ojo humano por senales DURAS; excepcion + muestra, NO revisar todo; determinista.
- **Depende de:** `escritor-diario`, `regla-contrapartida`
- **Eventos que sube:** `control-calidad-muestreo.seleccionar.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `control-calidad-muestreo.seleccionar.response`, `control-calidad-muestreo.seleccionar.failed`
- **A · dependencias:** deps de módulo: escritor-diario, regla-contrapartida · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `control-calidad-muestreo` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ControlCalidadMuestreo extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_seleccionar(input) → { status, data }`
- **E · handlers RPC:** `onSeleccionarRequest(e) → this._atender(e, 'seleccionar', 'control-calidad-muestreo.seleccionar.response', d => this._seleccionar(d))`
- **F · eventos:** **sube** → `control-calidad-muestreo.seleccionar.request`, `contabilidad.asiento_registrado` · **publica** → `control-calidad-muestreo.seleccionar.response`, `control-calidad-muestreo.seleccionar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cambio-desde-ultima-revision` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `CambioDesdeUltimaRevision` (HOJA L9)
- **Propósito:** Delta: asientos nuevos, ajustes y reglas cambiadas desde el ultimo visto bueno; calculo de diferencia.
- **Depende de:** `flujo-firma`, `traza-asiento`
- **Eventos que sube:** `cambio-desde-ultima-revision.delta.request`, `contabilidad.firma_registrada`, `contabilidad.asiento_registrado`, `contabilidad.asiento_ajuste_recibido`
- **Eventos que publica:** `cambio-desde-ultima-revision.delta.response`, `cambio-desde-ultima-revision.delta.failed`, `contabilidad.delta_revision`
- **A · dependencias:** deps de módulo: flujo-firma, traza-asiento · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cambio-desde-ultima-revision` · `subscribes`: 4 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CambioDesdeUltimaRevision extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_delta(input) → { status, data }`
- **E · handlers RPC:** `onDeltaRequest(e) → this._atender(e, 'delta', 'cambio-desde-ultima-revision.delta.response', d => this._delta(d))`
- **F · eventos:** **sube** → `cambio-desde-ultima-revision.delta.request`, `contabilidad.firma_registrada`, `contabilidad.asiento_registrado`, `contabilidad.asiento_ajuste_recibido` · **publica** → `cambio-desde-ultima-revision.delta.response`, `cambio-desde-ultima-revision.delta.failed`, `contabilidad.delta_revision` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `ratificacion-regla-aprendida` · `PUENTE` · eje `contabilidad-libro`
- **Clase / hoja F2:** `RatificacionReglaAprendida` (HOJA L10)
- **Propósito:** El asesor ratifica o bloquea la regla ANTES de que actue sobre el volumen; gate humano unico para A6.2 y E8.
- **Depende de:** `regla-contrapartida`, `regla-movimiento-bancario`
- **Eventos que sube:** `ratificacion-regla-aprendida.ratificar.request`, `contabilidad.regla_contrapartida_propuesta`, `contabilidad.regla_bancaria_propuesta`
- **Eventos que publica:** `ratificacion-regla-aprendida.ratificar.response`, `ratificacion-regla-aprendida.ratificar.failed`, `contabilidad.regla_ratificada`
- **A · dependencias:** deps de módulo: regla-contrapartida, regla-movimiento-bancario · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `ratificacion-regla-aprendida` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class RatificacionReglaAprendida extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_ratificar(input) → { status, data }`
- **E · handlers RPC:** `onRatificarRequest(e) → this._atender(e, 'ratificar', 'ratificacion-regla-aprendida.ratificar.response', d => this._ratificar(d))`
- **F · eventos:** **sube** → `ratificacion-regla-aprendida.ratificar.request`, `contabilidad.regla_contrapartida_propuesta`, `contabilidad.regla_bancaria_propuesta` · **publica** → `ratificacion-regla-aprendida.ratificar.response`, `ratificacion-regla-aprendida.ratificar.failed`, `contabilidad.regla_ratificada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `frontera-planos` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `FronteraPlanos` (HOJA M1)
- **Propósito:** Guarda verificable de que SOLO se emiten calculos, NUNCA hechos de negocio; un test lo afirma; no realimenta la operacion.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `frontera-planos.verificar.request`
- **Eventos que publica:** `frontera-planos.verificar.response`, `frontera-planos.verificar.failed`, `contabilidad.salida_verificada`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `frontera-planos` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class FronteraPlanos extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_verificar(input) → { status, data }`
- **E · handlers RPC:** `onVerificarRequest(e) → this._atender(e, 'verificar', 'frontera-planos.verificar.response', d => this._verificar(d))`
- **F · eventos:** **sube** → `frontera-planos.verificar.request` · **publica** → `frontera-planos.verificar.response`, `frontera-planos.verificar.failed`, `contabilidad.salida_verificada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `single-writer` · `CUSTODIO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `SingleWriter` (HOJA M2)
- **Propósito:** La LEY que gobierna cada custodio: un solo escritor por parcela; segundo escritor = corrupcion.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `single-writer.reclamar.request`, `single-writer.es_escritor.request`, `project.activated`
- **Eventos que publica:** `single-writer.reclamar.response`, `single-writer.reclamar.failed`, `single-writer.es_escritor.response`, `single-writer.es_escritor.failed`, `contabilidad.escritor_reclamado`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `single-writer` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class SingleWriter extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_reclamar(input) → { status, data }` · + 1 proyección(es) más (una por op): _es_escritor
- **E · handlers RPC:** `onReclamarRequest(e) → this._atender(e, 'reclamar', 'single-writer.reclamar.response', d => this._reclamar(d))` · `onEsEscritorRequest(e) → this._atender(e, 'es_escritor', 'single-writer.es_escritor.response', d => this._es_escritor(d))`
- **F · eventos:** **sube** → `single-writer.reclamar.request`, `single-writer.es_escritor.request`, `project.activated` · **publica** → `single-writer.reclamar.response`, `single-writer.reclamar.failed`, `single-writer.es_escritor.response`, `single-writer.es_escritor.failed`, `contabilidad.escritor_reclamado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `clave-natural` · `REFLEJO` · eje `contabilidad-libro`
- **Clase / hoja F2:** `ClaveNatural` (HOJA M3)
- **Propósito:** Idempotencia determinista: reprocesar NO duplica ("un cierre = un asiento"); un test lo afirma.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `clave-natural.calcular.request`, `clave-natural.coincide.request`
- **Eventos que publica:** `clave-natural.calcular.response`, `clave-natural.calcular.failed`, `clave-natural.coincide.response`, `clave-natural.coincide.failed`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `clave-natural` · `subscribes`: 2 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ClaveNatural extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }` · + 1 proyección(es) más (una por op): _coincide
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'clave-natural.calcular.response', d => this._calcular(d))` · `onCoincideRequest(e) → this._atender(e, 'coincide', 'clave-natural.coincide.response', d => this._coincide(d))`
- **F · eventos:** **sube** → `clave-natural.calcular.request`, `clave-natural.coincide.request` · **publica** → `clave-natural.calcular.response`, `clave-natural.calcular.failed`, `clave-natural.coincide.response`, `clave-natural.coincide.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `maestro-terceros` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `MaestroTerceros` (HOJA N1)
- **Propósito:** Ficha unica de cliente/proveedor (identificacion fiscal, condiciones, historial); UN solo maestro con roles.
- **Depende de:** `padron-terceros`
- **Eventos que sube:** `maestro-terceros.ficha.request`, `maestro-terceros.upsert.request`, `project.activated`
- **Eventos que publica:** `maestro-terceros.ficha.response`, `maestro-terceros.ficha.failed`, `maestro-terceros.upsert.response`, `maestro-terceros.upsert.failed`, `contabilidad.tercero_actualizado`
- **A · dependencias:** deps de módulo: padron-terceros · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `maestro-terceros` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class MaestroTerceros extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_ficha(input) → { status, data }` · + 1 proyección(es) más (una por op): _upsert
- **E · handlers RPC:** `onFichaRequest(e) → this._atender(e, 'ficha', 'maestro-terceros.ficha.response', d => this._ficha(d))` · `onUpsertRequest(e) → this._atender(e, 'upsert', 'maestro-terceros.upsert.response', d => this._upsert(d))`
- **F · eventos:** **sube** → `maestro-terceros.ficha.request`, `maestro-terceros.upsert.request`, `project.activated` · **publica** → `maestro-terceros.ficha.response`, `maestro-terceros.ficha.failed`, `maestro-terceros.upsert.response`, `maestro-terceros.upsert.failed`, `contabilidad.tercero_actualizado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `padron-terceros` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `PadronTerceros` (HOJA N2)
- **Propósito:** Identidad unica por numero fiscal: un proveedor escrito de tres formas sigue siendo uno; faceta de identidad del MISMO maestro N1.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `padron-terceros.unificar.request`, `project.activated`
- **Eventos que publica:** `padron-terceros.unificar.response`, `padron-terceros.unificar.failed`, `contabilidad.identidad_unificada`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `padron-terceros` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class PadronTerceros extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_unificar(input) → { status, data }`
- **E · handlers RPC:** `onUnificarRequest(e) → this._atender(e, 'unificar', 'padron-terceros.unificar.response', d => this._unificar(d))`
- **F · eventos:** **sube** → `padron-terceros.unificar.request`, `project.activated` · **publica** → `padron-terceros.unificar.response`, `padron-terceros.unificar.failed`, `contabilidad.identidad_unificada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `cuenta-proveedor` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `CuentaProveedor` (HOJA N3)
- **Propósito:** Mayor auxiliar del tercero (cada factura de compra viva y su saldo) DERIVADO del diario.
- **Depende de:** `escritor-diario`, `maestro-terceros`
- **Eventos que sube:** `cuenta-proveedor.saldo.request`, `cuenta-proveedor.facturas_vivas.request`, `contabilidad.asiento_registrado`
- **Eventos que publica:** `cuenta-proveedor.saldo.response`, `cuenta-proveedor.saldo.failed`, `cuenta-proveedor.facturas_vivas.response`, `cuenta-proveedor.facturas_vivas.failed`
- **A · dependencias:** deps de módulo: escritor-diario, maestro-terceros · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cuenta-proveedor` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CuentaProveedor extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_saldo(input) → { status, data }` · + 1 proyección(es) más (una por op): _facturas_vivas
- **E · handlers RPC:** `onSaldoRequest(e) → this._atender(e, 'saldo', 'cuenta-proveedor.saldo.response', d => this._saldo(d))` · `onFacturasVivasRequest(e) → this._atender(e, 'facturas_vivas', 'cuenta-proveedor.facturas_vivas.response', d => this._facturas_vivas(d))`
- **F · eventos:** **sube** → `cuenta-proveedor.saldo.request`, `cuenta-proveedor.facturas_vivas.request`, `contabilidad.asiento_registrado` · **publica** → `cuenta-proveedor.saldo.response`, `cuenta-proveedor.saldo.failed`, `cuenta-proveedor.facturas_vivas.response`, `cuenta-proveedor.facturas_vivas.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `estado-cuenta-proveedor` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `EstadoCuentaProveedor` (HOJA N4)
- **Propósito:** Extracto CONFRONTABLE con el proveedor (conciliacion de saldos); derivacion determinista.
- **Depende de:** `cuenta-proveedor`
- **Eventos que sube:** `estado-cuenta-proveedor.extracto.request`
- **Eventos que publica:** `estado-cuenta-proveedor.extracto.response`, `estado-cuenta-proveedor.extracto.failed`
- **A · dependencias:** deps de módulo: cuenta-proveedor · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `estado-cuenta-proveedor` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class EstadoCuentaProveedor extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_extracto(input) → { status, data }`
- **E · handlers RPC:** `onExtractoRequest(e) → this._atender(e, 'extracto', 'estado-cuenta-proveedor.extracto.response', d => this._extracto(d))`
- **F · eventos:** **sube** → `estado-cuenta-proveedor.extracto.request` · **publica** → `estado-cuenta-proveedor.extracto.response`, `estado-cuenta-proveedor.extracto.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `cruce-factura-recepcion` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `CruceFacturaRecepcion` (HOJA N5)
- **Propósito:** Coteja pedido <-> recepcion <-> factura ANTES de asentar; lo que no cuadra -> cola; determinista.
- **Depende de:** `puerto-evento-vertical`
- **Eventos que sube:** `cruce-factura-recepcion.cotejar.request`
- **Eventos que publica:** `cruce-factura-recepcion.cotejar.response`, `cruce-factura-recepcion.cotejar.failed`, `contabilidad.cruce_descuadrado`
- **A · dependencias:** deps de módulo: puerto-evento-vertical · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `cruce-factura-recepcion` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class CruceFacturaRecepcion extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_cotejar(input) → { status, data }`
- **E · handlers RPC:** `onCotejarRequest(e) → this._atender(e, 'cotejar', 'cruce-factura-recepcion.cotejar.response', d => this._cotejar(d))`
- **F · eventos:** **sube** → `cruce-factura-recepcion.cotejar.request` · **publica** → `cruce-factura-recepcion.cotejar.response`, `cruce-factura-recepcion.cotejar.failed`, `contabilidad.cruce_descuadrado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `vencimiento-pago` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `VencimientoPago` (HOJA N6)
- **Propósito:** Fecha de vencimiento por factura desde la politica declarada -> alimenta E5 y K2; un solo tipo Vencimiento con dos lados.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `vencimiento-pago.calcular.request`
- **Eventos que publica:** `vencimiento-pago.calcular.response`, `vencimiento-pago.calcular.failed`, `contabilidad.vencimiento_proximo`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `vencimiento-pago` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class VencimientoPago extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'vencimiento-pago.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `vencimiento-pago.calcular.request` · **publica** → `vencimiento-pago.calcular.response`, `vencimiento-pago.calcular.failed`, `contabilidad.vencimiento_proximo` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `rappel-pronto-pago` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `RappelProntoPago` (HOJA N7)
- **Propósito:** Descuentos/rappels/anticipos que ajustan el coste REAL de la compra a lo realmente pagado; determinista.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `rappel-pronto-pago.ajustar.request`
- **Eventos que publica:** `rappel-pronto-pago.ajustar.response`, `rappel-pronto-pago.ajustar.failed`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `rappel-pronto-pago` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class RappelProntoPago extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_ajustar(input) → { status, data }`
- **E · handlers RPC:** `onAjustarRequest(e) → this._atender(e, 'ajustar', 'rappel-pronto-pago.ajustar.response', d => this._ajustar(d))`
- **F · eventos:** **sube** → `rappel-pronto-pago.ajustar.request` · **publica** → `rappel-pronto-pago.ajustar.response`, `rappel-pronto-pago.ajustar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `antiguedad-de-saldos` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `AntiguedadSaldos` (HOJA N8)
- **Propósito:** Lo pendiente clasificado por vencimiento: quien y cuanto esta vencido; espejo de N6 del lado del cobro.
- **Depende de:** `vencimiento-pago`
- **Eventos que sube:** `antiguedad-de-saldos.clasificar.request`
- **Eventos que publica:** `antiguedad-de-saldos.clasificar.response`, `antiguedad-de-saldos.clasificar.failed`
- **A · dependencias:** deps de módulo: vencimiento-pago · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `antiguedad-de-saldos` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AntiguedadSaldos extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_clasificar(input) → { status, data }`
- **E · handlers RPC:** `onClasificarRequest(e) → this._atender(e, 'clasificar', 'antiguedad-de-saldos.clasificar.response', d => this._clasificar(d))`
- **F · eventos:** **sube** → `antiguedad-de-saldos.clasificar.request` · **publica** → `antiguedad-de-saldos.clasificar.response`, `antiguedad-de-saldos.clasificar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `emision-factura-venta` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `EmisionFacturaVenta` (HOJA O1)
- **Propósito:** Cara emitida con serie/numeracion; numero duplicado = corrupcion -> un solo escritor; contabilidad SI emite SU factura.
- **Depende de:** `maestro-terceros`, `factura-electronica`
- **Eventos que sube:** `emision-factura-venta.emitir.request`, `project.activated`
- **Eventos que publica:** `emision-factura-venta.emitir.response`, `emision-factura-venta.emitir.failed`, `contabilidad.factura_emitida`
- **A · dependencias:** deps de módulo: maestro-terceros, factura-electronica · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `emision-factura-venta` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class EmisionFacturaVenta extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_emitir(input) → { status, data }`
- **E · handlers RPC:** `onEmitirRequest(e) → this._atender(e, 'emitir', 'emision-factura-venta.emitir.response', d => this._emitir(d))`
- **F · eventos:** **sube** → `emision-factura-venta.emitir.request`, `project.activated` · **publica** → `emision-factura-venta.emitir.response`, `emision-factura-venta.emitir.failed`, `contabilidad.factura_emitida` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `factura-rectificativa` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `FacturaRectificativa` (HOJA O2)
- **Propósito:** Correccion comercial POSTERIOR a la emision (abono/devolucion/descuento) que NO borra nada; != ajuste interno B5.
- **Depende de:** `emision-factura-venta`
- **Eventos que sube:** `factura-rectificativa.calcular.request`
- **Eventos que publica:** `factura-rectificativa.calcular.response`, `factura-rectificativa.calcular.failed`, `contabilidad.factura_rectificada`
- **A · dependencias:** deps de módulo: emision-factura-venta · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `factura-rectificativa` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class FacturaRectificativa extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'factura-rectificativa.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `factura-rectificativa.calcular.request` · **publica** → `factura-rectificativa.calcular.response`, `factura-rectificativa.calcular.failed`, `contabilidad.factura_rectificada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `panel-proceso-contable` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `PanelProcesoContable` (HOJA P1)
- **Propósito:** Que entra, que se procesa, que esta en cola, que falla; agregacion determinista; el "display" de la contabilidad.
- **Depende de:** `encolado-excepcion`, `historial-proceso-contable`
- **Eventos que sube:** `panel-proceso-contable.latido.request`, `contabilidad.excepcion_encolada`, `contabilidad.proceso_anotado`
- **Eventos que publica:** `panel-proceso-contable.latido.response`, `panel-proceso-contable.latido.failed`
- **A · dependencias:** deps de módulo: encolado-excepcion, historial-proceso-contable · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `panel-proceso-contable` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class PanelProcesoContable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_latido(input) → { status, data }`
- **E · handlers RPC:** `onLatidoRequest(e) → this._atender(e, 'latido', 'panel-proceso-contable.latido.response', d => this._latido(d))`
- **F · eventos:** **sube** → `panel-proceso-contable.latido.request`, `contabilidad.excepcion_encolada`, `contabilidad.proceso_anotado` · **publica** → `panel-proceso-contable.latido.response`, `panel-proceso-contable.latido.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `historial-proceso-contable` · `CUSTODIO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `HistorialProcesoContable` (HOJA P2)
- **Propósito:** Registro append-only de lo procesado y lo fallado con su rastro; != traza-asiento B4; un solo escritor.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `historial-proceso-contable.anotar.request`, `project.activated`
- **Eventos que publica:** `historial-proceso-contable.anotar.response`, `historial-proceso-contable.anotar.failed`, `contabilidad.proceso_anotado`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `historial-proceso-contable` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · + `project.activated` obligatorio (persiste estado)
- **C · index.js:** `class HistorialProcesoContable extends ModuloHibridoReflejo` · `PosPersistencia({ modulo, file: '<slug>.json', snapshot, hidratar })` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_anotar(input) → { status, data }`
- **E · handlers RPC:** `onAnotarRequest(e) → this._atender(e, 'anotar', 'historial-proceso-contable.anotar.response', d => this._anotar(d))`
- **F · eventos:** **sube** → `historial-proceso-contable.anotar.request`, `project.activated` · **publica** → `historial-proceso-contable.anotar.response`, `historial-proceso-contable.anotar.failed`, `contabilidad.proceso_anotado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `desatasco-entrada` · `MICRO-AGENTE` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `DesatascoEntrada` (HOJA P3)
- **Propósito:** Resolver/reencolar/descartar una excepcion CON motivo; la ACCION que completa A8; si la silla es humana, captura su decision.
- **Depende de:** `encolado-excepcion`
- **Eventos que sube:** `desatasco-entrada.juzgar.request`
- **Eventos que publica:** `desatasco-entrada.juzgar.response`, `desatasco-entrada.juzgar.failed`, `contabilidad.excepcion_desatascada`
- **A · dependencias:** deps de módulo: encolado-excepcion · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `desatasco-entrada` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class DesatascoEntrada extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_juzgar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onJuzgarRequest(e) → this._atender(e, 'juzgar', 'desatasco-entrada.juzgar.response', d => this._juzgar(d))`
- **F · eventos:** **sube** → `desatasco-entrada.juzgar.request` · **publica** → `desatasco-entrada.juzgar.response`, `desatasco-entrada.juzgar.failed`, `contabilidad.excepcion_desatascada` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `tasa-cobertura-entrada` · `REFLEJO` · eje `contabilidad-entrada`
- **Clase / hoja F2:** `TasaCoberturaEntrada` (HOJA P4)
- **Propósito:** Proporcion de hechos que entran SIN intervencion vs caen a cola; LEE la metrica unica; prueba la promesa "sin una persona digitando".
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `tasa-cobertura-entrada.calcular.request`, `contabilidad.cobertura_medida`
- **Eventos que publica:** `tasa-cobertura-entrada.calcular.response`, `tasa-cobertura-entrada.calcular.failed`
- **A · dependencias:** deps de módulo: completitud-cobertura · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `tasa-cobertura-entrada` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class TasaCoberturaEntrada extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_calcular(input) → { status, data }`
- **E · handlers RPC:** `onCalcularRequest(e) → this._atender(e, 'calcular', 'tasa-cobertura-entrada.calcular.response', d => this._calcular(d))`
- **F · eventos:** **sube** → `tasa-cobertura-entrada.calcular.request`, `contabilidad.cobertura_medida` · **publica** → `tasa-cobertura-entrada.calcular.response`, `tasa-cobertura-entrada.calcular.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `consulta-cuentas-bajo-demanda` · `PUENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `ConsultaCuentasBajoDemanda` (HOJA Q1)
- **Propósito:** Puerta pull: conecta la pregunta del dueno con el calculo por peticion; NO impone cadencia.
- **Depende de:** — (hoja raíz)
- **Eventos que sube:** `consulta-cuentas-bajo-demanda.preguntar.request`
- **Eventos que publica:** `consulta-cuentas-bajo-demanda.preguntar.response`, `consulta-cuentas-bajo-demanda.preguntar.failed`, `contabilidad.respuesta_consulta`
- **A · dependencias:** deps de módulo: (ninguna) · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `consulta-cuentas-bajo-demanda` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class ConsultaCuentasBajoDemanda extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_preguntar(input) → { status, data }`
- **E · handlers RPC:** `onPreguntarRequest(e) → this._atender(e, 'preguntar', 'consulta-cuentas-bajo-demanda.preguntar.response', d => this._preguntar(d))`
- **F · eventos:** **sube** → `consulta-cuentas-bajo-demanda.preguntar.request` · **publica** → `consulta-cuentas-bajo-demanda.preguntar.response`, `consulta-cuentas-bajo-demanda.preguntar.failed`, `contabilidad.respuesta_consulta` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `puente-lenguaje-dueno` · `MICRO-AGENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `PuenteLenguajeDueno` (HOJA Q2)
- **Propósito:** Traductor BIDIRECCIONAL: su pregunta -> consulta contable; calculo -> cifra en su idioma (caja, deuda, "puedo pagar X?").
- **Depende de:** `consulta-cuentas-bajo-demanda`
- **Eventos que sube:** `puente-lenguaje-dueno.a_consulta.request`, `puente-lenguaje-dueno.a_cifra.request`, `contabilidad.respuesta_consulta`
- **Eventos que publica:** `puente-lenguaje-dueno.a_consulta.response`, `puente-lenguaje-dueno.a_consulta.failed`, `puente-lenguaje-dueno.a_cifra.response`, `puente-lenguaje-dueno.a_cifra.failed`, `contabilidad.consulta_traducida`
- **A · dependencias:** deps de módulo: consulta-cuentas-bajo-demanda · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `puente-lenguaje-dueno` · `subscribes`: 3 tópicos (+ 2 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class PuenteLenguajeDueno extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_a_consulta(input) → { status, data }` · + 1 proyección(es) más (una por op): _a_cifra · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onAConsultaRequest(e) → this._atender(e, 'a_consulta', 'puente-lenguaje-dueno.a_consulta.response', d => this._a_consulta(d))` · `onACifraRequest(e) → this._atender(e, 'a_cifra', 'puente-lenguaje-dueno.a_cifra.response', d => this._a_cifra(d))`
- **F · eventos:** **sube** → `puente-lenguaje-dueno.a_consulta.request`, `puente-lenguaje-dueno.a_cifra.request`, `contabilidad.respuesta_consulta` · **publica** → `puente-lenguaje-dueno.a_consulta.response`, `puente-lenguaje-dueno.a_consulta.failed`, `puente-lenguaje-dueno.a_cifra.response`, `puente-lenguaje-dueno.a_cifra.failed`, `contabilidad.consulta_traducida` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `sello-cobertura` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `SelloCobertura` (HOJA Q3)
- **Propósito:** Marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES de decidir; LEE la metrica unica.
- **Depende de:** `completitud-cobertura`
- **Eventos que sube:** `sello-cobertura.sellar.request`, `contabilidad.respuesta_consulta`
- **Eventos que publica:** `sello-cobertura.sellar.response`, `sello-cobertura.sellar.failed`
- **A · dependencias:** deps de módulo: completitud-cobertura · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `sello-cobertura` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class SelloCobertura extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_sellar(input) → { status, data }`
- **E · handlers RPC:** `onSellarRequest(e) → this._atender(e, 'sellar', 'sello-cobertura.sellar.response', d => this._sellar(d))`
- **F · eventos:** **sube** → `sello-cobertura.sellar.request`, `contabilidad.respuesta_consulta` · **publica** → `sello-cobertura.sellar.response`, `sello-cobertura.sellar.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `marca-borrador-validado` · `REFLEJO` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `MarcaBorradorValidado` (HOJA Q4)
- **Propósito:** Sello del punto en que esta lo que ve (en curso/revisado/firmado) para no decidir sobre un borrador vivo; deriva de traza y firma.
- **Depende de:** `traza-asiento`, `flujo-firma`
- **Eventos que sube:** `marca-borrador-validado.estado.request`, `contabilidad.traza_registrada`, `contabilidad.firma_registrada`
- **Eventos que publica:** `marca-borrador-validado.estado.response`, `marca-borrador-validado.estado.failed`
- **A · dependencias:** deps de módulo: traza-asiento, flujo-firma · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `marca-borrador-validado` · `subscribes`: 3 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class MarcaBorradorValidado extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_estado(input) → { status, data }`
- **E · handlers RPC:** `onEstadoRequest(e) → this._atender(e, 'estado', 'marca-borrador-validado.estado.response', d => this._estado(d))`
- **F · eventos:** **sube** → `marca-borrador-validado.estado.request`, `contabilidad.traza_registrada`, `contabilidad.firma_registrada` · **publica** → `marca-borrador-validado.estado.response`, `marca-borrador-validado.estado.failed` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test unitario AFIRMA la proyección determinista (una sola respuesta correcta)

### `aviso-al-negocio` · `PUENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `AvisoAlNegocio` (HOJA R1)
- **Propósito:** El aviso ENTREGADO y CONFIRMADO al negocio cliente; cara de entrega que COMPLETA motor-avisos K2.
- **Depende de:** `motor-avisos`
- **Eventos que sube:** `aviso-al-negocio.entregar.request`, `contabilidad.aviso_producido`
- **Eventos que publica:** `aviso-al-negocio.entregar.response`, `aviso-al-negocio.entregar.failed`, `contabilidad.aviso_entregado`
- **A · dependencias:** deps de módulo: motor-avisos · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `aviso-al-negocio` · `subscribes`: 2 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op
- **C · index.js:** `class AvisoAlNegocio extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_entregar(input) → { status, data }`
- **E · handlers RPC:** `onEntregarRequest(e) → this._atender(e, 'entregar', 'aviso-al-negocio.entregar.response', d => this._entregar(d))`
- **F · eventos:** **sube** → `aviso-al-negocio.entregar.request`, `contabilidad.aviso_producido` · **publica** → `aviso-al-negocio.entregar.response`, `aviso-al-negocio.entregar.failed`, `contabilidad.aviso_entregado` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `informe-accionable` · `MICRO-AGENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `InformeAccionable` (HOJA R2)
- **Propósito:** Todo informe que recibe el cliente lleva QUE HACER con el; la recomendacion es juicio; refuerza K3.
- **Depende de:** `informe-rico`
- **Eventos que sube:** `informe-accionable.juzgar.request`
- **Eventos que publica:** `informe-accionable.juzgar.response`, `informe-accionable.juzgar.failed`, `contabilidad.recomendacion`
- **A · dependencias:** deps de módulo: informe-rico · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `informe-accionable` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class InformeAccionable extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_juzgar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onJuzgarRequest(e) → this._atender(e, 'juzgar', 'informe-accionable.juzgar.response', d => this._juzgar(d))`
- **F · eventos:** **sube** → `informe-accionable.juzgar.request` · **publica** → `informe-accionable.juzgar.response`, `informe-accionable.juzgar.failed`, `contabilidad.recomendacion` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

### `narrador-estados` · `MICRO-AGENTE` · eje `contabilidad-analitica`
- **Clase / hoja F2:** `NarradorEstados` (HOJA R3)
- **Propósito:** Traduce balance/resultado al LENGUAJE del negocio cliente ("esto es lo que te ha pasado y lo que viene").
- **Depende de:** `balance-situacion`, `cuenta-resultados`
- **Eventos que sube:** `narrador-estados.narrar.request`
- **Eventos que publica:** `narrador-estados.narrar.response`, `narrador-estados.narrar.failed`, `contabilidad.narracion`
- **A · dependencias:** deps de módulo: balance-situacion, cuenta-resultados · las deps se resuelven por EVENTO (request/response), nunca por import
- **B · module.json:** `name`: `narrador-estados` · `subscribes`: 1 tópicos (+ 1 `.request` propios) · `publishes`: par `.response`+`.failed` por op · `blueprint_driven: true` (cajones fuzzy + reflejo que sirve las ops)
- **C · index.js:** `class NarradorEstados extends ModuloHibridoReflejo` · `onUnload()` → flush; `onProjectActivated(e)` → restaurar(project_id)
- **D · proyecciones:** `_narrar(input) → { status, data }` · la proyección determinista (fallback) + cajón blueprint para el juicio fuzzy (delega al reflejo)
- **E · handlers RPC:** `onNarrarRequest(e) → this._atender(e, 'narrar', 'narrador-estados.narrar.response', d => this._narrar(d))`
- **F · eventos:** **sube** → `narrador-estados.narrar.request` · **publica** → `narrador-estados.narrar.response`, `narrador-estados.narrar.failed`, `contabilidad.narracion` · todo flujo cierra su círculo con su par `*.failed`
- **VERIFICACIÓN:** `node scripts/validate-hibridos.js` → **PASS** (sin colisión reflejo↔blueprint; handlers existen) · test: el CUSTODIO rechaza el segundo escritor / MICRO-AGENTE no escribe (solo propone)

---

## §4 · Contrato de eventos (request/response + fire-and-forget con par de fallo)

> Convención: `<slug>.<op>.request` → `<slug>.<op>.response` (éxito) **y** `<slug>.<op>.failed` (fallo).
> Tópicos en **ASCII**. Los fire-and-forget de dominio cierran también con su par de fallo declarado en el módulo emisor.


### 4.1 · Pares request/response/failed (por hoja)

| Hoja (slug) | Forma | Sube (`.request`) | Publica (`.response`/`.failed`) | Fire-and-forget |
|---|---|---|---|---|
| `puerto-evento-vertical` | PUENTE | `puerto-evento-vertical.recibir.request` | `puerto-evento-vertical.recibir.response`, `puerto-evento-vertical.recibir.failed` | `contabilidad.hecho_crudo` |
| `normalizador-hecho` | CONVERSOR | `normalizador-hecho.normalizar.request` | `normalizador-hecho.normalizar.response`, `normalizador-hecho.normalizar.failed` | `contabilidad.hecho_normalizado` |
| `captura-documento` | REFLEJO | `captura-documento.admitir.request` | `captura-documento.admitir.response`, `captura-documento.admitir.failed` | `contabilidad.documento_admitido` |
| `extraccion-dato` | MICRO-AGENTE | — | — | `factura.recibida`, `factura.procesada`, `factura.error`, `factura.exportada` |
| `puerto-documento` | CONVERSOR | `puerto-documento.entrar.request` | `puerto-documento.entrar.response`, `puerto-documento.entrar.failed` | `contabilidad.documento_normalizado` |
| `control-cuadre-documento` | REFLEJO | `control-cuadre-documento.cuadra.request` | `control-cuadre-documento.cuadra.response`, `control-cuadre-documento.cuadra.failed` | `contabilidad.documento_descuadrado` |
| `puerto-documento-digital` | PUENTE | — | — | `factura.entrada` |
| `contrapartida-asistida` | MICRO-AGENTE | `contrapartida-asistida.juzgar.request` | `contrapartida-asistida.juzgar.response`, `contrapartida-asistida.juzgar.failed` | `contabilidad.contrapartida_propuesta` |
| `regla-contrapartida` | CUSTODIO | `regla-contrapartida.aplicar.request`, `regla-contrapartida.proponer.request` | `regla-contrapartida.aplicar.response`, `regla-contrapartida.aplicar.failed`, `regla-contrapartida.proponer.response`, `regla-contrapartida.proponer.failed` | `contabilidad.regla_contrapartida_propuesta` |
| `deduplicacion-hecho` | REFLEJO | `deduplicacion-hecho.es_nuevo.request` | `deduplicacion-hecho.es_nuevo.response`, `deduplicacion-hecho.es_nuevo.failed` | — |
| `encolado-excepcion` | CUSTODIO | `encolado-excepcion.encolar.request`, `encolado-excepcion.tomar.request` | `encolado-excepcion.encolar.response`, `encolado-excepcion.encolar.failed`, `encolado-excepcion.tomar.response`, `encolado-excepcion.tomar.failed` | `contabilidad.excepcion_encolada` |
| `aviso-revision` | PUENTE | `aviso-revision.empujar.request` | `aviso-revision.empujar.response`, `aviso-revision.empujar.failed` | `contabilidad.aviso_revision` |
| `lote-admision` | REFLEJO | `lote-admision.admitir.request` | `lote-admision.admitir.response`, `lote-admision.admitir.failed` | — |
| `contrato-hecho-minimo` | CUSTODIO | `contrato-hecho-minimo.exigir.request`, `contrato-hecho-minimo.declarar.request` | `contrato-hecho-minimo.exigir.response`, `contrato-hecho-minimo.exigir.failed`, `contrato-hecho-minimo.declarar.response`, `contrato-hecho-minimo.declarar.failed` | `contabilidad.contrato_declarado` |
| `completitud-cobertura` | REFLEJO | `completitud-cobertura.medir.request` | `completitud-cobertura.medir.response`, `completitud-cobertura.medir.failed` | `contabilidad.cobertura_medida` |
| `hecho-rectificativo` | PUENTE | `hecho-rectificativo.emparejar.request` | `hecho-rectificativo.emparejar.response`, `hecho-rectificativo.emparejar.failed` | `contabilidad.hecho_rectificado` |
| `anclaje-cierre-vertical` | CUSTODIO | `anclaje-cierre-vertical.anclar.request`, `anclaje-cierre-vertical.declarar.request` | `anclaje-cierre-vertical.anclar.response`, `anclaje-cierre-vertical.anclar.failed`, `anclaje-cierre-vertical.declarar.response`, `anclaje-cierre-vertical.declarar.failed` | `contabilidad.cierre_anclado` |
| `declaracion-fuente-faltante` | PUENTE | `declaracion-fuente-faltante.declarar.request` | `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed` | `contabilidad.fuente_faltante` |
| `catalogo-cuentas` | CUSTODIO | `catalogo-cuentas.anadir.request`, `catalogo-cuentas.buscar.request` | `catalogo-cuentas.anadir.response`, `catalogo-cuentas.anadir.failed`, `catalogo-cuentas.buscar.response`, `catalogo-cuentas.buscar.failed` | — |
| `escritor-diario` | CUSTODIO | `escritor-diario.asentar.request` | `escritor-diario.asentar.response`, `escritor-diario.asentar.failed` | `contabilidad.asiento_registrado` |
| `mayor-balanza` | REFLEJO | `mayor-balanza.saldos.request`, `mayor-balanza.balanza.request` | `mayor-balanza.saldos.response`, `mayor-balanza.saldos.failed`, `mayor-balanza.balanza.response`, `mayor-balanza.balanza.failed` | — |
| `traza-asiento` | CUSTODIO | `traza-asiento.registrar.request` | `traza-asiento.registrar.response`, `traza-asiento.registrar.failed` | `contabilidad.traza_registrada` |
| `asiento-ajuste` | PUENTE | `asiento-ajuste.entrar.request` | `asiento-ajuste.entrar.response`, `asiento-ajuste.entrar.failed` | `contabilidad.asiento_ajuste_recibido` |
| `puerto-plan-contable` | CONVERSOR | `puerto-plan-contable.entrar.request`, `puerto-plan-contable.salir.request` | `puerto-plan-contable.entrar.response`, `puerto-plan-contable.entrar.failed`, `puerto-plan-contable.salir.response`, `puerto-plan-contable.salir.failed` | — |
| `balance-situacion` | REFLEJO | `balance-situacion.calcular.request` | `balance-situacion.calcular.response`, `balance-situacion.calcular.failed` | — |
| `cuenta-resultados` | REFLEJO | `cuenta-resultados.calcular.request` | `cuenta-resultados.calcular.response`, `cuenta-resultados.calcular.failed` | — |
| `periodificacion` | REFLEJO | `periodificacion.imputar.request` | `periodificacion.imputar.response`, `periodificacion.imputar.failed` | — |
| `cierre-ejercicio` | CUSTODIO | `cierre-ejercicio.cerrar.request`, `cierre-ejercicio.reabrir.request` | `cierre-ejercicio.cerrar.response`, `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed` | `contabilidad.ejercicio_cerrado` |
| `apertura-ejercicio` | REFLEJO | `apertura-ejercicio.generar.request` | `apertura-ejercicio.generar.response`, `apertura-ejercicio.generar.failed` | — |
| `aviso-cuadre` | PUENTE | `aviso-cuadre.avisar.request` | `aviso-cuadre.avisar.response`, `aviso-cuadre.avisar.failed` | `contabilidad.aviso_cuadre` |
| `liquidacion-iva` | REFLEJO | `liquidacion-iva.calcular.request` | `liquidacion-iva.calcular.response`, `liquidacion-iva.calcular.failed` | — |
| `modelo-303` | REFLEJO | `modelo-303.construir.request` | `modelo-303.construir.response`, `modelo-303.construir.failed` | — |
| `modelo-390` | REFLEJO | `modelo-390.construir.request` | `modelo-390.construir.response`, `modelo-390.construir.failed` | — |
| `retenciones` | REFLEJO | `retenciones.calcular.request` | `retenciones.calcular.response`, `retenciones.calcular.failed` | — |
| `estimacion-is-irpf` | REFLEJO | `estimacion-is-irpf.estimar.request` | `estimacion-is-irpf.estimar.response`, `estimacion-is-irpf.estimar.failed` | — |
| `calendario-fiscal` | CUSTODIO | `calendario-fiscal.proximos.request`, `calendario-fiscal.declarar.request` | `calendario-fiscal.proximos.response`, `calendario-fiscal.proximos.failed`, `calendario-fiscal.declarar.response`, `calendario-fiscal.declarar.failed` | `contabilidad.vencimiento_fiscal` |
| `generador-modelo` | PUENTE | `generador-modelo.exportar.request` | `generador-modelo.exportar.response`, `generador-modelo.exportar.failed` | `contabilidad.modelo_exportado` |
| `registro-verifactu` | CUSTODIO | `registro-verifactu.encadenar.request` | `registro-verifactu.encadenar.response`, `registro-verifactu.encadenar.failed` | `contabilidad.huella_encadenada` |
| `factura-electronica` | CONVERSOR | `factura-electronica.entrar.request`, `factura-electronica.salir.request` | `factura-electronica.entrar.response`, `factura-electronica.entrar.failed`, `factura-electronica.salir.response`, `factura-electronica.salir.failed` | — |
| `estado-presentacion-fiscal` | CUSTODIO | `estado-presentacion-fiscal.avanzar.request`, `estado-presentacion-fiscal.estado.request` | `estado-presentacion-fiscal.avanzar.response`, `estado-presentacion-fiscal.avanzar.failed`, `estado-presentacion-fiscal.estado.response`, `estado-presentacion-fiscal.estado.failed` | `contabilidad.obligacion_avanzada` |
| `acuse-presentacion` | PUENTE | `acuse-presentacion.ligar.request` | `acuse-presentacion.ligar.response`, `acuse-presentacion.ligar.failed` | `contabilidad.acuse_ligado` |
| `rectificacion-declaracion` | CUSTODIO | `rectificacion-declaracion.rectificar.request` | `rectificacion-declaracion.rectificar.response`, `rectificacion-declaracion.rectificar.failed` | `contabilidad.declaracion_rectificada` |
| `perfil-administrativo` | CUSTODIO | `perfil-administrativo.obligaciones.request`, `perfil-administrativo.declarar.request` | `perfil-administrativo.obligaciones.response`, `perfil-administrativo.obligaciones.failed`, `perfil-administrativo.declarar.response`, `perfil-administrativo.declarar.failed` | `contabilidad.perfil_fiscal_declarado` |
| `conciliacion-bancaria` | REFLEJO | `conciliacion-bancaria.cruzar.request` | `conciliacion-bancaria.cruzar.response`, `conciliacion-bancaria.cruzar.failed` | `contabilidad.conciliacion_cruzada` |
| `puerto-extracto` | CONVERSOR | `puerto-extracto.entrar.request` | `puerto-extracto.entrar.response`, `puerto-extracto.entrar.failed` | `contabilidad.movimiento_bancario` |
| `cuadre-cobro-pago` | REFLEJO | `cuadre-cobro-pago.cuadrar.request` | `cuadre-cobro-pago.cuadrar.response`, `cuadre-cobro-pago.cuadrar.failed` | — |
| `saldo-tesoreria` | REFLEJO | `saldo-tesoreria.calcular.request` | `saldo-tesoreria.calcular.response`, `saldo-tesoreria.calcular.failed` | — |
| `prevision-caja` | REFLEJO | `prevision-caja.proyectar.request` | `prevision-caja.proyectar.response`, `prevision-caja.proyectar.failed` | `contabilidad.vencimiento_proximo` |
| `partida-no-identificada` | MICRO-AGENTE | `partida-no-identificada.juzgar.request` | `partida-no-identificada.juzgar.response`, `partida-no-identificada.juzgar.failed` | `contabilidad.partida_propuesta` |
| `regla-movimiento-bancario` | CUSTODIO | `regla-movimiento-bancario.aplicar.request`, `regla-movimiento-bancario.proponer.request` | `regla-movimiento-bancario.aplicar.response`, `regla-movimiento-bancario.aplicar.failed`, `regla-movimiento-bancario.proponer.response`, `regla-movimiento-bancario.proponer.failed` | `contabilidad.regla_bancaria_propuesta` |
| `partida-conciliatoria` | REFLEJO | `partida-conciliatoria.desfase.request` | `partida-conciliatoria.desfase.response`, `partida-conciliatoria.desfase.failed` | — |
| `informe-conciliacion` | REFLEJO | `informe-conciliacion.componer.request` | `informe-conciliacion.componer.response`, `informe-conciliacion.componer.failed` | — |
| `maestro-cuentas-bancarias` | CUSTODIO | `maestro-cuentas-bancarias.declarar.request`, `maestro-cuentas-bancarias.listar.request` | `maestro-cuentas-bancarias.declarar.response`, `maestro-cuentas-bancarias.declarar.failed`, `maestro-cuentas-bancarias.listar.response`, `maestro-cuentas-bancarias.listar.failed` | `contabilidad.cuenta_bancaria_declarada` |
| `alta-activo` | CUSTODIO | `alta-activo.registrar.request` | `alta-activo.registrar.response`, `alta-activo.registrar.failed` | `contabilidad.activo_registrado` |
| `plan-amortizacion` | CUSTODIO | `plan-amortizacion.cuota_del_periodo.request`, `plan-amortizacion.declarar.request` | `plan-amortizacion.cuota_del_periodo.response`, `plan-amortizacion.cuota_del_periodo.failed`, `plan-amortizacion.declarar.response`, `plan-amortizacion.declarar.failed` | `contabilidad.cuota_amortizacion` |
| `baja-activo` | REFLEJO | `baja-activo.calcular.request` | `baja-activo.calcular.response`, `baja-activo.calcular.failed` | — |
| `valor-neto-contable` | REFLEJO | `valor-neto-contable.calcular.request` | `valor-neto-contable.calcular.response`, `valor-neto-contable.calcular.failed` | — |
| `recibo-nomina` | REFLEJO | `recibo-nomina.dar_forma.request` | `recibo-nomina.dar_forma.response`, `recibo-nomina.dar_forma.failed` | `contabilidad.nomina_formada` |
| `obligacion-seguridad-social` | REFLEJO | `obligacion-seguridad-social.calcular.request` | `obligacion-seguridad-social.calcular.response`, `obligacion-seguridad-social.calcular.failed` | — |
| `asiento-personal` | REFLEJO | `asiento-personal.construir.request` | `asiento-personal.construir.response`, `asiento-personal.construir.failed` | — |
| `puerto-nomina` | PUENTE | `puerto-nomina.recibir.request` | `puerto-nomina.recibir.response`, `puerto-nomina.recibir.failed` | `contabilidad.nomina_recibida` |
| `lineas-nomina` | REFLEJO | `lineas-nomina.desglosar.request` | `lineas-nomina.desglosar.response`, `lineas-nomina.desglosar.failed` | — |
| `acceso-nomina` | CUSTODIO | `acceso-nomina.autorizar.request`, `acceso-nomina.declarar.request` | `acceso-nomina.autorizar.response`, `acceso-nomina.autorizar.failed`, `acceso-nomina.declarar.response`, `acceso-nomina.declarar.failed` | `contabilidad.acceso_nomina` |
| `pagos-a-cuenta-empleado` | REFLEJO | `pagos-a-cuenta-empleado.impacto.request` | `pagos-a-cuenta-empleado.impacto.response`, `pagos-a-cuenta-empleado.impacto.failed` | — |
| `conceptos-extra-nomina` | REFLEJO | `conceptos-extra-nomina.imputar.request` | `conceptos-extra-nomina.imputar.response`, `conceptos-extra-nomina.imputar.failed` | — |
| `liquidacion-baja-empleado` | REFLEJO | `liquidacion-baja-empleado.liquidar.request` | `liquidacion-baja-empleado.liquidar.response`, `liquidacion-baja-empleado.liquidar.failed` | — |
| `valoracion-existencia` | REFLEJO | `valoracion-existencia.valorar.request` | `valoracion-existencia.valorar.response`, `valoracion-existencia.valorar.failed` | — |
| `frontera-ficha-producto` | CONVERSOR | `frontera-ficha-producto.entrar.request` | `frontera-ficha-producto.entrar.response`, `frontera-ficha-producto.entrar.failed` | `contabilidad.coste_interno` |
| `ajuste-inventario` | REFLEJO | `ajuste-inventario.diferencia.request` | `ajuste-inventario.diferencia.response`, `ajuste-inventario.diferencia.failed` | — |
| `variacion-stock-valorada` | REFLEJO | `variacion-stock-valorada.variacion.request` | `variacion-stock-valorada.variacion.response`, `variacion-stock-valorada.variacion.failed` | — |
| `marca-sociedad` | REFLEJO | `marca-sociedad.marcar.request` | `marca-sociedad.marcar.response`, `marca-sociedad.marcar.failed` | — |
| `eliminacion-intercompany` | REFLEJO | `eliminacion-intercompany.eliminar.request` | `eliminacion-intercompany.eliminar.response`, `eliminacion-intercompany.eliminar.failed` | — |
| `consolidacion` | REFLEJO | `consolidacion.estados.request` | `consolidacion.estados.response`, `consolidacion.estados.failed` | — |
| `aislamiento-negocio` | CUSTODIO | `aislamiento-negocio.parcela.request`, `aislamiento-negocio.escritor.request` | `aislamiento-negocio.parcela.response`, `aislamiento-negocio.parcela.failed`, `aislamiento-negocio.escritor.response`, `aislamiento-negocio.escritor.failed` | `contabilidad.parcela_reclamada` |
| `etiquetado-analitico` | MICRO-AGENTE | `etiquetado-analitico.juzgar.request` | `etiquetado-analitico.juzgar.response`, `etiquetado-analitico.juzgar.failed` | `contabilidad.dimension_propuesta` |
| `margen-analitico` | REFLEJO | `margen-analitico.calcular.request` | `margen-analitico.calcular.response`, `margen-analitico.calcular.failed` | — |
| `presupuesto` | CUSTODIO | `presupuesto.fijar.request`, `presupuesto.objetivo.request` | `presupuesto.fijar.response`, `presupuesto.fijar.failed`, `presupuesto.objetivo.response`, `presupuesto.objetivo.failed` | `contabilidad.presupuesto_fijado` |
| `desviacion` | REFLEJO | `desviacion.calcular.request` | `desviacion.calcular.response`, `desviacion.calcular.failed` | `contabilidad.desviacion` |
| `coste-indirecto` | REFLEJO | `coste-indirecto.repartir.request` | `coste-indirecto.repartir.response`, `coste-indirecto.repartir.failed` | — |
| `cuadro-mando-contable` | REFLEJO | `cuadro-mando-contable.componer.request` | `cuadro-mando-contable.componer.response`, `cuadro-mando-contable.componer.failed` | — |
| `comparador-periodos` | REFLEJO | `comparador-periodos.comparar.request` | `comparador-periodos.comparar.response`, `comparador-periodos.comparar.failed` | — |
| `tablero-margen-dimension` | REFLEJO | `tablero-margen-dimension.cruzar.request` | `tablero-margen-dimension.cruzar.response`, `tablero-margen-dimension.cruzar.failed` | — |
| `onboarding-negocio` | CUSTODIO | `onboarding-negocio.recoger.request`, `onboarding-negocio.leer.request` | `onboarding-negocio.recoger.response`, `onboarding-negocio.recoger.failed`, `onboarding-negocio.leer.response`, `onboarding-negocio.leer.failed` | `contabilidad.negocio_onboarded` |
| `motor-avisos` | PUENTE | `motor-avisos.producir.request` | `motor-avisos.producir.response`, `motor-avisos.producir.failed` | `contabilidad.aviso_producido` |
| `informe-rico` | REFLEJO | `informe-rico.componer.request` | `informe-rico.componer.response`, `informe-rico.componer.failed` | — |
| `activacion-vertical` | REFLEJO | `activacion-vertical.activar.request` | `activacion-vertical.activar.response`, `activacion-vertical.activar.failed` | `contabilidad.vertical_activada` |
| `cola-declaraciones-criterio` | CUSTODIO | `cola-declaraciones-criterio.fijar.request`, `cola-declaraciones-criterio.ratificar.request` | `cola-declaraciones-criterio.fijar.response`, `cola-declaraciones-criterio.fijar.failed`, `cola-declaraciones-criterio.ratificar.response`, `cola-declaraciones-criterio.ratificar.failed` | `contabilidad.criterio_ratificado` |
| `puerto-exportacion` | CONVERSOR | `puerto-exportacion.salir.request`, `puerto-exportacion.entrar.request` | `puerto-exportacion.salir.response`, `puerto-exportacion.salir.failed`, `puerto-exportacion.entrar.response`, `puerto-exportacion.entrar.failed` | — |
| `vista-revisable` | REFLEJO | `vista-revisable.explicar.request` | `vista-revisable.explicar.response`, `vista-revisable.explicar.failed` | — |
| `flujo-firma` | CUSTODIO | `flujo-firma.firmar.request`, `flujo-firma.estado.request` | `flujo-firma.firmar.response`, `flujo-firma.firmar.failed`, `flujo-firma.estado.response`, `flujo-firma.estado.failed` | `contabilidad.firma_registrada` |
| `expediente-documental` | CUSTODIO | `expediente-documental.archivar.request`, `expediente-documental.recuperar.request` | `expediente-documental.archivar.response`, `expediente-documental.archivar.failed`, `expediente-documental.recuperar.response`, `expediente-documental.recuperar.failed` | `contabilidad.cifra_archivada` |
| `control-calidad-muestreo` | REFLEJO | `control-calidad-muestreo.seleccionar.request` | `control-calidad-muestreo.seleccionar.response`, `control-calidad-muestreo.seleccionar.failed` | — |
| `cambio-desde-ultima-revision` | REFLEJO | `cambio-desde-ultima-revision.delta.request` | `cambio-desde-ultima-revision.delta.response`, `cambio-desde-ultima-revision.delta.failed` | `contabilidad.delta_revision` |
| `ratificacion-regla-aprendida` | PUENTE | `ratificacion-regla-aprendida.ratificar.request` | `ratificacion-regla-aprendida.ratificar.response`, `ratificacion-regla-aprendida.ratificar.failed` | `contabilidad.regla_ratificada` |
| `frontera-planos` | REFLEJO | `frontera-planos.verificar.request` | `frontera-planos.verificar.response`, `frontera-planos.verificar.failed` | `contabilidad.salida_verificada` |
| `single-writer` | CUSTODIO | `single-writer.reclamar.request`, `single-writer.es_escritor.request` | `single-writer.reclamar.response`, `single-writer.reclamar.failed`, `single-writer.es_escritor.response`, `single-writer.es_escritor.failed` | `contabilidad.escritor_reclamado` |
| `clave-natural` | REFLEJO | `clave-natural.calcular.request`, `clave-natural.coincide.request` | `clave-natural.calcular.response`, `clave-natural.calcular.failed`, `clave-natural.coincide.response`, `clave-natural.coincide.failed` | — |
| `maestro-terceros` | CUSTODIO | `maestro-terceros.ficha.request`, `maestro-terceros.upsert.request` | `maestro-terceros.ficha.response`, `maestro-terceros.ficha.failed`, `maestro-terceros.upsert.response`, `maestro-terceros.upsert.failed` | `contabilidad.tercero_actualizado` |
| `padron-terceros` | CUSTODIO | `padron-terceros.unificar.request` | `padron-terceros.unificar.response`, `padron-terceros.unificar.failed` | `contabilidad.identidad_unificada` |
| `cuenta-proveedor` | REFLEJO | `cuenta-proveedor.saldo.request`, `cuenta-proveedor.facturas_vivas.request` | `cuenta-proveedor.saldo.response`, `cuenta-proveedor.saldo.failed`, `cuenta-proveedor.facturas_vivas.response`, `cuenta-proveedor.facturas_vivas.failed` | — |
| `estado-cuenta-proveedor` | REFLEJO | `estado-cuenta-proveedor.extracto.request` | `estado-cuenta-proveedor.extracto.response`, `estado-cuenta-proveedor.extracto.failed` | — |
| `cruce-factura-recepcion` | REFLEJO | `cruce-factura-recepcion.cotejar.request` | `cruce-factura-recepcion.cotejar.response`, `cruce-factura-recepcion.cotejar.failed` | `contabilidad.cruce_descuadrado` |
| `vencimiento-pago` | REFLEJO | `vencimiento-pago.calcular.request` | `vencimiento-pago.calcular.response`, `vencimiento-pago.calcular.failed` | `contabilidad.vencimiento_proximo` |
| `rappel-pronto-pago` | REFLEJO | `rappel-pronto-pago.ajustar.request` | `rappel-pronto-pago.ajustar.response`, `rappel-pronto-pago.ajustar.failed` | — |
| `antiguedad-de-saldos` | REFLEJO | `antiguedad-de-saldos.clasificar.request` | `antiguedad-de-saldos.clasificar.response`, `antiguedad-de-saldos.clasificar.failed` | — |
| `emision-factura-venta` | CUSTODIO | `emision-factura-venta.emitir.request` | `emision-factura-venta.emitir.response`, `emision-factura-venta.emitir.failed` | `contabilidad.factura_emitida` |
| `factura-rectificativa` | REFLEJO | `factura-rectificativa.calcular.request` | `factura-rectificativa.calcular.response`, `factura-rectificativa.calcular.failed` | `contabilidad.factura_rectificada` |
| `panel-proceso-contable` | REFLEJO | `panel-proceso-contable.latido.request` | `panel-proceso-contable.latido.response`, `panel-proceso-contable.latido.failed` | — |
| `historial-proceso-contable` | CUSTODIO | `historial-proceso-contable.anotar.request` | `historial-proceso-contable.anotar.response`, `historial-proceso-contable.anotar.failed` | `contabilidad.proceso_anotado` |
| `desatasco-entrada` | MICRO-AGENTE | `desatasco-entrada.juzgar.request` | `desatasco-entrada.juzgar.response`, `desatasco-entrada.juzgar.failed` | `contabilidad.excepcion_desatascada` |
| `tasa-cobertura-entrada` | REFLEJO | `tasa-cobertura-entrada.calcular.request` | `tasa-cobertura-entrada.calcular.response`, `tasa-cobertura-entrada.calcular.failed` | — |
| `consulta-cuentas-bajo-demanda` | PUENTE | `consulta-cuentas-bajo-demanda.preguntar.request` | `consulta-cuentas-bajo-demanda.preguntar.response`, `consulta-cuentas-bajo-demanda.preguntar.failed` | `contabilidad.respuesta_consulta` |
| `puente-lenguaje-dueno` | MICRO-AGENTE | `puente-lenguaje-dueno.a_consulta.request`, `puente-lenguaje-dueno.a_cifra.request` | `puente-lenguaje-dueno.a_consulta.response`, `puente-lenguaje-dueno.a_consulta.failed`, `puente-lenguaje-dueno.a_cifra.response`, `puente-lenguaje-dueno.a_cifra.failed` | `contabilidad.consulta_traducida` |
| `sello-cobertura` | REFLEJO | `sello-cobertura.sellar.request` | `sello-cobertura.sellar.response`, `sello-cobertura.sellar.failed` | — |
| `marca-borrador-validado` | REFLEJO | `marca-borrador-validado.estado.request` | `marca-borrador-validado.estado.response`, `marca-borrador-validado.estado.failed` | — |
| `aviso-al-negocio` | PUENTE | `aviso-al-negocio.entregar.request` | `aviso-al-negocio.entregar.response`, `aviso-al-negocio.entregar.failed` | `contabilidad.aviso_entregado` |
| `informe-accionable` | MICRO-AGENTE | `informe-accionable.juzgar.request` | `informe-accionable.juzgar.response`, `informe-accionable.juzgar.failed` | `contabilidad.recomendacion` |
| `narrador-estados` | MICRO-AGENTE | `narrador-estados.narrar.request` | `narrador-estados.narrar.response`, `narrador-estados.narrar.failed` | `contabilidad.narracion` |

### 4.2 · Fire-and-forget del dominio (emisor → consumidor)

| Evento | Emisor | Consumidor(es) |
|---|---|---|
| `contabilidad.hecho_crudo` | puerto-evento-vertical | normalizador-hecho |
| `contabilidad.hecho_normalizado` | normalizador-hecho | deduplicacion-hecho, lote-admision |
| `contabilidad.documento_admitido` | captura-documento | control-cuadre-documento |
| `contabilidad.documento_descuadrado` | control-cuadre-documento | encolado-excepcion |
| `contabilidad.excepcion_encolada` | encolado-excepcion | aviso-revision, panel-proceso-contable, desatasco-entrada |
| `contabilidad.aviso_revision` | aviso-revision | motor-avisos |
| `contabilidad.aviso_cuadre` | aviso-cuadre | motor-avisos |
| `contabilidad.fuente_faltante` | declaracion-fuente-faltante | motor-avisos |
| `contabilidad.cobertura_medida` | completitud-cobertura | aviso-cuadre, declaracion-fuente-faltante, tasa-cobertura-entrada, sello-cobertura |
| `contabilidad.asiento_registrado` | escritor-diario | mayor-balanza, traza-asiento, cuenta-proveedor, marca-sociedad, liquidacion-iva, retenciones, estimacion-is-irpf, periodificacion, saldo-tesoreria, control-calidad-muestreo, cambio-desde-ultima-revision |
| `contabilidad.traza_registrada` | traza-asiento | vista-revisable, cambio-desde-ultima-revision, marca-borrador-validado |
| `contabilidad.firma_registrada` | flujo-firma | asiento-ajuste, cambio-desde-ultima-revision, marca-borrador-validado |
| `contabilidad.asiento_ajuste_recibido` | asiento-ajuste | cambio-desde-ultima-revision |
| `contabilidad.regla_contrapartida_propuesta` | regla-contrapartida | ratificacion-regla-aprendida |
| `contabilidad.regla_bancaria_propuesta` | regla-movimiento-bancario | ratificacion-regla-aprendida |
| `contabilidad.regla_ratificada` | ratificacion-regla-aprendida | regla-contrapartida, regla-movimiento-bancario |
| `contabilidad.movimiento_bancario` | puerto-extracto | cuadre-cobro-pago |
| `contabilidad.ejercicio_cerrado` | cierre-ejercicio | apertura-ejercicio |
| `contabilidad.vencimiento_fiscal` | calendario-fiscal | motor-avisos |
| `contabilidad.vencimiento_proximo` | vencimiento-pago, prevision-caja | motor-avisos |
| `contabilidad.desviacion` | desviacion | motor-avisos |
| `contabilidad.aviso_producido` | motor-avisos | aviso-al-negocio |
| `contabilidad.aviso_entregado` | aviso-al-negocio | (confirmación al negocio) |
| `contabilidad.nomina_recibida` | puerto-nomina | recibo-nomina |
| `contabilidad.nomina_formada` | recibo-nomina | obligacion-seguridad-social, asiento-personal, lineas-nomina, pagos-a-cuenta-empleado, conceptos-extra-nomina, liquidacion-baja-empleado |
| `contabilidad.coste_interno` | frontera-ficha-producto | valoracion-existencia |
| `contabilidad.factura_emitida` | emision-factura-venta | registro-verifactu |
| `contabilidad.proceso_anotado` | historial-proceso-contable | panel-proceso-contable |
| `contabilidad.negocio_onboarded` | onboarding-negocio | activacion-vertical |
| `contabilidad.presupuesto_fijado` | presupuesto | desviacion |
| `contabilidad.excepcion_desatascada` | desatasco-entrada | encolado-excepcion |
| `contabilidad.respuesta_consulta` | consulta-cuentas-bajo-demanda | puente-lenguaje-dueno, sello-cobertura |
| `factura.entrada` | puerto-documento-digital (A5, REUTILIZAR) | extraccion-dato (A4.1, REUTILIZAR = módulo `facturas`) |
| `factura.procesada` | extraccion-dato (A4.1, REUTILIZAR) | normalizador-hecho (vía A2) |
---

## §5 · Reparto por los 4 ejes (partición decidida, no reabierta)

| Vertical | Hojas | CONSTRUIR | REUTILIZAR | Grupos (F2) |
|---|---|---|---|---|
| **`contabilidad-entrada`** | **32** | 30 | 2 (`extraccion-dato` · `puerto-documento-digital`) | A entrada-hechos (18) · N terceros (8) · O facturación emitida (2) · P control-proceso (4) |
| **`contabilidad-libro`** | **32** | 32 | 0 | B libro-núcleo (6) · C estados-cierre (6) · E tesorería (10) · L revisión-asesor (7) · M anti-bucle (3) |
| **`contabilidad-fiscal`** | **22** | 22 | 0 | D capa-fiscal (13) · G personal (9) |
| **`contabilidad-analítica`** | **32** | 32 | 0 | F inmovilizado (4) · H existencias (4) · I grupo (4) · J analítica/mando (8) · K producto-servicio (5) · Q consulta-dueño (4) · R entrega-negocio (3) |
| **TOTAL** | **118** | **116** | **2** | 32 + 32 + 22 + 32 = 118 |

- **`contabilidad-entrada` contiene el eslabón limitante** (grupo A · la puerta) → **primera oleada**.
- `fiscal` se vende como añadido; el núcleo se vende sin él. **Un solo proceso, cuatro oleadas.**
- Órden topológico (`orden`): **118 slugs**, REUTILIZAR primero (`extraccion-dato`, `puerto-documento-digital`)
  y luego por dependencias (`depende_de`), respetando que ninguna hoja precede a su dependencia.

---

## §6 · La espina `enki-plan`

```json enki-plan
{
 "proyecto": "contabilidad",
 "proyecto_id": "contabilidad",
 "origen": "boveda/contabilidad/proceso/fase3/diseno-oop.md",
 "inventario": "boveda/contabilidad/proceso/fase3b/inventario-modulos-enki.json",
 "regla": "UNA clase = UN modulo; 118 clases = 118 hojas; NO se agrupa ni se fusiona",
 "verticales": [
  "contabilidad-entrada",
  "contabilidad-libro",
  "contabilidad-fiscal",
  "contabilidad-analitica"
 ],
 "orden": [
  "puerto-documento-digital",
  "puerto-documento",
  "captura-documento",
  "extraccion-dato",
  "puerto-evento-vertical",
  "normalizador-hecho",
  "control-cuadre-documento",
  "puerto-plan-contable",
  "catalogo-cuentas",
  "padron-terceros",
  "maestro-terceros",
  "contrapartida-asistida",
  "regla-contrapartida",
  "clave-natural",
  "deduplicacion-hecho",
  "encolado-excepcion",
  "aviso-revision",
  "lote-admision",
  "cola-declaraciones-criterio",
  "contrato-hecho-minimo",
  "completitud-cobertura",
  "hecho-rectificativo",
  "anclaje-cierre-vertical",
  "declaracion-fuente-faltante",
  "single-writer",
  "escritor-diario",
  "mayor-balanza",
  "traza-asiento",
  "asiento-ajuste",
  "balance-situacion",
  "cuenta-resultados",
  "periodificacion",
  "cierre-ejercicio",
  "apertura-ejercicio",
  "aviso-cuadre",
  "liquidacion-iva",
  "modelo-303",
  "modelo-390",
  "retenciones",
  "estimacion-is-irpf",
  "perfil-administrativo",
  "calendario-fiscal",
  "estado-presentacion-fiscal",
  "generador-modelo",
  "factura-electronica",
  "emision-factura-venta",
  "registro-verifactu",
  "acuse-presentacion",
  "rectificacion-declaracion",
  "puerto-extracto",
  "regla-movimiento-bancario",
  "conciliacion-bancaria",
  "cuadre-cobro-pago",
  "maestro-cuentas-bancarias",
  "saldo-tesoreria",
  "vencimiento-pago",
  "prevision-caja",
  "partida-no-identificada",
  "partida-conciliatoria",
  "informe-conciliacion",
  "alta-activo",
  "plan-amortizacion",
  "valor-neto-contable",
  "baja-activo",
  "puerto-nomina",
  "recibo-nomina",
  "obligacion-seguridad-social",
  "asiento-personal",
  "lineas-nomina",
  "acceso-nomina",
  "pagos-a-cuenta-empleado",
  "conceptos-extra-nomina",
  "liquidacion-baja-empleado",
  "frontera-ficha-producto",
  "valoracion-existencia",
  "ajuste-inventario",
  "variacion-stock-valorada",
  "marca-sociedad",
  "eliminacion-intercompany",
  "consolidacion",
  "aislamiento-negocio",
  "etiquetado-analitico",
  "margen-analitico",
  "presupuesto",
  "desviacion",
  "coste-indirecto",
  "cuadro-mando-contable",
  "comparador-periodos",
  "tablero-margen-dimension",
  "onboarding-negocio",
  "motor-avisos",
  "informe-rico",
  "activacion-vertical",
  "puerto-exportacion",
  "vista-revisable",
  "flujo-firma",
  "expediente-documental",
  "control-calidad-muestreo",
  "cambio-desde-ultima-revision",
  "ratificacion-regla-aprendida",
  "frontera-planos",
  "cuenta-proveedor",
  "estado-cuenta-proveedor",
  "cruce-factura-recepcion",
  "rappel-pronto-pago",
  "antiguedad-de-saldos",
  "factura-rectificativa",
  "historial-proceso-contable",
  "panel-proceso-contable",
  "desatasco-entrada",
  "tasa-cobertura-entrada",
  "consulta-cuentas-bajo-demanda",
  "puente-lenguaje-dueno",
  "sello-cobertura",
  "marca-borrador-validado",
  "aviso-al-negocio",
  "informe-accionable",
  "narrador-estados"
 ],
 "hojas": [
  {
   "slug": "puerto-evento-vertical",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "puerto-evento-vertical.recibir.request",
    "vertical.hecho.emitido"
   ],
   "eventos_publica": [
    "puerto-evento-vertical.recibir.response",
    "puerto-evento-vertical.recibir.failed",
    "contabilidad.hecho_crudo"
   ],
   "proposito": "Abre el puerto por el que cada vertical manda sus hechos ya emitidos; contabilidad se adapta, no impone formato ni obliga a emitir."
  },
  {
   "slug": "normalizador-hecho",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "puerto-evento-vertical"
   ],
   "eventos_sube": [
    "normalizador-hecho.normalizar.request",
    "contabilidad.hecho_crudo"
   ],
   "eventos_publica": [
    "normalizador-hecho.normalizar.response",
    "normalizador-hecho.normalizar.failed",
    "contabilidad.hecho_normalizado"
   ],
   "proposito": "Unica puerta de formato: homogeneiza el hecho de cada vertical a forma asentable."
  },
  {
   "slug": "captura-documento",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "puerto-documento",
    "puerto-documento-digital"
   ],
   "eventos_sube": [
    "captura-documento.admitir.request"
   ],
   "eventos_publica": [
    "captura-documento.admitir.response",
    "captura-documento.admitir.failed",
    "contabilidad.documento_admitido"
   ],
   "proposito": "Admite el documento (digitalizado o recibido) y valida campos; mecanico, cero juicio."
  },
  {
   "slug": "extraccion-dato",
   "forma": "MICRO-AGENTE",
   "accion": "REUTILIZAR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "captura-documento"
   ],
   "eventos_sube": [
    "factura.entrada"
   ],
   "eventos_publica": [
    "factura.recibida",
    "factura.procesada",
    "factura.error",
    "factura.exportada"
   ],
   "proposito": "Abre un documento NO estructurado y lo vuelve dato propuesto; interpretar lo ilegible es juicio; no asienta."
  },
  {
   "slug": "puerto-documento",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "puerto-documento-digital"
   ],
   "eventos_sube": [
    "puerto-documento.entrar.request"
   ],
   "eventos_publica": [
    "puerto-documento.entrar.response",
    "puerto-documento.entrar.failed",
    "contabilidad.documento_normalizado"
   ],
   "proposito": "Frontera de las formas declarables del documento; el adaptador lo pone el sitio."
  },
  {
   "slug": "control-cuadre-documento",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "puerto-documento"
   ],
   "eventos_sube": [
    "control-cuadre-documento.cuadra.request"
   ],
   "eventos_publica": [
    "control-cuadre-documento.cuadra.response",
    "control-cuadre-documento.cuadra.failed",
    "contabilidad.documento_descuadrado"
   ],
   "proposito": "Si importe+impuestos no cuadran -> cola, NO se asienta mal; calculo determinista."
  },
  {
   "slug": "puerto-documento-digital",
   "forma": "PUENTE",
   "accion": "REUTILIZAR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "telegram.photo.received",
    "telegram.document.received"
   ],
   "eventos_publica": [
    "factura.entrada"
   ],
   "proposito": "Recepcion digital declarable de documentos; conecta con el canal emisor; si no existe, se crea."
  },
  {
   "slug": "contrapartida-asistida",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "catalogo-cuentas",
    "maestro-terceros"
   ],
   "eventos_sube": [
    "contrapartida-asistida.juzgar.request"
   ],
   "eventos_publica": [
    "contrapartida-asistida.juzgar.response",
    "contrapartida-asistida.juzgar.failed",
    "contabilidad.contrapartida_propuesta"
   ],
   "proposito": "Propone cuenta/tercero/periodo contra el plan declarado; PROPONE, no escribe; el corte duro lo fija A6.2."
  },
  {
   "slug": "regla-contrapartida",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "catalogo-cuentas"
   ],
   "eventos_sube": [
    "regla-contrapartida.aplicar.request",
    "regla-contrapartida.proponer.request",
    "project.activated"
   ],
   "eventos_publica": [
    "regla-contrapartida.aplicar.response",
    "regla-contrapartida.aplicar.failed",
    "regla-contrapartida.proponer.response",
    "regla-contrapartida.proponer.failed",
    "contabilidad.regla_contrapartida_propuesta"
   ],
   "proposito": "Parcela de reglas declarables/aprendidas (proveedor -> cuenta); un solo escritor; entra hidratada de L10."
  },
  {
   "slug": "deduplicacion-hecho",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "clave-natural"
   ],
   "eventos_sube": [
    "deduplicacion-hecho.es_nuevo.request",
    "contabilidad.hecho_normalizado"
   ],
   "eventos_publica": [
    "deduplicacion-hecho.es_nuevo.response",
    "deduplicacion-hecho.es_nuevo.failed"
   ],
   "proposito": "Aplica la clave natural del hecho/documento -> no duplica; idempotencia determinista."
  },
  {
   "slug": "encolado-excepcion",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "control-cuadre-documento"
   ],
   "eventos_sube": [
    "encolado-excepcion.encolar.request",
    "encolado-excepcion.tomar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "encolado-excepcion.encolar.response",
    "encolado-excepcion.encolar.failed",
    "encolado-excepcion.tomar.response",
    "encolado-excepcion.tomar.failed",
    "contabilidad.excepcion_encolada"
   ],
   "proposito": "Parcela de lo dudoso; el flujo CONTINUA, lo dudoso espera; un solo escritor."
  },
  {
   "slug": "aviso-revision",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "encolado-excepcion"
   ],
   "eventos_sube": [
    "aviso-revision.empujar.request",
    "contabilidad.excepcion_encolada"
   ],
   "eventos_publica": [
    "aviso-revision.empujar.response",
    "aviso-revision.empujar.failed",
    "contabilidad.aviso_revision"
   ],
   "proposito": "Empejon al canal de avisos: esto necesita revision; conecta por evento."
  },
  {
   "slug": "lote-admision",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "normalizador-hecho"
   ],
   "eventos_sube": [
    "lote-admision.admitir.request",
    "contabilidad.hecho_normalizado"
   ],
   "eventos_publica": [
    "lote-admision.admitir.response",
    "lote-admision.admitir.failed"
   ],
   "proposito": "Desacople del cuello: N hechos en paralelo (la admision no se serializa)."
  },
  {
   "slug": "contrato-hecho-minimo",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "contrato-hecho-minimo.exigir.request",
    "contrato-hecho-minimo.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "contrato-hecho-minimo.exigir.response",
    "contrato-hecho-minimo.exigir.failed",
    "contrato-hecho-minimo.declarar.response",
    "contrato-hecho-minimo.declarar.failed",
    "contabilidad.contrato_declarado"
   ],
   "proposito": "Parcela declarable del minimo exigible a cada fuente; la cara vista desde la fuente: un minimo, no un formato impuesto."
  },
  {
   "slug": "completitud-cobertura",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "contrato-hecho-minimo"
   ],
   "eventos_sube": [
    "completitud-cobertura.medir.request"
   ],
   "eventos_publica": [
    "completitud-cobertura.medir.response",
    "completitud-cobertura.medir.failed",
    "contabilidad.cobertura_medida"
   ],
   "proposito": "Mide que hechos publico una vertical y cuales NO llegaron; produce LA metrica unica; las demas senales la LEEN."
  },
  {
   "slug": "hecho-rectificativo",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "clave-natural"
   ],
   "eventos_sube": [
    "hecho-rectificativo.emparejar.request"
   ],
   "eventos_publica": [
    "hecho-rectificativo.emparejar.response",
    "hecho-rectificativo.emparejar.failed",
    "contabilidad.hecho_rectificado"
   ],
   "proposito": "Conecta el hecho posterior que corrige/anula uno anterior por clave natural; NO borra, anade."
  },
  {
   "slug": "anclaje-cierre-vertical",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "anclaje-cierre-vertical.anclar.request",
    "anclaje-cierre-vertical.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "anclaje-cierre-vertical.anclar.response",
    "anclaje-cierre-vertical.anclar.failed",
    "anclaje-cierre-vertical.declarar.response",
    "anclaje-cierre-vertical.declarar.failed",
    "contabilidad.cierre_anclado"
   ],
   "proposito": "Parcela declarable POR VERTICAL de que es \"un cierre\" y como se identifica; pende de unidad_de_cierre (dato del dueno)."
  },
  {
   "slug": "declaracion-fuente-faltante",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "completitud-cobertura"
   ],
   "eventos_sube": [
    "declaracion-fuente-faltante.declarar.request",
    "contabilidad.cobertura_medida"
   ],
   "eventos_publica": [
    "declaracion-fuente-faltante.declarar.response",
    "declaracion-fuente-faltante.declarar.failed",
    "contabilidad.fuente_faltante"
   ],
   "proposito": "Detecta que una vertical NO publica un hecho necesario y lo DECLARA (abierto + aviso); no obliga a producirlo."
  },
  {
   "slug": "catalogo-cuentas",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "puerto-plan-contable"
   ],
   "eventos_sube": [
    "catalogo-cuentas.anadir.request",
    "catalogo-cuentas.buscar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "catalogo-cuentas.anadir.response",
    "catalogo-cuentas.anadir.failed",
    "catalogo-cuentas.buscar.response",
    "catalogo-cuentas.buscar.failed"
   ],
   "proposito": "Plan contable declarable/importable del asesor; un solo escritor."
  },
  {
   "slug": "escritor-diario",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "clave-natural",
    "single-writer"
   ],
   "eventos_sube": [
    "escritor-diario.asentar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "escritor-diario.asentar.response",
    "escritor-diario.asentar.failed",
    "contabilidad.asiento_registrado"
   ],
   "proposito": "ES el custodio del libro; single-writer por parcela; rechaza si suma debe != suma haber."
  },
  {
   "slug": "mayor-balanza",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario"
   ],
   "eventos_sube": [
    "mayor-balanza.saldos.request",
    "mayor-balanza.balanza.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "mayor-balanza.saldos.response",
    "mayor-balanza.saldos.failed",
    "mayor-balanza.balanza.response",
    "mayor-balanza.balanza.failed"
   ],
   "proposito": "Saldos por cuenta derivados del diario; calculo determinista, un test lo afirma."
  },
  {
   "slug": "traza-asiento",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario"
   ],
   "eventos_sube": [
    "traza-asiento.registrar.request",
    "project.activated",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "traza-asiento.registrar.response",
    "traza-asiento.registrar.failed",
    "contabilidad.traza_registrada"
   ],
   "proposito": "Registro inmutable (quien/cuando creo cada asiento), append-only; un solo escritor."
  },
  {
   "slug": "asiento-ajuste",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario"
   ],
   "eventos_sube": [
    "asiento-ajuste.entrar.request",
    "contabilidad.firma_registrada"
   ],
   "eventos_publica": [
    "asiento-ajuste.entrar.response",
    "asiento-ajuste.entrar.failed",
    "contabilidad.asiento_ajuste_recibido"
   ],
   "proposito": "Camino por el que la correccion del asesor ENTRA al libro sin borrar; la traza queda intacta; el almacen es B2/B4."
  },
  {
   "slug": "puerto-plan-contable",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "puerto-plan-contable.entrar.request",
    "puerto-plan-contable.salir.request"
   ],
   "eventos_publica": [
    "puerto-plan-contable.entrar.response",
    "puerto-plan-contable.entrar.failed",
    "puerto-plan-contable.salir.response",
    "puerto-plan-contable.salir.failed"
   ],
   "proposito": "Frontera de codificacion del plan contable (import/export); cruce de formatos."
  },
  {
   "slug": "balance-situacion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "mayor-balanza"
   ],
   "eventos_sube": [
    "balance-situacion.calcular.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "balance-situacion.calcular.response",
    "balance-situacion.calcular.failed"
   ],
   "proposito": "Activo/pasivo/patrimonio derivado del mayor; invariante ACTIVO = PASIVO + PATRIMONIO; descuadre = ERROR."
  },
  {
   "slug": "cuenta-resultados",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "mayor-balanza"
   ],
   "eventos_sube": [
    "cuenta-resultados.calcular.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "cuenta-resultados.calcular.response",
    "cuenta-resultados.calcular.failed"
   ],
   "proposito": "Ingresos/gastos/resultado derivado del mayor; determinista."
  },
  {
   "slug": "periodificacion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario"
   ],
   "eventos_sube": [
    "periodificacion.imputar.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "periodificacion.imputar.response",
    "periodificacion.imputar.failed"
   ],
   "proposito": "Imputa cada hecho a su periodo con el criterio declarado; conserva fecha operacion y fecha valor, NO elige."
  },
  {
   "slug": "cierre-ejercicio",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "balance-situacion",
    "cuenta-resultados",
    "asiento-ajuste"
   ],
   "eventos_sube": [
    "cierre-ejercicio.cerrar.request",
    "cierre-ejercicio.reabrir.request",
    "project.activated"
   ],
   "eventos_publica": [
    "cierre-ejercicio.cerrar.response",
    "cierre-ejercicio.cerrar.failed",
    "cierre-ejercicio.reabrir.response",
    "cierre-ejercicio.reabrir.failed",
    "contabilidad.ejercicio_cerrado"
   ],
   "proposito": "Cierra el periodo con ajustes; IRREVERSIBLE salvo ajuste (reabrir solo con asiento-ajuste); un solo escritor."
  },
  {
   "slug": "apertura-ejercicio",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "cierre-ejercicio"
   ],
   "eventos_sube": [
    "apertura-ejercicio.generar.request",
    "contabilidad.ejercicio_cerrado"
   ],
   "eventos_publica": [
    "apertura-ejercicio.generar.response",
    "apertura-ejercicio.generar.failed"
   ],
   "proposito": "Asientos de apertura DERIVADOS del cierre anterior; determinista."
  },
  {
   "slug": "aviso-cuadre",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "completitud-cobertura"
   ],
   "eventos_sube": [
    "aviso-cuadre.avisar.request",
    "contabilidad.cobertura_medida"
   ],
   "eventos_publica": [
    "aviso-cuadre.avisar.response",
    "aviso-cuadre.avisar.failed",
    "contabilidad.aviso_cuadre"
   ],
   "proposito": "NO finge el cuadre: si falta cobertura, avisa; LEE la metrica unica, no la recalcula."
  },
  {
   "slug": "liquidacion-iva",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "mayor-balanza"
   ],
   "eventos_sube": [
    "liquidacion-iva.calcular.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "liquidacion-iva.calcular.response",
    "liquidacion-iva.calcular.failed"
   ],
   "proposito": "IVA devengado/soportado DERIVADO del libro; los tipos son dato, no constante."
  },
  {
   "slug": "modelo-303",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "liquidacion-iva"
   ],
   "eventos_sube": [
    "modelo-303.construir.request"
   ],
   "eventos_publica": [
    "modelo-303.construir.response",
    "modelo-303.construir.failed"
   ],
   "proposito": "Construye el modelo 303 desde la liquidacion; determinista."
  },
  {
   "slug": "modelo-390",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "liquidacion-iva"
   ],
   "eventos_sube": [
    "modelo-390.construir.request"
   ],
   "eventos_publica": [
    "modelo-390.construir.response",
    "modelo-390.construir.failed"
   ],
   "proposito": "Idem anual (390) construido desde las liquidaciones del ejercicio; determinista."
  },
  {
   "slug": "retenciones",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "mayor-balanza"
   ],
   "eventos_sube": [
    "retenciones.calcular.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "retenciones.calcular.response",
    "retenciones.calcular.failed"
   ],
   "proposito": "Retenciones practicadas/soportadas calculadas desde los asientos; determinista."
  },
  {
   "slug": "estimacion-is-irpf",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "cuenta-resultados"
   ],
   "eventos_sube": [
    "estimacion-is-irpf.estimar.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "estimacion-is-irpf.estimar.response",
    "estimacion-is-irpf.estimar.failed"
   ],
   "proposito": "Estimacion del resultado fiscal con base DECLARADA; nada se estima sin base."
  },
  {
   "slug": "calendario-fiscal",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "perfil-administrativo"
   ],
   "eventos_sube": [
    "calendario-fiscal.proximos.request",
    "calendario-fiscal.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "calendario-fiscal.proximos.response",
    "calendario-fiscal.proximos.failed",
    "calendario-fiscal.declarar.response",
    "calendario-fiscal.declarar.failed",
    "contabilidad.vencimiento_fiscal"
   ],
   "proposito": "Parcela de plazos declarables -> dispara aviso proactivo; la ley entra como dato; un solo escritor."
  },
  {
   "slug": "generador-modelo",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "modelo-303",
    "modelo-390",
    "estado-presentacion-fiscal"
   ],
   "eventos_sube": [
    "generador-modelo.exportar.request"
   ],
   "eventos_publica": [
    "generador-modelo.exportar.response",
    "generador-modelo.exportar.failed",
    "contabilidad.modelo_exportado"
   ],
   "proposito": "Salida al programa del asesor; conecta por puerto; formato ABIERTO (no declarado aun)."
  },
  {
   "slug": "registro-verifactu",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "emision-factura-venta"
   ],
   "eventos_sube": [
    "registro-verifactu.encadenar.request",
    "project.activated",
    "contabilidad.factura_emitida"
   ],
   "eventos_publica": [
    "registro-verifactu.encadenar.response",
    "registro-verifactu.encadenar.failed",
    "contabilidad.huella_encadenada"
   ],
   "proposito": "Huella/cadena INALTERABLE de la facturacion; registro encadenado; un solo escritor."
  },
  {
   "slug": "factura-electronica",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [],
   "eventos_sube": [
    "factura-electronica.entrar.request",
    "factura-electronica.salir.request"
   ],
   "eventos_publica": [
    "factura-electronica.entrar.response",
    "factura-electronica.entrar.failed",
    "factura-electronica.salir.response",
    "factura-electronica.salir.failed"
   ],
   "proposito": "Frontera de formato estructurado de la factura."
  },
  {
   "slug": "estado-presentacion-fiscal",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "calendario-fiscal"
   ],
   "eventos_sube": [
    "estado-presentacion-fiscal.avanzar.request",
    "estado-presentacion-fiscal.estado.request",
    "project.activated"
   ],
   "eventos_publica": [
    "estado-presentacion-fiscal.avanzar.response",
    "estado-presentacion-fiscal.avanzar.failed",
    "estado-presentacion-fiscal.estado.response",
    "estado-presentacion-fiscal.estado.failed",
    "contabilidad.obligacion_avanzada"
   ],
   "proposito": "Ciclo de vida de cada obligacion (pendiente->generada->presentada->justificada->atrasada); un solo escritor."
  },
  {
   "slug": "acuse-presentacion",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "estado-presentacion-fiscal"
   ],
   "eventos_sube": [
    "acuse-presentacion.ligar.request"
   ],
   "eventos_publica": [
    "acuse-presentacion.ligar.response",
    "acuse-presentacion.ligar.failed",
    "contabilidad.acuse_ligado"
   ],
   "proposito": "Recoge y liga el justificante/acuse que devuelve la administracion a su modelo y a su asiento; cierra el bucle hacia fuera."
  },
  {
   "slug": "rectificacion-declaracion",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "estado-presentacion-fiscal"
   ],
   "eventos_sube": [
    "rectificacion-declaracion.rectificar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "rectificacion-declaracion.rectificar.response",
    "rectificacion-declaracion.rectificar.failed",
    "contabilidad.declaracion_rectificada"
   ],
   "proposito": "Camino de correccion POSTERIOR a la presentacion (complementaria/sustitutiva); != asiento-ajuste B5; un solo escritor."
  },
  {
   "slug": "perfil-administrativo",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "perfil-administrativo.obligaciones.request",
    "perfil-administrativo.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "perfil-administrativo.obligaciones.response",
    "perfil-administrativo.obligaciones.failed",
    "perfil-administrativo.declarar.response",
    "perfil-administrativo.declarar.failed",
    "contabilidad.perfil_fiscal_declarado"
   ],
   "proposito": "Parcela declarable de que administraciones y obligaciones aplican (territorio y regimen); un solo escritor."
  },
  {
   "slug": "conciliacion-bancaria",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario",
    "puerto-extracto",
    "regla-movimiento-bancario"
   ],
   "eventos_sube": [
    "conciliacion-bancaria.cruzar.request"
   ],
   "eventos_publica": [
    "conciliacion-bancaria.cruzar.response",
    "conciliacion-bancaria.cruzar.failed",
    "contabilidad.conciliacion_cruzada"
   ],
   "proposito": "Cruce extracto <-> libro por clave natural y reglas; determinista; el juicio vive en E7/E8."
  },
  {
   "slug": "puerto-extracto",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "puerto-extracto.entrar.request"
   ],
   "eventos_publica": [
    "puerto-extracto.entrar.response",
    "puerto-extracto.entrar.failed",
    "contabilidad.movimiento_bancario"
   ],
   "proposito": "Frontera de canal/formato del extracto; un adaptador por banco; si falta, se crea."
  },
  {
   "slug": "cuadre-cobro-pago",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario",
    "puerto-extracto"
   ],
   "eventos_sube": [
    "cuadre-cobro-pago.cuadrar.request",
    "contabilidad.movimiento_bancario"
   ],
   "eventos_publica": [
    "cuadre-cobro-pago.cuadrar.response",
    "cuadre-cobro-pago.cuadrar.failed"
   ],
   "proposito": "Clave natural compartida: un movimiento bancario = un cobro/pago; determinista."
  },
  {
   "slug": "saldo-tesoreria",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "maestro-cuentas-bancarias",
    "mayor-balanza"
   ],
   "eventos_sube": [
    "saldo-tesoreria.calcular.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "saldo-tesoreria.calcular.response",
    "saldo-tesoreria.calcular.failed"
   ],
   "proposito": "Posicion real de dinero por cuenta; derivacion determinista."
  },
  {
   "slug": "prevision-caja",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "vencimiento-pago",
    "saldo-tesoreria"
   ],
   "eventos_sube": [
    "prevision-caja.proyectar.request"
   ],
   "eventos_publica": [
    "prevision-caja.proyectar.response",
    "prevision-caja.proyectar.failed",
    "contabilidad.vencimiento_proximo"
   ],
   "proposito": "Proyecta entradas/salidas desde los compromisos con la politica declarada; determinista."
  },
  {
   "slug": "partida-no-identificada",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "regla-movimiento-bancario"
   ],
   "eventos_sube": [
    "partida-no-identificada.juzgar.request"
   ],
   "eventos_publica": [
    "partida-no-identificada.juzgar.response",
    "partida-no-identificada.juzgar.failed",
    "contabilidad.partida_propuesta"
   ],
   "proposito": "Reconoce y clasifica el movimiento sin contrapartida (comision/interes/devolucion); PROPONE, no escribe."
  },
  {
   "slug": "regla-movimiento-bancario",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "regla-movimiento-bancario.aplicar.request",
    "regla-movimiento-bancario.proponer.request",
    "project.activated"
   ],
   "eventos_publica": [
    "regla-movimiento-bancario.aplicar.response",
    "regla-movimiento-bancario.aplicar.failed",
    "regla-movimiento-bancario.proponer.response",
    "regla-movimiento-bancario.proponer.failed",
    "contabilidad.regla_bancaria_propuesta"
   ],
   "proposito": "Parcela de reglas declarables/aprendidas de movimientos bancarios; ratificacion unica por L10."
  },
  {
   "slug": "partida-conciliatoria",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "conciliacion-bancaria"
   ],
   "eventos_sube": [
    "partida-conciliatoria.desfase.request"
   ],
   "eventos_publica": [
    "partida-conciliatoria.desfase.response",
    "partida-conciliatoria.desfase.failed"
   ],
   "proposito": "Partidas en transito que explican el desfase (cheque no cobrado, cobro no apuntado); determinista."
  },
  {
   "slug": "informe-conciliacion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "conciliacion-bancaria",
    "partida-conciliatoria"
   ],
   "eventos_sube": [
    "informe-conciliacion.componer.request"
   ],
   "eventos_publica": [
    "informe-conciliacion.componer.response",
    "informe-conciliacion.componer.failed"
   ],
   "proposito": "Documento de cuadre saldo banco <-> saldo contable ajustado; la PRUEBA de que cuadra."
  },
  {
   "slug": "maestro-cuentas-bancarias",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "maestro-cuentas-bancarias.declarar.request",
    "maestro-cuentas-bancarias.listar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "maestro-cuentas-bancarias.declarar.response",
    "maestro-cuentas-bancarias.declarar.failed",
    "maestro-cuentas-bancarias.listar.response",
    "maestro-cuentas-bancarias.listar.failed",
    "contabilidad.cuenta_bancaria_declarada"
   ],
   "proposito": "Parcela declarable de cuentas y su moneda; sin el, \"el banco\" es un numero falso."
  },
  {
   "slug": "alta-activo",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "alta-activo.registrar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "alta-activo.registrar.response",
    "alta-activo.registrar.failed",
    "contabilidad.activo_registrado"
   ],
   "proposito": "Parcela del inmovilizado; un solo escritor; la valoracion del alta es reflejo hidratador."
  },
  {
   "slug": "plan-amortizacion",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "alta-activo",
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "plan-amortizacion.cuota_del_periodo.request",
    "plan-amortizacion.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "plan-amortizacion.cuota_del_periodo.response",
    "plan-amortizacion.cuota_del_periodo.failed",
    "plan-amortizacion.declarar.response",
    "plan-amortizacion.declarar.failed",
    "contabilidad.cuota_amortizacion"
   ],
   "proposito": "Genera la cuota cuando toca (dispara en el cierre); metodo/coeficiente = dato; un solo escritor."
  },
  {
   "slug": "baja-activo",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "alta-activo",
    "valor-neto-contable"
   ],
   "eventos_sube": [
    "baja-activo.calcular.request"
   ],
   "eventos_publica": [
    "baja-activo.calcular.response",
    "baja-activo.calcular.failed"
   ],
   "proposito": "Retira el bien y calcula el resultado (perdida/beneficio) y lo imputa; determinista."
  },
  {
   "slug": "valor-neto-contable",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "plan-amortizacion"
   ],
   "eventos_sube": [
    "valor-neto-contable.calcular.request"
   ],
   "eventos_publica": [
    "valor-neto-contable.calcular.response",
    "valor-neto-contable.calcular.failed"
   ],
   "proposito": "Coste - amortizacion acumulada; determinista, al balance."
  },
  {
   "slug": "recibo-nomina",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "puerto-nomina"
   ],
   "eventos_sube": [
    "recibo-nomina.dar_forma.request",
    "contabilidad.nomina_recibida"
   ],
   "eventos_publica": [
    "recibo-nomina.dar_forma.response",
    "recibo-nomina.dar_forma.failed",
    "contabilidad.nomina_formada"
   ],
   "proposito": "Admite y da forma asentable al hecho de nomina (hecho o documento); mecanico, cero juicio."
  },
  {
   "slug": "obligacion-seguridad-social",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina"
   ],
   "eventos_sube": [
    "obligacion-seguridad-social.calcular.request"
   ],
   "eventos_publica": [
    "obligacion-seguridad-social.calcular.response",
    "obligacion-seguridad-social.calcular.failed"
   ],
   "proposito": "Gasto de empresa + obligacion con la TGSS desde el recibo; tipos = dato; determinista."
  },
  {
   "slug": "asiento-personal",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina",
    "obligacion-seguridad-social"
   ],
   "eventos_sube": [
    "asiento-personal.construir.request"
   ],
   "eventos_publica": [
    "asiento-personal.construir.response",
    "asiento-personal.construir.failed"
   ],
   "proposito": "Gasto de personal, retencion y pago -> asiento EQUILIBRADO; determinista."
  },
  {
   "slug": "puerto-nomina",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [],
   "eventos_sube": [
    "puerto-nomina.recibir.request",
    "nomina.recibida",
    "nomina.emitida"
   ],
   "eventos_publica": [
    "puerto-nomina.recibir.response",
    "puerto-nomina.recibir.failed",
    "contabilidad.nomina_recibida"
   ],
   "proposito": "Origen declarable del dato de nomina: conecta con el sistema de personal por evento; si no existe, se crea."
  },
  {
   "slug": "lineas-nomina",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina"
   ],
   "eventos_sube": [
    "lineas-nomina.desglosar.request"
   ],
   "eventos_publica": [
    "lineas-nomina.desglosar.response",
    "lineas-nomina.desglosar.failed"
   ],
   "proposito": "Desglose bruto/retencion/cotizacion del trabajador/neto; hace la nomina EXPLICABLE, no un numero pelado."
  },
  {
   "slug": "acceso-nomina",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [],
   "eventos_sube": [
    "acceso-nomina.autorizar.request",
    "acceso-nomina.declarar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "acceso-nomina.autorizar.response",
    "acceso-nomina.autorizar.failed",
    "acceso-nomina.declarar.response",
    "acceso-nomina.declarar.failed",
    "contabilidad.acceso_nomina"
   ],
   "proposito": "Gobernanza de quien ve que nomina (dato personal): cada uno ve la suya; eje persona; un solo escritor."
  },
  {
   "slug": "pagos-a-cuenta-empleado",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina"
   ],
   "eventos_sube": [
    "pagos-a-cuenta-empleado.impacto.request"
   ],
   "eventos_publica": [
    "pagos-a-cuenta-empleado.impacto.response",
    "pagos-a-cuenta-empleado.impacto.failed"
   ],
   "proposito": "Anticipos/adelantos y su impacto en el neto y el IRPF; no todo es sueldo fijo; determinista."
  },
  {
   "slug": "conceptos-extra-nomina",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina"
   ],
   "eventos_sube": [
    "conceptos-extra-nomina.imputar.request"
   ],
   "eventos_publica": [
    "conceptos-extra-nomina.imputar.response",
    "conceptos-extra-nomina.imputar.failed"
   ],
   "proposito": "Dietas, especie, finiquito, paga extra: calculo de su imputacion; determinista."
  },
  {
   "slug": "liquidacion-baja-empleado",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-fiscal",
   "depende_de": [
    "recibo-nomina",
    "pagos-a-cuenta-empleado"
   ],
   "eventos_sube": [
    "liquidacion-baja-empleado.liquidar.request"
   ],
   "eventos_publica": [
    "liquidacion-baja-empleado.liquidar.response",
    "liquidacion-baja-empleado.liquidar.failed"
   ],
   "proposito": "Cierre de la cuenta del trabajador (finiquito/indemnizacion) para que no quede un acreedor abierto; determinista."
  },
  {
   "slug": "valoracion-existencia",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "inventario",
    "frontera-ficha-producto"
   ],
   "eventos_sube": [
    "valoracion-existencia.valorar.request"
   ],
   "eventos_publica": [
    "valoracion-existencia.valorar.response",
    "valoracion-existencia.valorar.failed"
   ],
   "proposito": "Capa de valor SOBRE el inventario existente (no lo duplica); metodo = dato (FIFO/medio)."
  },
  {
   "slug": "frontera-ficha-producto",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "frontera-ficha-producto.entrar.request"
   ],
   "eventos_publica": [
    "frontera-ficha-producto.entrar.response",
    "frontera-ficha-producto.entrar.failed",
    "contabilidad.coste_interno"
   ],
   "proposito": "Puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al dato interno; si falta, se crea."
  },
  {
   "slug": "ajuste-inventario",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "valoracion-existencia"
   ],
   "eventos_sube": [
    "ajuste-inventario.diferencia.request"
   ],
   "eventos_publica": [
    "ajuste-inventario.diferencia.response",
    "ajuste-inventario.diferencia.failed"
   ],
   "proposito": "Regulariza merma/rotura con asiento Y aviso; calculo de la diferencia; determinista."
  },
  {
   "slug": "variacion-stock-valorada",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "valoracion-existencia",
    "inventario"
   ],
   "eventos_sube": [
    "variacion-stock-valorada.variacion.request",
    "inventario.ajustado",
    "inventario.reserva.creada"
   ],
   "eventos_publica": [
    "variacion-stock-valorada.variacion.response",
    "variacion-stock-valorada.variacion.failed"
   ],
   "proposito": "Entrada por compra / salida por consumo, VALORADAS; determinista."
  },
  {
   "slug": "marca-sociedad",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "escritor-diario"
   ],
   "eventos_sube": [
    "marca-sociedad.marcar.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "marca-sociedad.marcar.response",
    "marca-sociedad.marcar.failed"
   ],
   "proposito": "Etiqueta cada asiento con su sociedad; mecanico, cero juicio."
  },
  {
   "slug": "eliminacion-intercompany",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "marca-sociedad"
   ],
   "eventos_sube": [
    "eliminacion-intercompany.eliminar.request"
   ],
   "eventos_publica": [
    "eliminacion-intercompany.eliminar.response",
    "eliminacion-intercompany.eliminar.failed"
   ],
   "proposito": "Detecta y elimina el cruce interno en la consolidacion; determinista."
  },
  {
   "slug": "consolidacion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "eliminacion-intercompany"
   ],
   "eventos_sube": [
    "consolidacion.estados.request"
   ],
   "eventos_publica": [
    "consolidacion.estados.response",
    "consolidacion.estados.failed"
   ],
   "proposito": "Estados del conjunto con criterio DECLARADO; agregacion determinista; grupo COMPLETO."
  },
  {
   "slug": "aislamiento-negocio",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "aislamiento-negocio.parcela.request",
    "aislamiento-negocio.escritor.request",
    "project.activated"
   ],
   "eventos_publica": [
    "aislamiento-negocio.parcela.response",
    "aislamiento-negocio.parcela.failed",
    "aislamiento-negocio.escritor.response",
    "aislamiento-negocio.escritor.failed",
    "contabilidad.parcela_reclamada"
   ],
   "proposito": "Multi-negocio sin fuga: un dueno por parcela; los negocios NO se fugan (eje negocio)."
  },
  {
   "slug": "etiquetado-analitico",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "cola-declaraciones-criterio"
   ],
   "eventos_sube": [
    "etiquetado-analitico.juzgar.request"
   ],
   "eventos_publica": [
    "etiquetado-analitico.juzgar.response",
    "etiquetado-analitico.juzgar.failed",
    "contabilidad.dimension_propuesta"
   ],
   "proposito": "Asigna centro/linea/producto a cada hecho con regla declarable; cuando la regla no cubre, PROPONE y lo dudoso va a cola."
  },
  {
   "slug": "margen-analitico",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "etiquetado-analitico"
   ],
   "eventos_sube": [
    "margen-analitico.calcular.request"
   ],
   "eventos_publica": [
    "margen-analitico.calcular.response",
    "margen-analitico.calcular.failed"
   ],
   "proposito": "Ingreso - coste imputado por dimension; determinista."
  },
  {
   "slug": "presupuesto",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "etiquetado-analitico"
   ],
   "eventos_sube": [
    "presupuesto.fijar.request",
    "presupuesto.objetivo.request",
    "project.activated"
   ],
   "eventos_publica": [
    "presupuesto.fijar.response",
    "presupuesto.fijar.failed",
    "presupuesto.objetivo.response",
    "presupuesto.objetivo.failed",
    "contabilidad.presupuesto_fijado"
   ],
   "proposito": "Cifra objetivo por dimension declarable; un solo escritor."
  },
  {
   "slug": "desviacion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "presupuesto"
   ],
   "eventos_sube": [
    "desviacion.calcular.request",
    "contabilidad.presupuesto_fijado"
   ],
   "eventos_publica": [
    "desviacion.calcular.response",
    "desviacion.calcular.failed",
    "contabilidad.desviacion"
   ],
   "proposito": "Real vs presupuesto -> dispara aviso SI se sale del umbral declarado; determinista."
  },
  {
   "slug": "coste-indirecto",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "etiquetado-analitico"
   ],
   "eventos_sube": [
    "coste-indirecto.repartir.request"
   ],
   "eventos_publica": [
    "coste-indirecto.repartir.response",
    "coste-indirecto.repartir.failed"
   ],
   "proposito": "Aplica el reparto DECLARADO de gastos no directos; determinista; cubre lo que la pieza existente no cubre para grupo."
  },
  {
   "slug": "cuadro-mando-contable",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "saldo-tesoreria",
    "cuenta-resultados",
    "margen-analitico",
    "desviacion"
   ],
   "eventos_sube": [
    "cuadro-mando-contable.componer.request"
   ],
   "eventos_publica": [
    "cuadro-mando-contable.componer.response",
    "cuadro-mando-contable.componer.failed"
   ],
   "proposito": "Agregacion de conjunto (caja\u00b7resultado\u00b7margen\u00b7desviacion\u00b7ejercicio) SIN bajar al asiento; lente del jefe; determinista."
  },
  {
   "slug": "comparador-periodos",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "presupuesto",
    "desviacion"
   ],
   "eventos_sube": [
    "comparador-periodos.comparar.request"
   ],
   "eventos_publica": [
    "comparador-periodos.comparar.response",
    "comparador-periodos.comparar.failed"
   ],
   "proposito": "Ejercicio vs ejercicio, mes vs mes, real vs presupuesto; REUTILIZA J3/J4, no los duplica."
  },
  {
   "slug": "tablero-margen-dimension",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "margen-analitico",
    "etiquetado-analitico"
   ],
   "eventos_sube": [
    "tablero-margen-dimension.cruzar.request"
   ],
   "eventos_publica": [
    "tablero-margen-dimension.cruzar.response",
    "tablero-margen-dimension.cruzar.failed"
   ],
   "proposito": "Cruce margen x dimension bajo lente de conjunto: por centro, familia o sociedad."
  },
  {
   "slug": "onboarding-negocio",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "project-manager"
   ],
   "eventos_sube": [
    "onboarding-negocio.recoger.request",
    "onboarding-negocio.leer.request",
    "project.activated"
   ],
   "eventos_publica": [
    "onboarding-negocio.recoger.response",
    "onboarding-negocio.recoger.failed",
    "onboarding-negocio.leer.response",
    "onboarding-negocio.leer.failed",
    "contabilidad.negocio_onboarded"
   ],
   "proposito": "Recoge los datos declarables del negocio nuevo (plan, fuentes, parametros); un solo escritor."
  },
  {
   "slug": "motor-avisos",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "motor-avisos.producir.request",
    "contabilidad.aviso_revision",
    "contabilidad.aviso_cuadre",
    "contabilidad.vencimiento_fiscal",
    "contabilidad.vencimiento_proximo",
    "contabilidad.desviacion",
    "contabilidad.fuente_faltante"
   ],
   "eventos_publica": [
    "motor-avisos.producir.response",
    "motor-avisos.producir.failed",
    "contabilidad.aviso_producido"
   ],
   "proposito": "PRODUCE el aviso (requisito 4 del dueno); conecta por evento; la ENTREGA es R1."
  },
  {
   "slug": "informe-rico",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "informe-conciliacion"
   ],
   "eventos_sube": [
    "informe-rico.componer.request"
   ],
   "eventos_publica": [
    "informe-rico.componer.response",
    "informe-rico.componer.failed"
   ],
   "proposito": "COMPONE la cifra ya calculada con el contexto declarado (periodo, origen, comparativas); mecanico."
  },
  {
   "slug": "activacion-vertical",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "onboarding-negocio"
   ],
   "eventos_sube": [
    "activacion-vertical.activar.request",
    "contabilidad.negocio_onboarded"
   ],
   "eventos_publica": [
    "activacion-vertical.activar.response",
    "activacion-vertical.activar.failed",
    "contabilidad.vertical_activada"
   ],
   "proposito": "Enciende la vertical por la configuracion declarada; mecanico, cero juicio."
  },
  {
   "slug": "cola-declaraciones-criterio",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "cola-declaraciones-criterio.fijar.request",
    "cola-declaraciones-criterio.ratificar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "cola-declaraciones-criterio.fijar.response",
    "cola-declaraciones-criterio.fijar.failed",
    "cola-declaraciones-criterio.ratificar.response",
    "cola-declaraciones-criterio.ratificar.failed",
    "contabilidad.criterio_ratificado"
   ],
   "proposito": "UNA sola cola donde el jefe fija/ratifica TODOS los criterios; cierra declarativamente B1/B7\u00b7C7\u00b7E6\u00b7F5\u00b7J6\u00b7D11\u00b7I5."
  },
  {
   "slug": "puerto-exportacion",
   "forma": "CONVERSOR",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "puerto-exportacion.salir.request",
    "puerto-exportacion.entrar.request"
   ],
   "eventos_publica": [
    "puerto-exportacion.salir.response",
    "puerto-exportacion.salir.failed",
    "puerto-exportacion.entrar.response",
    "puerto-exportacion.entrar.failed"
   ],
   "proposito": "Frontera de formatos contables estandar hacia el programa del asesor; si falta, se crea."
  },
  {
   "slug": "vista-revisable",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "traza-asiento"
   ],
   "eventos_sube": [
    "vista-revisable.explicar.request",
    "contabilidad.traza_registrada",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "vista-revisable.explicar.response",
    "vista-revisable.explicar.failed"
   ],
   "proposito": "Muestra cada asiento/calculo CON su origen: composicion determinista de la traza; NO caja negra."
  },
  {
   "slug": "flujo-firma",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "flujo-firma.firmar.request",
    "flujo-firma.estado.request",
    "project.activated"
   ],
   "eventos_publica": [
    "flujo-firma.firmar.response",
    "flujo-firma.firmar.failed",
    "flujo-firma.estado.response",
    "flujo-firma.estado.failed",
    "contabilidad.firma_registrada"
   ],
   "proposito": "Parcela de estado revisado/firmado del asesor; El sistema NO firma; vence -> expira y RE-PREGUNTA, jamas asume."
  },
  {
   "slug": "expediente-documental",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "puerto-documento"
   ],
   "eventos_sube": [
    "expediente-documental.archivar.request",
    "expediente-documental.recuperar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "expediente-documental.archivar.response",
    "expediente-documental.archivar.failed",
    "expediente-documental.recuperar.response",
    "expediente-documental.recuperar.failed",
    "contabilidad.cifra_archivada"
   ],
   "proposito": "Cada cifra con el documento origen ARCHIVADO y ENLAZADO; registro inmutable, un solo escritor; L2 explica, el expediente CONSERVA."
  },
  {
   "slug": "control-calidad-muestreo",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "escritor-diario",
    "regla-contrapartida"
   ],
   "eventos_sube": [
    "control-calidad-muestreo.seleccionar.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "control-calidad-muestreo.seleccionar.response",
    "control-calidad-muestreo.seleccionar.failed"
   ],
   "proposito": "Selecciona lo que exige ojo humano por senales DURAS; excepcion + muestra, NO revisar todo; determinista."
  },
  {
   "slug": "cambio-desde-ultima-revision",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "flujo-firma",
    "traza-asiento"
   ],
   "eventos_sube": [
    "cambio-desde-ultima-revision.delta.request",
    "contabilidad.firma_registrada",
    "contabilidad.asiento_registrado",
    "contabilidad.asiento_ajuste_recibido"
   ],
   "eventos_publica": [
    "cambio-desde-ultima-revision.delta.response",
    "cambio-desde-ultima-revision.delta.failed",
    "contabilidad.delta_revision"
   ],
   "proposito": "Delta: asientos nuevos, ajustes y reglas cambiadas desde el ultimo visto bueno; calculo de diferencia."
  },
  {
   "slug": "ratificacion-regla-aprendida",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [
    "regla-contrapartida",
    "regla-movimiento-bancario"
   ],
   "eventos_sube": [
    "ratificacion-regla-aprendida.ratificar.request",
    "contabilidad.regla_contrapartida_propuesta",
    "contabilidad.regla_bancaria_propuesta"
   ],
   "eventos_publica": [
    "ratificacion-regla-aprendida.ratificar.response",
    "ratificacion-regla-aprendida.ratificar.failed",
    "contabilidad.regla_ratificada"
   ],
   "proposito": "El asesor ratifica o bloquea la regla ANTES de que actue sobre el volumen; gate humano unico para A6.2 y E8."
  },
  {
   "slug": "frontera-planos",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "frontera-planos.verificar.request"
   ],
   "eventos_publica": [
    "frontera-planos.verificar.response",
    "frontera-planos.verificar.failed",
    "contabilidad.salida_verificada"
   ],
   "proposito": "Guarda verificable de que SOLO se emiten calculos, NUNCA hechos de negocio; un test lo afirma; no realimenta la operacion."
  },
  {
   "slug": "single-writer",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "single-writer.reclamar.request",
    "single-writer.es_escritor.request",
    "project.activated"
   ],
   "eventos_publica": [
    "single-writer.reclamar.response",
    "single-writer.reclamar.failed",
    "single-writer.es_escritor.response",
    "single-writer.es_escritor.failed",
    "contabilidad.escritor_reclamado"
   ],
   "proposito": "La LEY que gobierna cada custodio: un solo escritor por parcela; segundo escritor = corrupcion."
  },
  {
   "slug": "clave-natural",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-libro",
   "depende_de": [],
   "eventos_sube": [
    "clave-natural.calcular.request",
    "clave-natural.coincide.request"
   ],
   "eventos_publica": [
    "clave-natural.calcular.response",
    "clave-natural.calcular.failed",
    "clave-natural.coincide.response",
    "clave-natural.coincide.failed"
   ],
   "proposito": "Idempotencia determinista: reprocesar NO duplica (\"un cierre = un asiento\"); un test lo afirma."
  },
  {
   "slug": "maestro-terceros",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "padron-terceros"
   ],
   "eventos_sube": [
    "maestro-terceros.ficha.request",
    "maestro-terceros.upsert.request",
    "project.activated"
   ],
   "eventos_publica": [
    "maestro-terceros.ficha.response",
    "maestro-terceros.ficha.failed",
    "maestro-terceros.upsert.response",
    "maestro-terceros.upsert.failed",
    "contabilidad.tercero_actualizado"
   ],
   "proposito": "Ficha unica de cliente/proveedor (identificacion fiscal, condiciones, historial); UN solo maestro con roles."
  },
  {
   "slug": "padron-terceros",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "padron-terceros.unificar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "padron-terceros.unificar.response",
    "padron-terceros.unificar.failed",
    "contabilidad.identidad_unificada"
   ],
   "proposito": "Identidad unica por numero fiscal: un proveedor escrito de tres formas sigue siendo uno; faceta de identidad del MISMO maestro N1."
  },
  {
   "slug": "cuenta-proveedor",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "escritor-diario",
    "maestro-terceros"
   ],
   "eventos_sube": [
    "cuenta-proveedor.saldo.request",
    "cuenta-proveedor.facturas_vivas.request",
    "contabilidad.asiento_registrado"
   ],
   "eventos_publica": [
    "cuenta-proveedor.saldo.response",
    "cuenta-proveedor.saldo.failed",
    "cuenta-proveedor.facturas_vivas.response",
    "cuenta-proveedor.facturas_vivas.failed"
   ],
   "proposito": "Mayor auxiliar del tercero (cada factura de compra viva y su saldo) DERIVADO del diario."
  },
  {
   "slug": "estado-cuenta-proveedor",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "cuenta-proveedor"
   ],
   "eventos_sube": [
    "estado-cuenta-proveedor.extracto.request"
   ],
   "eventos_publica": [
    "estado-cuenta-proveedor.extracto.response",
    "estado-cuenta-proveedor.extracto.failed"
   ],
   "proposito": "Extracto CONFRONTABLE con el proveedor (conciliacion de saldos); derivacion determinista."
  },
  {
   "slug": "cruce-factura-recepcion",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "puerto-evento-vertical"
   ],
   "eventos_sube": [
    "cruce-factura-recepcion.cotejar.request"
   ],
   "eventos_publica": [
    "cruce-factura-recepcion.cotejar.response",
    "cruce-factura-recepcion.cotejar.failed",
    "contabilidad.cruce_descuadrado"
   ],
   "proposito": "Coteja pedido <-> recepcion <-> factura ANTES de asentar; lo que no cuadra -> cola; determinista."
  },
  {
   "slug": "vencimiento-pago",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "vencimiento-pago.calcular.request"
   ],
   "eventos_publica": [
    "vencimiento-pago.calcular.response",
    "vencimiento-pago.calcular.failed",
    "contabilidad.vencimiento_proximo"
   ],
   "proposito": "Fecha de vencimiento por factura desde la politica declarada -> alimenta E5 y K2; un solo tipo Vencimiento con dos lados."
  },
  {
   "slug": "rappel-pronto-pago",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "rappel-pronto-pago.ajustar.request"
   ],
   "eventos_publica": [
    "rappel-pronto-pago.ajustar.response",
    "rappel-pronto-pago.ajustar.failed"
   ],
   "proposito": "Descuentos/rappels/anticipos que ajustan el coste REAL de la compra a lo realmente pagado; determinista."
  },
  {
   "slug": "antiguedad-de-saldos",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "vencimiento-pago"
   ],
   "eventos_sube": [
    "antiguedad-de-saldos.clasificar.request"
   ],
   "eventos_publica": [
    "antiguedad-de-saldos.clasificar.response",
    "antiguedad-de-saldos.clasificar.failed"
   ],
   "proposito": "Lo pendiente clasificado por vencimiento: quien y cuanto esta vencido; espejo de N6 del lado del cobro."
  },
  {
   "slug": "emision-factura-venta",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "maestro-terceros",
    "factura-electronica"
   ],
   "eventos_sube": [
    "emision-factura-venta.emitir.request",
    "project.activated"
   ],
   "eventos_publica": [
    "emision-factura-venta.emitir.response",
    "emision-factura-venta.emitir.failed",
    "contabilidad.factura_emitida"
   ],
   "proposito": "Cara emitida con serie/numeracion; numero duplicado = corrupcion -> un solo escritor; contabilidad SI emite SU factura."
  },
  {
   "slug": "factura-rectificativa",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "emision-factura-venta"
   ],
   "eventos_sube": [
    "factura-rectificativa.calcular.request"
   ],
   "eventos_publica": [
    "factura-rectificativa.calcular.response",
    "factura-rectificativa.calcular.failed",
    "contabilidad.factura_rectificada"
   ],
   "proposito": "Correccion comercial POSTERIOR a la emision (abono/devolucion/descuento) que NO borra nada; != ajuste interno B5."
  },
  {
   "slug": "panel-proceso-contable",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "encolado-excepcion",
    "historial-proceso-contable"
   ],
   "eventos_sube": [
    "panel-proceso-contable.latido.request",
    "contabilidad.excepcion_encolada",
    "contabilidad.proceso_anotado"
   ],
   "eventos_publica": [
    "panel-proceso-contable.latido.response",
    "panel-proceso-contable.latido.failed"
   ],
   "proposito": "Que entra, que se procesa, que esta en cola, que falla; agregacion determinista; el \"display\" de la contabilidad."
  },
  {
   "slug": "historial-proceso-contable",
   "forma": "CUSTODIO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [],
   "eventos_sube": [
    "historial-proceso-contable.anotar.request",
    "project.activated"
   ],
   "eventos_publica": [
    "historial-proceso-contable.anotar.response",
    "historial-proceso-contable.anotar.failed",
    "contabilidad.proceso_anotado"
   ],
   "proposito": "Registro append-only de lo procesado y lo fallado con su rastro; != traza-asiento B4; un solo escritor."
  },
  {
   "slug": "desatasco-entrada",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "encolado-excepcion"
   ],
   "eventos_sube": [
    "desatasco-entrada.juzgar.request"
   ],
   "eventos_publica": [
    "desatasco-entrada.juzgar.response",
    "desatasco-entrada.juzgar.failed",
    "contabilidad.excepcion_desatascada"
   ],
   "proposito": "Resolver/reencolar/descartar una excepcion CON motivo; la ACCION que completa A8; si la silla es humana, captura su decision."
  },
  {
   "slug": "tasa-cobertura-entrada",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-entrada",
   "depende_de": [
    "completitud-cobertura"
   ],
   "eventos_sube": [
    "tasa-cobertura-entrada.calcular.request",
    "contabilidad.cobertura_medida"
   ],
   "eventos_publica": [
    "tasa-cobertura-entrada.calcular.response",
    "tasa-cobertura-entrada.calcular.failed"
   ],
   "proposito": "Proporcion de hechos que entran SIN intervencion vs caen a cola; LEE la metrica unica; prueba la promesa \"sin una persona digitando\"."
  },
  {
   "slug": "consulta-cuentas-bajo-demanda",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [],
   "eventos_sube": [
    "consulta-cuentas-bajo-demanda.preguntar.request"
   ],
   "eventos_publica": [
    "consulta-cuentas-bajo-demanda.preguntar.response",
    "consulta-cuentas-bajo-demanda.preguntar.failed",
    "contabilidad.respuesta_consulta"
   ],
   "proposito": "Puerta pull: conecta la pregunta del dueno con el calculo por peticion; NO impone cadencia."
  },
  {
   "slug": "puente-lenguaje-dueno",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "consulta-cuentas-bajo-demanda"
   ],
   "eventos_sube": [
    "puente-lenguaje-dueno.a_consulta.request",
    "puente-lenguaje-dueno.a_cifra.request",
    "contabilidad.respuesta_consulta"
   ],
   "eventos_publica": [
    "puente-lenguaje-dueno.a_consulta.response",
    "puente-lenguaje-dueno.a_consulta.failed",
    "puente-lenguaje-dueno.a_cifra.response",
    "puente-lenguaje-dueno.a_cifra.failed",
    "contabilidad.consulta_traducida"
   ],
   "proposito": "Traductor BIDIRECCIONAL: su pregunta -> consulta contable; calculo -> cifra en su idioma (caja, deuda, \"puedo pagar X?\")."
  },
  {
   "slug": "sello-cobertura",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "completitud-cobertura"
   ],
   "eventos_sube": [
    "sello-cobertura.sellar.request",
    "contabilidad.respuesta_consulta"
   ],
   "eventos_publica": [
    "sello-cobertura.sellar.response",
    "sello-cobertura.sellar.failed"
   ],
   "proposito": "Marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES de decidir; LEE la metrica unica."
  },
  {
   "slug": "marca-borrador-validado",
   "forma": "REFLEJO",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "traza-asiento",
    "flujo-firma"
   ],
   "eventos_sube": [
    "marca-borrador-validado.estado.request",
    "contabilidad.traza_registrada",
    "contabilidad.firma_registrada"
   ],
   "eventos_publica": [
    "marca-borrador-validado.estado.response",
    "marca-borrador-validado.estado.failed"
   ],
   "proposito": "Sello del punto en que esta lo que ve (en curso/revisado/firmado) para no decidir sobre un borrador vivo; deriva de traza y firma."
  },
  {
   "slug": "aviso-al-negocio",
   "forma": "PUENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "motor-avisos"
   ],
   "eventos_sube": [
    "aviso-al-negocio.entregar.request",
    "contabilidad.aviso_producido"
   ],
   "eventos_publica": [
    "aviso-al-negocio.entregar.response",
    "aviso-al-negocio.entregar.failed",
    "contabilidad.aviso_entregado"
   ],
   "proposito": "El aviso ENTREGADO y CONFIRMADO al negocio cliente; cara de entrega que COMPLETA motor-avisos K2."
  },
  {
   "slug": "informe-accionable",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "informe-rico"
   ],
   "eventos_sube": [
    "informe-accionable.juzgar.request"
   ],
   "eventos_publica": [
    "informe-accionable.juzgar.response",
    "informe-accionable.juzgar.failed",
    "contabilidad.recomendacion"
   ],
   "proposito": "Todo informe que recibe el cliente lleva QUE HACER con el; la recomendacion es juicio; refuerza K3."
  },
  {
   "slug": "narrador-estados",
   "forma": "MICRO-AGENTE",
   "accion": "CONSTRUIR",
   "eje": "contabilidad-analitica",
   "depende_de": [
    "balance-situacion",
    "cuenta-resultados"
   ],
   "eventos_sube": [
    "narrador-estados.narrar.request"
   ],
   "eventos_publica": [
    "narrador-estados.narrar.response",
    "narrador-estados.narrar.failed",
    "contabilidad.narracion"
   ],
   "proposito": "Traduce balance/resultado al LENGUAJE del negocio cliente (\"esto es lo que te ha pasado y lo que viene\")."
  }
 ],
 "clases": {
  "puerto-evento-vertical": "A1",
  "normalizador-hecho": "A2",
  "captura-documento": "A3",
  "extraccion-dato": "A4.1",
  "puerto-documento": "A4.2",
  "control-cuadre-documento": "A4.3",
  "puerto-documento-digital": "A5",
  "contrapartida-asistida": "A6.1",
  "regla-contrapartida": "A6.2",
  "deduplicacion-hecho": "A7",
  "encolado-excepcion": "A8.1",
  "aviso-revision": "A8.2",
  "lote-admision": "A9",
  "contrato-hecho-minimo": "A11",
  "completitud-cobertura": "A12",
  "hecho-rectificativo": "A13",
  "anclaje-cierre-vertical": "A14",
  "declaracion-fuente-faltante": "A15",
  "catalogo-cuentas": "B1",
  "escritor-diario": "B2",
  "mayor-balanza": "B3",
  "traza-asiento": "B4",
  "asiento-ajuste": "B5",
  "puerto-plan-contable": "B6",
  "balance-situacion": "C1",
  "cuenta-resultados": "C2",
  "periodificacion": "C3",
  "cierre-ejercicio": "C4",
  "apertura-ejercicio": "C5",
  "aviso-cuadre": "C6",
  "liquidacion-iva": "D1",
  "modelo-303": "D2",
  "modelo-390": "D3",
  "retenciones": "D4",
  "estimacion-is-irpf": "D5",
  "calendario-fiscal": "D6",
  "generador-modelo": "D7",
  "registro-verifactu": "D8",
  "factura-electronica": "D9",
  "estado-presentacion-fiscal": "D12",
  "acuse-presentacion": "D13",
  "rectificacion-declaracion": "D14",
  "perfil-administrativo": "D15",
  "conciliacion-bancaria": "E1",
  "puerto-extracto": "E2",
  "cuadre-cobro-pago": "E3",
  "saldo-tesoreria": "E4",
  "prevision-caja": "E5",
  "partida-no-identificada": "E7",
  "regla-movimiento-bancario": "E8",
  "partida-conciliatoria": "E9",
  "informe-conciliacion": "E10",
  "maestro-cuentas-bancarias": "E11",
  "alta-activo": "F1",
  "plan-amortizacion": "F2",
  "baja-activo": "F3",
  "valor-neto-contable": "F4",
  "recibo-nomina": "G1",
  "obligacion-seguridad-social": "G2",
  "asiento-personal": "G3",
  "puerto-nomina": "G4",
  "lineas-nomina": "G6",
  "acceso-nomina": "G7",
  "pagos-a-cuenta-empleado": "G8",
  "conceptos-extra-nomina": "G9",
  "liquidacion-baja-empleado": "G10",
  "valoracion-existencia": "H1",
  "frontera-ficha-producto": "H2",
  "ajuste-inventario": "H3",
  "variacion-stock-valorada": "H4",
  "marca-sociedad": "I1",
  "eliminacion-intercompany": "I2",
  "consolidacion": "I3",
  "aislamiento-negocio": "I4",
  "etiquetado-analitico": "J1",
  "margen-analitico": "J2",
  "presupuesto": "J3",
  "desviacion": "J4",
  "coste-indirecto": "J5",
  "cuadro-mando-contable": "J8",
  "comparador-periodos": "J9",
  "tablero-margen-dimension": "J10",
  "onboarding-negocio": "K1",
  "motor-avisos": "K2",
  "informe-rico": "K3",
  "activacion-vertical": "K4",
  "cola-declaraciones-criterio": "K9",
  "puerto-exportacion": "L1",
  "vista-revisable": "L2",
  "flujo-firma": "L3",
  "expediente-documental": "L7",
  "control-calidad-muestreo": "L8",
  "cambio-desde-ultima-revision": "L9",
  "ratificacion-regla-aprendida": "L10",
  "frontera-planos": "M1",
  "single-writer": "M2",
  "clave-natural": "M3",
  "maestro-terceros": "N1",
  "padron-terceros": "N2",
  "cuenta-proveedor": "N3",
  "estado-cuenta-proveedor": "N4",
  "cruce-factura-recepcion": "N5",
  "vencimiento-pago": "N6",
  "rappel-pronto-pago": "N7",
  "antiguedad-de-saldos": "N8",
  "emision-factura-venta": "O1",
  "factura-rectificativa": "O2",
  "panel-proceso-contable": "P1",
  "historial-proceso-contable": "P2",
  "desatasco-entrada": "P3",
  "tasa-cobertura-entrada": "P4",
  "consulta-cuentas-bajo-demanda": "Q1",
  "puente-lenguaje-dueno": "Q2",
  "sello-cobertura": "Q3",
  "marca-borrador-validado": "Q4",
  "aviso-al-negocio": "R1",
  "informe-accionable": "R2",
  "narrador-estados": "R3"
 }
}
```

> **Verificado:** JSON parseable (validado con `node -e`). `hojas` = **118** (una por clase OOP) · `clases` = mapa
> `slug → código de hoja F2` · `orden` = **118** slugs en orden topológico · `verticales` = los 4 ejes.
