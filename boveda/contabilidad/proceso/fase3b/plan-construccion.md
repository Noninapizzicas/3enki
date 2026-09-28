# PLAN DE CONSTRUCCION — Vertical CONTABILIDAD (Fase 3b · ADAPTADOR)

> **Proyecto:** contabilidad · **Vertical(es):** `contabilidad-entrada` · `contabilidad-libro` · `contabilidad-fiscal` · `contabilidad-analitica`
> **Fase:** 3b · ADAPTADOR (adaptador de disenos Enki — traducir el diseno OOP a modulos-isla event-driven)
> **Fecha:** 2026-09-28 · **Ejecutor:** `prisma-universal` en lente de ADAPTADOR
>
> **Fuentes (leidas, no de memoria):**
> 1. `fase3/diseno-oop.md` — FASE 3 · PLASMA: **135 clases** (118 de dominio, una por hoja atomica de F2, + 17 de soporte), 4 ejes (32/32/22/32), 16 puertos abiertos, 23 piezas `[ABIERTO]` como parametros declarables.
> 2. `fase2/esquemas/esquema.md` — FASE 2: 118 hojas atomicas con su **FORMA** (60 REFLEJO · 29 CUSTODIO · 14 PUENTE · 8 MICRO-AGENTE · 7 CONVERSOR) y la particion en 4 verticales. **La forma no se negocia.**
> 3. `fase3b/reutilizables-verificados.md` — verificacion **YA HECHA por el padre** contra el `module.json` REAL (contrato/tools/eje) + descartados con motivo. **No se re-verifica.**
> 4. `fase3b/inventario-modulos-enki.json` — 248 modulos reales (contrato leido de `events.subscribes`/`events.publishes`).
> 5. Molde de forma: `boveda/nichos/proceso/fase3b/plan-construccion.md` · Metodo: skill `enki-adaptador-disenos` + `references/espina-enki-plan.md`.
>
> **Hallazgo que gobierna este plan:** YA EXISTE UN PIPELINE DE FACTURACION (`facturacion/fuentes` -> `facturas` -> `facturacion/asesoria`). La ENTRADA (eslabon limitante) esta **en parte construida**: 4 de sus clases (A3, A4.1, A4.2, A5) y la salida al asesor (L1) se CUBREN con lo reutilizado en vez de re-construirse.

---

## 1 · Reglas de traduccion aplicadas

| Clase OOP | Traduccion Enki |
|---|---|
| CLASE con estado | modulo **CUSTODIO** (single-writer de su parcela) — `PosPersistencia` + `project.activated` |
| CLASE que solo calcula | **PROYECCION INTERNA** del modulo que la usa (metodo puro `_op`) — **JAMAS en `_shared/`** |
| CLASE que orquesta | modulo **MICRO-AGENTE / ORQUESTADOR** (op fuzzy en cajon de blueprint, gate `validate-hibridos`) |
| CLASE que habla al exterior | modulo **PUENTE** (puerto abierto, adaptador cableado en el sitio) |
| Frontera de formato | modulo **CONVERSOR** (unico cruce de formatos de su dominio) |
| Dependencia entre clases | **EVENTO request/response**, nunca `import` cruzado |
| Logica de negocio | dentro del modulo como proyeccion `_op`; `_shared/` SOLO infraestructura |

**Criterio de fusion declarado (clase -> hoja).** Una hoja = un modulo-isla. Para no inflar el numero de modulos sin perder ninguna clase:
1. **CUSTODIO** -> 1 modulo. Se funden SOLO si comparten parcela (N1+N2 = un maestro con roles, conflicto 1 resuelto).
2. **REFLEJO** -> es PROYECCION INTERNA del modulo consumidor cuando tiene **un solo consumidor** en su cadena; es **modulo propio de forma `reflejo`** cuando lo consumen **varios** modulos o su invariante exige **UN SOLO calculador** (A12 cobertura, M3 clave natural, M1 frontera de planos).
3. **PUENTE / CONVERSOR / MICRO-AGENTE** -> 1 modulo (hablan con el exterior, cruzan formatos o ejercen juicio).
4. Cada fusion queda declarada en la tabla **§2.6 (clase -> hoja)**: **ninguna clase se pierde**.

**Convenciones del bus (innegociables).**
- Topicos en **ASCII** (sin tildes ni enye: `dueno`, `anadir`, `senales`, `liquidacion`, `periodificacion`).
- RPC: `contabilidad.<modulo>.<op>.request` -> `contabilidad.<modulo>.<op>.response`; fallo: `.failed`.
- Evento de dominio: fire-and-forget `contabilidad.<sustantivo>_<participio>`; **todo flujo cierra su circulo con su par `.failed`**.
- El espacio `contabilidad.*` es el de **CALCULOS**: nunca realimenta la operacion (cerrojo M1 `frontera-planos`). El hecho de negocio lo emite la OPERACION.
- `contabilidad-*` son las 4 verticales (unidad de ORGANIZACION y ACTIVACION): **no son frontera de comunicacion** — todos los modulos son del sistema y se hablan entre si.
- **Cero supuestos:** lo no declarado no se estima; es parametro declarable en `cola-declaraciones-criterio` (K9) o queda `[ABIERTO]`.

---

## 2 · Inventario: REUTILIZAR / ADAPTAR / CONSTRUIR

### 2.1 — REUTILIZAR (8) — contrato REAL ya verificado por el padre

| slug | forma | v | que CUBRE | eje | contrato real (module.json) |
|---|---|---|---|---|---|
| `filesystem` | reflejo | v2.4.0 | infraestructura | `transversal` | sub `fs.read.request` · `fs.write.request` · `fs.edit.request` · `fs.list.request` · `fs.exists.request` · `project.activated` · `project.deactivated` · pub (ninguno) |
| `project-manager` | reflejo | v4.2.0 | infraestructura | `transversal` | sub `project.activate` · `project.create` · `project.get.request` · `project.list.request` · `project.state.request` · `project.update` · pub `project.activated` · `project.created` · `project.deactivated` · `project.state` |
| `credential-manager` | reflejo | v2.2.0 | infraestructura | `transversal` | sub `credential.resolve.request` · `credential.create.request` · `credential.update.request` · `credential.delete.request` · `credential.state.request` · pub `credential.saved` · `credential.updated` · `credential.deleted` · `credential.state` |
| `facturas` | custodio | v3.0.0 | A3 · A4.1 | `entrada` | sub `factura.entrada` · pub `factura.recibida` · `factura.procesada` · `factura.error` · `factura.exportada` · `telegram.send_message.request` |
| `facturacion/fuentes` | puente | v2.0.0 | A5 · A4.2 | `entrada` | sub `telegram.photo.received` · `telegram.document.received` · pub `factura.entrada` |
| `inventario` | custodio | v1.0.0 | sustrato de stock (grupo H) | `analitica` | sub `pedido.completado` · `pedido.cancelado` · pub `inventario.reserva.creada` · `inventario.reserva.expirada` · `inventario.reserva.liberada` · `inventario.confirmado` · `inventario.ajustado` · `inventario.stock.bajo_minimo` |
| `metricas` | reflejo | v2.0.0 | infraestructura | `libro` | sub `*.creado` · `*.actualizado` · `*.eliminado` · `*.error` · `*.completado` · pub `metricas.snapshot` |
| `facturacion/asesoria` | puente | v2.0.0 | L1 | `libro` | sub (ninguno) · pub `asesoria.paquete.generado` · `asesoria.paquete.error` |

> **Por que se REUTILIZA (y no se construye):** se leyo su `module.json` real — el contrato encaja sin romper su proyecto de origen (PosPersistencia per-proyecto donde toca).
> El detalle de la verificacion vive en `fase3b/reutilizables-verificados.md` (trabajo del padre, no repetido aqui).

### 2.2 — Clases de F3 CUBIERTAS por lo reutilizado (no se construyen)

| clase | la cubre | como |
|---|---|---|
| `A3 captura-documento` | `facturas` | admision e integridad del documento en su pipeline Intake (v3.0.0) |
| `A4.1 extraccion-dato` | `facturas` | `facturas.procesar` = OCR + IA: el juicio de "abrir el documento" ya existe |
| `A4.2 puerto-documento` | `facturas` + `facturacion/fuentes` | formas/canales por adaptador (`fuentes`, strategy-pattern); el catalogo es DATO declarable (A10) |
| `A5 puerto-documento-digital` | `facturacion/fuentes` | recepcion digital (Telegram hoy; Gmail/extension por el mismo patron) -> `factura.entrada` |
| `L1 puerto-exportacion` | `facturacion/asesoria` | CSV formato espanol + ZIP con originales (`asesoria.generar-paquete`) |

**Consecuencia de diseno:** la ENTRADA no se construye de cero. Lo que FALTA del cuello es lo que ninguna pieza cubre: **contrato minimo del hecho (A11), anclaje del cierre (A14), cuadre del documento (A4.3), resolucion de contrapartida (A6.1+A6.2), deduplicacion (A7), valvula de 2 colas (A8) y la metrica de cobertura (A12)**.

### 2.3 — ADAPTAR: **0**

Todo lo que "se parece" es de otro dominio o mono-negocio y ADAPTARlo romperia su proyecto. Se toma su **patron** y se CONSTRUYE para contabilidad. Ver §2.4.

### 2.4 — Descartados con motivo (no se adaptan · se toma su patron)

| modulo evaluado | por que NO |
|---|---|
| `pizzepos/escandallo` | **mono-negocio** (receta -> coste). Falta coste indirecto, multi-sociedad y periodos: insuficiente para un grupo. **Se pone POR ENCIMA, no se toca.** Su patron (hibrido) se toma en `margen-analitico`/`frontera-ficha-producto`. |
| `marketing-budget` | dominio marketing; declara "custodia contable" pero es presupuesto de marketing. **Contabilidad LEE, no absorbe** (solape registrado; H6). |
| `planes-y-tiers` | licencias de OTRO producto (Free/Pro/Agencias). Patron para `modelo-licencia` (K8, `[ABIERTO]`), no se adapta. |
| `cuenta-recurrente` | dominio despacho de pan (cliente + pedido base + dia). Patron de custodio, dominio ajeno. |
| `agenda-operacion` | operacion diaria de negocio (horarios, demanda). Ajeno. |
| `lotes` | ciclo de lotes de produccion. Ajeno (util a la operacion, no a la contabilidad). |
| `entrega` | estimacion de reparto. Ajeno. |
| `banco` (v0.2.0) | **NOMBRE ENGANOSO**: NO es banca, es *"custodio del banco de NICHOS del radar"*. Los bancos de contabilidad se **CONSTRUYEN** (`maestro-cuentas-bancarias`, `conciliacion-bancaria`). |
| `nichos/motor-cobro`, `prisma/cobro`, `pizzepos/cobros`, `pizzepos/pago-gateway` | cobro de OTRO dominio. Contabilidad **observa** el cobro, no lo ejecuta (salvo pasarela declarada: `[ABIERTO]` D21). |
| `pizzepos/persistencia-comandero` / `prisma/cierre` | **cierre de caja del DIA** de la operacion, mono-negocio. **No se toca**: entra como HECHO observado (`CIERRE_JORNADA`) por la puerta (A1). El cierre CONTABLE (nivel 2) si se construye. |

### 2.5 — CONSTRUIR (72)

Cada CONSTRUIR justifica por que no reutiliza (el `NO REUTILIZA` va en su bloque de §3 y en la espina). Motivo de fondo, repetido y honesto: **en el inventario de 248 modulos la contabilidad real (IVA/modelos/diario/conciliacion/nomina/inmovilizado/consolidacion) es CERO modulos**; lo unico contable que existe es el intake de facturas (`facturas`) y el paquete al asesor (`facturacion/asesoria`), ambos REUTILIZADOS.

### 2.6 — Cobertura: clase (F3) -> hoja (F3b)

> Garantia de que **ninguna de las 118 clases se pierde**: 118 clases mapeadas a 80 hojas (72 CONSTRUIR + 8 REUTILIZAR).

**Eje `contabilidad-entrada` — 32 clases**

| clase | hoja (slug) | forma |
|---|---|---|
| `A1` | `puerto-evento-vertical` | puente |
| `A2` | `normalizador-hecho` | conversor |
| `A3` | `facturas` *(REUTILIZAR)* | custodio |
| `A4.1` | `facturas` *(REUTILIZAR)* | custodio |
| `A4.2` | `facturacion/fuentes` *(REUTILIZAR)* | puente |
| `A4.3` | `normalizador-hecho` | conversor |
| `A5` | `facturacion/fuentes` *(REUTILIZAR)* | puente |
| `A6.1` | `resolucion-contrapartida` | micro-agente |
| `A6.2` | `regla-contrapartida` | custodio |
| `A7` | `deduplicacion-hecho` | reflejo |
| `A8.1` | `cola-revision` | custodio |
| `A8.2` | `aviso-revision` | puente |
| `A9` | `lote-admision` | reflejo |
| `A11` | `contrato-hecho-minimo` | custodio |
| `A12` | `completitud-cobertura` | reflejo |
| `A13` | `hecho-rectificativo` | puente |
| `A14` | `anclaje-cierre-vertical` | custodio |
| `A15` | `declaracion-fuente-faltante` | puente |
| `N1` | `maestro-terceros` | custodio |
| `N2` | `maestro-terceros` | custodio |
| `N3` | `cuenta-terceros` | reflejo |
| `N4` | `cuenta-terceros` | reflejo |
| `N5` | `compra-proveedor` | reflejo |
| `N6` | `cuenta-terceros` | reflejo |
| `N7` | `compra-proveedor` | reflejo |
| `N8` | `cuenta-terceros` | reflejo |
| `O1` | `emision-factura-venta` | custodio |
| `O2` | `emision-factura-venta` | custodio |
| `P1` | `panel-proceso-contable` | reflejo |
| `P2` | `historial-proceso-contable` | custodio |
| `P3` | `desatasco-entrada` | micro-agente |
| `P4` | `panel-proceso-contable` | reflejo |

**Eje `contabilidad-libro` — 32 clases**

| clase | hoja (slug) | forma |
|---|---|---|
| `B1` | `catalogo-cuentas` | custodio |
| `B2` | `escritor-diario` | custodio |
| `B3` | `mayor-balanza` | reflejo |
| `B4` | `traza-asiento` | custodio |
| `B5` | `asiento-ajuste` | puente |
| `B6` | `catalogo-cuentas` | custodio |
| `C1` | `estados-contables` | reflejo |
| `C2` | `estados-contables` | reflejo |
| `C3` | `periodificacion` | reflejo |
| `C4` | `cierre-ejercicio` | custodio |
| `C5` | `cierre-ejercicio` | custodio |
| `C6` | `aviso-cuadre` | puente |
| `E1` | `conciliacion-bancaria` | reflejo |
| `E2` | `puerto-extracto` | conversor |
| `E3` | `conciliacion-bancaria` | reflejo |
| `E4` | `saldo-tesoreria` | reflejo |
| `E5` | `saldo-tesoreria` | reflejo |
| `E7` | `partida-no-identificada` | micro-agente |
| `E8` | `regla-movimiento-bancario` | custodio |
| `E9` | `conciliacion-bancaria` | reflejo |
| `E10` | `conciliacion-bancaria` | reflejo |
| `E11` | `maestro-cuentas-bancarias` | custodio |
| `L1` | `facturacion/asesoria` *(REUTILIZAR)* | puente |
| `L2` | `vista-revisable` | reflejo |
| `L3` | `flujo-firma` | custodio |
| `L7` | `expediente-documental` | custodio |
| `L8` | `vista-revisable` | reflejo |
| `L9` | `flujo-firma` | custodio |
| `L10` | `ratificacion-regla-aprendida` | puente |
| `M1` | `frontera-planos` | reflejo |
| `M2` | `single-writer` | custodio |
| `M3` | `clave-natural` | reflejo |

**Eje `contabilidad-fiscal` — 22 clases**

| clase | hoja (slug) | forma |
|---|---|---|
| `D1` | `liquidacion-iva` | reflejo |
| `D2` | `liquidacion-iva` | reflejo |
| `D3` | `liquidacion-iva` | reflejo |
| `D4` | `retenciones-is-irpf` | reflejo |
| `D5` | `retenciones-is-irpf` | reflejo |
| `D6` | `calendario-fiscal` | custodio |
| `D7` | `generador-modelo` | puente |
| `D8` | `registro-verifactu` | custodio |
| `D9` | `factura-electronica` | conversor |
| `D12` | `estado-presentacion-fiscal` | custodio |
| `D13` | `acuse-presentacion` | puente |
| `D14` | `rectificacion-declaracion` | custodio |
| `D15` | `perfil-administrativo` | custodio |
| `G1` | `recibo-nomina` | reflejo |
| `G2` | `recibo-nomina` | reflejo |
| `G3` | `recibo-nomina` | reflejo |
| `G4` | `puerto-nomina` | puente |
| `G6` | `recibo-nomina` | reflejo |
| `G7` | `acceso-nomina` | custodio |
| `G8` | `recibo-nomina` | reflejo |
| `G9` | `recibo-nomina` | reflejo |
| `G10` | `recibo-nomina` | reflejo |

**Eje `contabilidad-analitica` — 32 clases**

| clase | hoja (slug) | forma |
|---|---|---|
| `F1` | `inmovilizado` | custodio |
| `F2` | `inmovilizado` | custodio |
| `F3` | `inmovilizado` | custodio |
| `F4` | `inmovilizado` | custodio |
| `H1` | `valoracion-existencia` | reflejo |
| `H2` | `frontera-ficha-producto` | conversor |
| `H3` | `valoracion-existencia` | reflejo |
| `H4` | `valoracion-existencia` | reflejo |
| `I1` | `consolidacion-grupo` | reflejo |
| `I2` | `consolidacion-grupo` | reflejo |
| `I3` | `consolidacion-grupo` | reflejo |
| `I4` | `aislamiento-negocio` | custodio |
| `J1` | `etiquetado-analitico` | micro-agente |
| `J2` | `margen-analitico` | reflejo |
| `J3` | `presupuesto` | custodio |
| `J4` | `presupuesto` | custodio |
| `J5` | `margen-analitico` | reflejo |
| `J8` | `cuadro-mando-contable` | reflejo |
| `J9` | `presupuesto` | custodio |
| `J10` | `margen-analitico` | reflejo |
| `K1` | `onboarding-negocio` | custodio |
| `K2` | `motor-avisos` | puente |
| `K3` | `informe-rico` | reflejo |
| `K4` | `onboarding-negocio` | custodio |
| `K9` | `cola-declaraciones-criterio` | custodio |
| `Q1` | `consulta-dueno` | puente |
| `Q2` | `puente-lenguaje-dueno` | micro-agente |
| `Q3` | `consulta-dueno` | puente |
| `Q4` | `consulta-dueno` | puente |
| `R1` | `aviso-al-negocio` | puente |
| `R2` | `informe-accionable` | micro-agente |
| `R3` | `informe-accionable` | micro-agente |

---

## 3 · Las hojas CONSTRUIR — 7 etapas

> Plantilla (skill `enki-adaptador-disenos`): **A** dependencias · **B** `module.json` · **C** `index.js` · **D** proyecciones (`_op`, DONDE VIVE LA LOGICA) · **E** handlers RPC · **F** eventos de dominio · **VERIFICACION**.
> No se escribe codigo completo: el PLAN declara cada hoja (slug, forma, proposito, eventos, dependencias, proyecciones). La construccion es la FASE 4.

### 3.0 — El eslabon limitante: LA CADENA DE ADMISION (detalle)

```
[puerto-evento-vertical]   hechos ya emitidos por las verticales (VENTA/COBRO/PAGO/COMPRA/CONSUMO/CIERRE_JORNADA/RECTIFICATIVO)
       + [contrato-hecho-minimo]  el minimo EXIGIBLE por fuente (declarado, no impuesto)
       |
       +-- documentos:  [facturacion/fuentes] -> [facturas] (Intake/Convert/OCR)  == REUTILIZADO
       v
[normalizador-hecho]  UNICA puerta de formato (A2) + cuadre del documento (A4.3: si no cuadra -> cola)
       v  contabilidad.hecho_normalizado
[deduplicacion-hecho]  (A7 + M3 clave-natural): reprocesar NO duplica; un rectificativo no es duplicado
       v  contabilidad.hecho_nuevo
[resolucion-contrapartida]  PROPONE cuenta/tercero/periodo (fuzzy) <- [regla-contrapartida] corte DURO + [maestro-terceros] identidad
       v  contabilidad.contrapartida_propuesta
[escritor-diario]  EL cuello ENTREGA: partida doble verificada (suma debe = suma haber), single-writer, rechazo de duplicados
       |
       +-- valvula: lo dudoso NO bloquea -> [cola-revision] (2 colas: asesor | dueno) -> [aviso-revision] -> motor-avisos
       +-- accion:  [desatasco-entrada] resuelve/descarta con motivo -> regla candidata -> [ratificacion-regla-aprendida]
       +-- medida:  [completitud-cobertura] (metrica UNICA) -> [panel-proceso-contable] (tasa) / [aviso-cuadre] / [sello Q3]
       +-- asimetria con la fuente: [anclaje-cierre-vertical] (la fuente declara su cierre) + [declaracion-fuente-faltante] (se DECLARA, no se exige)
       +-- desacople: [lote-admision] (N hechos en paralelo; la serie no atasca el embudo)
```

**Bucle de aprendizaje (no de realimentacion de negocio):** `excepcion -> desatasco-entrada -> regla candidata -> ratificacion-regla-aprendida -> regla-contrapartida/regla-movimiento-bancario -> menos excepciones`. `frontera-planos` (M1) garantiza que nada de esto emite hechos de negocio.

### 3.1 — Oleada 1 · `contabilidad-entrada` (20 hojas CONSTRUIR)

### contrato-hecho-minimo — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.contrato.declarar.request` · `contabilidad.contrato.exigir.request` · `contabilidad.contrato.cubre.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"contrato-hecho-minimo" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.contrato.declarar.request","contabilidad.contrato.exigir.request","contabilidad.contrato.cubre.request","project.activated"];
                       publishes:  ["contabilidad.contrato_declarado","contabilidad.contrato.declarar.response","contabilidad.contrato.declarar.failed","contabilidad.contrato.exigir.response","contabilidad.contrato.exigir.failed","contabilidad.contrato.cubre.response","contabilidad.contrato.cubre.failed","contabilidad.contrato_declarado.failed"];
                       _doc: "El minimo EXIGIBLE por fuente (declarado por dueno/jefe), visto desde la fuente: no un formato impuesto.".
C. INDEX.JS            class ContratoHechoMinimo extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, vertical, campos) — un solo escritor del minimo por vertical
                       · _exigir — exigir(vertical) -> Set<Campo>
                       · _cubre — cubre(vertical, hecho) -> ok | Set<Campo> faltantes
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onExigirRequest -> _atender(e, 'exigir', ...) | onCubreRequest -> _atender(e, 'cubre', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.contrato_declarado` · `contabilidad.contrato.declarar.failed` · `contabilidad.contrato.exigir.failed` · `contabilidad.contrato.cubre.failed` · `contabilidad.contrato_declarado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: ningun modulo del inventario declara un contrato minimo de hecho por vertical; los contratos de entrada viven en cada vertical productora.
```

### anclaje-cierre-vertical — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.anclaje.declarar.request` · `contabilidad.anclaje.anclar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"anclaje-cierre-vertical" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.anclaje.declarar.request","contabilidad.anclaje.anclar.request","project.activated"];
                       publishes:  ["contabilidad.anclaje_declarado","contabilidad.anclaje.declarar.response","contabilidad.anclaje.declarar.failed","contabilidad.anclaje.anclar.response","contabilidad.anclaje.anclar.failed","contabilidad.anclaje_declarado.failed"];
                       _doc: "Declara POR FUENTE que es un cierre y como se identifica; ancla la clave natural. Su contenido pende de la unidad_de_cierre (M4, declarable).".
C. INDEX.JS            class AnclajeCierreVertical extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, vertical, definicion) — un solo escritor (DUENO)
                       · _anclar — anclar(vertical, hecho) -> ClaveNatural
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onAnclarRequest -> _atender(e, 'anclar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.anclaje_declarado` · `contabilidad.anclaje.declarar.failed` · `contabilidad.anclaje.anclar.failed` · `contabilidad.anclaje_declarado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: la definicion de cierre por vertical no existe en el inventario; el cierre de caja existente es de la operacion (mono-negocio) y aqui llega como HECHO observado.
```

### cola-revision — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.excepcion.encolar.request` · `contabilidad.excepcion.resolver.request` · `contabilidad.excepcion.siguiente.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"cola-revision" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.excepcion.encolar.request","contabilidad.excepcion.resolver.request","contabilidad.excepcion.siguiente.request","project.activated"];
                       publishes:  ["contabilidad.excepcion_encolada","contabilidad.excepcion_resuelta","contabilidad.excepcion.encolar.response","contabilidad.excepcion.encolar.failed","contabilidad.excepcion.resolver.response","contabilidad.excepcion.resolver.failed","contabilidad.excepcion.siguiente.response","contabilidad.excepcion.siguiente.failed","contabilidad.excepcion_encolada.failed","contabilidad.excepcion_resuelta.failed"];
                       _doc: "DOS colas de excepciones (asesor / dueno) por naturaleza; el flujo NUNCA se bloquea. Un solo escritor por cola.".
C. INDEX.JS            class ColaRevision extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _encolar — routing por naturaleza de la excepcion -> cola ASESOR | cola DUENO
                       · _siguiente — siguiente(cola) -> Excepcion | VACIA
                       · _resolver — resolver(rol, excepcion, resolucion) — guard de escritor por cola
E. HANDLERS RPC        onEncolarRequest -> _atender(e, 'encolar', ...) | onResolverRequest -> _atender(e, 'resolver', ...) | onSiguienteRequest -> _atender(e, 'siguiente', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.excepcion_encolada` · `contabilidad.excepcion_resuelta` · `contabilidad.excepcion.encolar.failed` · `contabilidad.excepcion.resolver.failed` · `contabilidad.excepcion.siguiente.failed` · `contabilidad.excepcion_encolada.failed` · `contabilidad.excepcion_resuelta.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe modulo de cola de revision contable en el inventario; `manejo-fallo` (nichos) es fallo de canal, otro dominio (patron tomado).
```

### regla-contrapartida — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.regla.leer.request` · `contabilidad.regla.declarar.request` · `contabilidad.regla.aprender.request` · `contabilidad.regla_ratificada` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"regla-contrapartida" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.regla.leer.request","contabilidad.regla.declarar.request","contabilidad.regla.aprender.request","contabilidad.regla_ratificada","project.activated"];
                       publishes:  ["contabilidad.regla_declarada","contabilidad.regla_aprendida","contabilidad.regla.leer.response","contabilidad.regla.leer.failed","contabilidad.regla.declarar.response","contabilidad.regla.declarar.failed","contabilidad.regla.aprender.response","contabilidad.regla.aprender.failed","contabilidad.regla_declarada.failed","contabilidad.regla_aprendida.failed"];
                       _doc: "Repositorio de reglas declaradas/aprendidas ("este proveedor -> esta cuenta"). Una regla APRENDIDA no actua hasta ser RATIFICADA (L10).".
C. INDEX.JS            class ReglaContrapartida extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, regla) — un solo escritor (DUENO/ASESOR)
                       · _aplicar — aplicar(hecho) -> Contrapartida | SIN_COBERTURA
                       · _aprender — aprender(rol, regla, evidencia) — el aprendizaje entra HIDRATADO y queda PENDIENTE de ratificacion
E. HANDLERS RPC        onLeerRequest -> _atender(e, 'leer', ...) | onDeclararRequest -> _atender(e, 'declarar', ...) | onAprenderRequest -> _atender(e, 'aprender', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.regla_declarada` · `contabilidad.regla_aprendida` · `contabilidad.regla.leer.failed` · `contabilidad.regla.declarar.failed` · `contabilidad.regla.aprender.failed` · `contabilidad.regla_declarada.failed` · `contabilidad.regla_aprendida.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: repositorio de reglas contables por negocio; `reglas-aprendidas` (nichos) es umbrales de viabilidad, otro dominio (patron tomado).
```

### lote-admision — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.lote.despachar.request`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"lote-admision" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.lote.despachar.request"];
                       publishes:  ["contabilidad.lote_despachado","contabilidad.lote.despachar.response","contabilidad.lote.despachar.failed","contabilidad.lote_despachado.failed"];
                       _doc: "DESACOPLE del cuello: la admision no se hace en serie (N hechos en paralelo). Mecanico, cero juicio.".
C. INDEX.JS            class LoteAdmision extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _lotear — lotear(cola) -> List<Hecho>
                       · _despachar — despachar(lote) -> ok — consumido por AMBAS puertas (hechos y documentos)
E. HANDLERS RPC        onDespacharRequest -> _atender(e, 'despachar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.lote_despachado` · `contabilidad.lote.despachar.failed` · `contabilidad.lote_despachado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: el paralelismo declarable de la admision no existe en el inventario.
```

### puerto-evento-vertical — puente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.hecho.admitir.request` · `contabilidad.contrato_declarado` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `contrato-hecho-minimo`.
B. MODULE.JSON         name:"puerto-evento-vertical" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.hecho.admitir.request","contabilidad.contrato_declarado","project.activated"];
                       publishes:  ["contabilidad.hecho_admitido","contabilidad.hecho.admitir.response","contabilidad.hecho.admitir.failed","contabilidad.hecho_admitido.failed"];
                       _doc: "PUERTA de los hechos ya emitidos por las verticales. Contabilidad LEE, no impone: la fuente manda en formato, granularidad y ritmo.".
C. INDEX.JS            class PuertoEventoVertical extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _admitir — admitir(hecho) -> ok — valida la forma minima de entrada, no el contenido
                       · _reconectar — reconectar(fuente) — el puerto es reemplazable, la fuente manda
                       · _declararHueco — si no hay fuente -> senal a A15, nunca se fuerza
E. HANDLERS RPC        onAdmitirRequest -> _atender(e, 'admitir', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.hecho_admitido` · `contabilidad.hecho.admitir.failed` · `contabilidad.hecho_admitido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: ningun modulo del inventario recibe hechos heterogeneos de otras verticales; un adaptador por fuente se pone en el sitio de despliegue.
```

### historial-proceso-contable — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.historial.anotar.request` · `contabilidad.historial.consultar.request` · `contabilidad.hecho_admitido` · `contabilidad.excepcion_encolada` · `contabilidad.excepcion_resuelta` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"historial-proceso-contable" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.historial.anotar.request","contabilidad.historial.consultar.request","contabilidad.hecho_admitido","contabilidad.excepcion_encolada","contabilidad.excepcion_resuelta","project.activated"];
                       publishes:  ["contabilidad.historial_anotado","contabilidad.historial.anotar.response","contabilidad.historial.anotar.failed","contabilidad.historial.consultar.response","contabilidad.historial.consultar.failed","contabilidad.historial_anotado.failed"];
                       _doc: "Registro append-only de lo PROCESADO y lo FALLADO con su rastro. Solo crece; nunca se reescribe.".
C. INDEX.JS            class HistorialProcesoContable extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _anotar — anotar(entrada) — single-writer ADMISION
                       · _consultar — consultar(desde, hasta) -> Historial
E. HANDLERS RPC        onAnotarRequest -> _atender(e, 'anotar', ...) | onConsultarRequest -> _atender(e, 'consultar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.historial_anotado` · `contabilidad.historial.anotar.failed` · `contabilidad.historial.consultar.failed` · `contabilidad.historial_anotado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: es el historial del PROCESO de entrada, distinto de `traza-asiento` (B4, del asiento) y de `historial-nicho` (otro dominio).
```

### maestro-terceros — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.tercero.declarar.request` · `contabilidad.tercero.ficha.request` · `contabilidad.tercero.identificar.request` · `contabilidad.tercero.historial.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"maestro-terceros" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.tercero.declarar.request","contabilidad.tercero.ficha.request","contabilidad.tercero.identificar.request","contabilidad.tercero.historial.request","project.activated"];
                       publishes:  ["contabilidad.tercero_declarado","contabilidad.tercero_identificado","contabilidad.tercero.declarar.response","contabilidad.tercero.declarar.failed","contabilidad.tercero.ficha.response","contabilidad.tercero.ficha.failed","contabilidad.tercero.identificar.response","contabilidad.tercero.identificar.failed","contabilidad.tercero.historial.response","contabilidad.tercero.historial.failed","contabilidad.tercero_declarado.failed","contabilidad.tercero_identificado.failed"];
                       _doc: "MAESTRO UNICO del tercero con ROLES (conflicto 1 resuelto): ficha funcional + identidad por NIF en la MISMA parcela.".
C. INDEX.JS            class MaestroTerceros extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        6 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, tercero) — un solo escritor (DUENO/ASESOR)
                       · _ficha — ficha(idTercero) -> Tercero
                       · _historial — historial(idTercero) -> List<IdAsiento|IdDocumento>
                       · _anadirRol — anadirRol(idTercero, rol) — cliente+proveedor NO duplica al tercero
                       · _identificar — identificar(nif, nombreFiscal) -> IdTercero (N2, faceta de identidad)
                       · _unificar — unificar(idA, idB, evidencia) -> IdTercero — "un proveedor escrito de tres formas = uno"
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onFichaRequest -> _atender(e, 'ficha', ...) | onIdentificarRequest -> _atender(e, 'identificar', ...) | onHistorialRequest -> _atender(e, 'historial', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.tercero_declarado` · `contabilidad.tercero_identificado` · `contabilidad.tercero.declarar.failed` · `contabilidad.tercero.ficha.failed` · `contabilidad.tercero.identificar.failed` · `contabilidad.tercero.historial.failed` · `contabilidad.tercero_declarado.failed` · `contabilidad.tercero_identificado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe maestro fiscal de terceros en el inventario (N1+N2 se funden en UNA parcela, decision del dueno).
```

### normalizador-hecho — conversor (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.hecho.normalizar.request` · `contabilidad.hecho_admitido` · `factura.procesada`.
                       Depende (por EVENTO, sin require cruzado): `puerto-evento-vertical` · `contrato-hecho-minimo` · `facturas` · `facturacion/fuentes` · `lote-admision`.
B. MODULE.JSON         name:"normalizador-hecho" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.hecho.normalizar.request","contabilidad.hecho_admitido","factura.procesada"];
                       publishes:  ["contabilidad.hecho_normalizado","contabilidad.documento_descuadrado","contabilidad.hecho.normalizar.response","contabilidad.hecho.normalizar.failed","contabilidad.hecho_normalizado.failed","contabilidad.documento_descuadrado.failed"];
                       _doc: "UNICA puerta de FORMATO (A2) + control de cuadre del documento (A4.3): homogeneiza a forma asentable y jamas asienta "casi cuadrado".".
C. INDEX.JS            class NormalizadorHecho extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _homogeneizar — homogeneizar(hechoCrudo) -> Hecho — unica puerta de formato
                       · _mapear — mapear(camposFuente, camposInternos) -> Hecho
                       · _detectarFaltantes — detectarFaltantes(hecho) -> Set<Campo> -> excepcion/pregunta (lo que falta NO se rellena)
                       · _cuadrarDocumento — cuadrarDocumento(campos) -> Cuadrado | Descuadre (suma bases + suma impuestos = total; tolerancia declarable)
E. HANDLERS RPC        onNormalizarRequest -> _atender(e, 'normalizar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.hecho_normalizado` · `contabilidad.documento_descuadrado` · `contabilidad.hecho.normalizar.failed` · `contabilidad.hecho_normalizado.failed` · `contabilidad.documento_descuadrado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke leer/escribir en las dos direcciones del formato + caso de forma NO declarada.
NO REUTILIZA / NOTA    NO REUTILIZA: `facturas` entrega el dato extraido, no la forma asentable de contabilidad (contrato A11 + clave natural A14). El cuadre determinista es propio.
```

### deduplicacion-hecho — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.duplicado.verificar.request` · `contabilidad.hecho_normalizado`.
                       Depende (por EVENTO, sin require cruzado): `clave-natural`.
B. MODULE.JSON         name:"deduplicacion-hecho" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.duplicado.verificar.request","contabilidad.hecho_normalizado"];
                       publishes:  ["contabilidad.hecho_nuevo","contabilidad.hecho_duplicado","contabilidad.duplicado.verificar.response","contabilidad.duplicado.verificar.failed","contabilidad.hecho_nuevo.failed","contabilidad.hecho_duplicado.failed"];
                       _doc: "ANTI-BUCLE: aplica la clave natural. Reprocesar NO duplica; un rectificativo no es duplicado.".
C. INDEX.JS            class DeduplicacionHecho extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _esDuplicado — esDuplicado(hecho) -> Duplicado | Nuevo (determinista, test lo afirma)
                       · _marcarProcesado — marcarProcesado(clave) -> ok
E. HANDLERS RPC        onVerificarRequest -> _atender(e, 'verificar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.hecho_nuevo` · `contabilidad.hecho_duplicado` · `contabilidad.duplicado.verificar.failed` · `contabilidad.hecho_nuevo.failed` · `contabilidad.hecho_duplicado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la idempotencia por clave natural es el cerrojo 3 del dominio; ningun modulo del inventario lo aplica.
```

### resolucion-contrapartida — micro-agente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.contrapartida.proponer.request` · `contabilidad.hecho_nuevo`.
                       Depende (por EVENTO, sin require cruzado): `normalizador-hecho` · `catalogo-cuentas` · `regla-contrapartida` · `maestro-terceros` · `deduplicacion-hecho`.
B. MODULE.JSON         name:"resolucion-contrapartida" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.contrapartida.proponer.request","contabilidad.hecho_nuevo"];
                       publishes:  ["contabilidad.contrapartida_propuesta","contabilidad.contrapartida.proponer.response","contabilidad.contrapartida.proponer.failed","contabilidad.contrapartida_propuesta.failed"];
                       _doc: "PROPONE cuenta/tercero/periodo (juicio con ambiguedad contra el plan declarado). El corte DURO lo fija la regla (A6.2).".
C. INDEX.JS            class ResolucionContrapartida extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _proponer — proponer(hecho) -> ContrapartidaPropuesta {cuenta, tercero, periodo} — FUZZY (LLM)
                       · _justificar — justificar(propuesta) -> Explicacion (base de L2)
                       · _alzarExcepcion — ambiguedad alta y sin regla -> excepcion a cola (A8.1), no se asienta
E. HANDLERS RPC        onProponerRequest -> _atender(e, 'proponer', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.contrapartida_propuesta` · `contabilidad.contrapartida.proponer.failed` · `contabilidad.contrapartida_propuesta.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe resolucion de contrapartida contable en el inventario (IVA/plan/diario = 0 modulos).
```

### completitud-cobertura — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.cobertura.calcular.request` · `contabilidad.anclaje_declarado` · `contabilidad.hecho_admitido`.
                       Depende (por EVENTO, sin require cruzado): `clave-natural` · `anclaje-cierre-vertical`.
B. MODULE.JSON         name:"completitud-cobertura" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cobertura.calcular.request","contabilidad.anclaje_declarado","contabilidad.hecho_admitido"];
                       publishes:  ["contabilidad.cobertura_calculada","contabilidad.cobertura.calcular.response","contabilidad.cobertura.calcular.failed","contabilidad.cobertura_calculada.failed"];
                       _doc: "EL UNICO CALCULADOR de cobertura (conflicto 2 resuelto): esperados / recibidos / huecos / tasa. Q3, P4 y C6 son VISTAS suyas.".
C. INDEX.JS            class CompletitudCobertura extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _calcular — calcular(periodo) -> Cobertura {esperados, recibidos, huecos, tasa}
                       · _huecos — huecos() -> Set<ClaveHecho> — alimenta A15, C6, Q3, P4
E. HANDLERS RPC        onCalcularRequest -> _atender(e, 'calcular', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cobertura_calculada` · `contabilidad.cobertura.calcular.failed` · `contabilidad.cobertura_calculada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la metrica de cobertura de la ENTRADA es el corazon del cuello; no existe equivalente en el inventario.
```

### hecho-rectificativo — puente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.rectificativo.emparejar.request` · `contabilidad.hecho_admitido`.
                       Depende (por EVENTO, sin require cruzado): `clave-natural`.
B. MODULE.JSON         name:"hecho-rectificativo" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.rectificativo.emparejar.request","contabilidad.hecho_admitido"];
                       publishes:  ["contabilidad.hecho_rectificado","contabilidad.rectificativo.emparejar.response","contabilidad.rectificativo.emparejar.failed","contabilidad.hecho_rectificado.failed"];
                       _doc: "Plano 2 de los 4 planos de correccion: el hecho posterior que corrige/anula casa con su original POR CLAVE NATURAL. NO borra: ANADE.".
C. INDEX.JS            class HechoRectificativo extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _emparejar — emparejar(rectificativo, original) -> ok | ERROR_ORIGINAL_NO_HALLADO
                       · _emitir — emitir(hecho, ajuste) -> asiento de ajuste (B5), nunca borrado
E. HANDLERS RPC        onEmparejarRequest -> _atender(e, 'emparejar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.hecho_rectificado` · `contabilidad.rectificativo.emparejar.failed` · `contabilidad.hecho_rectificado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: la correccion no destructiva por clave natural es propia del dominio contable.
```

### panel-proceso-contable — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.panel.latido.request`.
                       Depende (por EVENTO, sin require cruzado): `cola-revision` · `historial-proceso-contable` · `completitud-cobertura`.
B. MODULE.JSON         name:"panel-proceso-contable" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.panel.latido.request"];
                       publishes:  ["contabilidad.panel_latido","contabilidad.panel.latido.response","contabilidad.panel.latido.failed","contabilidad.panel_latido.failed"];
                       _doc: "Latido del proceso de admision (que entra, que se procesa, que esta en cola, que falla) + la TASA que PRUEBA la promesa "sin una persona digitando".".
C. INDEX.JS            class PanelProcesoContable extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _latido — latido() -> Panel — agregacion determinista
                       · _tasaCobertura — tasaCobertura() -> Tasa (P4, vista de la metrica unica A12)
E. HANDLERS RPC        onLatidoRequest -> _atender(e, 'latido', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.panel_latido` · `contabilidad.panel.latido.failed` · `contabilidad.panel_latido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: no existe panel de proceso contable; es el "display" de la entrada.
```

### desatasco-entrada — micro-agente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.desatasco.resolver.request` · `contabilidad.excepcion_encolada`.
                       Depende (por EVENTO, sin require cruzado): `cola-revision` · `catalogo-cuentas` · `regla-contrapartida` · `regla-movimiento-bancario` · `ratificacion-regla-aprendida`.
B. MODULE.JSON         name:"desatasco-entrada" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.desatasco.resolver.request","contabilidad.excepcion_encolada"];
                       publishes:  ["contabilidad.excepcion_desatascada","contabilidad.regla_aprendida","contabilidad.desatasco.resolver.response","contabilidad.desatasco.resolver.failed","contabilidad.excepcion_desatascada.failed","contabilidad.regla_aprendida.failed"];
                       _doc: "LA ACCION que completa la cola: resolver / reencolar / descartar con MOTIVO. Produce la regla candidata que NO actua hasta ser ratificada (L10).".
C. INDEX.JS            class DesatascoEntrada extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _resolver — resolver(excepcion, decision) -> Resolucion | REENColar | DescartarConMotivo — FUZZY
                       · _producirRegla — producirRegla(resolucion, evidencia) -> ReglaDeclarada candidata (aprendizaje hidratado)
E. HANDLERS RPC        onResolverRequest -> _atender(e, 'resolver', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.excepcion_desatascada` · `contabilidad.regla_aprendida` · `contabilidad.desatasco.resolver.failed` · `contabilidad.excepcion_desatascada.failed` · `contabilidad.regla_aprendida.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: el bucle excepcion -> regla -> menos excepciones es el corazon del cuello y no existe en el inventario.
```

### cuenta-terceros — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.cuenta_terceros.saldo.request` · `contabilidad.cuenta_terceros.extracto.request` · `contabilidad.cuenta_terceros.vencimiento.request` · `contabilidad.cuenta_terceros.aging.request`.
                       Depende (por EVENTO, sin require cruzado): `maestro-terceros` · `mayor-balanza` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"cuenta-terceros" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cuenta_terceros.saldo.request","contabilidad.cuenta_terceros.extracto.request","contabilidad.cuenta_terceros.vencimiento.request","contabilidad.cuenta_terceros.aging.request"];
                       publishes:  ["contabilidad.cuenta_terceros_calculada","contabilidad.cuenta_terceros.saldo.response","contabilidad.cuenta_terceros.saldo.failed","contabilidad.cuenta_terceros.extracto.response","contabilidad.cuenta_terceros.extracto.failed","contabilidad.cuenta_terceros.vencimiento.response","contabilidad.cuenta_terceros.vencimiento.failed","contabilidad.cuenta_terceros.aging.response","contabilidad.cuenta_terceros.aging.failed","contabilidad.cuenta_terceros_calculada.failed"];
                       _doc: "Mayor AUXILIAR del tercero DERIVADO del libro (nunca almacen paralelo): facturas vivas, saldo, extracto confrontable, vencimientos y antiguedad por lado.".
C. INDEX.JS            class CuentaTerceros extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        6 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _facturasVivas — facturasVivas(idTercero) -> List<IdAsiento> (N3)
                       · _saldo — saldo(idTercero) -> Importe (N3)
                       · _extracto — extracto(idTercero, desde, hasta) -> DocumentoConfrontable (N4)
                       · _calcularVencimiento — calcularVencimiento(factura) -> Fecha desde la politica declarada (N6)
                       · _estaVencido — estaVencido(factura, hoy) -> Bool (N6)
                       · _clasificarPorVencimiento — clasificarPorVencimiento(lado, hoy) -> AgingReport POR_COBRAR | POR_PAGAR (N8)
E. HANDLERS RPC        onSaldoRequest -> _atender(e, 'saldo', ...) | onExtractoRequest -> _atender(e, 'extracto', ...) | onVencimientoRequest -> _atender(e, 'vencimiento', ...) | onAgingRequest -> _atender(e, 'aging', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cuenta_terceros_calculada` · `contabilidad.cuenta_terceros.saldo.failed` · `contabilidad.cuenta_terceros.extracto.failed` · `contabilidad.cuenta_terceros.vencimiento.failed` · `contabilidad.cuenta_terceros.aging.failed` · `contabilidad.cuenta_terceros_calculada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: las vistas por rol del tercero (auxiliar, extracto, vencimientos) cuelgan del libro de ESTA vertical.
```

### compra-proveedor — reflejo (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.compra.cotejar.request` · `contabilidad.compra.coste_real.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `maestro-terceros`.
B. MODULE.JSON         name:"compra-proveedor" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.compra.cotejar.request","contabilidad.compra.coste_real.request"];
                       publishes:  ["contabilidad.compra_cotejada","contabilidad.compra.cotejar.response","contabilidad.compra.cotejar.failed","contabilidad.compra.coste_real.response","contabilidad.compra.coste_real.failed","contabilidad.compra_cotejada.failed"];
                       _doc: "La compra VERIFICADA antes de asentar: cotejo pedido <-> recepcion <-> factura (N5) y ajuste del coste real por rappels/anticipos (N7).".
C. INDEX.JS            class CompraProveedor extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _cotejar — cotejar(pedido, recepcion, factura) -> Cuadra | Descuadre -> cola (N5). Si el negocio no coteja (declarable), se asienta directo y SE DECLARA
                       · _ajustarCosteReal — ajustarCosteReal(factura) -> Importe a lo realmente pagado (N7); el ajuste SUMA
E. HANDLERS RPC        onCotejarRequest -> _atender(e, 'cotejar', ...) | onCoste_realRequest -> _atender(e, 'coste_real', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.compra_cotejada` · `contabilidad.compra.cotejar.failed` · `contabilidad.compra.coste_real.failed` · `contabilidad.compra_cotejada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: no existe cotejo compra/recepcion/factura en el inventario.
```

### emision-factura-venta — custodio (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.factura.emitir.request` · `contabilidad.factura.rectificar.request` · `contabilidad.factura.series.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `maestro-terceros` · `catalogo-cuentas` · `escritor-diario`.
B. MODULE.JSON         name:"emision-factura-venta" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.factura.emitir.request","contabilidad.factura.rectificar.request","contabilidad.factura.series.request","project.activated"];
                       publishes:  ["contabilidad.factura_emitida","contabilidad.factura_rectificada","contabilidad.factura.emitir.response","contabilidad.factura.emitir.failed","contabilidad.factura.rectificar.response","contabilidad.factura.rectificar.failed","contabilidad.factura.series.response","contabilidad.factura.series.failed","contabilidad.factura_emitida.failed","contabilidad.factura_rectificada.failed"];
                       _doc: "Cara EMITIDA con serie/numeracion fiscal: numeracion correlativa SIN SALTOS. Un solo escritor (numero duplicado = corrupcion).".
C. INDEX.JS            class EmisionFacturaVenta extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _emitir — emitir(factura) -> FacturaEmitida — asigna numero correlativo; ticket o factura completa segun el TIPO (dato del hecho)
                       · _series — series() -> List<IdSerie> (por negocio/canal/unica — declarable)
                       · _rectificarSustitutiva — rectificarSustitutiva(serie, rectificativa) -> OK | ERROR (O2)
                       · _calcularAjuste — calcularAjuste(original, motivo) -> Importe — abono/devolucion/descuento; NO borra (O2)
E. HANDLERS RPC        onEmitirRequest -> _atender(e, 'emitir', ...) | onRectificarRequest -> _atender(e, 'rectificar', ...) | onSeriesRequest -> _atender(e, 'series', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.factura_emitida` · `contabilidad.factura_rectificada` · `contabilidad.factura.emitir.failed` · `contabilidad.factura.rectificar.failed` · `contabilidad.factura.series.failed` · `contabilidad.factura_emitida.failed` · `contabilidad.factura_rectificada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe emision de factura con serie fiscal en el inventario (fiscal en Enki = 0 modulos). `prisma/ticket` formatea texto, no emite documento fiscal (patron de formato tomado).
```

### declaracion-fuente-faltante — puente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.cobertura_calculada`.
                       Depende (por EVENTO, sin require cruzado): `completitud-cobertura` · `motor-avisos`.
B. MODULE.JSON         name:"declaracion-fuente-faltante" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cobertura_calculada"];
                       publishes:  ["contabilidad.fuente_faltante_declarada","contabilidad.aviso.solicitar.request","contabilidad.fuente_faltante.failed","contabilidad.fuente_faltante_declarada.failed","contabilidad.aviso.solicitar.failed"];
                       _doc: "Si una vertical NO publica un hecho que se necesita, se DECLARA el hueco (abierto + aviso). NUNCA se obliga a la fuente a producirlo.".
C. INDEX.JS            class DeclaracionFuenteFaltante extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _detectarHueco — detectarHueco(cobertura) -> Hueco (reflejo interno)
                       · _declarar — declarar(hueco) -> aviso (K2) + marca [ABIERTO]
E. HANDLERS RPC        no declara ops propias: solo reacciona a eventos de dominio.
F. EVENTOS DE DOMINIO  publica `contabilidad.fuente_faltante_declarada` · `contabilidad.aviso.solicitar.request` · `contabilidad.fuente_faltante.failed` · `contabilidad.fuente_faltante_declarada.failed` · `contabilidad.aviso.solicitar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: la asimetria con la vertical subordinada es propia de esta vertical (fuente: prisma de interlocutor `verticales`).
```

### aviso-revision — puente (CONSTRUIR · contabilidad-entrada)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.excepcion_encolada`.
                       Depende (por EVENTO, sin require cruzado): `cola-revision` · `motor-avisos`.
B. MODULE.JSON         name:"aviso-revision" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.excepcion_encolada"];
                       publishes:  ["contabilidad.aviso.solicitar.request","contabilidad.aviso_revision_solicitado","contabilidad.aviso.solicitar.failed","contabilidad.aviso_revision_solicitado.failed"];
                       _doc: "Empujon al motor de avisos: "esto necesita revision". Conecta por senal; no resuelve ni decide nada.".
C. INDEX.JS            class AvisoRevision extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        1 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _avisar — avisar(excepcion) -> senal a motor-avisos (K2) con el motivo y la cola de destino
E. HANDLERS RPC        no declara ops propias: solo reacciona a eventos de dominio.
F. EVENTOS DE DOMINIO  publica `contabilidad.aviso.solicitar.request` · `contabilidad.aviso_revision_solicitado` · `contabilidad.aviso.solicitar.failed` · `contabilidad.aviso_revision_solicitado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: el aviso de revision nace de la cola de ESTA vertical; K2 (motor-avisos) solo lo produce/entrega.
```

### 3.2 — Oleada 2 · `contabilidad-libro` (22 hojas CONSTRUIR)

### clave-natural — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.clave.calcular.request` · `contabilidad.clave.repeticion.request`.
                       Depende (por EVENTO, sin require cruzado): `anclaje-cierre-vertical` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"clave-natural" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.clave.calcular.request","contabilidad.clave.repeticion.request"];
                       publishes:  ["contabilidad.clave_calculada","contabilidad.clave.calcular.response","contabilidad.clave.calcular.failed","contabilidad.clave.repeticion.response","contabilidad.clave.repeticion.failed","contabilidad.clave_calculada.failed"];
                       _doc: "CERROJO 3 · idempotencia: mismos componentes => mismo hecho => mismo asiento. Un solo calculador de la clave.".
C. INDEX.JS            class ClaveNatural extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _calcular — calcular(hechoODocumento) -> ClaveNatural (cuelga de A14 / unidad_de_cierre)
                       · _esRepeticion — esRepeticion(clave, yaAsentados) -> Bool — test unitario lo afirma
E. HANDLERS RPC        onCalcularRequest -> _atender(e, 'calcular', ...) | onRepeticionRequest -> _atender(e, 'repeticion', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.clave_calculada` · `contabilidad.clave.calcular.failed` · `contabilidad.clave.repeticion.failed` · `contabilidad.clave_calculada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la clave natural es la invariante anti-bucle de ESTA vertical; ningun modulo del inventario la calcula.
```

### single-writer — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.parcela.registrar.request` · `contabilidad.parcela.autorizar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"single-writer" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.parcela.registrar.request","contabilidad.parcela.autorizar.request","project.activated"];
                       publishes:  ["contabilidad.parcela_registrada","contabilidad.parcela_autorizada","contabilidad.parcela.registrar.response","contabilidad.parcela.registrar.failed","contabilidad.parcela.autorizar.response","contabilidad.parcela.autorizar.failed","contabilidad.parcela_registrada.failed","contabilidad.parcela_autorizada.failed"];
                       _doc: "CERROJO 2 · la ley que gobierna a TODO custodio: un unico escritor por parcela. Los custodios registran su parcela y su rol autorizado.".
C. INDEX.JS            class SingleWriter extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _autorizar — autorizar(parcela, rol) -> ok
                       · _escribir — escribir(parcela, rol, cambio) -> ok | ERROR_DOS_ESCRITORES
E. HANDLERS RPC        onRegistrarRequest -> _atender(e, 'registrar', ...) | onAutorizarRequest -> _atender(e, 'autorizar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.parcela_registrada` · `contabilidad.parcela_autorizada` · `contabilidad.parcela.registrar.failed` · `contabilidad.parcela.autorizar.failed` · `contabilidad.parcela_registrada.failed` · `contabilidad.parcela_autorizada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el guard de escritor por parcela es la invariante transversal del dominio; no existe modulo que lo gobierne.
```

### frontera-planos — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.frontera_planos.verificar.request`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"frontera-planos" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.frontera_planos.verificar.request"];
                       publishes:  ["contabilidad.frontera_planos_verificada","contabilidad.frontera_planos.verificar.response","contabilidad.frontera_planos.verificar.failed","contabilidad.frontera_planos_verificada.failed"];
                       _doc: "CERROJO 1 · anti-realimentacion: contabilidad emite CALCULOS; si un contrato pretende ser un HECHO de negocio -> rechazo determinista.".
C. INDEX.JS            class FronteraPlanos extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        1 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _verificar — verificar(emision) -> ok | ERROR_FUGA (prefijo del espacio de CALCULOS contabilidad.*)
E. HANDLERS RPC        onVerificarRequest -> _atender(e, 'verificar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.frontera_planos_verificada` · `contabilidad.frontera_planos.verificar.failed` · `contabilidad.frontera_planos_verificada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: cerrojo propio del dominio contable (la identidad "observadora que no produce hechos" se verifica aqui).
```

### catalogo-cuentas — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.cuenta.declarar.request` · `contabilidad.cuenta.resolver.request` · `contabilidad.plan.importar.request` · `contabilidad.plan.exportar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"catalogo-cuentas" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cuenta.declarar.request","contabilidad.cuenta.resolver.request","contabilidad.plan.importar.request","contabilidad.plan.exportar.request","project.activated"];
                       publishes:  ["contabilidad.cuenta_declarada","contabilidad.plan_importado","contabilidad.plan_exportado","contabilidad.cuenta.declarar.response","contabilidad.cuenta.declarar.failed","contabilidad.cuenta.resolver.response","contabilidad.cuenta.resolver.failed","contabilidad.plan.importar.response","contabilidad.plan.importar.failed","contabilidad.plan.exportar.response","contabilidad.plan.exportar.failed","contabilidad.cuenta_declarada.failed","contabilidad.plan_importado.failed","contabilidad.plan_exportado.failed"];
                       _doc: "Plan contable DECLARABLE/IMPORTABLE (lo aporta el negocio o el asesor) + frontera unica de codificacion (B6). Un solo escritor.".
C. INDEX.JS            class CatalogoCuentas extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, cuenta) — un solo escritor
                       · _resolver — resolver(codigo) -> Cuenta | NO_EXISTE
                       · _importar — importar(origen) -> List<Cuenta> (B6, unico cruce de formatos del plan)
                       · _exportar — exportar(catalogo) -> DocumentoPlan (B6)
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onResolverRequest -> _atender(e, 'resolver', ...) | onImportarRequest -> _atender(e, 'importar', ...) | onExportarRequest -> _atender(e, 'exportar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cuenta_declarada` · `contabilidad.plan_importado` · `contabilidad.plan_exportado` · `contabilidad.cuenta.declarar.failed` · `contabilidad.cuenta.resolver.failed` · `contabilidad.plan.importar.failed` · `contabilidad.plan.exportar.failed` · `contabilidad.cuenta_declarada.failed` · `contabilidad.plan_importado.failed` · `contabilidad.plan_exportado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe plan contable en el inventario; el formato declarable del asesor es DATO (K9).
```

### escritor-diario — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.asiento.asentar.request` · `contabilidad.asiento.apertura.request` · `contabilidad.asiento.cierre.request` · `contabilidad.asiento.ajustar.request` · `contabilidad.contrapartida_propuesta` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `catalogo-cuentas` · `clave-natural` · `single-writer`.
B. MODULE.JSON         name:"escritor-diario" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.asiento.asentar.request","contabilidad.asiento.apertura.request","contabilidad.asiento.cierre.request","contabilidad.asiento.ajustar.request","contabilidad.contrapartida_propuesta","project.activated"];
                       publishes:  ["contabilidad.asiento_asentado","contabilidad.asiento_rechazado","contabilidad.asiento.asentar.response","contabilidad.asiento.asentar.failed","contabilidad.asiento.apertura.response","contabilidad.asiento.apertura.failed","contabilidad.asiento.cierre.response","contabilidad.asiento.cierre.failed","contabilidad.asiento.ajustar.response","contabilidad.asiento.ajustar.failed","contabilidad.asiento_asentado.failed","contabilidad.asiento_rechazado.failed"];
                       _doc: "EL custodio del libro: single-writer por parcela, verifica partida doble ANTES de aceptar y rechaza duplicados por clave natural. Aqui entrega el cuello.".
C. INDEX.JS            class EscritorDiario extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _asentar — asentar(rol, asiento) -> ok | ERROR_DESCUADRE | ERROR_DUPLICADO (suma debe = suma haber)
                       · _registrarApertura — registrarApertura(apertura) -> ok
                       · _registrarCierre — registrarCierre(cierre) -> ok
                       · _componerDesdeContrapartida — compone los apuntes desde el hecho + la contrapartida recibida (proyeccion interna; no hay orquestador)
E. HANDLERS RPC        onAsentarRequest -> _atender(e, 'asentar', ...) | onAperturaRequest -> _atender(e, 'apertura', ...) | onCierreRequest -> _atender(e, 'cierre', ...) | onAjustarRequest -> _atender(e, 'ajustar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.asiento_asentado` · `contabilidad.asiento_rechazado` · `contabilidad.asiento.asentar.failed` · `contabilidad.asiento.apertura.failed` · `contabilidad.asiento.cierre.failed` · `contabilidad.asiento.ajustar.failed` · `contabilidad.asiento_asentado.failed` · `contabilidad.asiento_rechazado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe diario de partida doble en el inventario (verificado: fiscal/contable = 0 modulos).
```

### mayor-balanza — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.mayor.saldo.request` · `contabilidad.mayor.balanza.request` · `contabilidad.mayor.movimientos.request`.
                       Depende (por EVENTO, sin require cruzado): `escritor-diario`.
B. MODULE.JSON         name:"mayor-balanza" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.mayor.saldo.request","contabilidad.mayor.balanza.request","contabilidad.mayor.movimientos.request"];
                       publishes:  ["contabilidad.balanza_calculada","contabilidad.mayor.saldo.response","contabilidad.mayor.saldo.failed","contabilidad.mayor.balanza.response","contabilidad.mayor.balanza.failed","contabilidad.mayor.movimientos.response","contabilidad.mayor.movimientos.failed","contabilidad.balanza_calculada.failed"];
                       _doc: "Saldos por cuenta DERIVADOS del diario (nunca almacen paralelo). Determinista; un test lo afirma.".
C. INDEX.JS            class MayorBalanza extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _saldoPorCuenta — saldoPorCuenta(periodo) -> Map<IdCuenta, Importe>
                       · _balanza — balanza(periodo) -> Balanza (sumas y saldos)
                       · _movimientosDe — movimientosDe(cuenta, periodo) -> List<Apunte>
E. HANDLERS RPC        onSaldoRequest -> _atender(e, 'saldo', ...) | onBalanzaRequest -> _atender(e, 'balanza', ...) | onMovimientosRequest -> _atender(e, 'movimientos', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.balanza_calculada` · `contabilidad.mayor.saldo.failed` · `contabilidad.mayor.balanza.failed` · `contabilidad.mayor.movimientos.failed` · `contabilidad.balanza_calculada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: derivacion del diario propia; ningun modulo del inventario lleva mayor/balanza.
```

### traza-asiento — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.traza.anotar.request` · `contabilidad.traza.consultar.request` · `contabilidad.asiento_asentado` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `escritor-diario`.
B. MODULE.JSON         name:"traza-asiento" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.traza.anotar.request","contabilidad.traza.consultar.request","contabilidad.asiento_asentado","project.activated"];
                       publishes:  ["contabilidad.traza_anotada","contabilidad.traza.anotar.response","contabilidad.traza.anotar.failed","contabilidad.traza.consultar.response","contabilidad.traza.consultar.failed","contabilidad.traza_anotada.failed"];
                       _doc: "Registro INMUTABLE (append-only) de quien y cuando creo cada asiento. Solo crece; nunca se reescribe ni se borra.".
C. INDEX.JS            class TrazaAsiento extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _anotar — anotar(quien, cuando, que) — escritor unico: el ESCRITOR_DIARIO
                       · _consultar — consultar(claveNatural) -> EntradaTraza
E. HANDLERS RPC        onAnotarRequest -> _atender(e, 'anotar', ...) | onConsultarRequest -> _atender(e, 'consultar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.traza_anotada` · `contabilidad.traza.anotar.failed` · `contabilidad.traza.consultar.failed` · `contabilidad.traza_anotada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: la traza del asiento es requisito de auditoria y de Verifactu; no existe en el inventario.
```

### asiento-ajuste — puente (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.ajuste.recibir.request`.
                       Depende (por EVENTO, sin require cruzado): `escritor-diario` · `traza-asiento`.
B. MODULE.JSON         name:"asiento-ajuste" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.ajuste.recibir.request"];
                       publishes:  ["contabilidad.asiento.ajustar.request","contabilidad.ajuste_recibido","contabilidad.ajuste.recibir.failed","contabilidad.ajuste.recibir.response","contabilidad.asiento.ajustar.failed","contabilidad.ajuste_recibido.failed"];
                       _doc: "Plano 1 de correccion: por donde la correccion del asesor ENTRA al libro SIN BORRAR (suma). Traza intacta.".
C. INDEX.JS            class AsientoAjuste extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _recibir — recibir(correccion: Asiento) -> senal al diario (B2)
                       · _verificarNoBorrado — verificarNoBorrado() -> ok — el original sigue en la traza
E. HANDLERS RPC        onRecibirRequest -> _atender(e, 'recibir', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.asiento.ajustar.request` · `contabilidad.ajuste_recibido` · `contabilidad.ajuste.recibir.failed` · `contabilidad.asiento.ajustar.failed` · `contabilidad.ajuste_recibido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: la correccion que suma sobre el libro es propia del dominio contable.
```

### estados-contables — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.estado.balance.request` · `contabilidad.estado.resultado.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `inmovilizado` · `valoracion-existencia`.
B. MODULE.JSON         name:"estados-contables" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.estado.balance.request","contabilidad.estado.resultado.request"];
                       publishes:  ["contabilidad.balance_calculado","contabilidad.resultado_calculado","contabilidad.estado.balance.response","contabilidad.estado.balance.failed","contabilidad.estado.resultado.response","contabilidad.estado.resultado.failed","contabilidad.balance_calculado.failed","contabilidad.resultado_calculado.failed"];
                       _doc: "Balance de situacion (C1) y cuenta de resultados (C2) DERIVADOS del mayor + valoraciones. No se "arregla" un resultado: se explica con su base y su cobertura.".
C. INDEX.JS            class EstadosContables extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _componerBalance — componerBalance(periodo) -> Balance {activo, pasivo, patrimonio} (C1)
                       · _cuadrar — cuadrar() -> ok | ERROR_ACTIVO_NO_CUADRA (C1)
                       · _componerResultado — componerResultado(periodo) -> Resultado {ingresos, gastos, resultado} (C2)
E. HANDLERS RPC        onBalanceRequest -> _atender(e, 'balance', ...) | onResultadoRequest -> _atender(e, 'resultado', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.balance_calculado` · `contabilidad.resultado_calculado` · `contabilidad.estado.balance.failed` · `contabilidad.estado.resultado.failed` · `contabilidad.balance_calculado.failed` · `contabilidad.resultado_calculado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: los estados contables no existen en el inventario; son la derivacion del mayor.
```

### periodificacion — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.periodo.imputar.request`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"periodificacion" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.periodo.imputar.request"];
                       publishes:  ["contabilidad.periodo_imputado","contabilidad.periodo.imputar.response","contabilidad.periodo.imputar.failed","contabilidad.periodo_imputado.failed"];
                       _doc: "Imputa cada hecho a su periodo con el CRITERIO DECLARADO y CONSERVA las dos fechas (operacion != valor). No elige ni adivina.".
C. INDEX.JS            class Periodificacion extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _imputarPeriodo — imputarPeriodo(hecho) -> IdPeriodo (criterio declarado, nunca cableado)
                       · _conservarFechas — conservarFechas(hecho) -> (fechaOperacion, fechaValor)
E. HANDLERS RPC        onImputarRequest -> _atender(e, 'imputar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.periodo_imputado` · `contabilidad.periodo.imputar.failed` · `contabilidad.periodo_imputado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la periodificacion con dos fechas y criterio declarable es propia de la vertical.
```

### cierre-ejercicio — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.cierre.cerrar.request` · `contabilidad.cierre.estado.request` · `contabilidad.hecho_admitido` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `escritor-diario` · `mayor-balanza` · `periodificacion` · `inmovilizado` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"cierre-ejercicio" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cierre.cerrar.request","contabilidad.cierre.estado.request","contabilidad.hecho_admitido","project.activated"];
                       publishes:  ["contabilidad.cierre_realizado","contabilidad.apertura_generada","contabilidad.cierre.cerrar.response","contabilidad.cierre.cerrar.failed","contabilidad.cierre.estado.response","contabilidad.cierre.estado.failed","contabilidad.cierre_realizado.failed","contabilidad.apertura_generada.failed"];
                       _doc: "Cierra el periodo con ajustes: IRREVERSIBLE salvo ajuste posterior (B5). DOS niveles de cierre (dia del negocio · mes del asesor).".
C. INDEX.JS            class CierreEjercicio extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        6 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _cerrar — cerrar(periodo, ajustes) -> Cierre | ERROR_PERIODO_YA_CERRADO
                       · _esIrreversible — esIrreversible() -> Bool
                       · _nivel1 — NIVEL 1 caja del dia: consume el hecho CIERRE_JORNADA admitido por la puerta (clave natural: proyecto+jornada)
                       · _nivel2 — NIVEL 2 mes natural: ajustes, periodificacion, amortizaciones, IVA devengado/soportado, regularizacion (clave: proyecto+ejercicio+mes)
                       · _generarApertura — generarApertura(cierreAnterior) -> List<Asiento> (C5): los saldos de apertura son los de cierre, nunca inventados
                       · _arrastrarSaldos — arrastrarSaldos() -> Balance (C5)
E. HANDLERS RPC        onCerrarRequest -> _atender(e, 'cerrar', ...) | onEstadoRequest -> _atender(e, 'estado', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cierre_realizado` · `contabilidad.apertura_generada` · `contabilidad.cierre.cerrar.failed` · `contabilidad.cierre.estado.failed` · `contabilidad.cierre_realizado.failed` · `contabilidad.apertura_generada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el cierre de caja diario de la OPERACION no se toca: entra como hecho observado. El cierre contable con ajustes no existe en el inventario.
```

### aviso-cuadre — puente (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.cobertura_calculada` · `contabilidad.cierre_realizado`.
                       Depende (por EVENTO, sin require cruzado): `completitud-cobertura` · `motor-avisos`.
B. MODULE.JSON         name:"aviso-cuadre" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cobertura_calculada","contabilidad.cierre_realizado"];
                       publishes:  ["contabilidad.cuadre_evaluado","contabilidad.aviso.solicitar.request","contabilidad.cuadre.failed","contabilidad.cuadre_evaluado.failed","contabilidad.aviso.solicitar.failed"];
                       _doc: "NO FINGE el cuadre: si falta cobertura, AVISA. VISTA de la metrica unica (A12), no una segunda metrica.".
C. INDEX.JS            class AvisoCuadre extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        1 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _evaluar — evaluar(cierre) -> Cuadra | FaltaCobertura (lee la metrica unica, no recalcula)
E. HANDLERS RPC        no declara ops propias: solo reacciona a eventos de dominio.
F. EVENTOS DE DOMINIO  publica `contabilidad.cuadre_evaluado` · `contabilidad.aviso.solicitar.request` · `contabilidad.cuadre.failed` · `contabilidad.cuadre_evaluado.failed` · `contabilidad.aviso.solicitar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: el aviso de cuadre bebe de la metrica de cobertura de ESTA vertical.
```

### puerto-extracto — conversor (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.extracto.leer.request` · `contabilidad.extracto.registrar_forma.request`.
                       Depende (por EVENTO, sin require cruzado): `credential-manager`.
B. MODULE.JSON         name:"puerto-extracto" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.extracto.leer.request","contabilidad.extracto.registrar_forma.request"];
                       publishes:  ["contabilidad.extracto_leido","contabilidad.extracto.leer.response","contabilidad.extracto.leer.failed","contabilidad.extracto.registrar_forma.response","contabilidad.extracto.registrar_forma.failed","contabilidad.extracto_leido.failed"];
                       _doc: "Frontera del canal/formato del extracto bancario: un adaptador por fuente, puesto en el sitio. Si falta una fuente -> SE CREA.".
C. INDEX.JS            class PuertoExtracto extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _leer — leer(canal) -> List<MovimientoBancario>
                       · _registrarAdaptador — registrarAdaptador(canal) -> ok — catalogo declarable; credenciales via credential-manager
E. HANDLERS RPC        onLeerRequest -> _atender(e, 'leer', ...) | onRegistrar_formaRequest -> _atender(e, 'registrar_forma', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.extracto_leido` · `contabilidad.extracto.leer.failed` · `contabilidad.extracto.registrar_forma.failed` · `contabilidad.extracto_leido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke leer/escribir en las dos direcciones del formato + caso de forma NO declarada.
NO REUTILIZA / NOTA    NO REUTILIZA: ningun modulo del inventario lee extractos bancarios (conciliacion = 0 modulos).
```

### conciliacion-bancaria — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.conciliacion.cruzar.request` · `contabilidad.conciliacion.informe.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `puerto-extracto` · `regla-movimiento-bancario` · `maestro-cuentas-bancarias`.
B. MODULE.JSON         name:"conciliacion-bancaria" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.conciliacion.cruzar.request","contabilidad.conciliacion.informe.request"];
                       publishes:  ["contabilidad.conciliacion_realizada","contabilidad.movimiento_sin_cruzar","contabilidad.conciliacion.cruzar.response","contabilidad.conciliacion.cruzar.failed","contabilidad.conciliacion.informe.response","contabilidad.conciliacion.informe.failed","contabilidad.conciliacion_realizada.failed","contabilidad.movimiento_sin_cruzar.failed"];
                       _doc: "El CRUCE extracto <-> libro por clave natural y reglas es DETERMINISTA; el juicio vive en sus satelites E7 (fuzzy) y E8 (custodio).".
C. INDEX.JS            class ConciliacionBancaria extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        5 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _cruzar — cruzar(extracto, libro) -> List<Conciliacion> (E1)
                       · _sinCruzar — sinCruzar(extracto, libro) -> List<MovimientoBancario> -> E7
                       · _cuadrarMovimiento — cuadrarMovimiento(movimiento, cobroOPago) -> Ok | Descuadre (E3, clave natural compartida)
                       · _explicarDesfase — explicarDesfase() -> List<PartidaEnTransito> (E9: cheque no cobrado, cobro no apuntado)
                       · _componerInforme — componerInforme() -> DocumentoCuadre (E10: saldo banco <-> saldo contable ajustado)
E. HANDLERS RPC        onCruzarRequest -> _atender(e, 'cruzar', ...) | onInformeRequest -> _atender(e, 'informe', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.conciliacion_realizada` · `contabilidad.movimiento_sin_cruzar` · `contabilidad.conciliacion.cruzar.failed` · `contabilidad.conciliacion.informe.failed` · `contabilidad.conciliacion_realizada.failed` · `contabilidad.movimiento_sin_cruzar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la conciliacion bancaria no existe en el inventario; el cruce deterministico es propio.
```

### partida-no-identificada — micro-agente (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.movimiento_sin_cruzar`.
                       Depende (por EVENTO, sin require cruzado): `conciliacion-bancaria` · `regla-movimiento-bancario` · `cola-revision`.
B. MODULE.JSON         name:"partida-no-identificada" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.movimiento_sin_cruzar"];
                       publishes:  ["contabilidad.partida_clasificada","contabilidad.excepcion.encolar.request","contabilidad.partida_clasificada.failed","contabilidad.excepcion.encolar.failed"];
                       _doc: "El movimiento SIN contrapartida llega con descripcion ambigua -> INTERPRETAR. Una vez existe la regla (E8) pasa a automatico; lo no reconocible va a cola. NO se ignora.".
C. INDEX.JS            class PartidaNoIdentificada extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _reconocer — reconocer(movimiento) -> Clasificacion | SIN_REGLA — FUZZY (comision/interes/devolucion)
                       · _proponerContrapartida — proponerContrapartida(movimiento) -> Contrapartida
E. HANDLERS RPC        no declara ops propias: solo reacciona a eventos de dominio.
F. EVENTOS DE DOMINIO  publica `contabilidad.partida_clasificada` · `contabilidad.excepcion.encolar.request` · `contabilidad.partida_clasificada.failed` · `contabilidad.excepcion.encolar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: la interpretacion de partidas bancarias es propia; no existe en el inventario.
```

### regla-movimiento-bancario — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.regla_movimiento.leer.request` · `contabilidad.regla_movimiento.declarar.request` · `contabilidad.regla_movimiento.aprender.request` · `contabilidad.regla_ratificada` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"regla-movimiento-bancario" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.regla_movimiento.leer.request","contabilidad.regla_movimiento.declarar.request","contabilidad.regla_movimiento.aprender.request","contabilidad.regla_ratificada","project.activated"];
                       publishes:  ["contabilidad.regla_movimiento_declarada","contabilidad.regla_movimiento_aprendida","contabilidad.regla_movimiento.leer.response","contabilidad.regla_movimiento.leer.failed","contabilidad.regla_movimiento.declarar.response","contabilidad.regla_movimiento.declarar.failed","contabilidad.regla_movimiento.aprender.response","contabilidad.regla_movimiento.aprender.failed","contabilidad.regla_movimiento_declarada.failed","contabilidad.regla_movimiento_aprendida.failed"];
                       _doc: "Repositorio de reglas "esta comision -> esta cuenta", declaradas o aprendidas. Comparte la PUERTA UNICA de ratificacion (L10).".
C. INDEX.JS            class ReglaMovimientoBancario extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, regla) — un solo escritor (DUENO/ASESOR)
                       · _aplicar — aplicar(movimiento) -> Contrapartida | SIN_COBERTURA
                       · _aprender — aprender(rol, regla, evidencia) — hidratada por E7/desatasco; RATIFICADA por L10
E. HANDLERS RPC        onLeerRequest -> _atender(e, 'leer', ...) | onDeclararRequest -> _atender(e, 'declarar', ...) | onAprenderRequest -> _atender(e, 'aprender', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.regla_movimiento_declarada` · `contabilidad.regla_movimiento_aprendida` · `contabilidad.regla_movimiento.leer.failed` · `contabilidad.regla_movimiento.declarar.failed` · `contabilidad.regla_movimiento.aprender.failed` · `contabilidad.regla_movimiento_declarada.failed` · `contabilidad.regla_movimiento_aprendida.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe regla de clasificacion bancaria en el inventario.
```

### saldo-tesoreria — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.tesoreria.saldo.request` · `contabilidad.tesoreria.prevision.request`.
                       Depende (por EVENTO, sin require cruzado): `maestro-cuentas-bancarias` · `conciliacion-bancaria` · `cuenta-terceros` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"saldo-tesoreria" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.tesoreria.saldo.request","contabilidad.tesoreria.prevision.request"];
                       publishes:  ["contabilidad.saldo_tesoreria_calculado","contabilidad.caja_proyectada","contabilidad.tesoreria.saldo.response","contabilidad.tesoreria.saldo.failed","contabilidad.tesoreria.prevision.response","contabilidad.tesoreria.prevision.failed","contabilidad.saldo_tesoreria_calculado.failed","contabilidad.caja_proyectada.failed"];
                       _doc: "Posicion REAL de dinero por cuenta (E4) + prevision de caja desde los compromisos con la POLITICA DECLARADA (E5). Los umbrales los declara el dueno.".
C. INDEX.JS            class SaldoTesoreria extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _saldoPorCuenta — saldoPorCuenta(idCuentaBancaria) -> Importe (E4)
                       · _posicionReal — posicionReal() -> Map<IdCuentaBancaria, Importe> (E4: la real, no la contable)
                       · _proyectar — proyectar(desde, hasta) -> CajaProyectada (E5)
                       · _alertarUmbral — alertarUmbral(prevision, umbral) -> senal (K2); umbral declarable (Q24)
E. HANDLERS RPC        onSaldoRequest -> _atender(e, 'saldo', ...) | onPrevisionRequest -> _atender(e, 'prevision', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.saldo_tesoreria_calculado` · `contabilidad.caja_proyectada` · `contabilidad.tesoreria.saldo.failed` · `contabilidad.tesoreria.prevision.failed` · `contabilidad.saldo_tesoreria_calculado.failed` · `contabilidad.caja_proyectada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la posicion real de tesoreria y la prevision de caja no existen en el inventario.
```

### maestro-cuentas-bancarias — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.cuenta_bancaria.declarar.request` · `contabilidad.cuenta_bancaria.listar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"maestro-cuentas-bancarias" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cuenta_bancaria.declarar.request","contabilidad.cuenta_bancaria.listar.request","project.activated"];
                       publishes:  ["contabilidad.cuenta_bancaria_declarada","contabilidad.cuenta_bancaria.declarar.response","contabilidad.cuenta_bancaria.declarar.failed","contabilidad.cuenta_bancaria.listar.response","contabilidad.cuenta_bancaria.listar.failed","contabilidad.cuenta_bancaria_declarada.failed"];
                       _doc: "Catalogo DECLARABLE de cuentas y su MONEDA. Sin el, "el banco" es un solo numero falso. Multi-moneda: parametro declarable.".
C. INDEX.JS            class MaestroCuentasBancarias extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, cuenta, moneda) — un solo escritor (DUENO)
                       · _cuentas — cuentas() -> List<CuentaBancaria>
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onListarRequest -> _atender(e, 'listar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cuenta_bancaria_declarada` · `contabilidad.cuenta_bancaria.declarar.failed` · `contabilidad.cuenta_bancaria.listar.failed` · `contabilidad.cuenta_bancaria_declarada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe maestro de cuentas bancarias; ningun modulo del inventario toca banca.
```

### vista-revisable — reflejo (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.asiento.explicar.request` · `contabilidad.muestra.seleccionar.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `traza-asiento` · `expediente-documental`.
B. MODULE.JSON         name:"vista-revisable" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.asiento.explicar.request","contabilidad.muestra.seleccionar.request"];
                       publishes:  ["contabilidad.vista_explicada","contabilidad.muestra_seleccionada","contabilidad.asiento.explicar.response","contabilidad.asiento.explicar.failed","contabilidad.muestra.seleccionar.response","contabilidad.muestra.seleccionar.failed","contabilidad.vista_explicada.failed","contabilidad.muestra_seleccionada.failed"];
                       _doc: "TODO asiento/calculo EXPLICADO (cifra, base, origen, estado) + seleccion por excepcion y MUESTRA (no revisar todo). No caja negra.".
C. INDEX.JS            class VistaRevisable extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _explicar — explicar(asientoOCalculo) -> Vista {cifra, base, origen, estado} (L2, composicion determinista de la traza)
                       · _seleccionarMuestra — seleccionarMuestra(conjuntoAsientos) -> Muestra por senales DURAS DECLARADAS: alto importe, sin regla, contrapartida nueva, cuadre dudoso (L8)
E. HANDLERS RPC        onExplicarRequest -> _atender(e, 'explicar', ...) | onSeleccionarRequest -> _atender(e, 'seleccionar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.vista_explicada` · `contabilidad.muestra_seleccionada` · `contabilidad.asiento.explicar.failed` · `contabilidad.muestra.seleccionar.failed` · `contabilidad.vista_explicada.failed` · `contabilidad.muestra_seleccionada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la explicabilidad de cada cifra es requisito de la medida maestra (que el asesor la acepte).
```

### flujo-firma — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.firma.marcar.request` · `contabilidad.firma.delta.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `asiento-ajuste` · `regla-contrapartida` · `regla-movimiento-bancario` · `facturacion/asesoria`.
B. MODULE.JSON         name:"flujo-firma" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.firma.marcar.request","contabilidad.firma.delta.request","project.activated"];
                       publishes:  ["contabilidad.firma_registrada","contabilidad.delta_revision_calculado","contabilidad.firma.marcar.response","contabilidad.firma.marcar.failed","contabilidad.firma.delta.response","contabilidad.firma.delta.failed","contabilidad.firma_registrada.failed","contabilidad.delta_revision_calculado.failed"];
                       _doc: "Marca de revisado/firmado POR EL ASESOR: el sistema NO firma, solo registra. El delta da al asesor solo lo que cambio desde su ultimo visto bueno.".
C. INDEX.JS            class FlujoFirma extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _marcarRevisado — marcarRevisado(rol, alcance) -> ok (un solo escritor: el ASESOR)
                       · _firmar — firmar(rol, alcance) -> MarcaFirma (L3); el nivel (periodo/estado/documento) es declarable
                       · _calcularDelta — calcularDelta(desdeUltimaFirma) -> Delta {asientosNuevos, ajustes, reglasCambiadas} (L9)
E. HANDLERS RPC        onMarcarRequest -> _atender(e, 'marcar', ...) | onDeltaRequest -> _atender(e, 'delta', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.firma_registrada` · `contabilidad.delta_revision_calculado` · `contabilidad.firma.marcar.failed` · `contabilidad.firma.delta.failed` · `contabilidad.firma_registrada.failed` · `contabilidad.delta_revision_calculado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe flujo de firma del asesor en el inventario.
```

### expediente-documental — custodio (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.expediente.archivar.request` · `contabilidad.expediente.recuperar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `filesystem`.
B. MODULE.JSON         name:"expediente-documental" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.expediente.archivar.request","contabilidad.expediente.recuperar.request","project.activated"];
                       publishes:  ["contabilidad.cifra_archivada","contabilidad.expediente.archivar.response","contabilidad.expediente.archivar.failed","contabilidad.expediente.recuperar.response","contabilidad.expediente.recuperar.failed","contabilidad.cifra_archivada.failed"];
                       _doc: "Cada cifra con el documento origen ARCHIVADO y ENLAZADO: LA PRUEBA que sostiene la firma ante una inspeccion. L2 explica; el expediente CONSERVA.".
C. INDEX.JS            class ExpedienteDocumental extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _archivar — archivar(cifra, documentoOrigen) -> ok (single-writer; archivo via filesystem)
                       · _recuperar — recuperar(cifra) -> IdDocumento
                       · _verificarEnlace — verificarEnlace() -> ok | ERROR_CIFRA_SIN_PRUEBA
E. HANDLERS RPC        onArchivarRequest -> _atender(e, 'archivar', ...) | onRecuperarRequest -> _atender(e, 'recuperar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cifra_archivada` · `contabilidad.expediente.archivar.failed` · `contabilidad.expediente.recuperar.failed` · `contabilidad.cifra_archivada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el enlace cifra<->documento de origen es propio de la vertical; `filesystem` es el almacen, no el expediente.
```

### ratificacion-regla-aprendida — puente (CONSTRUIR · contabilidad-libro)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.regla_aprendida`.
                       Depende (por EVENTO, sin require cruzado): `regla-contrapartida` · `regla-movimiento-bancario`.
B. MODULE.JSON         name:"ratificacion-regla-aprendida" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.regla_aprendida"];
                       publishes:  ["contabilidad.regla.ratificar.request","contabilidad.regla_ratificada","contabilidad.regla.ratificar.failed","contabilidad.regla_ratificada.failed"];
                       _doc: "PUERTA UNICA de ratificacion: el asesor ratifica o BLOQUEA la regla aprendida ANTES de que actue sobre el volumen. Vencida sin respuesta -> NO actua.".
C. INDEX.JS            class RatificacionReglaAprendida extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _solicitarRatificacion — solicitarRatificacion(regla) -> SolicitudDecision (el sistema NO resuelve)
                       · _aplicarRatificacion — aplicarRatificacion(regla, decision) -> ok | bloqueada
E. HANDLERS RPC        no declara ops propias: solo reacciona a eventos de dominio.
F. EVENTOS DE DOMINIO  publica `contabilidad.regla.ratificar.request` · `contabilidad.regla_ratificada` · `contabilidad.regla.ratificar.failed` · `contabilidad.regla_ratificada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: cubre DOS repositorios (A6.2 contrapartida + E8 movimiento bancario) con UNA sola puerta; no existe en el inventario.
```

### 3.3 — Oleada 3 · `contabilidad-fiscal` (13 hojas CONSTRUIR)

### perfil-administrativo — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.perfil.declarar.request` · `contabilidad.perfil.aplicables.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"perfil-administrativo" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.perfil.declarar.request","contabilidad.perfil.aplicables.request","project.activated"];
                       publishes:  ["contabilidad.perfil_declarado","contabilidad.perfil.declarar.response","contabilidad.perfil.declarar.failed","contabilidad.perfil.aplicables.response","contabilidad.perfil.aplicables.failed","contabilidad.perfil_declarado.failed"];
                       _doc: "Que administraciones y obligaciones aplican al negocio (territorio + regimen). Cuatro territorios posibles; el sistema no asume uno.".
C. INDEX.JS            class PerfilAdministrativo extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, sociedad, perfil) — un solo escritor (DUENO/ASESOR)
                       · _aplicables — aplicables(sociedad) -> Set<IdObligacion>
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onAplicablesRequest -> _atender(e, 'aplicables', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.perfil_declarado` · `contabilidad.perfil.declarar.failed` · `contabilidad.perfil.aplicables.failed` · `contabilidad.perfil_declarado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe perfil fiscal por sociedad en el inventario (fiscal = 0 modulos).
```

### calendario-fiscal — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.calendario.declarar.request` · `contabilidad.calendario.proximos.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `perfil-administrativo` · `motor-avisos`.
B. MODULE.JSON         name:"calendario-fiscal" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.calendario.declarar.request","contabilidad.calendario.proximos.request","project.activated"];
                       publishes:  ["contabilidad.plazo_declarado","contabilidad.plazo_proximo","contabilidad.calendario.declarar.response","contabilidad.calendario.declarar.failed","contabilidad.calendario.proximos.response","contabilidad.calendario.proximos.failed","contabilidad.plazo_declarado.failed","contabilidad.plazo_proximo.failed"];
                       _doc: "Plazos DECLARABLES por ejercicio (cambian: prorrogas, festivos, domiciliacion). Dispara aviso proactivo; nunca fija una fecha de memoria.".
C. INDEX.JS            class CalendarioFiscal extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, ejercicio, plazos) — un solo escritor (ASESOR/DUENO)
                       · _proximos — proximos(hoy) -> List<Plazo>
                       · _dispararAviso — dispararAviso(plazo) -> senal a K2
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onProximosRequest -> _atender(e, 'proximos', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.plazo_declarado` · `contabilidad.plazo_proximo` · `contabilidad.calendario.declarar.failed` · `contabilidad.calendario.proximos.failed` · `contabilidad.plazo_declarado.failed` · `contabilidad.plazo_proximo.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el calendario fiscal con plazos declarables no existe en el inventario.
```

### liquidacion-iva — reflejo (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.iva.liquidar.request` · `contabilidad.modelo.303.request` · `contabilidad.modelo.390.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `perfil-administrativo` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"liquidacion-iva" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.iva.liquidar.request","contabilidad.modelo.303.request","contabilidad.modelo.390.request"];
                       publishes:  ["contabilidad.iva_liquidado","contabilidad.modelo_construido","contabilidad.iva.liquidar.response","contabilidad.iva.liquidar.failed","contabilidad.modelo.303.response","contabilidad.modelo.303.failed","contabilidad.modelo.390.response","contabilidad.modelo.390.failed","contabilidad.iva_liquidado.failed","contabilidad.modelo_construido.failed"];
                       _doc: "Impuesto indirecto DERIVADO del libro con los tipos DECLARADOS (IVA/IGIC/IPSI segun territorio) + sus modelos 303 y 390. Ningun tipo cableado.".
C. INDEX.JS            class LiquidacionIva extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        5 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _devengado — devengado(periodo) -> Importe (D1)
                       · _soportado — soportado(periodo) -> Importe (D1)
                       · _liquidar — liquidar(periodo) -> Liquidacion {devengado, deducible, resultado} (D1)
                       · _construir303 — construir303(periodo) -> Modelo (D2)
                       · _resumir390 — resumir390(ejercicio) -> Modelo (D3)
E. HANDLERS RPC        onLiquidarRequest -> _atender(e, 'liquidar', ...) | on303Request -> _atender(e, '303', ...) | on390Request -> _atender(e, '390', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.iva_liquidado` · `contabilidad.modelo_construido` · `contabilidad.iva.liquidar.failed` · `contabilidad.modelo.303.failed` · `contabilidad.modelo.390.failed` · `contabilidad.iva_liquidado.failed` · `contabilidad.modelo_construido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: IVA/modelos no existen en el inventario (verificado: 0 modulos). La ley entra como DATO declarable.
```

### retenciones-is-irpf — reflejo (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.retenciones.calcular.request` · `contabilidad.estimacion.calcular.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `estados-contables` · `perfil-administrativo` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"retenciones-is-irpf" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.retenciones.calcular.request","contabilidad.estimacion.calcular.request"];
                       publishes:  ["contabilidad.retenciones_calculadas","contabilidad.cuota_estimada","contabilidad.retenciones.calcular.response","contabilidad.retenciones.calcular.failed","contabilidad.estimacion.calcular.response","contabilidad.estimacion.calcular.failed","contabilidad.retenciones_calculadas.failed","contabilidad.cuota_estimada.failed"];
                       _doc: "Retenciones practicadas/soportadas (D4) y estimacion IS/IRPF con base declarada (D5). El sujeto fiscal es parametro POR SOCIEDAD.".
C. INDEX.JS            class RetencionesIsIrpf extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _practicadas — practicadas(periodo) -> Importe (D4: profesionales, alquileres, trabajo — todos parametros)
                       · _soportadas — soportadas(periodo) -> Importe (D4)
                       · _estimar — estimar(periodo) -> CuotaEstimada (D5: IS sociedad | IRPF persona fisica, declarable)
E. HANDLERS RPC        onCalcularRequest -> _atender(e, 'calcular', ...) | onCalcularRequest -> _atender(e, 'calcular', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.retenciones_calculadas` · `contabilidad.cuota_estimada` · `contabilidad.retenciones.calcular.failed` · `contabilidad.estimacion.calcular.failed` · `contabilidad.retenciones_calculadas.failed` · `contabilidad.cuota_estimada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: IRPF/IS y retenciones no existen en el inventario.
```

### estado-presentacion-fiscal — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.obligacion.avanzar.request` · `contabilidad.obligacion.estado.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `perfil-administrativo` · `calendario-fiscal`.
B. MODULE.JSON         name:"estado-presentacion-fiscal" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.obligacion.avanzar.request","contabilidad.obligacion.estado.request","project.activated"];
                       publishes:  ["contabilidad.obligacion_avanzada","contabilidad.obligacion.avanzar.response","contabilidad.obligacion.avanzar.failed","contabilidad.obligacion.estado.response","contabilidad.obligacion.estado.failed","contabilidad.obligacion_avanzada.failed"];
                       _doc: "Ciclo de vida de cada obligacion (pendiente -> generada -> presentada -> justificada -> atrasada): sin el, el calendario avisa pero nadie sabe en que punto esta.".
C. INDEX.JS            class EstadoPresentacionFiscal extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _avanzar — avanzar(obligacion, estado) — escritor SISTEMA+ASESOR
                       · _estadoDe — estadoDe(obligacion) -> EstadoObligacion
E. HANDLERS RPC        onAvanzarRequest -> _atender(e, 'avanzar', ...) | onEstadoRequest -> _atender(e, 'estado', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.obligacion_avanzada` · `contabilidad.obligacion.avanzar.failed` · `contabilidad.obligacion.estado.failed` · `contabilidad.obligacion_avanzada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe estado de obligacion fiscal en el inventario.
```

### generador-modelo — puente (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.modelo.generar.request`.
                       Depende (por EVENTO, sin require cruzado): `liquidacion-iva` · `retenciones-is-irpf` · `estado-presentacion-fiscal` · `filesystem`.
B. MODULE.JSON         name:"generador-modelo" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.modelo.generar.request"];
                       publishes:  ["contabilidad.modelo_generado","contabilidad.modelo_entregado","contabilidad.modelo.generar.failed","contabilidad.modelo.generar.response","contabilidad.modelo_generado.failed","contabilidad.modelo_entregado.failed"];
                       _doc: "Salida al programa del asesor por PUERTO (formato abierto y declarable). Si el sistema solo PREPARA, aqui termina su responsabilidad.".
C. INDEX.JS            class GeneradorModelo extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _generar — generar(modelo) -> DocumentoModelo
                       · _entregar — entregar(documento) -> ok | NO_DECLARADO (presentar es declarable; D34)
E. HANDLERS RPC        onGenerarRequest -> _atender(e, 'generar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.modelo_generado` · `contabilidad.modelo_entregado` · `contabilidad.modelo.generar.failed` · `contabilidad.modelo_generado.failed` · `contabilidad.modelo_entregado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: la generacion de modelos fiscales con puerto abierto no existe; hay que construirlo.
```

### registro-verifactu — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.registro.anotar.request` · `contabilidad.registro.verificar.request` · `contabilidad.factura_emitida` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `emision-factura-venta`.
B. MODULE.JSON         name:"registro-verifactu" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.registro.anotar.request","contabilidad.registro.verificar.request","contabilidad.factura_emitida","project.activated"];
                       publishes:  ["contabilidad.registro_verifactu_anotado","contabilidad.registro.anotar.response","contabilidad.registro.anotar.failed","contabilidad.registro.verificar.response","contabilidad.registro.verificar.failed","contabilidad.registro_verifactu_anotado.failed"];
                       _doc: "Registro INTERNO Y NO ALTERABLE de la facturacion: huella + encadenamiento. Solo crece. Distinto de la emision (O1) y del formato (D9).".
C. INDEX.JS            class RegistroVerifactu extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _encadenar — encadenar(factura) -> Huella
                       · _anotar — anotar(factura, huella) — append-only
                       · _verificarCadena — verificarCadena() -> ok | ERROR_CADENA_ROTA
E. HANDLERS RPC        onAnotarRequest -> _atender(e, 'anotar', ...) | onVerificarRequest -> _atender(e, 'verificar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.registro_verifactu_anotado` · `contabilidad.registro.anotar.failed` · `contabilidad.registro.verificar.failed` · `contabilidad.registro_verifactu_anotado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: Verifactu no existe en el inventario (0 modulos); es requisito legal de la factura emitida.
```

### factura-electronica — conversor (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.factura.estructurar.request` · `contabilidad.factura.interpretar.request`.
                       Depende (por EVENTO, sin require cruzado): `emision-factura-venta`.
B. MODULE.JSON         name:"factura-electronica" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.factura.estructurar.request","contabilidad.factura.interpretar.request"];
                       publishes:  ["contabilidad.factura_estructurada","contabilidad.factura_interpretada","contabilidad.factura.estructurar.response","contabilidad.factura.estructurar.failed","contabilidad.factura.interpretar.response","contabilidad.factura.interpretar.failed","contabilidad.factura_estructurada.failed","contabilidad.factura_interpretada.failed"];
                       _doc: "Frontera del FORMATO ESTRUCTURADO de la factura (emitir y recibir). Un solo cruce; un documento estructurado entra SIN extraccion (no pasa por A4.1).".
C. INDEX.JS            class FacturaElectronica extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _emitirEstructurada — emitirEstructurada(factura) -> DocumentoEstructurado
                       · _interpretarEstructurado — interpretarEstructurado(documento) -> Factura
E. HANDLERS RPC        onEstructurarRequest -> _atender(e, 'estructurar', ...) | onInterpretarRequest -> _atender(e, 'interpretar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.factura_estructurada` · `contabilidad.factura_interpretada` · `contabilidad.factura.estructurar.failed` · `contabilidad.factura.interpretar.failed` · `contabilidad.factura_estructurada.failed` · `contabilidad.factura_interpretada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke leer/escribir en las dos direcciones del formato + caso de forma NO declarada.
NO REUTILIZA / NOTA    NO REUTILIZA: la factura electronica estructurada no existe en el inventario; el formato concreto es declarable.
```

### acuse-presentacion — puente (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.acuse.recibir.request`.
                       Depende (por EVENTO, sin require cruzado): `estado-presentacion-fiscal` · `generador-modelo` · `escritor-diario`.
B. MODULE.JSON         name:"acuse-presentacion" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.acuse.recibir.request"];
                       publishes:  ["contabilidad.acuse_ligado","contabilidad.acuse.recibir.failed","contabilidad.acuse.recibir.response","contabilidad.acuse_ligado.failed"];
                       _doc: "Recoge y LIGA el justificante/acuse de la administracion a su modelo y a su asiento: cierra el bucle hacia fuera. Sin acuse -> obligacion no justificada -> aviso.".
C. INDEX.JS            class AcusePresentacion extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _recibir — recibir(justificante) -> ok (canal declarable; credenciales via credential-manager)
                       · _ligar — ligar(acuse, modelo, asiento) -> ok
E. HANDLERS RPC        onRecibirRequest -> _atender(e, 'recibir', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.acuse_ligado` · `contabilidad.acuse.recibir.failed` · `contabilidad.acuse_ligado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: el retorno del acuse administrativo no existe en el inventario.
```

### rectificacion-declaracion — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.declaracion.rectificar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `estado-presentacion-fiscal` · `escritor-diario`.
B. MODULE.JSON         name:"rectificacion-declaracion" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.declaracion.rectificar.request","project.activated"];
                       publishes:  ["contabilidad.declaracion_rectificada","contabilidad.declaracion.rectificar.response","contabilidad.declaracion.rectificar.failed","contabilidad.declaracion_rectificada.failed"];
                       _doc: "Plano 4 de correccion: correccion POSTERIOR a la presentacion (complementaria/sustitutiva). NO se confunde con el ajuste contable ni con la rectificativa comercial.".
C. INDEX.JS            class RectificacionDeclaracion extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _rectificar — rectificar(declaracionOriginal, tipo) -> Rectificacion — un solo escritor (ASESOR)
                       · _enlazar — enlazar(original, rectificacion) -> ok
E. HANDLERS RPC        onRectificarRequest -> _atender(e, 'rectificar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.declaracion_rectificada` · `contabilidad.declaracion.rectificar.failed` · `contabilidad.declaracion_rectificada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: la rectificacion fiscal posterior a la presentacion no existe en el inventario.
```

### puerto-nomina — puente (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.nomina.recibir.request`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"puerto-nomina" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.nomina.recibir.request"];
                       publishes:  ["contabilidad.nomina_recibida","contabilidad.nomina.recibir.response","contabilidad.nomina.recibir.failed","contabilidad.nomina_recibida.failed"];
                       _doc: "Origen DECLARABLE del dato de nomina. El sistema NO calcula nomina por defecto: la RECIBE (calcular es capacidad opcional, G5 declarable).".
C. INDEX.JS            class PuertoNomina extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _recibir — recibir(hechoNomina) -> ok
                       · _conectar — conectar(origen) -> ok | NO_DECLARADO; si no existe el origen -> se crea
E. HANDLERS RPC        onRecibirRequest -> _atender(e, 'recibir', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.nomina_recibida` · `contabilidad.nomina.recibir.failed` · `contabilidad.nomina_recibida.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe puerto de nomina en el inventario (nominas = 0 modulos).
```

### recibo-nomina — reflejo (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.nomina.procesar.request` · `contabilidad.nomina.desglosar.request` · `contabilidad.nomina.liquidar.request` · `contabilidad.nomina_recibida`.
                       Depende (por EVENTO, sin require cruzado): `puerto-nomina` · `catalogo-cuentas` · `cola-declaraciones-criterio` · `escritor-diario`.
B. MODULE.JSON         name:"recibo-nomina" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.nomina.procesar.request","contabilidad.nomina.desglosar.request","contabilidad.nomina.liquidar.request","contabilidad.nomina_recibida"];
                       publishes:  ["contabilidad.nomina_formada","contabilidad.asiento.asentar.request","contabilidad.nomina.procesar.response","contabilidad.nomina.procesar.failed","contabilidad.nomina.desglosar.response","contabilidad.nomina.desglosar.failed","contabilidad.nomina.liquidar.response","contabilidad.nomina.liquidar.failed","contabilidad.nomina_formada.failed","contabilidad.asiento.asentar.failed"];
                       _doc: "Del recibo al ASIENTO EQUILIBRADO y EXPLICABLE: obligacion con la Seguridad Social, desglose bruto/retencion/cotizacion/neto, anticipos, conceptos extra y liquidacion de baja.".
C. INDEX.JS            class ReciboNomina extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        7 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _admitir — admitir(recibo) -> ReciboFormado (G1: cero juicio; si el negocio no calcula, el recibo LLEGA hecho)
                       · _calcularObligacion — calcularObligacion(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS} (G2, tipos declarables)
                       · _construirAsiento — construirAsiento(recibo) -> AsientoEquilibrado (G3)
                       · _desglosar — desglosar(recibo) -> Lineas {bruto, retencion, cotizacionTrabajador, neto} (G6)
                       · _aplicarAnticipo — aplicarAnticipo(empleado, recibo) -> NetoAjustado (G8)
                       · _imputarConcepto — imputarConcepto(concepto, recibo) -> List<Apunte> (G9: dietas, especie, pagas extra, finiquitos)
                       · _liquidar — liquidar(empleado) -> AsientoCierre + SaldoCero (G10: una cuenta de empleado sin cerrar es un error de estado)
E. HANDLERS RPC        onProcesarRequest -> _atender(e, 'procesar', ...) | onDesglosarRequest -> _atender(e, 'desglosar', ...) | onLiquidarRequest -> _atender(e, 'liquidar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.nomina_formada` · `contabilidad.asiento.asentar.request` · `contabilidad.nomina.procesar.failed` · `contabilidad.nomina.desglosar.failed` · `contabilidad.nomina.liquidar.failed` · `contabilidad.nomina_formada.failed` · `contabilidad.asiento.asentar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: no existe modulo de nomina en el inventario; el asiento de personal y su desglose son propios.
```

### acceso-nomina — custodio (CONSTRUIR · contabilidad-fiscal)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.nomina.autorizar.request` · `contabilidad.nomina.puede_ver.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `aislamiento-negocio`.
B. MODULE.JSON         name:"acceso-nomina" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.nomina.autorizar.request","contabilidad.nomina.puede_ver.request","project.activated"];
                       publishes:  ["contabilidad.acceso_nomina_autorizado","contabilidad.nomina.autorizar.response","contabilidad.nomina.autorizar.failed","contabilidad.nomina.puede_ver.response","contabilidad.nomina.puede_ver.failed","contabilidad.acceso_nomina_autorizado.failed"];
                       _doc: "Aisla la nomina como DATO PERSONAL: cada uno ve la suya. Eje de aislamiento DENTRO del negocio (distinto de I4, entre negocios).".
C. INDEX.JS            class AccesoNomina extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _autorizar — autorizar(rol, empleado, visor) — un solo escritor (DUENO)
                       · _puedeVer — puedeVer(visor, empleado) -> Bool
E. HANDLERS RPC        onAutorizarRequest -> _atender(e, 'autorizar', ...) | onPuede_verRequest -> _atender(e, 'puede_ver', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.acceso_nomina_autorizado` · `contabilidad.nomina.autorizar.failed` · `contabilidad.nomina.puede_ver.failed` · `contabilidad.acceso_nomina_autorizado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el aislamiento de la nomina como dato personal no existe en el inventario.
```

### 3.4 — Oleada 4 · `contabilidad-analitica` (17 hojas CONSTRUIR)

### inmovilizado — custodio (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.activo.alta.request` · `contabilidad.amortizacion.generar.request` · `contabilidad.activo.baja.request` · `contabilidad.activo.valor_neto.request` · `contabilidad.cierre_realizado` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `escritor-diario` · `mayor-balanza` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"inmovilizado" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.activo.alta.request","contabilidad.amortizacion.generar.request","contabilidad.activo.baja.request","contabilidad.activo.valor_neto.request","contabilidad.cierre_realizado","project.activated"];
                       publishes:  ["contabilidad.activo_dado_de_alta","contabilidad.amortizacion_generada","contabilidad.activo_dado_de_baja","contabilidad.activo.alta.response","contabilidad.activo.alta.failed","contabilidad.amortizacion.generar.response","contabilidad.amortizacion.generar.failed","contabilidad.activo.baja.response","contabilidad.activo.baja.failed","contabilidad.activo.valor_neto.response","contabilidad.activo.valor_neto.failed","contabilidad.activo_dado_de_alta.failed","contabilidad.amortizacion_generada.failed","contabilidad.activo_dado_de_baja.failed"];
                       _doc: "El bien duradero y su amortizacion: alta declarada (no estimada), cuota que dispara EN EL CIERRE con parametros declarables, baja que calcula resultado y valor neto contable.".
C. INDEX.JS            class Inmovilizado extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        7 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _registrar — registrar(rol, activo) -> ok (F1, un solo escritor DUENO/ASESOR)
                       · _valorarAlta — valorarAlta(activo) -> Importe (F1, reflejo hidratador)
                       · _generarCuota — generarCuota(activo, periodo) -> AsientoAmortizacion | NADA (F2; metodo/coeficiente/anios DECLARABLES, ningun coeficiente cableado)
                       · _dispararEnCierre — dispararEnCierre(cierre) -> ok (F2: la cuota se genera CUANDO TOCA)
                       · _calcularResultadoBaja — calcularResultadoBaja(activo) -> Perdida | Beneficio (F3)
                       · _imputar — imputar(resultado) -> Asiento (F3: la baja no borra la historia del bien, suma un asiento)
                       · _calcularValorNeto — calcular(activo) -> Importe coste - amortizacion acumulada (F4, al balance C1)
E. HANDLERS RPC        onAltaRequest -> _atender(e, 'alta', ...) | onGenerarRequest -> _atender(e, 'generar', ...) | onBajaRequest -> _atender(e, 'baja', ...) | onValor_netoRequest -> _atender(e, 'valor_neto', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.activo_dado_de_alta` · `contabilidad.amortizacion_generada` · `contabilidad.activo_dado_de_baja` · `contabilidad.activo.alta.failed` · `contabilidad.amortizacion.generar.failed` · `contabilidad.activo.baja.failed` · `contabilidad.activo.valor_neto.failed` · `contabilidad.activo_dado_de_alta.failed` · `contabilidad.amortizacion_generada.failed` · `contabilidad.activo_dado_de_baja.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el inmovilizado y la amortizacion no existen en el inventario (0 modulos); la amortizacion es un hecho que produce el TIEMPO y aqui se genera en el cierre.
```

### aislamiento-negocio — custodio (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.parcela_negocio.registrar.request` · `contabilidad.parcela_negocio.escribir.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `single-writer`.
B. MODULE.JSON         name:"aislamiento-negocio" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.parcela_negocio.registrar.request","contabilidad.parcela_negocio.escribir.request","project.activated"];
                       publishes:  ["contabilidad.parcela_negocio_registrada","contabilidad.parcela_negocio.registrar.response","contabilidad.parcela_negocio.registrar.failed","contabilidad.parcela_negocio.escribir.response","contabilidad.parcela_negocio.escribir.failed","contabilidad.parcela_negocio_registrada.failed"];
                       _doc: "Multi-negocio SIN FUGA: un dueno por parcela; ningun calculo lee ni escribe la parcela de otro salvo consolidacion declarada.".
C. INDEX.JS            class AislamientoNegocio extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _parcela — parcela(negocio) -> Parcela
                       · _escribir — escribir(negocio, rol, cambio) -> ok | ERROR_FUGA_ENTRE_NEGOCIOS
E. HANDLERS RPC        onRegistrarRequest -> _atender(e, 'registrar', ...) | onEscribirRequest -> _atender(e, 'escribir', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.parcela_negocio_registrada` · `contabilidad.parcela_negocio.registrar.failed` · `contabilidad.parcela_negocio.escribir.failed` · `contabilidad.parcela_negocio_registrada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el aislamiento por parcela de negocio es la invariante 13 del dominio; la capa de proyecto (PosPersistencia) NO la sustituye.
```

### cola-declaraciones-criterio — custodio (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.criterio.declarar.request` · `contabilidad.criterio.leer.request` · `contabilidad.criterio.pendientes.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"cola-declaraciones-criterio" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.criterio.declarar.request","contabilidad.criterio.leer.request","contabilidad.criterio.pendientes.request","project.activated"];
                       publishes:  ["contabilidad.criterio_declarado","contabilidad.criterio_pendiente","contabilidad.criterio.declarar.response","contabilidad.criterio.declarar.failed","contabilidad.criterio.leer.response","contabilidad.criterio.leer.failed","contabilidad.criterio.pendientes.response","contabilidad.criterio.pendientes.failed","contabilidad.criterio_declarado.failed","contabilidad.criterio_pendiente.failed"];
                       _doc: "UNA sola cola declarativa donde el jefe/asesor fija o ratifica TODOS los criterios (plan, periodo, plazos, amortizacion, dimensiones, tipos fiscales, consolidacion, unidad_de_cierre).".
C. INDEX.JS            class ColaDeclaracionesCriterio extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, criterio, valor) -> ParametroDeclarable — un solo escritor (JEFE/ASESOR)
                       · _leer — leer(criterio) -> ParametroDeclarable | AUSENTE
                       · _pendientes — pendientes() -> List<IdCriterio> — las 23 piezas [ABIERTO]; lo no declarado NO se estima
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onLeerRequest -> _atender(e, 'leer', ...) | onPendientesRequest -> _atender(e, 'pendientes', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.criterio_declarado` · `contabilidad.criterio_pendiente` · `contabilidad.criterio.declarar.failed` · `contabilidad.criterio.leer.failed` · `contabilidad.criterio.pendientes.failed` · `contabilidad.criterio_declarado.failed` · `contabilidad.criterio_pendiente.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: es la PUERTA DECLARATIVA del dominio; ninguna pieza del inventario recoge criterios contables.
```

### onboarding-negocio — custodio (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.negocio.configurar.request` · `contabilidad.negocio.estado.request` · `contabilidad.negocio.activar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio` · `project-manager`.
B. MODULE.JSON         name:"onboarding-negocio" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.negocio.configurar.request","contabilidad.negocio.estado.request","contabilidad.negocio.activar.request","project.activated"];
                       publishes:  ["contabilidad.negocio_configurado","contabilidad.vertical_activada","contabilidad.negocio.configurar.response","contabilidad.negocio.configurar.failed","contabilidad.negocio.estado.response","contabilidad.negocio.estado.failed","contabilidad.negocio.activar.response","contabilidad.negocio.activar.failed","contabilidad.negocio_configurado.failed","contabilidad.vertical_activada.failed"];
                       _doc: "Recoge los datos DECLARABLES del negocio (plan, fuentes, parametros) y enciende la vertical. Sin parametros declarados el negocio queda INCOMPLETO: se declara el hueco.".
C. INDEX.JS            class OnboardingNegocio extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _recoger — recoger(rol, negocio, datos) -> ok (K1, un solo escritor DUENO)
                       · _estado — estado(negocio) -> CONFIGURADO | FALTA [ABIERTO] (K1)
                       · _activar — activar(negocio) -> ok (K4: mecanico, cero juicio; sin parametros NO se activa)
E. HANDLERS RPC        onConfigurarRequest -> _atender(e, 'configurar', ...) | onEstadoRequest -> _atender(e, 'estado', ...) | onActivarRequest -> _atender(e, 'activar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.negocio_configurado` · `contabilidad.vertical_activada` · `contabilidad.negocio.configurar.failed` · `contabilidad.negocio.estado.failed` · `contabilidad.negocio.activar.failed` · `contabilidad.negocio_configurado.failed` · `contabilidad.vertical_activada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: el onboarding de un negocio contable no existe; `project-manager` gestiona el proyecto, no la configuracion contable.
```

### motor-avisos — puente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.aviso.solicitar.request` · `contabilidad.aviso.catalogo.declarar.request`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"motor-avisos" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.aviso.solicitar.request","contabilidad.aviso.catalogo.declarar.request"];
                       publishes:  ["contabilidad.aviso_producido","contabilidad.aviso.enrutar.request","contabilidad.aviso.solicitar.response","contabilidad.aviso.solicitar.failed","contabilidad.aviso.catalogo.declarar.response","contabilidad.aviso.catalogo.declarar.failed","contabilidad.aviso_producido.failed","contabilidad.aviso.enrutar.failed"];
                       _doc: "PRODUCE el aviso a partir de senales REALES (nunca de pantalla muda): descuadre, excepcion, IVA, vencimiento, plazo, desviacion, cierre, amortizacion, rectificacion, hueco.".
C. INDEX.JS            class MotorAvisos extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _producir — producir(senal) -> Aviso (catalogo declarable K6)
                       · _enrutar — enrutar(aviso, destinatario) -> ok
E. HANDLERS RPC        onSolicitarRequest -> _atender(e, 'solicitar', ...) | onDeclararRequest -> _atender(e, 'declarar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.aviso_producido` · `contabilidad.aviso.enrutar.request` · `contabilidad.aviso.solicitar.failed` · `contabilidad.aviso.catalogo.declarar.failed` · `contabilidad.aviso_producido.failed` · `contabilidad.aviso.enrutar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: no existe motor de avisos contables en el inventario; recibe senales de A8.2, C6, D6, E5, J4, A15 y R1.
```

### consolidacion-grupo — reflejo (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.consolidacion.agregar.request`.
                       Depende (por EVENTO, sin require cruzado): `estados-contables` · `aislamiento-negocio` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"consolidacion-grupo" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.consolidacion.agregar.request"];
                       publishes:  ["contabilidad.grupo_consolidado","contabilidad.consolidacion.agregar.response","contabilidad.consolidacion.agregar.failed","contabilidad.grupo_consolidado.failed"];
                       _doc: "Estados del CONJUNTO con criterio declarado: marca de sociedad, eliminacion intercompany y agregacion. Dos niveles: por negocio (aislado) y del grupo.".
C. INDEX.JS            class ConsolidacionGrupo extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _etiquetar — etiquetar(asiento, sociedad) -> Asiento (I1, mecanico)
                       · _detectarCruceInterno — detectarCruceInterno() -> List<Cruce> (I2)
                       · _eliminar — eliminar(cruces) -> List<Eliminacion> (I2)
                       · _agregar — agregar(sociedades) -> EstadosConsolidados (I3, criterio declarado)
E. HANDLERS RPC        onAgregarRequest -> _atender(e, 'agregar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.grupo_consolidado` · `contabilidad.consolidacion.agregar.failed` · `contabilidad.grupo_consolidado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: la consolidacion multi-sociedad no existe en el inventario (grupo = 0 modulos).
```

### frontera-ficha-producto — conversor (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.ficha.coste.request`.
                       Depende (por EVENTO, sin require cruzado): (ninguno).
B. MODULE.JSON         name:"frontera-ficha-producto" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.ficha.coste.request"];
                       publishes:  ["contabilidad.coste_leido","contabilidad.ficha.coste.response","contabilidad.ficha.coste.failed","contabilidad.coste_leido.failed"];
                       _doc: "Puerto DECLARABLE del coste de cada negocio: por donde cruza el coste de la ficha al dato interno. Si falta -> se crea. Nunca se inventa un coste.".
C. INDEX.JS            class FronteraFichaProducto extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _leerCoste — leerCoste(producto) -> Coste | AUSENTE
                       · _crearFrontera — crearFrontera(negocio) -> ok (invariante de puerto abierto)
E. HANDLERS RPC        onCosteRequest -> _atender(e, 'coste', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.coste_leido` · `contabilidad.ficha.coste.failed` · `contabilidad.coste_leido.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke leer/escribir en las dos direcciones del formato + caso de forma NO declarada.
NO REUTILIZA / NOTA    NO REUTILIZA: la frontera de coste (ficha/receta/otro) es declarable por negocio; `pizzepos/escandallo` es mono-negocio y se pone POR ENCIMA, no se toca.
```

### valoracion-existencia — reflejo (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.existencia.valorar.request` · `contabilidad.inventario.ajuste.request`.
                       Depende (por EVENTO, sin require cruzado): `frontera-ficha-producto` · `inventario` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"valoracion-existencia" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.existencia.valorar.request","contabilidad.inventario.ajuste.request"];
                       publishes:  ["contabilidad.existencia_valorada","contabilidad.ajuste_inventario_calculado","contabilidad.existencia.valorar.response","contabilidad.existencia.valorar.failed","contabilidad.inventario.ajuste.response","contabilidad.inventario.ajuste.failed","contabilidad.existencia_valorada.failed","contabilidad.ajuste_inventario_calculado.failed"];
                       _doc: "Capa de VALOR sobre el stock existente (no duplica el inventario): metodo declarable (FIFO/PMP; LIFO no), ajuste de merma y variacion valorada.".
C. INDEX.JS            class ValoracionExistencia extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        6 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _valorar — valorar(producto, cantidad, fecha) -> Importe (H1, metodo parametro declarable)
                       · _capaDeValor — capaDeValor(inventarioExistente) -> Valoracion (H1: NO duplica el inventario)
                       · _calcularDiferencia — calcularDiferencia() -> Importe (H3: merma/rotura)
                       · _regularizar — regularizar(diferencia) -> Asiento + aviso (H3: el asiento SUMA)
                       · _valorarEntrada — valorarEntrada(compra) -> Importe (H4)
                       · _valorarSalida — valorarSalida(consumo) -> Importe (H4: el hecho de stock lo emite la fuente; contabilidad lo VALORA)
E. HANDLERS RPC        onValorarRequest -> _atender(e, 'valorar', ...) | onAjusteRequest -> _atender(e, 'ajuste', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.existencia_valorada` · `contabilidad.ajuste_inventario_calculado` · `contabilidad.existencia.valorar.failed` · `contabilidad.inventario.ajuste.failed` · `contabilidad.existencia_valorada.failed` · `contabilidad.ajuste_inventario_calculado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: `inventario` custodia el stock real; la VALORACION contable (capa de valor, merma, coste del consumo) no existe en el inventario.
```

### etiquetado-analitico — micro-agente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.etiqueta.aplicar.request`.
                       Depende (por EVENTO, sin require cruzado): `cola-declaraciones-criterio` · `cola-revision`.
B. MODULE.JSON         name:"etiquetado-analitico" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.etiqueta.aplicar.request"];
                       publishes:  ["contabilidad.etiqueta_aplicada","contabilidad.excepcion.encolar.request","contabilidad.etiqueta.aplicar.response","contabilidad.etiqueta.aplicar.failed","contabilidad.etiqueta_aplicada.failed","contabilidad.excepcion.encolar.failed"];
                       _doc: "Asigna centro/linea/producto con REGLA declarable; cuando la regla no cubre, clasificar es JUICIO -> lo dudoso va a cola.".
C. INDEX.JS            class EtiquetadoAnalitico extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _etiquetar — etiquetar(hecho) -> Etiqueta {centro, linea, producto} | SIN_REGLA (caso cubierto por regla = reflejo)
                       · _proponerEtiqueta — proponerEtiqueta(hecho) -> Etiqueta — FUZZY
E. HANDLERS RPC        onAplicarRequest -> _atender(e, 'aplicar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.etiqueta_aplicada` · `contabilidad.excepcion.encolar.request` · `contabilidad.etiqueta.aplicar.failed` · `contabilidad.etiqueta_aplicada.failed` · `contabilidad.excepcion.encolar.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: el etiquetado analitico por dimensiones declaradas no existe en el inventario.
```

### margen-analitico — reflejo (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.margen.calcular.request` · `contabilidad.indirecto.repartir.request` · `contabilidad.tablero.cruzar.request`.
                       Depende (por EVENTO, sin require cruzado): `mayor-balanza` · `valoracion-existencia` · `etiquetado-analitico` · `cola-declaraciones-criterio`.
B. MODULE.JSON         name:"margen-analitico" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.margen.calcular.request","contabilidad.indirecto.repartir.request","contabilidad.tablero.cruzar.request"];
                       publishes:  ["contabilidad.margen_calculado","contabilidad.indirecto_repartido","contabilidad.tablero_calculado","contabilidad.margen.calcular.response","contabilidad.margen.calcular.failed","contabilidad.indirecto.repartir.response","contabilidad.indirecto.repartir.failed","contabilidad.tablero.cruzar.response","contabilidad.tablero.cruzar.failed","contabilidad.margen_calculado.failed","contabilidad.indirecto_repartido.failed","contabilidad.tablero_calculado.failed"];
                       _doc: "Margen por dimension (ingreso - coste imputado), reparto DECLARADO de gastos no directos y cruce margen x dimension bajo lente de conjunto.".
C. INDEX.JS            class MargenAnalitico extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        3 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _calcular — calcular(dimension) -> Margen (J2: enlaza existencias con analitica)
                       · _repartir — repartir(gasto, criterio) -> Map<IdDimension, Importe> (J5: criterio declarado)
                       · _cruzar — cruzar(margen, dimension) -> Tablero (J10: por centro, familia o sociedad)
E. HANDLERS RPC        onCalcularRequest -> _atender(e, 'calcular', ...) | onRepartirRequest -> _atender(e, 'repartir', ...) | onCruzarRequest -> _atender(e, 'cruzar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.margen_calculado` · `contabilidad.indirecto_repartido` · `contabilidad.tablero_calculado` · `contabilidad.margen.calcular.failed` · `contabilidad.indirecto.repartir.failed` · `contabilidad.tablero.cruzar.failed` · `contabilidad.margen_calculado.failed` · `contabilidad.indirecto_repartido.failed` · `contabilidad.tablero_calculado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: el coste indirecto multi-sociedad y por periodos NO lo cubre la pieza existente (escandallo, mono-negocio).
```

### presupuesto — custodio (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto).
                       Escucha: `contabilidad.presupuesto.declarar.request` · `contabilidad.desviacion.calcular.request` · `contabilidad.periodos.comparar.request` · `project.activated`.
                       Depende (por EVENTO, sin require cruzado): `estados-contables` · `motor-avisos`.
B. MODULE.JSON         name:"presupuesto" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.presupuesto.declarar.request","contabilidad.desviacion.calcular.request","contabilidad.periodos.comparar.request","project.activated"];
                       publishes:  ["contabilidad.presupuesto_declarado","contabilidad.desviacion_calculada","contabilidad.comparacion_calculada","contabilidad.presupuesto.declarar.response","contabilidad.presupuesto.declarar.failed","contabilidad.desviacion.calcular.response","contabilidad.desviacion.calcular.failed","contabilidad.periodos.comparar.response","contabilidad.periodos.comparar.failed","contabilidad.presupuesto_declarado.failed","contabilidad.desviacion_calculada.failed","contabilidad.comparacion_calculada.failed"];
                       _doc: "Cifra OBJETIVO por dimension (un solo escritor: el jefe) + desviacion real-vs-presupuesto con umbral declarado + comparador de periodos que REUTILIZA ambos, no los duplica.".
C. INDEX.JS            class Presupuesto extends ModuloHibridoReflejo; onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.
D. PROYECCIONES        5 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _declarar — declarar(rol, dimension, cifra) — un solo escritor (JEFE) (J3)
                       · _objetivo — objetivo(dimension, periodo) -> CifraObjetivo (J3)
                       · _calcular — calcular(real, presupuesto) -> Desviacion (J4)
                       · _dispararSiExcede — dispararSiExcede(desviacion) -> senal a K2 con el umbral declarado (J4)
                       · _comparar — comparar(a, b) -> Delta (J9: ejercicio vs ejercicio, mes vs mes, real vs presupuesto)
E. HANDLERS RPC        onDeclararRequest -> _atender(e, 'declarar', ...) | onCalcularRequest -> _atender(e, 'calcular', ...) | onCompararRequest -> _atender(e, 'comparar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.presupuesto_declarado` · `contabilidad.desviacion_calculada` · `contabilidad.comparacion_calculada` · `contabilidad.presupuesto.declarar.failed` · `contabilidad.desviacion.calcular.failed` · `contabilidad.periodos.comparar.failed` · `contabilidad.presupuesto_declarado.failed` · `contabilidad.desviacion_calculada.failed` · `contabilidad.comparacion_calculada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store.
NO REUTILIZA / NOTA    NO REUTILIZA: `marketing-budget` es presupuesto de marketing y declara "custodia contable" solo de nombre: contabilidad lo LEE, no lo absorbe (solape registrado).
```

### cuadro-mando-contable — reflejo (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.cuadro_mando.agregar.request`.
                       Depende (por EVENTO, sin require cruzado): `saldo-tesoreria` · `estados-contables` · `margen-analitico` · `presupuesto` · `cierre-ejercicio`.
B. MODULE.JSON         name:"cuadro-mando-contable" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.cuadro_mando.agregar.request"];
                       publishes:  ["contabilidad.cuadro_mando_calculado","contabilidad.cuadro_mando.agregar.response","contabilidad.cuadro_mando.agregar.failed","contabilidad.cuadro_mando_calculado.failed"];
                       _doc: "Agregacion de CONJUNTO para el jefe (caja, resultado, margen, desviacion, ejercicio) SIN bajar al asiento.".
C. INDEX.JS            class CuadroMandoContable extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        1 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _agregar — agregar(lente: CONJUNTO) -> CuadroMando
E. HANDLERS RPC        onAgregarRequest -> _atender(e, 'agregar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.cuadro_mando_calculado` · `contabilidad.cuadro_mando.agregar.failed` · `contabilidad.cuadro_mando_calculado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: no existe cuadro de mando contable; reutiliza J2/J3/J4/E4/E5/C1/C2 por RPC sin duplicarlos.
```

### informe-rico — reflejo (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.informe.componer.request`.
                       Depende (por EVENTO, sin require cruzado): `estados-contables` · `cierre-ejercicio` · `completitud-cobertura`.
B. MODULE.JSON         name:"informe-rico" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.informe.componer.request"];
                       publishes:  ["contabilidad.informe_compuesto","contabilidad.informe.componer.response","contabilidad.informe.componer.failed","contabilidad.informe_compuesto.failed"];
                       _doc: "Nucleo de informe rico: cifra ya calculada + contexto declarado (periodo, origen, comparativas, cobertura). No un numero pelado.".
C. INDEX.JS            class InformeRico extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        1 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _componer — componer(cifra, contexto) -> InformeRico — mecanico
E. HANDLERS RPC        onComponerRequest -> _atender(e, 'componer', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.informe_compuesto` · `contabilidad.informe.componer.failed` · `contabilidad.informe_compuesto.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas).
NO REUTILIZA / NOTA    NO REUTILIZA: el nucleo de informe rico se sirve en idiomas distintos (dueno Q2 / cliente R3); no existe en el inventario.
```

### consulta-dueno — puente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.consulta.responder.request`.
                       Depende (por EVENTO, sin require cruzado): `completitud-cobertura` · `traza-asiento` · `flujo-firma` · `informe-rico`.
B. MODULE.JSON         name:"consulta-dueno" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.consulta.responder.request"];
                       publishes:  ["contabilidad.consulta_respondida","contabilidad.consulta.responder.response","contabilidad.consulta.responder.failed","contabilidad.consulta_respondida.failed"];
                       _doc: "Puerta PULL: el dueno pregunta cuando quiere y el sistema contesta, con SELLO DE COBERTURA y MARCA de borrador/revisado/firmado (sin cadencia impuesta).".
C. INDEX.JS            class ConsultaDueno extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        4 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _responder — responder(pregunta) -> ResultadoCalculo (Q1: puerta declarable; el canal es puerto)
                       · _sinCadencia — sinCadencia() -> Bool (Q1: != cuadro del jefe J8, que impone cadencia)
                       · _sellarCobertura — sellarCobertura(resultadoCalculo) -> con sello (Q3: vista de la metrica unica A12, fuera de ciclo)
                       · _derivarEstado — derivarEstado(periodo) -> EN_CURSO | REVISADO | FIRMADO (Q4: deriva de B4 + L3)
E. HANDLERS RPC        onResponderRequest -> _atender(e, 'responder', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.consulta_respondida` · `contabilidad.consulta.responder.failed` · `contabilidad.consulta_respondida.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: la cara pull del dueno sobre la contabilidad no existe en el inventario.
```

### puente-lenguaje-dueno — micro-agente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.dueno.preguntar.request` · `contabilidad.dueno.cifra.presentar.request`.
                       Depende (por EVENTO, sin require cruzado): `informe-rico` · `consulta-dueno`.
B. MODULE.JSON         name:"puente-lenguaje-dueno" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.dueno.preguntar.request","contabilidad.dueno.cifra.presentar.request"];
                       publishes:  ["contabilidad.consulta.responder.request","contabilidad.cifra_presentada","contabilidad.dueno.preguntar.response","contabilidad.dueno.preguntar.failed","contabilidad.dueno.cifra.presentar.response","contabilidad.dueno.cifra.presentar.failed","contabilidad.consulta.responder.failed","contabilidad.cifra_presentada.failed"];
                       _doc: "Traductor BIDIRECCIONAL: su pregunta -> consulta contable; calculo -> cifra en su idioma (caja, deuda, resultado, "puedo pagar X?").".
C. INDEX.JS            class PuenteLenguajeDueno extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _traducirPregunta — traducirPregunta(preguntaNatural) -> ConsultaContable — FUZZY
                       · _traducirCifra — traducirCifra(resultado) -> CifraEnSuIdioma — FUZZY; vocabulario declarable
E. HANDLERS RPC        onPreguntarRequest -> _atender(e, 'preguntar', ...) | onPresentarRequest -> _atender(e, 'presentar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.consulta.responder.request` · `contabilidad.cifra_presentada` · `contabilidad.dueno.preguntar.failed` · `contabilidad.dueno.cifra.presentar.failed` · `contabilidad.consulta.responder.failed` · `contabilidad.cifra_presentada.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: el puente de lenguaje del dueno no existe; comparte el nucleo de informe (K3) con R3, no el traductor.
```

### aviso-al-negocio — puente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo (sin persistencia de estado).
                       Escucha: `contabilidad.aviso.enrutar.request`.
                       Depende (por EVENTO, sin require cruzado): `motor-avisos`.
B. MODULE.JSON         name:"aviso-al-negocio" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.aviso.enrutar.request"];
                       publishes:  ["contabilidad.aviso_entregado","contabilidad.aviso_confirmado","contabilidad.aviso.enrutar.response","contabilidad.aviso.enrutar.failed","contabilidad.aviso_entregado.failed","contabilidad.aviso_confirmado.failed"];
                       _doc: "Cara de ENTREGA del aviso al negocio cliente: sin confirmacion de entrega el aviso NO consta como recibido. El canal es un puerto.".
C. INDEX.JS            class AvisoAlNegocio extends ModuloHibridoReflejo; sin estado que persistir.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _entregar — entregar(aviso) -> ok (canal declarable: K7)
                       · _confirmar — confirmar(entrega) -> Confirmacion (honestidad: nadie da por entregado sin confirmacion)
E. HANDLERS RPC        onEnrutarRequest -> _atender(e, 'enrutar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.aviso_entregado` · `contabilidad.aviso_confirmado` · `contabilidad.aviso.enrutar.failed` · `contabilidad.aviso_entregado.failed` · `contabilidad.aviso_confirmado.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume.
NO REUTILIZA / NOTA    NO REUTILIZA: completa K2 (que solo PRODUCE); la entrega al negocio contable no existe en el inventario.
```

### informe-accionable — micro-agente (CONSTRUIR · contabilidad-analitica)
```
A. DEPENDENCIAS        _shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes).
                       Escucha: `contabilidad.informe.accionable.request` · `contabilidad.estados.narrar.request`.
                       Depende (por EVENTO, sin require cruzado): `informe-rico` · `estados-contables` · `aviso-al-negocio`.
B. MODULE.JSON         name:"informe-accionable" (SIN prefijo de vertical);
                       subscribes: ["contabilidad.informe.accionable.request","contabilidad.estados.narrar.request"];
                       publishes:  ["contabilidad.informe_accionable","contabilidad.estados_narrados","contabilidad.informe.accionable.response","contabilidad.informe.accionable.failed","contabilidad.estados.narrar.response","contabilidad.estados.narrar.failed","contabilidad.informe_accionable.failed","contabilidad.estados_narrados.failed"];
                       _doc: "Todo informe que recibe el cliente lleva QUE HACER con el (R2) y los estados van narrados a su lenguaje (R3).".
C. INDEX.JS            class InformeAccionable extends ModuloHibridoReflejo; cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.
D. PROYECCIONES        2 metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:
                       · _recomendar — recomendar(informe) -> InformeAccionable — FUZZY
                       · _narrar — narrar(estados) -> Narracion "esto es lo que te ha pasado y lo que viene" — FUZZY
E. HANDLERS RPC        onAccionableRequest -> _atender(e, 'accionable', ...) | onNarrarRequest -> _atender(e, 'narrar', ...).
F. EVENTOS DE DOMINIO  publica `contabilidad.informe_accionable` · `contabilidad.estados_narrados` · `contabilidad.informe.accionable.failed` · `contabilidad.estados.narrar.failed` · `contabilidad.informe_accionable.failed` · `contabilidad.estados_narrados.failed` (fire-and-forget + par .failed; el .response cierra su RPC).
VERIFICACION           ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`.
NO REUTILIZA / NOTA    NO REUTILIZA: la recomendacion accionable y la narracion de estados son juicio (fuzzy) propio de la vertical.
```

---

## 4 · Contrato de eventos

### 4.1 — Pares request/response (RPC del bus)

| Quien pide (`*.request`) | Quien responde | Respuesta | Par de fallo |
|---|---|---|---|
| `fs.read.request` | `filesystem` | `fs.read.response` | `fs.read.failed` |
| `fs.write.request` | `filesystem` | `fs.write.response` | `fs.write.failed` |
| `fs.edit.request` | `filesystem` | `fs.edit.response` | `fs.edit.failed` |
| `fs.list.request` | `filesystem` | `fs.list.response` | `fs.list.failed` |
| `fs.exists.request` | `filesystem` | `fs.exists.response` | `fs.exists.failed` |
| `project.get.request` | `project-manager` | `project.get.response` | `project.get.failed` |
| `project.list.request` | `project-manager` | `project.list.response` | `project.list.failed` |
| `project.state.request` | `project-manager` | `project.state.response` | `project.state.failed` |
| `credential.resolve.request` | `credential-manager` | `credential.resolve.response` | `credential.resolve.failed` |
| `credential.create.request` | `credential-manager` | `credential.create.response` | `credential.create.failed` |
| `credential.update.request` | `credential-manager` | `credential.update.response` | `credential.update.failed` |
| `credential.delete.request` | `credential-manager` | `credential.delete.response` | `credential.delete.failed` |
| `credential.state.request` | `credential-manager` | `credential.state.response` | `credential.state.failed` |
| `contabilidad.contrato.declarar.request` | `contrato-hecho-minimo` | `contabilidad.contrato.declarar.response` | `contabilidad.contrato.declarar.failed` |
| `contabilidad.contrato.exigir.request` | `contrato-hecho-minimo` | `contabilidad.contrato.exigir.response` | `contabilidad.contrato.exigir.failed` |
| `contabilidad.contrato.cubre.request` | `contrato-hecho-minimo` | `contabilidad.contrato.cubre.response` | `contabilidad.contrato.cubre.failed` |
| `contabilidad.anclaje.declarar.request` | `anclaje-cierre-vertical` | `contabilidad.anclaje.declarar.response` | `contabilidad.anclaje.declarar.failed` |
| `contabilidad.anclaje.anclar.request` | `anclaje-cierre-vertical` | `contabilidad.anclaje.anclar.response` | `contabilidad.anclaje.anclar.failed` |
| `contabilidad.excepcion.encolar.request` | `cola-revision` | `contabilidad.excepcion.encolar.response` | `contabilidad.excepcion.encolar.failed` |
| `contabilidad.excepcion.resolver.request` | `cola-revision` | `contabilidad.excepcion.resolver.response` | `contabilidad.excepcion.resolver.failed` |
| `contabilidad.excepcion.siguiente.request` | `cola-revision` | `contabilidad.excepcion.siguiente.response` | `contabilidad.excepcion.siguiente.failed` |
| `contabilidad.regla.leer.request` | `regla-contrapartida` | `contabilidad.regla.leer.response` | `contabilidad.regla.leer.failed` |
| `contabilidad.regla.declarar.request` | `regla-contrapartida` | `contabilidad.regla.declarar.response` | `contabilidad.regla.declarar.failed` |
| `contabilidad.regla.aprender.request` | `regla-contrapartida` | `contabilidad.regla.aprender.response` | `contabilidad.regla.aprender.failed` |
| `contabilidad.clave.calcular.request` | `clave-natural` | `contabilidad.clave.calcular.response` | `contabilidad.clave.calcular.failed` |
| `contabilidad.clave.repeticion.request` | `clave-natural` | `contabilidad.clave.repeticion.response` | `contabilidad.clave.repeticion.failed` |
| `contabilidad.parcela.registrar.request` | `single-writer` | `contabilidad.parcela.registrar.response` | `contabilidad.parcela.registrar.failed` |
| `contabilidad.parcela.autorizar.request` | `single-writer` | `contabilidad.parcela.autorizar.response` | `contabilidad.parcela.autorizar.failed` |
| `contabilidad.frontera_planos.verificar.request` | `frontera-planos` | `contabilidad.frontera_planos.verificar.response` | `contabilidad.frontera_planos.verificar.failed` |
| `contabilidad.lote.despachar.request` | `lote-admision` | `contabilidad.lote.despachar.response` | `contabilidad.lote.despachar.failed` |
| `contabilidad.hecho.admitir.request` | `puerto-evento-vertical` | `contabilidad.hecho.admitir.response` | `contabilidad.hecho.admitir.failed` |
| `contabilidad.historial.anotar.request` | `historial-proceso-contable` | `contabilidad.historial.anotar.response` | `contabilidad.historial.anotar.failed` |
| `contabilidad.historial.consultar.request` | `historial-proceso-contable` | `contabilidad.historial.consultar.response` | `contabilidad.historial.consultar.failed` |
| `contabilidad.tercero.declarar.request` | `maestro-terceros` | `contabilidad.tercero.declarar.response` | `contabilidad.tercero.declarar.failed` |
| `contabilidad.tercero.ficha.request` | `maestro-terceros` | `contabilidad.tercero.ficha.response` | `contabilidad.tercero.ficha.failed` |
| `contabilidad.tercero.identificar.request` | `maestro-terceros` | `contabilidad.tercero.identificar.response` | `contabilidad.tercero.identificar.failed` |
| `contabilidad.tercero.historial.request` | `maestro-terceros` | `contabilidad.tercero.historial.response` | `contabilidad.tercero.historial.failed` |
| `contabilidad.hecho.normalizar.request` | `normalizador-hecho` | `contabilidad.hecho.normalizar.response` | `contabilidad.hecho.normalizar.failed` |
| `contabilidad.duplicado.verificar.request` | `deduplicacion-hecho` | `contabilidad.duplicado.verificar.response` | `contabilidad.duplicado.verificar.failed` |
| `contabilidad.contrapartida.proponer.request` | `resolucion-contrapartida` | `contabilidad.contrapartida.proponer.response` | `contabilidad.contrapartida.proponer.failed` |
| `contabilidad.cobertura.calcular.request` | `completitud-cobertura` | `contabilidad.cobertura.calcular.response` | `contabilidad.cobertura.calcular.failed` |
| `contabilidad.rectificativo.emparejar.request` | `hecho-rectificativo` | `contabilidad.rectificativo.emparejar.response` | `contabilidad.rectificativo.emparejar.failed` |
| `contabilidad.panel.latido.request` | `panel-proceso-contable` | `contabilidad.panel.latido.response` | `contabilidad.panel.latido.failed` |
| `contabilidad.desatasco.resolver.request` | `desatasco-entrada` | `contabilidad.desatasco.resolver.response` | `contabilidad.desatasco.resolver.failed` |
| `contabilidad.cuenta_terceros.saldo.request` | `cuenta-terceros` | `contabilidad.cuenta_terceros.saldo.response` | `contabilidad.cuenta_terceros.saldo.failed` |
| `contabilidad.cuenta_terceros.extracto.request` | `cuenta-terceros` | `contabilidad.cuenta_terceros.extracto.response` | `contabilidad.cuenta_terceros.extracto.failed` |
| `contabilidad.cuenta_terceros.vencimiento.request` | `cuenta-terceros` | `contabilidad.cuenta_terceros.vencimiento.response` | `contabilidad.cuenta_terceros.vencimiento.failed` |
| `contabilidad.cuenta_terceros.aging.request` | `cuenta-terceros` | `contabilidad.cuenta_terceros.aging.response` | `contabilidad.cuenta_terceros.aging.failed` |
| `contabilidad.compra.cotejar.request` | `compra-proveedor` | `contabilidad.compra.cotejar.response` | `contabilidad.compra.cotejar.failed` |
| `contabilidad.compra.coste_real.request` | `compra-proveedor` | `contabilidad.compra.coste_real.response` | `contabilidad.compra.coste_real.failed` |
| `contabilidad.factura.emitir.request` | `emision-factura-venta` | `contabilidad.factura.emitir.response` | `contabilidad.factura.emitir.failed` |
| `contabilidad.factura.rectificar.request` | `emision-factura-venta` | `contabilidad.factura.rectificar.response` | `contabilidad.factura.rectificar.failed` |
| `contabilidad.factura.series.request` | `emision-factura-venta` | `contabilidad.factura.series.response` | `contabilidad.factura.series.failed` |
| `contabilidad.cuenta.declarar.request` | `catalogo-cuentas` | `contabilidad.cuenta.declarar.response` | `contabilidad.cuenta.declarar.failed` |
| `contabilidad.cuenta.resolver.request` | `catalogo-cuentas` | `contabilidad.cuenta.resolver.response` | `contabilidad.cuenta.resolver.failed` |
| `contabilidad.plan.importar.request` | `catalogo-cuentas` | `contabilidad.plan.importar.response` | `contabilidad.plan.importar.failed` |
| `contabilidad.plan.exportar.request` | `catalogo-cuentas` | `contabilidad.plan.exportar.response` | `contabilidad.plan.exportar.failed` |
| `contabilidad.asiento.asentar.request` | `escritor-diario` | `contabilidad.asiento.asentar.response` | `contabilidad.asiento.asentar.failed` |
| `contabilidad.asiento.apertura.request` | `escritor-diario` | `contabilidad.asiento.apertura.response` | `contabilidad.asiento.apertura.failed` |
| `contabilidad.asiento.cierre.request` | `escritor-diario` | `contabilidad.asiento.cierre.response` | `contabilidad.asiento.cierre.failed` |
| `contabilidad.asiento.ajustar.request` | `escritor-diario` | `contabilidad.asiento.ajustar.response` | `contabilidad.asiento.ajustar.failed` |
| `contabilidad.mayor.saldo.request` | `mayor-balanza` | `contabilidad.mayor.saldo.response` | `contabilidad.mayor.saldo.failed` |
| `contabilidad.mayor.balanza.request` | `mayor-balanza` | `contabilidad.mayor.balanza.response` | `contabilidad.mayor.balanza.failed` |
| `contabilidad.mayor.movimientos.request` | `mayor-balanza` | `contabilidad.mayor.movimientos.response` | `contabilidad.mayor.movimientos.failed` |
| `contabilidad.traza.anotar.request` | `traza-asiento` | `contabilidad.traza.anotar.response` | `contabilidad.traza.anotar.failed` |
| `contabilidad.traza.consultar.request` | `traza-asiento` | `contabilidad.traza.consultar.response` | `contabilidad.traza.consultar.failed` |
| `contabilidad.ajuste.recibir.request` | `asiento-ajuste` | `contabilidad.ajuste.recibir.response` | `contabilidad.ajuste.recibir.failed` |
| `contabilidad.estado.balance.request` | `estados-contables` | `contabilidad.estado.balance.response` | `contabilidad.estado.balance.failed` |
| `contabilidad.estado.resultado.request` | `estados-contables` | `contabilidad.estado.resultado.response` | `contabilidad.estado.resultado.failed` |
| `contabilidad.periodo.imputar.request` | `periodificacion` | `contabilidad.periodo.imputar.response` | `contabilidad.periodo.imputar.failed` |
| `contabilidad.cierre.cerrar.request` | `cierre-ejercicio` | `contabilidad.cierre.cerrar.response` | `contabilidad.cierre.cerrar.failed` |
| `contabilidad.cierre.estado.request` | `cierre-ejercicio` | `contabilidad.cierre.estado.response` | `contabilidad.cierre.estado.failed` |
| `contabilidad.extracto.leer.request` | `puerto-extracto` | `contabilidad.extracto.leer.response` | `contabilidad.extracto.leer.failed` |
| `contabilidad.extracto.registrar_forma.request` | `puerto-extracto` | `contabilidad.extracto.registrar_forma.response` | `contabilidad.extracto.registrar_forma.failed` |
| `contabilidad.conciliacion.cruzar.request` | `conciliacion-bancaria` | `contabilidad.conciliacion.cruzar.response` | `contabilidad.conciliacion.cruzar.failed` |
| `contabilidad.conciliacion.informe.request` | `conciliacion-bancaria` | `contabilidad.conciliacion.informe.response` | `contabilidad.conciliacion.informe.failed` |
| `contabilidad.regla_movimiento.leer.request` | `regla-movimiento-bancario` | `contabilidad.regla_movimiento.leer.response` | `contabilidad.regla_movimiento.leer.failed` |
| `contabilidad.regla_movimiento.declarar.request` | `regla-movimiento-bancario` | `contabilidad.regla_movimiento.declarar.response` | `contabilidad.regla_movimiento.declarar.failed` |
| `contabilidad.regla_movimiento.aprender.request` | `regla-movimiento-bancario` | `contabilidad.regla_movimiento.aprender.response` | `contabilidad.regla_movimiento.aprender.failed` |
| `contabilidad.tesoreria.saldo.request` | `saldo-tesoreria` | `contabilidad.tesoreria.saldo.response` | `contabilidad.tesoreria.saldo.failed` |
| `contabilidad.tesoreria.prevision.request` | `saldo-tesoreria` | `contabilidad.tesoreria.prevision.response` | `contabilidad.tesoreria.prevision.failed` |
| `contabilidad.cuenta_bancaria.declarar.request` | `maestro-cuentas-bancarias` | `contabilidad.cuenta_bancaria.declarar.response` | `contabilidad.cuenta_bancaria.declarar.failed` |
| `contabilidad.cuenta_bancaria.listar.request` | `maestro-cuentas-bancarias` | `contabilidad.cuenta_bancaria.listar.response` | `contabilidad.cuenta_bancaria.listar.failed` |
| `contabilidad.asiento.explicar.request` | `vista-revisable` | `contabilidad.asiento.explicar.response` | `contabilidad.asiento.explicar.failed` |
| `contabilidad.muestra.seleccionar.request` | `vista-revisable` | `contabilidad.muestra.seleccionar.response` | `contabilidad.muestra.seleccionar.failed` |
| `contabilidad.firma.marcar.request` | `flujo-firma` | `contabilidad.firma.marcar.response` | `contabilidad.firma.marcar.failed` |
| `contabilidad.firma.delta.request` | `flujo-firma` | `contabilidad.firma.delta.response` | `contabilidad.firma.delta.failed` |
| `contabilidad.expediente.archivar.request` | `expediente-documental` | `contabilidad.expediente.archivar.response` | `contabilidad.expediente.archivar.failed` |
| `contabilidad.expediente.recuperar.request` | `expediente-documental` | `contabilidad.expediente.recuperar.response` | `contabilidad.expediente.recuperar.failed` |
| `contabilidad.perfil.declarar.request` | `perfil-administrativo` | `contabilidad.perfil.declarar.response` | `contabilidad.perfil.declarar.failed` |
| `contabilidad.perfil.aplicables.request` | `perfil-administrativo` | `contabilidad.perfil.aplicables.response` | `contabilidad.perfil.aplicables.failed` |
| `contabilidad.calendario.declarar.request` | `calendario-fiscal` | `contabilidad.calendario.declarar.response` | `contabilidad.calendario.declarar.failed` |
| `contabilidad.calendario.proximos.request` | `calendario-fiscal` | `contabilidad.calendario.proximos.response` | `contabilidad.calendario.proximos.failed` |
| `contabilidad.iva.liquidar.request` | `liquidacion-iva` | `contabilidad.iva.liquidar.response` | `contabilidad.iva.liquidar.failed` |
| `contabilidad.modelo.303.request` | `liquidacion-iva` | `contabilidad.modelo.303.response` | `contabilidad.modelo.303.failed` |
| `contabilidad.modelo.390.request` | `liquidacion-iva` | `contabilidad.modelo.390.response` | `contabilidad.modelo.390.failed` |
| `contabilidad.retenciones.calcular.request` | `retenciones-is-irpf` | `contabilidad.retenciones.calcular.response` | `contabilidad.retenciones.calcular.failed` |
| `contabilidad.estimacion.calcular.request` | `retenciones-is-irpf` | `contabilidad.estimacion.calcular.response` | `contabilidad.estimacion.calcular.failed` |
| `contabilidad.obligacion.avanzar.request` | `estado-presentacion-fiscal` | `contabilidad.obligacion.avanzar.response` | `contabilidad.obligacion.avanzar.failed` |
| `contabilidad.obligacion.estado.request` | `estado-presentacion-fiscal` | `contabilidad.obligacion.estado.response` | `contabilidad.obligacion.estado.failed` |
| `contabilidad.modelo.generar.request` | `generador-modelo` | `contabilidad.modelo.generar.response` | `contabilidad.modelo.generar.failed` |
| `contabilidad.registro.anotar.request` | `registro-verifactu` | `contabilidad.registro.anotar.response` | `contabilidad.registro.anotar.failed` |
| `contabilidad.registro.verificar.request` | `registro-verifactu` | `contabilidad.registro.verificar.response` | `contabilidad.registro.verificar.failed` |
| `contabilidad.factura.estructurar.request` | `factura-electronica` | `contabilidad.factura.estructurar.response` | `contabilidad.factura.estructurar.failed` |
| `contabilidad.factura.interpretar.request` | `factura-electronica` | `contabilidad.factura.interpretar.response` | `contabilidad.factura.interpretar.failed` |
| `contabilidad.acuse.recibir.request` | `acuse-presentacion` | `contabilidad.acuse.recibir.response` | `contabilidad.acuse.recibir.failed` |
| `contabilidad.declaracion.rectificar.request` | `rectificacion-declaracion` | `contabilidad.declaracion.rectificar.response` | `contabilidad.declaracion.rectificar.failed` |
| `contabilidad.nomina.recibir.request` | `puerto-nomina` | `contabilidad.nomina.recibir.response` | `contabilidad.nomina.recibir.failed` |
| `contabilidad.nomina.procesar.request` | `recibo-nomina` | `contabilidad.nomina.procesar.response` | `contabilidad.nomina.procesar.failed` |
| `contabilidad.nomina.desglosar.request` | `recibo-nomina` | `contabilidad.nomina.desglosar.response` | `contabilidad.nomina.desglosar.failed` |
| `contabilidad.nomina.liquidar.request` | `recibo-nomina` | `contabilidad.nomina.liquidar.response` | `contabilidad.nomina.liquidar.failed` |
| `contabilidad.nomina.autorizar.request` | `acceso-nomina` | `contabilidad.nomina.autorizar.response` | `contabilidad.nomina.autorizar.failed` |
| `contabilidad.nomina.puede_ver.request` | `acceso-nomina` | `contabilidad.nomina.puede_ver.response` | `contabilidad.nomina.puede_ver.failed` |
| `contabilidad.activo.alta.request` | `inmovilizado` | `contabilidad.activo.alta.response` | `contabilidad.activo.alta.failed` |
| `contabilidad.amortizacion.generar.request` | `inmovilizado` | `contabilidad.amortizacion.generar.response` | `contabilidad.amortizacion.generar.failed` |
| `contabilidad.activo.baja.request` | `inmovilizado` | `contabilidad.activo.baja.response` | `contabilidad.activo.baja.failed` |
| `contabilidad.activo.valor_neto.request` | `inmovilizado` | `contabilidad.activo.valor_neto.response` | `contabilidad.activo.valor_neto.failed` |
| `contabilidad.parcela_negocio.registrar.request` | `aislamiento-negocio` | `contabilidad.parcela_negocio.registrar.response` | `contabilidad.parcela_negocio.registrar.failed` |
| `contabilidad.parcela_negocio.escribir.request` | `aislamiento-negocio` | `contabilidad.parcela_negocio.escribir.response` | `contabilidad.parcela_negocio.escribir.failed` |
| `contabilidad.criterio.declarar.request` | `cola-declaraciones-criterio` | `contabilidad.criterio.declarar.response` | `contabilidad.criterio.declarar.failed` |
| `contabilidad.criterio.leer.request` | `cola-declaraciones-criterio` | `contabilidad.criterio.leer.response` | `contabilidad.criterio.leer.failed` |
| `contabilidad.criterio.pendientes.request` | `cola-declaraciones-criterio` | `contabilidad.criterio.pendientes.response` | `contabilidad.criterio.pendientes.failed` |
| `contabilidad.negocio.configurar.request` | `onboarding-negocio` | `contabilidad.negocio.configurar.response` | `contabilidad.negocio.configurar.failed` |
| `contabilidad.negocio.estado.request` | `onboarding-negocio` | `contabilidad.negocio.estado.response` | `contabilidad.negocio.estado.failed` |
| `contabilidad.negocio.activar.request` | `onboarding-negocio` | `contabilidad.negocio.activar.response` | `contabilidad.negocio.activar.failed` |
| `contabilidad.aviso.solicitar.request` | `motor-avisos` | `contabilidad.aviso.solicitar.response` | `contabilidad.aviso.solicitar.failed` |
| `contabilidad.aviso.catalogo.declarar.request` | `motor-avisos` | `contabilidad.aviso.catalogo.declarar.response` | `contabilidad.aviso.catalogo.declarar.failed` |
| `contabilidad.consolidacion.agregar.request` | `consolidacion-grupo` | `contabilidad.consolidacion.agregar.response` | `contabilidad.consolidacion.agregar.failed` |
| `contabilidad.ficha.coste.request` | `frontera-ficha-producto` | `contabilidad.ficha.coste.response` | `contabilidad.ficha.coste.failed` |
| `contabilidad.existencia.valorar.request` | `valoracion-existencia` | `contabilidad.existencia.valorar.response` | `contabilidad.existencia.valorar.failed` |
| `contabilidad.inventario.ajuste.request` | `valoracion-existencia` | `contabilidad.inventario.ajuste.response` | `contabilidad.inventario.ajuste.failed` |
| `contabilidad.etiqueta.aplicar.request` | `etiquetado-analitico` | `contabilidad.etiqueta.aplicar.response` | `contabilidad.etiqueta.aplicar.failed` |
| `contabilidad.margen.calcular.request` | `margen-analitico` | `contabilidad.margen.calcular.response` | `contabilidad.margen.calcular.failed` |
| `contabilidad.indirecto.repartir.request` | `margen-analitico` | `contabilidad.indirecto.repartir.response` | `contabilidad.indirecto.repartir.failed` |
| `contabilidad.tablero.cruzar.request` | `margen-analitico` | `contabilidad.tablero.cruzar.response` | `contabilidad.tablero.cruzar.failed` |
| `contabilidad.presupuesto.declarar.request` | `presupuesto` | `contabilidad.presupuesto.declarar.response` | `contabilidad.presupuesto.declarar.failed` |
| `contabilidad.desviacion.calcular.request` | `presupuesto` | `contabilidad.desviacion.calcular.response` | `contabilidad.desviacion.calcular.failed` |
| `contabilidad.periodos.comparar.request` | `presupuesto` | `contabilidad.periodos.comparar.response` | `contabilidad.periodos.comparar.failed` |
| `contabilidad.cuadro_mando.agregar.request` | `cuadro-mando-contable` | `contabilidad.cuadro_mando.agregar.response` | `contabilidad.cuadro_mando.agregar.failed` |
| `contabilidad.informe.componer.request` | `informe-rico` | `contabilidad.informe.componer.response` | `contabilidad.informe.componer.failed` |
| `contabilidad.consulta.responder.request` | `consulta-dueno` | `contabilidad.consulta.responder.response` | `contabilidad.consulta.responder.failed` |
| `contabilidad.dueno.preguntar.request` | `puente-lenguaje-dueno` | `contabilidad.dueno.preguntar.response` | `contabilidad.dueno.preguntar.failed` |
| `contabilidad.dueno.cifra.presentar.request` | `puente-lenguaje-dueno` | `contabilidad.dueno.cifra.presentar.response` | `contabilidad.dueno.cifra.presentar.failed` |
| `contabilidad.aviso.enrutar.request` | `aviso-al-negocio` | `contabilidad.aviso.enrutar.response` | `contabilidad.aviso.enrutar.failed` |
| `contabilidad.informe.accionable.request` | `informe-accionable` | `contabilidad.informe.accionable.response` | `contabilidad.informe.accionable.failed` |
| `contabilidad.estados.narrar.request` | `informe-accionable` | `contabilidad.estados.narrar.response` | `contabilidad.estados.narrar.failed` |

### 4.2 — Fire-and-forget + par de fallo (todo flujo cierra su circulo)

| Evento de dominio | Emisor | Consumidores | Par de fallo |
|---|---|---|---|
| `asesoria.paquete.error` | `facturacion/asesoria` | (ninguno) | `asesoria.paquete.failed` |
| `asesoria.paquete.generado` | `facturacion/asesoria` | (ninguno) | `asesoria.paquete.failed` |
| `contabilidad.acceso_nomina_autorizado` | `acceso-nomina` | (ninguno) | `contabilidad.acceso_nomina_autorizado.failed` |
| `contabilidad.activo_dado_de_alta` | `inmovilizado` | (ninguno) | `contabilidad.activo_dado_de_alta.failed` |
| `contabilidad.activo_dado_de_baja` | `inmovilizado` | (ninguno) | `contabilidad.activo_dado_de_baja.failed` |
| `contabilidad.acuse_ligado` | `acuse-presentacion` | (ninguno) | `contabilidad.acuse_ligado.failed` |
| `contabilidad.ajuste_inventario_calculado` | `valoracion-existencia` | (ninguno) | `contabilidad.ajuste_inventario_calculado.failed` |
| `contabilidad.ajuste_recibido` | `asiento-ajuste` | (ninguno) | `contabilidad.ajuste_recibido.failed` |
| `contabilidad.amortizacion_generada` | `inmovilizado` | (ninguno) | `contabilidad.amortizacion_generada.failed` |
| `contabilidad.anclaje_declarado` | `anclaje-cierre-vertical` | `completitud-cobertura` | `contabilidad.anclaje_declarado.failed` |
| `contabilidad.apertura_generada` | `cierre-ejercicio` | (ninguno) | `contabilidad.apertura_generada.failed` |
| `contabilidad.asiento_asentado` | `escritor-diario` | `traza-asiento` | `contabilidad.asiento_asentado.failed` |
| `contabilidad.asiento_rechazado` | `escritor-diario` | (ninguno) | `contabilidad.asiento_rechazado.failed` |
| `contabilidad.aviso_confirmado` | `aviso-al-negocio` | (ninguno) | `contabilidad.aviso_confirmado.failed` |
| `contabilidad.aviso_entregado` | `aviso-al-negocio` | (ninguno) | `contabilidad.aviso_entregado.failed` |
| `contabilidad.aviso_producido` | `motor-avisos` | (ninguno) | `contabilidad.aviso_producido.failed` |
| `contabilidad.aviso_revision_solicitado` | `aviso-revision` | (ninguno) | `contabilidad.aviso_revision_solicitado.failed` |
| `contabilidad.balance_calculado` | `estados-contables` | (ninguno) | `contabilidad.balance_calculado.failed` |
| `contabilidad.balanza_calculada` | `mayor-balanza` | (ninguno) | `contabilidad.balanza_calculada.failed` |
| `contabilidad.caja_proyectada` | `saldo-tesoreria` | (ninguno) | `contabilidad.caja_proyectada.failed` |
| `contabilidad.cierre_realizado` | `cierre-ejercicio` | `aviso-cuadre` · `inmovilizado` | `contabilidad.cierre_realizado.failed` |
| `contabilidad.cifra_archivada` | `expediente-documental` | (ninguno) | `contabilidad.cifra_archivada.failed` |
| `contabilidad.cifra_presentada` | `puente-lenguaje-dueno` | (ninguno) | `contabilidad.cifra_presentada.failed` |
| `contabilidad.clave_calculada` | `clave-natural` | (ninguno) | `contabilidad.clave_calculada.failed` |
| `contabilidad.cobertura_calculada` | `completitud-cobertura` | `declaracion-fuente-faltante` · `aviso-cuadre` | `contabilidad.cobertura_calculada.failed` |
| `contabilidad.comparacion_calculada` | `presupuesto` | (ninguno) | `contabilidad.comparacion_calculada.failed` |
| `contabilidad.compra_cotejada` | `compra-proveedor` | (ninguno) | `contabilidad.compra_cotejada.failed` |
| `contabilidad.conciliacion_realizada` | `conciliacion-bancaria` | (ninguno) | `contabilidad.conciliacion_realizada.failed` |
| `contabilidad.consulta_respondida` | `consulta-dueno` | (ninguno) | `contabilidad.consulta_respondida.failed` |
| `contabilidad.contrapartida_propuesta` | `resolucion-contrapartida` | `escritor-diario` | `contabilidad.contrapartida_propuesta.failed` |
| `contabilidad.contrato_declarado` | `contrato-hecho-minimo` | `puerto-evento-vertical` | `contabilidad.contrato_declarado.failed` |
| `contabilidad.coste_leido` | `frontera-ficha-producto` | (ninguno) | `contabilidad.coste_leido.failed` |
| `contabilidad.criterio_declarado` | `cola-declaraciones-criterio` | (ninguno) | `contabilidad.criterio_declarado.failed` |
| `contabilidad.criterio_pendiente` | `cola-declaraciones-criterio` | (ninguno) | `contabilidad.criterio_pendiente.failed` |
| `contabilidad.cuadre_evaluado` | `aviso-cuadre` | (ninguno) | `contabilidad.cuadre_evaluado.failed` |
| `contabilidad.cuadro_mando_calculado` | `cuadro-mando-contable` | (ninguno) | `contabilidad.cuadro_mando_calculado.failed` |
| `contabilidad.cuenta_bancaria_declarada` | `maestro-cuentas-bancarias` | (ninguno) | `contabilidad.cuenta_bancaria_declarada.failed` |
| `contabilidad.cuenta_declarada` | `catalogo-cuentas` | (ninguno) | `contabilidad.cuenta_declarada.failed` |
| `contabilidad.cuenta_terceros_calculada` | `cuenta-terceros` | (ninguno) | `contabilidad.cuenta_terceros_calculada.failed` |
| `contabilidad.cuota_estimada` | `retenciones-is-irpf` | (ninguno) | `contabilidad.cuota_estimada.failed` |
| `contabilidad.declaracion_rectificada` | `rectificacion-declaracion` | (ninguno) | `contabilidad.declaracion_rectificada.failed` |
| `contabilidad.delta_revision_calculado` | `flujo-firma` | (ninguno) | `contabilidad.delta_revision_calculado.failed` |
| `contabilidad.desviacion_calculada` | `presupuesto` | (ninguno) | `contabilidad.desviacion_calculada.failed` |
| `contabilidad.documento_descuadrado` | `normalizador-hecho` | (ninguno) | `contabilidad.documento_descuadrado.failed` |
| `contabilidad.estados_narrados` | `informe-accionable` | (ninguno) | `contabilidad.estados_narrados.failed` |
| `contabilidad.etiqueta_aplicada` | `etiquetado-analitico` | (ninguno) | `contabilidad.etiqueta_aplicada.failed` |
| `contabilidad.excepcion_desatascada` | `desatasco-entrada` | (ninguno) | `contabilidad.excepcion_desatascada.failed` |
| `contabilidad.excepcion_encolada` | `cola-revision` | `historial-proceso-contable` · `desatasco-entrada` · `aviso-revision` | `contabilidad.excepcion_encolada.failed` |
| `contabilidad.excepcion_resuelta` | `cola-revision` | `historial-proceso-contable` | `contabilidad.excepcion_resuelta.failed` |
| `contabilidad.existencia_valorada` | `valoracion-existencia` | (ninguno) | `contabilidad.existencia_valorada.failed` |
| `contabilidad.extracto_leido` | `puerto-extracto` | (ninguno) | `contabilidad.extracto_leido.failed` |
| `contabilidad.factura_emitida` | `emision-factura-venta` | `registro-verifactu` | `contabilidad.factura_emitida.failed` |
| `contabilidad.factura_estructurada` | `factura-electronica` | (ninguno) | `contabilidad.factura_estructurada.failed` |
| `contabilidad.factura_interpretada` | `factura-electronica` | (ninguno) | `contabilidad.factura_interpretada.failed` |
| `contabilidad.factura_rectificada` | `emision-factura-venta` | (ninguno) | `contabilidad.factura_rectificada.failed` |
| `contabilidad.firma_registrada` | `flujo-firma` | (ninguno) | `contabilidad.firma_registrada.failed` |
| `contabilidad.frontera_planos_verificada` | `frontera-planos` | (ninguno) | `contabilidad.frontera_planos_verificada.failed` |
| `contabilidad.fuente_faltante_declarada` | `declaracion-fuente-faltante` | (ninguno) | `contabilidad.fuente_faltante_declarada.failed` |
| `contabilidad.grupo_consolidado` | `consolidacion-grupo` | (ninguno) | `contabilidad.grupo_consolidado.failed` |
| `contabilidad.hecho_admitido` | `puerto-evento-vertical` | `historial-proceso-contable` · `normalizador-hecho` · `completitud-cobertura` · `hecho-rectificativo` · `cierre-ejercicio` | `contabilidad.hecho_admitido.failed` |
| `contabilidad.hecho_duplicado` | `deduplicacion-hecho` | (ninguno) | `contabilidad.hecho_duplicado.failed` |
| `contabilidad.hecho_normalizado` | `normalizador-hecho` | `deduplicacion-hecho` | `contabilidad.hecho_normalizado.failed` |
| `contabilidad.hecho_nuevo` | `deduplicacion-hecho` | `resolucion-contrapartida` | `contabilidad.hecho_nuevo.failed` |
| `contabilidad.hecho_rectificado` | `hecho-rectificativo` | (ninguno) | `contabilidad.hecho_rectificado.failed` |
| `contabilidad.historial_anotado` | `historial-proceso-contable` | (ninguno) | `contabilidad.historial_anotado.failed` |
| `contabilidad.indirecto_repartido` | `margen-analitico` | (ninguno) | `contabilidad.indirecto_repartido.failed` |
| `contabilidad.informe_accionable` | `informe-accionable` | (ninguno) | `contabilidad.informe_accionable.failed` |
| `contabilidad.informe_compuesto` | `informe-rico` | (ninguno) | `contabilidad.informe_compuesto.failed` |
| `contabilidad.iva_liquidado` | `liquidacion-iva` | (ninguno) | `contabilidad.iva_liquidado.failed` |
| `contabilidad.lote_despachado` | `lote-admision` | (ninguno) | `contabilidad.lote_despachado.failed` |
| `contabilidad.margen_calculado` | `margen-analitico` | (ninguno) | `contabilidad.margen_calculado.failed` |
| `contabilidad.modelo_construido` | `liquidacion-iva` | (ninguno) | `contabilidad.modelo_construido.failed` |
| `contabilidad.modelo_entregado` | `generador-modelo` | (ninguno) | `contabilidad.modelo_entregado.failed` |
| `contabilidad.modelo_generado` | `generador-modelo` | (ninguno) | `contabilidad.modelo_generado.failed` |
| `contabilidad.movimiento_sin_cruzar` | `conciliacion-bancaria` | `partida-no-identificada` | `contabilidad.movimiento_sin_cruzar.failed` |
| `contabilidad.muestra_seleccionada` | `vista-revisable` | (ninguno) | `contabilidad.muestra_seleccionada.failed` |
| `contabilidad.negocio_configurado` | `onboarding-negocio` | (ninguno) | `contabilidad.negocio_configurado.failed` |
| `contabilidad.nomina_formada` | `recibo-nomina` | (ninguno) | `contabilidad.nomina_formada.failed` |
| `contabilidad.nomina_recibida` | `puerto-nomina` | `recibo-nomina` | `contabilidad.nomina_recibida.failed` |
| `contabilidad.obligacion_avanzada` | `estado-presentacion-fiscal` | (ninguno) | `contabilidad.obligacion_avanzada.failed` |
| `contabilidad.panel_latido` | `panel-proceso-contable` | (ninguno) | `contabilidad.panel_latido.failed` |
| `contabilidad.parcela_autorizada` | `single-writer` | (ninguno) | `contabilidad.parcela_autorizada.failed` |
| `contabilidad.parcela_negocio_registrada` | `aislamiento-negocio` | (ninguno) | `contabilidad.parcela_negocio_registrada.failed` |
| `contabilidad.parcela_registrada` | `single-writer` | (ninguno) | `contabilidad.parcela_registrada.failed` |
| `contabilidad.partida_clasificada` | `partida-no-identificada` | (ninguno) | `contabilidad.partida_clasificada.failed` |
| `contabilidad.perfil_declarado` | `perfil-administrativo` | (ninguno) | `contabilidad.perfil_declarado.failed` |
| `contabilidad.periodo_imputado` | `periodificacion` | (ninguno) | `contabilidad.periodo_imputado.failed` |
| `contabilidad.plan_exportado` | `catalogo-cuentas` | (ninguno) | `contabilidad.plan_exportado.failed` |
| `contabilidad.plan_importado` | `catalogo-cuentas` | (ninguno) | `contabilidad.plan_importado.failed` |
| `contabilidad.plazo_declarado` | `calendario-fiscal` | (ninguno) | `contabilidad.plazo_declarado.failed` |
| `contabilidad.plazo_proximo` | `calendario-fiscal` | (ninguno) | `contabilidad.plazo_proximo.failed` |
| `contabilidad.presupuesto_declarado` | `presupuesto` | (ninguno) | `contabilidad.presupuesto_declarado.failed` |
| `contabilidad.registro_verifactu_anotado` | `registro-verifactu` | (ninguno) | `contabilidad.registro_verifactu_anotado.failed` |
| `contabilidad.regla_aprendida` | `regla-contrapartida` · `desatasco-entrada` | `ratificacion-regla-aprendida` | `contabilidad.regla_aprendida.failed` |
| `contabilidad.regla_declarada` | `regla-contrapartida` | (ninguno) | `contabilidad.regla_declarada.failed` |
| `contabilidad.regla_movimiento_aprendida` | `regla-movimiento-bancario` | (ninguno) | `contabilidad.regla_movimiento_aprendida.failed` |
| `contabilidad.regla_movimiento_declarada` | `regla-movimiento-bancario` | (ninguno) | `contabilidad.regla_movimiento_declarada.failed` |
| `contabilidad.regla_ratificada` | `ratificacion-regla-aprendida` | `regla-contrapartida` · `regla-movimiento-bancario` | `contabilidad.regla_ratificada.failed` |
| `contabilidad.resultado_calculado` | `estados-contables` | (ninguno) | `contabilidad.resultado_calculado.failed` |
| `contabilidad.retenciones_calculadas` | `retenciones-is-irpf` | (ninguno) | `contabilidad.retenciones_calculadas.failed` |
| `contabilidad.saldo_tesoreria_calculado` | `saldo-tesoreria` | (ninguno) | `contabilidad.saldo_tesoreria_calculado.failed` |
| `contabilidad.tablero_calculado` | `margen-analitico` | (ninguno) | `contabilidad.tablero_calculado.failed` |
| `contabilidad.tercero_declarado` | `maestro-terceros` | (ninguno) | `contabilidad.tercero_declarado.failed` |
| `contabilidad.tercero_identificado` | `maestro-terceros` | (ninguno) | `contabilidad.tercero_identificado.failed` |
| `contabilidad.traza_anotada` | `traza-asiento` | (ninguno) | `contabilidad.traza_anotada.failed` |
| `contabilidad.vertical_activada` | `onboarding-negocio` | (ninguno) | `contabilidad.vertical_activada.failed` |
| `contabilidad.vista_explicada` | `vista-revisable` | (ninguno) | `contabilidad.vista_explicada.failed` |
| `credential.deleted` | `credential-manager` | (ninguno) | `credential.failed` |
| `credential.saved` | `credential-manager` | (ninguno) | `credential.failed` |
| `credential.state` | `credential-manager` | (ninguno) | `credential.failed` |
| `credential.updated` | `credential-manager` | (ninguno) | `credential.failed` |
| `factura.entrada` | `facturacion/fuentes` | `facturas` | `factura.failed` |
| `factura.error` | `facturas` | (ninguno) | `factura.failed` |
| `factura.exportada` | `facturas` | (ninguno) | `factura.failed` |
| `factura.procesada` | `facturas` | `normalizador-hecho` | `factura.failed` |
| `factura.recibida` | `facturas` | (ninguno) | `factura.failed` |
| `inventario.ajustado` | `inventario` | (ninguno) | `inventario.failed` |
| `inventario.confirmado` | `inventario` | (ninguno) | `inventario.failed` |
| `inventario.reserva.creada` | `inventario` | (ninguno) | `inventario.reserva.failed` |
| `inventario.reserva.expirada` | `inventario` | (ninguno) | `inventario.reserva.failed` |
| `inventario.reserva.liberada` | `inventario` | (ninguno) | `inventario.reserva.failed` |
| `inventario.stock.bajo_minimo` | `inventario` | (ninguno) | `inventario.stock.failed` |
| `metricas.snapshot` | `metricas` | (ninguno) | `metricas.failed` |
| `project.activated` | `project-manager` | `filesystem` · `contrato-hecho-minimo` · `anclaje-cierre-vertical` · `cola-revision` · `regla-contrapartida` · `single-writer` · `puerto-evento-vertical` · `historial-proceso-contable` · `maestro-terceros` · `emision-factura-venta` · `catalogo-cuentas` · `escritor-diario` · `traza-asiento` · `cierre-ejercicio` · `regla-movimiento-bancario` · `maestro-cuentas-bancarias` · `flujo-firma` · `expediente-documental` · `perfil-administrativo` · `calendario-fiscal` · `estado-presentacion-fiscal` · `registro-verifactu` · `rectificacion-declaracion` · `acceso-nomina` · `inmovilizado` · `aislamiento-negocio` · `cola-declaraciones-criterio` · `onboarding-negocio` · `presupuesto` | `project.failed` |
| `project.created` | `project-manager` | (ninguno) | `project.failed` |
| `project.deactivated` | `project-manager` | `filesystem` | `project.failed` |
| `project.state` | `project-manager` | (ninguno) | `project.failed` |

> Eventos de la FUENTE (verticales): **no se fijan aqui** — entran por el puerto `puerto-evento-vertical` (A1) con el contrato minimo declarado (A11). Cero nombres inventados.

---

## 5 · Reparto por los 4 ejes (particion decidida por el dueno 2026-09-28)

| vertical | hojas | CONSTRUIR | REUTILIZAR | clases F3 |
|---|---|---|---|---|
| `contabilidad-entrada` | 20 | 20 | 0 | 32 |
| `contabilidad-libro` | 22 | 22 | 0 | 32 |
| `contabilidad-fiscal` | 13 | 13 | 0 | 22 |
| `contabilidad-analitica` | 17 | 17 | 0 | 32 |
| *(transversal)* | 3 | 0 | 3 | infraestructura (sirve a los 4) |
| **TOTAL** | **80** | **72** | **8** | **118** |

**Oleadas (orden de CONSTRUCCION, no de comunicacion):**

| oleada | vertical | hojas | por que en este orden |
|---|---|---|---|
| 0 | *(transversal)* | 3 | infraestructura: `filesystem`, `project-manager`, `credential-manager` — existen y se REUTILIZAN. |
| 1 | `contabilidad-entrada` | 22 | **EL CUELLO.** La entrada es el eslabon limitante: si la puerta no se llena sola, nada aguas abajo cuadra. |
| 2 | `contabilidad-libro` | 24 | Donde el cuello ENTREGA: diario, mayor, cierre, tesoreria y la revision del asesor (medida maestra). |
| 3 | `contabilidad-fiscal` | 13 | Capa fiscal completa (vendible como anadido); se calcula sobre el libro ya vivo. |
| 4 | `contabilidad-analitica` | 18 | Inmovilizado, existencias valoradas, grupo, analitica, avisos y caras de actor: LEEN lo ya calculado. |

**Nota de dependencias cruzadas (honestidad):** el orden de la espina es **topologico** (dependencias primero) y las oleadas son de **despliegue por vertical**. Cuando una hoja de oleada tardia es dependencia de una temprana (p.ej. `motor-avisos` K2 o `mayor-balanza` B3), la espina la **adelanta**; mientras no exista, el consumidor construye con **contrato TOLERANTE** (su RPC falla -> publica su par `.failed`, nunca basura).

**Piezas `[ABIERTO]` (23):** **no son hojas**. Son parametros declarables que viven en `cola-declaraciones-criterio` (K9) o en el `module.json` de su consumidor, y hasta que el dueno/asesor declare el valor la pieza **no actua**. Cero valores estimados.

---

## 6 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos` en F4)

```json enki-plan
{
  "proyecto": "contabilidad",
  "proyecto_id": "contabilidad",
  "origen": "fase3/diseno-oop.md (135 clases = 118 de dominio por eje 32/32/22/32 + 17 de soporte) + fase2/esquemas/esquema.md (118 hojas con su FORMA, innegociable) + fase3b/reutilizables-verificados.md (8 REUTILIZAR verificados contra el module.json REAL) + fase3b/inventario-modulos-enki.json (248 modulos reales)",
  "inventario": "248 modulos reales consultados en fase3b/inventario-modulos-enki.json (contrato leido de events.subscribes/events.publishes, NO por nombre; `banco` = banco de NICHOS, no banca)",
  "regla": "modulos-isla event-driven: CLASE con estado -> CUSTODIO (single-writer); CLASE que solo calcula -> PROYECCION INTERNA del modulo que la usa (jamas en _shared/); CLASE que orquesta -> MICRO-AGENTE; CLASE que habla con el exterior -> PUENTE; frontera de formato -> CONVERSOR; dependencia entre clases -> EVENTO request/response, nunca require. _shared/ SOLO infraestructura.",
  "verticales": [
    "contabilidad-entrada",
    "contabilidad-libro",
    "contabilidad-fiscal",
    "contabilidad-analitica"
  ],
  "orden": [
    "filesystem",
    "project-manager",
    "credential-manager",
    "facturas",
    "facturacion/fuentes",
    "metricas",
    "facturacion/asesoria",
    "inventario",
    "contrato-hecho-minimo",
    "anclaje-cierre-vertical",
    "cola-revision",
    "regla-contrapartida",
    "single-writer",
    "frontera-planos",
    "lote-admision",
    "puerto-evento-vertical",
    "historial-proceso-contable",
    "maestro-terceros",
    "normalizador-hecho",
    "puerto-extracto",
    "regla-movimiento-bancario",
    "maestro-cuentas-bancarias",
    "expediente-documental",
    "ratificacion-regla-aprendida",
    "puerto-nomina",
    "aislamiento-negocio",
    "acceso-nomina",
    "cola-declaraciones-criterio",
    "clave-natural",
    "deduplicacion-hecho",
    "completitud-cobertura",
    "hecho-rectificativo",
    "panel-proceso-contable",
    "catalogo-cuentas",
    "resolucion-contrapartida",
    "desatasco-entrada",
    "escritor-diario",
    "emision-factura-venta",
    "mayor-balanza",
    "cuenta-terceros",
    "compra-proveedor",
    "traza-asiento",
    "asiento-ajuste",
    "periodificacion",
    "conciliacion-bancaria",
    "partida-no-identificada",
    "saldo-tesoreria",
    "vista-revisable",
    "flujo-firma",
    "perfil-administrativo",
    "liquidacion-iva",
    "registro-verifactu",
    "factura-electronica",
    "recibo-nomina",
    "inmovilizado",
    "cierre-ejercicio",
    "onboarding-negocio",
    "motor-avisos",
    "declaracion-fuente-faltante",
    "aviso-revision",
    "aviso-cuadre",
    "calendario-fiscal",
    "estado-presentacion-fiscal",
    "rectificacion-declaracion",
    "frontera-ficha-producto",
    "valoracion-existencia",
    "estados-contables",
    "retenciones-is-irpf",
    "generador-modelo",
    "acuse-presentacion",
    "consolidacion-grupo",
    "etiquetado-analitico",
    "margen-analitico",
    "presupuesto",
    "cuadro-mando-contable",
    "informe-rico",
    "consulta-dueno",
    "puente-lenguaje-dueno",
    "aviso-al-negocio",
    "informe-accionable"
  ],
  "hojas": [
    {
      "slug": "filesystem",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "eje": "transversal",
      "depende_de": [],
      "eventos_sube": [
        "fs.read.request",
        "fs.write.request",
        "fs.edit.request",
        "fs.list.request",
        "fs.exists.request",
        "project.activated",
        "project.deactivated"
      ],
      "eventos_publica": [
        "fs.read.response",
        "fs.write.response",
        "fs.edit.response",
        "fs.list.response",
        "fs.exists.response"
      ],
      "proposito": "Infraestructura de storage scopeada por el project_id de la PETICION (multi-tenant real).",
      "clases": [],
      "proyecciones_internas": [],
      "reutiliza": [
        "filesystem"
      ],
      "nota": "v2.4.0 — 23 subs / 27 pubs / 17 tools (fs.list/read/write/edit/...). Base de TODO store de la vertical."
    },
    {
      "slug": "project-manager",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "eje": "transversal",
      "depende_de": [],
      "eventos_sube": [
        "project.activate",
        "project.create",
        "project.get.request",
        "project.list.request",
        "project.state.request",
        "project.update"
      ],
      "eventos_publica": [
        "project.activated",
        "project.created",
        "project.deactivated",
        "project.state",
        "project.get.response",
        "project.list.response",
        "project.state.response"
      ],
      "proposito": "Lifecycle del proyecto: la activacion de la vertical y el scope de PosPersistencia.",
      "clases": [],
      "proyecciones_internas": [],
      "reutiliza": [
        "project-manager"
      ],
      "nota": "v4.2.0 — 11 subs / 13 pubs. `project.activated` es el arranque de todo custodio (restaura su store por project_id)."
    },
    {
      "slug": "credential-manager",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "eje": "transversal",
      "depende_de": [],
      "eventos_sube": [
        "credential.resolve.request",
        "credential.create.request",
        "credential.update.request",
        "credential.delete.request",
        "credential.state.request"
      ],
      "eventos_publica": [
        "credential.resolve.response",
        "credential.saved",
        "credential.updated",
        "credential.deleted",
        "credential.state",
        "credential.create.response",
        "credential.update.response",
        "credential.delete.response",
        "credential.state.response"
      ],
      "proposito": "Credenciales por-tenant (bancos, FACe, SII, buzon digital) resueltas por cascada.",
      "clases": [],
      "proyecciones_internas": [],
      "reutiliza": [
        "credential-manager"
      ],
      "nota": "v2.2.0 — tools `credential.list`. Lo consumen los puentes de extracto, acuse y recepcion digital."
    },
    {
      "slug": "facturas",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "factura.entrada"
      ],
      "eventos_publica": [
        "factura.recibida",
        "factura.procesada",
        "factura.error",
        "factura.exportada",
        "telegram.send_message.request"
      ],
      "proposito": "CUBRE la admision del documento (A3) y la conversion documento->dato (A4.1).",
      "clases": [
        "A3",
        "A4.1"
      ],
      "proyecciones_internas": [],
      "reutiliza": [
        "facturas"
      ],
      "nota": "v3.0.0 — pipeline step-based (Intake/Convert/Prepare/OCR/Structure) + tools `facturas.procesar` (OCR+IA), `facturas.listar`, `facturas.estadisticas`. El hecho extraido entra a contabilidad por `factura.procesada`."
    },
    {
      "slug": "facturacion/fuentes",
      "forma": "puente",
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
      "proposito": "CUBRE el puerto de documento digital (A5) y el canal declarable de A4.2.",
      "clases": [
        "A5",
        "A4.2"
      ],
      "proyecciones_internas": [],
      "reutiliza": [
        "facturacion/fuentes"
      ],
      "nota": "v2.0.0 — adaptador strategy-pattern de FUENTES (Telegram push, Gmail pull, extensible). El catalogo de fuentes/formas es DATO declarable (A10)."
    },
    {
      "slug": "inventario",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "eje": "contabilidad-analitica",
      "depende_de": [],
      "eventos_sube": [
        "pedido.completado",
        "pedido.cancelado"
      ],
      "eventos_publica": [
        "inventario.reserva.creada",
        "inventario.reserva.expirada",
        "inventario.reserva.liberada",
        "inventario.confirmado",
        "inventario.ajustado",
        "inventario.stock.bajo_minimo"
      ],
      "proposito": "CUBRE el STOCK REAL por proyecto (sustrato del grupo H): contabilidad lo VALORA, nunca lo duplica.",
      "clases": [],
      "proyecciones_internas": [],
      "reutiliza": [
        "inventario"
      ],
      "nota": "v1.0.0 — stock_real + reservas con expiracion, data/projects/<slug>/inventario.json. Tools consultar/reservar/confirmar/liberar/ajustar."
    },
    {
      "slug": "metricas",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [
        "*.creado",
        "*.actualizado",
        "*.eliminado",
        "*.error",
        "*.completado"
      ],
      "eventos_publica": [
        "metricas.snapshot"
      ],
      "proposito": "Instrumentacion PASIVA (wildcards): contadores y gauges que sostienen la observabilidad de la vertical.",
      "clases": [],
      "proyecciones_internas": [],
      "reutiliza": [
        "metricas"
      ],
      "nota": "v2.0.0 — ninguna hoja de contabilidad escribe contadores: emiten sus eventos de dominio y `metricas` los absorbe."
    },
    {
      "slug": "facturacion/asesoria",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [],
      "eventos_publica": [
        "asesoria.paquete.generado",
        "asesoria.paquete.error"
      ],
      "proposito": "CUBRE el puerto de exportacion al asesor (L1): CSV en formato espanol + ZIP con los originales.",
      "clases": [
        "L1"
      ],
      "proyecciones_internas": [],
      "reutiliza": [
        "facturacion/asesoria"
      ],
      "nota": "v2.0.0 — tools `asesoria.generar-paquete`, `asesoria.historial`. Lee las facturas procesadas; el FORMATO exigido por cada asesor concreto queda declarable (L6)."
    },
    {
      "slug": "contrato-hecho-minimo",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.contrato.declarar.request",
        "contabilidad.contrato.exigir.request",
        "contabilidad.contrato.cubre.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.contrato_declarado",
        "contabilidad.contrato.declarar.response",
        "contabilidad.contrato.declarar.failed",
        "contabilidad.contrato.exigir.response",
        "contabilidad.contrato.exigir.failed",
        "contabilidad.contrato.cubre.response",
        "contabilidad.contrato.cubre.failed",
        "contabilidad.contrato_declarado.failed"
      ],
      "proposito": "El minimo EXIGIBLE por fuente (declarado por dueno/jefe), visto desde la fuente: no un formato impuesto.",
      "clases": [
        "A11"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, vertical, campos) — un solo escritor del minimo por vertical"
        },
        {
          "nombre": "_exigir",
          "descripcion": "exigir(vertical) -> Set<Campo>"
        },
        {
          "nombre": "_cubre",
          "descripcion": "cubre(vertical, hecho) -> ok | Set<Campo> faltantes"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: ningun modulo del inventario declara un contrato minimo de hecho por vertical; los contratos de entrada viven en cada vertical productora."
    },
    {
      "slug": "anclaje-cierre-vertical",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.anclaje.declarar.request",
        "contabilidad.anclaje.anclar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.anclaje_declarado",
        "contabilidad.anclaje.declarar.response",
        "contabilidad.anclaje.declarar.failed",
        "contabilidad.anclaje.anclar.response",
        "contabilidad.anclaje.anclar.failed",
        "contabilidad.anclaje_declarado.failed"
      ],
      "proposito": "Declara POR FUENTE que es un cierre y como se identifica; ancla la clave natural. Su contenido pende de la unidad_de_cierre (M4, declarable).",
      "clases": [
        "A14"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, vertical, definicion) — un solo escritor (DUENO)"
        },
        {
          "nombre": "_anclar",
          "descripcion": "anclar(vertical, hecho) -> ClaveNatural"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: la definicion de cierre por vertical no existe en el inventario; el cierre de caja existente es de la operacion (mono-negocio) y aqui llega como HECHO observado."
    },
    {
      "slug": "cola-revision",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.excepcion.encolar.request",
        "contabilidad.excepcion.resolver.request",
        "contabilidad.excepcion.siguiente.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.excepcion_encolada",
        "contabilidad.excepcion_resuelta",
        "contabilidad.excepcion.encolar.response",
        "contabilidad.excepcion.encolar.failed",
        "contabilidad.excepcion.resolver.response",
        "contabilidad.excepcion.resolver.failed",
        "contabilidad.excepcion.siguiente.response",
        "contabilidad.excepcion.siguiente.failed",
        "contabilidad.excepcion_encolada.failed",
        "contabilidad.excepcion_resuelta.failed"
      ],
      "proposito": "DOS colas de excepciones (asesor / dueno) por naturaleza; el flujo NUNCA se bloquea. Un solo escritor por cola.",
      "clases": [
        "A8.1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_encolar",
          "descripcion": "routing por naturaleza de la excepcion -> cola ASESOR | cola DUENO"
        },
        {
          "nombre": "_siguiente",
          "descripcion": "siguiente(cola) -> Excepcion | VACIA"
        },
        {
          "nombre": "_resolver",
          "descripcion": "resolver(rol, excepcion, resolucion) — guard de escritor por cola"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe modulo de cola de revision contable en el inventario; `manejo-fallo` (nichos) es fallo de canal, otro dominio (patron tomado)."
    },
    {
      "slug": "regla-contrapartida",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.regla.leer.request",
        "contabilidad.regla.declarar.request",
        "contabilidad.regla.aprender.request",
        "contabilidad.regla_ratificada",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.regla_declarada",
        "contabilidad.regla_aprendida",
        "contabilidad.regla.leer.response",
        "contabilidad.regla.leer.failed",
        "contabilidad.regla.declarar.response",
        "contabilidad.regla.declarar.failed",
        "contabilidad.regla.aprender.response",
        "contabilidad.regla.aprender.failed",
        "contabilidad.regla_declarada.failed",
        "contabilidad.regla_aprendida.failed"
      ],
      "proposito": "Repositorio de reglas declaradas/aprendidas (\"este proveedor -> esta cuenta\"). Una regla APRENDIDA no actua hasta ser RATIFICADA (L10).",
      "clases": [
        "A6.2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, regla) — un solo escritor (DUENO/ASESOR)"
        },
        {
          "nombre": "_aplicar",
          "descripcion": "aplicar(hecho) -> Contrapartida | SIN_COBERTURA"
        },
        {
          "nombre": "_aprender",
          "descripcion": "aprender(rol, regla, evidencia) — el aprendizaje entra HIDRATADO y queda PENDIENTE de ratificacion"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: repositorio de reglas contables por negocio; `reglas-aprendidas` (nichos) es umbrales de viabilidad, otro dominio (patron tomado)."
    },
    {
      "slug": "clave-natural",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "anclaje-cierre-vertical",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.clave.calcular.request",
        "contabilidad.clave.repeticion.request"
      ],
      "eventos_publica": [
        "contabilidad.clave_calculada",
        "contabilidad.clave.calcular.response",
        "contabilidad.clave.calcular.failed",
        "contabilidad.clave.repeticion.response",
        "contabilidad.clave.repeticion.failed",
        "contabilidad.clave_calculada.failed"
      ],
      "proposito": "CERROJO 3 · idempotencia: mismos componentes => mismo hecho => mismo asiento. Un solo calculador de la clave.",
      "clases": [
        "M3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_calcular",
          "descripcion": "calcular(hechoODocumento) -> ClaveNatural (cuelga de A14 / unidad_de_cierre)"
        },
        {
          "nombre": "_esRepeticion",
          "descripcion": "esRepeticion(clave, yaAsentados) -> Bool — test unitario lo afirma"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la clave natural es la invariante anti-bucle de ESTA vertical; ningun modulo del inventario la calcula."
    },
    {
      "slug": "single-writer",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.parcela.registrar.request",
        "contabilidad.parcela.autorizar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.parcela_registrada",
        "contabilidad.parcela_autorizada",
        "contabilidad.parcela.registrar.response",
        "contabilidad.parcela.registrar.failed",
        "contabilidad.parcela.autorizar.response",
        "contabilidad.parcela.autorizar.failed",
        "contabilidad.parcela_registrada.failed",
        "contabilidad.parcela_autorizada.failed"
      ],
      "proposito": "CERROJO 2 · la ley que gobierna a TODO custodio: un unico escritor por parcela. Los custodios registran su parcela y su rol autorizado.",
      "clases": [
        "M2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_autorizar",
          "descripcion": "autorizar(parcela, rol) -> ok"
        },
        {
          "nombre": "_escribir",
          "descripcion": "escribir(parcela, rol, cambio) -> ok | ERROR_DOS_ESCRITORES"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el guard de escritor por parcela es la invariante transversal del dominio; no existe modulo que lo gobierne."
    },
    {
      "slug": "frontera-planos",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.frontera_planos.verificar.request"
      ],
      "eventos_publica": [
        "contabilidad.frontera_planos_verificada",
        "contabilidad.frontera_planos.verificar.response",
        "contabilidad.frontera_planos.verificar.failed",
        "contabilidad.frontera_planos_verificada.failed"
      ],
      "proposito": "CERROJO 1 · anti-realimentacion: contabilidad emite CALCULOS; si un contrato pretende ser un HECHO de negocio -> rechazo determinista.",
      "clases": [
        "M1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_verificar",
          "descripcion": "verificar(emision) -> ok | ERROR_FUGA (prefijo del espacio de CALCULOS contabilidad.*)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: cerrojo propio del dominio contable (la identidad \"observadora que no produce hechos\" se verifica aqui)."
    },
    {
      "slug": "lote-admision",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.lote.despachar.request"
      ],
      "eventos_publica": [
        "contabilidad.lote_despachado",
        "contabilidad.lote.despachar.response",
        "contabilidad.lote.despachar.failed",
        "contabilidad.lote_despachado.failed"
      ],
      "proposito": "DESACOPLE del cuello: la admision no se hace en serie (N hechos en paralelo). Mecanico, cero juicio.",
      "clases": [
        "A9"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_lotear",
          "descripcion": "lotear(cola) -> List<Hecho>"
        },
        {
          "nombre": "_despachar",
          "descripcion": "despachar(lote) -> ok — consumido por AMBAS puertas (hechos y documentos)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el paralelismo declarable de la admision no existe en el inventario."
    },
    {
      "slug": "puerto-evento-vertical",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "contrato-hecho-minimo"
      ],
      "eventos_sube": [
        "contabilidad.hecho.admitir.request",
        "contabilidad.contrato_declarado",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.hecho_admitido",
        "contabilidad.hecho.admitir.response",
        "contabilidad.hecho.admitir.failed",
        "contabilidad.hecho_admitido.failed"
      ],
      "proposito": "PUERTA de los hechos ya emitidos por las verticales. Contabilidad LEE, no impone: la fuente manda en formato, granularidad y ritmo.",
      "clases": [
        "A1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_admitir",
          "descripcion": "admitir(hecho) -> ok — valida la forma minima de entrada, no el contenido"
        },
        {
          "nombre": "_reconectar",
          "descripcion": "reconectar(fuente) — el puerto es reemplazable, la fuente manda"
        },
        {
          "nombre": "_declararHueco",
          "descripcion": "si no hay fuente -> senal a A15, nunca se fuerza"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: ningun modulo del inventario recibe hechos heterogeneos de otras verticales; un adaptador por fuente se pone en el sitio de despliegue."
    },
    {
      "slug": "historial-proceso-contable",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.historial.anotar.request",
        "contabilidad.historial.consultar.request",
        "contabilidad.hecho_admitido",
        "contabilidad.excepcion_encolada",
        "contabilidad.excepcion_resuelta",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.historial_anotado",
        "contabilidad.historial.anotar.response",
        "contabilidad.historial.anotar.failed",
        "contabilidad.historial.consultar.response",
        "contabilidad.historial.consultar.failed",
        "contabilidad.historial_anotado.failed"
      ],
      "proposito": "Registro append-only de lo PROCESADO y lo FALLADO con su rastro. Solo crece; nunca se reescribe.",
      "clases": [
        "P2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_anotar",
          "descripcion": "anotar(entrada) — single-writer ADMISION"
        },
        {
          "nombre": "_consultar",
          "descripcion": "consultar(desde, hasta) -> Historial"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: es el historial del PROCESO de entrada, distinto de `traza-asiento` (B4, del asiento) y de `historial-nicho` (otro dominio)."
    },
    {
      "slug": "maestro-terceros",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.tercero.declarar.request",
        "contabilidad.tercero.ficha.request",
        "contabilidad.tercero.identificar.request",
        "contabilidad.tercero.historial.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.tercero_declarado",
        "contabilidad.tercero_identificado",
        "contabilidad.tercero.declarar.response",
        "contabilidad.tercero.declarar.failed",
        "contabilidad.tercero.ficha.response",
        "contabilidad.tercero.ficha.failed",
        "contabilidad.tercero.identificar.response",
        "contabilidad.tercero.identificar.failed",
        "contabilidad.tercero.historial.response",
        "contabilidad.tercero.historial.failed",
        "contabilidad.tercero_declarado.failed",
        "contabilidad.tercero_identificado.failed"
      ],
      "proposito": "MAESTRO UNICO del tercero con ROLES (conflicto 1 resuelto): ficha funcional + identidad por NIF en la MISMA parcela.",
      "clases": [
        "N1",
        "N2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, tercero) — un solo escritor (DUENO/ASESOR)"
        },
        {
          "nombre": "_ficha",
          "descripcion": "ficha(idTercero) -> Tercero"
        },
        {
          "nombre": "_historial",
          "descripcion": "historial(idTercero) -> List<IdAsiento|IdDocumento>"
        },
        {
          "nombre": "_anadirRol",
          "descripcion": "anadirRol(idTercero, rol) — cliente+proveedor NO duplica al tercero"
        },
        {
          "nombre": "_identificar",
          "descripcion": "identificar(nif, nombreFiscal) -> IdTercero (N2, faceta de identidad)"
        },
        {
          "nombre": "_unificar",
          "descripcion": "unificar(idA, idB, evidencia) -> IdTercero — \"un proveedor escrito de tres formas = uno\""
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe maestro fiscal de terceros en el inventario (N1+N2 se funden en UNA parcela, decision del dueno)."
    },
    {
      "slug": "normalizador-hecho",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "puerto-evento-vertical",
        "contrato-hecho-minimo",
        "facturas",
        "facturacion/fuentes",
        "lote-admision"
      ],
      "eventos_sube": [
        "contabilidad.hecho.normalizar.request",
        "contabilidad.hecho_admitido",
        "factura.procesada"
      ],
      "eventos_publica": [
        "contabilidad.hecho_normalizado",
        "contabilidad.documento_descuadrado",
        "contabilidad.hecho.normalizar.response",
        "contabilidad.hecho.normalizar.failed",
        "contabilidad.hecho_normalizado.failed",
        "contabilidad.documento_descuadrado.failed"
      ],
      "proposito": "UNICA puerta de FORMATO (A2) + control de cuadre del documento (A4.3): homogeneiza a forma asentable y jamas asienta \"casi cuadrado\".",
      "clases": [
        "A2",
        "A4.3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_homogeneizar",
          "descripcion": "homogeneizar(hechoCrudo) -> Hecho — unica puerta de formato"
        },
        {
          "nombre": "_mapear",
          "descripcion": "mapear(camposFuente, camposInternos) -> Hecho"
        },
        {
          "nombre": "_detectarFaltantes",
          "descripcion": "detectarFaltantes(hecho) -> Set<Campo> -> excepcion/pregunta (lo que falta NO se rellena)"
        },
        {
          "nombre": "_cuadrarDocumento",
          "descripcion": "cuadrarDocumento(campos) -> Cuadrado | Descuadre (suma bases + suma impuestos = total; tolerancia declarable)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: `facturas` entrega el dato extraido, no la forma asentable de contabilidad (contrato A11 + clave natural A14). El cuadre determinista es propio."
    },
    {
      "slug": "deduplicacion-hecho",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "clave-natural"
      ],
      "eventos_sube": [
        "contabilidad.duplicado.verificar.request",
        "contabilidad.hecho_normalizado"
      ],
      "eventos_publica": [
        "contabilidad.hecho_nuevo",
        "contabilidad.hecho_duplicado",
        "contabilidad.duplicado.verificar.response",
        "contabilidad.duplicado.verificar.failed",
        "contabilidad.hecho_nuevo.failed",
        "contabilidad.hecho_duplicado.failed"
      ],
      "proposito": "ANTI-BUCLE: aplica la clave natural. Reprocesar NO duplica; un rectificativo no es duplicado.",
      "clases": [
        "A7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_esDuplicado",
          "descripcion": "esDuplicado(hecho) -> Duplicado | Nuevo (determinista, test lo afirma)"
        },
        {
          "nombre": "_marcarProcesado",
          "descripcion": "marcarProcesado(clave) -> ok"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la idempotencia por clave natural es el cerrojo 3 del dominio; ningun modulo del inventario lo aplica."
    },
    {
      "slug": "resolucion-contrapartida",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "normalizador-hecho",
        "catalogo-cuentas",
        "regla-contrapartida",
        "maestro-terceros",
        "deduplicacion-hecho"
      ],
      "eventos_sube": [
        "contabilidad.contrapartida.proponer.request",
        "contabilidad.hecho_nuevo"
      ],
      "eventos_publica": [
        "contabilidad.contrapartida_propuesta",
        "contabilidad.contrapartida.proponer.response",
        "contabilidad.contrapartida.proponer.failed",
        "contabilidad.contrapartida_propuesta.failed"
      ],
      "proposito": "PROPONE cuenta/tercero/periodo (juicio con ambiguedad contra el plan declarado). El corte DURO lo fija la regla (A6.2).",
      "clases": [
        "A6.1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_proponer",
          "descripcion": "proponer(hecho) -> ContrapartidaPropuesta {cuenta, tercero, periodo} — FUZZY (LLM)"
        },
        {
          "nombre": "_justificar",
          "descripcion": "justificar(propuesta) -> Explicacion (base de L2)"
        },
        {
          "nombre": "_alzarExcepcion",
          "descripcion": "ambiguedad alta y sin regla -> excepcion a cola (A8.1), no se asienta"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe resolucion de contrapartida contable en el inventario (IVA/plan/diario = 0 modulos)."
    },
    {
      "slug": "completitud-cobertura",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "clave-natural",
        "anclaje-cierre-vertical"
      ],
      "eventos_sube": [
        "contabilidad.cobertura.calcular.request",
        "contabilidad.anclaje_declarado",
        "contabilidad.hecho_admitido"
      ],
      "eventos_publica": [
        "contabilidad.cobertura_calculada",
        "contabilidad.cobertura.calcular.response",
        "contabilidad.cobertura.calcular.failed",
        "contabilidad.cobertura_calculada.failed"
      ],
      "proposito": "EL UNICO CALCULADOR de cobertura (conflicto 2 resuelto): esperados / recibidos / huecos / tasa. Q3, P4 y C6 son VISTAS suyas.",
      "clases": [
        "A12"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_calcular",
          "descripcion": "calcular(periodo) -> Cobertura {esperados, recibidos, huecos, tasa}"
        },
        {
          "nombre": "_huecos",
          "descripcion": "huecos() -> Set<ClaveHecho> — alimenta A15, C6, Q3, P4"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la metrica de cobertura de la ENTRADA es el corazon del cuello; no existe equivalente en el inventario."
    },
    {
      "slug": "hecho-rectificativo",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "clave-natural"
      ],
      "eventos_sube": [
        "contabilidad.rectificativo.emparejar.request",
        "contabilidad.hecho_admitido"
      ],
      "eventos_publica": [
        "contabilidad.hecho_rectificado",
        "contabilidad.rectificativo.emparejar.response",
        "contabilidad.rectificativo.emparejar.failed",
        "contabilidad.hecho_rectificado.failed"
      ],
      "proposito": "Plano 2 de los 4 planos de correccion: el hecho posterior que corrige/anula casa con su original POR CLAVE NATURAL. NO borra: ANADE.",
      "clases": [
        "A13"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_emparejar",
          "descripcion": "emparejar(rectificativo, original) -> ok | ERROR_ORIGINAL_NO_HALLADO"
        },
        {
          "nombre": "_emitir",
          "descripcion": "emitir(hecho, ajuste) -> asiento de ajuste (B5), nunca borrado"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la correccion no destructiva por clave natural es propia del dominio contable."
    },
    {
      "slug": "panel-proceso-contable",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "cola-revision",
        "historial-proceso-contable",
        "completitud-cobertura"
      ],
      "eventos_sube": [
        "contabilidad.panel.latido.request"
      ],
      "eventos_publica": [
        "contabilidad.panel_latido",
        "contabilidad.panel.latido.response",
        "contabilidad.panel.latido.failed",
        "contabilidad.panel_latido.failed"
      ],
      "proposito": "Latido del proceso de admision (que entra, que se procesa, que esta en cola, que falla) + la TASA que PRUEBA la promesa \"sin una persona digitando\".",
      "clases": [
        "P1",
        "P4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_latido",
          "descripcion": "latido() -> Panel — agregacion determinista"
        },
        {
          "nombre": "_tasaCobertura",
          "descripcion": "tasaCobertura() -> Tasa (P4, vista de la metrica unica A12)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe panel de proceso contable; es el \"display\" de la entrada."
    },
    {
      "slug": "desatasco-entrada",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "cola-revision",
        "catalogo-cuentas",
        "regla-contrapartida",
        "regla-movimiento-bancario",
        "ratificacion-regla-aprendida"
      ],
      "eventos_sube": [
        "contabilidad.desatasco.resolver.request",
        "contabilidad.excepcion_encolada"
      ],
      "eventos_publica": [
        "contabilidad.excepcion_desatascada",
        "contabilidad.regla_aprendida",
        "contabilidad.desatasco.resolver.response",
        "contabilidad.desatasco.resolver.failed",
        "contabilidad.excepcion_desatascada.failed",
        "contabilidad.regla_aprendida.failed"
      ],
      "proposito": "LA ACCION que completa la cola: resolver / reencolar / descartar con MOTIVO. Produce la regla candidata que NO actua hasta ser ratificada (L10).",
      "clases": [
        "P3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_resolver",
          "descripcion": "resolver(excepcion, decision) -> Resolucion | REENColar | DescartarConMotivo — FUZZY"
        },
        {
          "nombre": "_producirRegla",
          "descripcion": "producirRegla(resolucion, evidencia) -> ReglaDeclarada candidata (aprendizaje hidratado)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el bucle excepcion -> regla -> menos excepciones es el corazon del cuello y no existe en el inventario."
    },
    {
      "slug": "cuenta-terceros",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "maestro-terceros",
        "mayor-balanza",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.cuenta_terceros.saldo.request",
        "contabilidad.cuenta_terceros.extracto.request",
        "contabilidad.cuenta_terceros.vencimiento.request",
        "contabilidad.cuenta_terceros.aging.request"
      ],
      "eventos_publica": [
        "contabilidad.cuenta_terceros_calculada",
        "contabilidad.cuenta_terceros.saldo.response",
        "contabilidad.cuenta_terceros.saldo.failed",
        "contabilidad.cuenta_terceros.extracto.response",
        "contabilidad.cuenta_terceros.extracto.failed",
        "contabilidad.cuenta_terceros.vencimiento.response",
        "contabilidad.cuenta_terceros.vencimiento.failed",
        "contabilidad.cuenta_terceros.aging.response",
        "contabilidad.cuenta_terceros.aging.failed",
        "contabilidad.cuenta_terceros_calculada.failed"
      ],
      "proposito": "Mayor AUXILIAR del tercero DERIVADO del libro (nunca almacen paralelo): facturas vivas, saldo, extracto confrontable, vencimientos y antiguedad por lado.",
      "clases": [
        "N3",
        "N4",
        "N6",
        "N8"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_facturasVivas",
          "descripcion": "facturasVivas(idTercero) -> List<IdAsiento> (N3)"
        },
        {
          "nombre": "_saldo",
          "descripcion": "saldo(idTercero) -> Importe (N3)"
        },
        {
          "nombre": "_extracto",
          "descripcion": "extracto(idTercero, desde, hasta) -> DocumentoConfrontable (N4)"
        },
        {
          "nombre": "_calcularVencimiento",
          "descripcion": "calcularVencimiento(factura) -> Fecha desde la politica declarada (N6)"
        },
        {
          "nombre": "_estaVencido",
          "descripcion": "estaVencido(factura, hoy) -> Bool (N6)"
        },
        {
          "nombre": "_clasificarPorVencimiento",
          "descripcion": "clasificarPorVencimiento(lado, hoy) -> AgingReport POR_COBRAR | POR_PAGAR (N8)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: las vistas por rol del tercero (auxiliar, extracto, vencimientos) cuelgan del libro de ESTA vertical."
    },
    {
      "slug": "compra-proveedor",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "mayor-balanza",
        "maestro-terceros"
      ],
      "eventos_sube": [
        "contabilidad.compra.cotejar.request",
        "contabilidad.compra.coste_real.request"
      ],
      "eventos_publica": [
        "contabilidad.compra_cotejada",
        "contabilidad.compra.cotejar.response",
        "contabilidad.compra.cotejar.failed",
        "contabilidad.compra.coste_real.response",
        "contabilidad.compra.coste_real.failed",
        "contabilidad.compra_cotejada.failed"
      ],
      "proposito": "La compra VERIFICADA antes de asentar: cotejo pedido <-> recepcion <-> factura (N5) y ajuste del coste real por rappels/anticipos (N7).",
      "clases": [
        "N5",
        "N7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_cotejar",
          "descripcion": "cotejar(pedido, recepcion, factura) -> Cuadra | Descuadre -> cola (N5). Si el negocio no coteja (declarable), se asienta directo y SE DECLARA"
        },
        {
          "nombre": "_ajustarCosteReal",
          "descripcion": "ajustarCosteReal(factura) -> Importe a lo realmente pagado (N7); el ajuste SUMA"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe cotejo compra/recepcion/factura en el inventario."
    },
    {
      "slug": "emision-factura-venta",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "maestro-terceros",
        "catalogo-cuentas",
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.factura.emitir.request",
        "contabilidad.factura.rectificar.request",
        "contabilidad.factura.series.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.factura_emitida",
        "contabilidad.factura_rectificada",
        "contabilidad.factura.emitir.response",
        "contabilidad.factura.emitir.failed",
        "contabilidad.factura.rectificar.response",
        "contabilidad.factura.rectificar.failed",
        "contabilidad.factura.series.response",
        "contabilidad.factura.series.failed",
        "contabilidad.factura_emitida.failed",
        "contabilidad.factura_rectificada.failed"
      ],
      "proposito": "Cara EMITIDA con serie/numeracion fiscal: numeracion correlativa SIN SALTOS. Un solo escritor (numero duplicado = corrupcion).",
      "clases": [
        "O1",
        "O2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_emitir",
          "descripcion": "emitir(factura) -> FacturaEmitida — asigna numero correlativo; ticket o factura completa segun el TIPO (dato del hecho)"
        },
        {
          "nombre": "_series",
          "descripcion": "series() -> List<IdSerie> (por negocio/canal/unica — declarable)"
        },
        {
          "nombre": "_rectificarSustitutiva",
          "descripcion": "rectificarSustitutiva(serie, rectificativa) -> OK | ERROR (O2)"
        },
        {
          "nombre": "_calcularAjuste",
          "descripcion": "calcularAjuste(original, motivo) -> Importe — abono/devolucion/descuento; NO borra (O2)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe emision de factura con serie fiscal en el inventario (fiscal en Enki = 0 modulos). `prisma/ticket` formatea texto, no emite documento fiscal (patron de formato tomado)."
    },
    {
      "slug": "declaracion-fuente-faltante",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "completitud-cobertura",
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.cobertura_calculada"
      ],
      "eventos_publica": [
        "contabilidad.fuente_faltante_declarada",
        "contabilidad.aviso.solicitar.request",
        "contabilidad.fuente_faltante.failed",
        "contabilidad.fuente_faltante_declarada.failed",
        "contabilidad.aviso.solicitar.failed"
      ],
      "proposito": "Si una vertical NO publica un hecho que se necesita, se DECLARA el hueco (abierto + aviso). NUNCA se obliga a la fuente a producirlo.",
      "clases": [
        "A15"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_detectarHueco",
          "descripcion": "detectarHueco(cobertura) -> Hueco (reflejo interno)"
        },
        {
          "nombre": "_declarar",
          "descripcion": "declarar(hueco) -> aviso (K2) + marca [ABIERTO]"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la asimetria con la vertical subordinada es propia de esta vertical (fuente: prisma de interlocutor `verticales`)."
    },
    {
      "slug": "aviso-revision",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-entrada",
      "depende_de": [
        "cola-revision",
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.excepcion_encolada"
      ],
      "eventos_publica": [
        "contabilidad.aviso.solicitar.request",
        "contabilidad.aviso_revision_solicitado",
        "contabilidad.aviso.solicitar.failed",
        "contabilidad.aviso_revision_solicitado.failed"
      ],
      "proposito": "Empujon al motor de avisos: \"esto necesita revision\". Conecta por senal; no resuelve ni decide nada.",
      "clases": [
        "A8.2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_avisar",
          "descripcion": "avisar(excepcion) -> senal a motor-avisos (K2) con el motivo y la cola de destino"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el aviso de revision nace de la cola de ESTA vertical; K2 (motor-avisos) solo lo produce/entrega."
    },
    {
      "slug": "catalogo-cuentas",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.cuenta.declarar.request",
        "contabilidad.cuenta.resolver.request",
        "contabilidad.plan.importar.request",
        "contabilidad.plan.exportar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.cuenta_declarada",
        "contabilidad.plan_importado",
        "contabilidad.plan_exportado",
        "contabilidad.cuenta.declarar.response",
        "contabilidad.cuenta.declarar.failed",
        "contabilidad.cuenta.resolver.response",
        "contabilidad.cuenta.resolver.failed",
        "contabilidad.plan.importar.response",
        "contabilidad.plan.importar.failed",
        "contabilidad.plan.exportar.response",
        "contabilidad.plan.exportar.failed",
        "contabilidad.cuenta_declarada.failed",
        "contabilidad.plan_importado.failed",
        "contabilidad.plan_exportado.failed"
      ],
      "proposito": "Plan contable DECLARABLE/IMPORTABLE (lo aporta el negocio o el asesor) + frontera unica de codificacion (B6). Un solo escritor.",
      "clases": [
        "B1",
        "B6"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, cuenta) — un solo escritor"
        },
        {
          "nombre": "_resolver",
          "descripcion": "resolver(codigo) -> Cuenta | NO_EXISTE"
        },
        {
          "nombre": "_importar",
          "descripcion": "importar(origen) -> List<Cuenta> (B6, unico cruce de formatos del plan)"
        },
        {
          "nombre": "_exportar",
          "descripcion": "exportar(catalogo) -> DocumentoPlan (B6)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe plan contable en el inventario; el formato declarable del asesor es DATO (K9)."
    },
    {
      "slug": "escritor-diario",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "catalogo-cuentas",
        "clave-natural",
        "single-writer"
      ],
      "eventos_sube": [
        "contabilidad.asiento.asentar.request",
        "contabilidad.asiento.apertura.request",
        "contabilidad.asiento.cierre.request",
        "contabilidad.asiento.ajustar.request",
        "contabilidad.contrapartida_propuesta",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.asiento_asentado",
        "contabilidad.asiento_rechazado",
        "contabilidad.asiento.asentar.response",
        "contabilidad.asiento.asentar.failed",
        "contabilidad.asiento.apertura.response",
        "contabilidad.asiento.apertura.failed",
        "contabilidad.asiento.cierre.response",
        "contabilidad.asiento.cierre.failed",
        "contabilidad.asiento.ajustar.response",
        "contabilidad.asiento.ajustar.failed",
        "contabilidad.asiento_asentado.failed",
        "contabilidad.asiento_rechazado.failed"
      ],
      "proposito": "EL custodio del libro: single-writer por parcela, verifica partida doble ANTES de aceptar y rechaza duplicados por clave natural. Aqui entrega el cuello.",
      "clases": [
        "B2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_asentar",
          "descripcion": "asentar(rol, asiento) -> ok | ERROR_DESCUADRE | ERROR_DUPLICADO (suma debe = suma haber)"
        },
        {
          "nombre": "_registrarApertura",
          "descripcion": "registrarApertura(apertura) -> ok"
        },
        {
          "nombre": "_registrarCierre",
          "descripcion": "registrarCierre(cierre) -> ok"
        },
        {
          "nombre": "_componerDesdeContrapartida",
          "descripcion": "compone los apuntes desde el hecho + la contrapartida recibida (proyeccion interna; no hay orquestador)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe diario de partida doble en el inventario (verificado: fiscal/contable = 0 modulos)."
    },
    {
      "slug": "mayor-balanza",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.mayor.saldo.request",
        "contabilidad.mayor.balanza.request",
        "contabilidad.mayor.movimientos.request"
      ],
      "eventos_publica": [
        "contabilidad.balanza_calculada",
        "contabilidad.mayor.saldo.response",
        "contabilidad.mayor.saldo.failed",
        "contabilidad.mayor.balanza.response",
        "contabilidad.mayor.balanza.failed",
        "contabilidad.mayor.movimientos.response",
        "contabilidad.mayor.movimientos.failed",
        "contabilidad.balanza_calculada.failed"
      ],
      "proposito": "Saldos por cuenta DERIVADOS del diario (nunca almacen paralelo). Determinista; un test lo afirma.",
      "clases": [
        "B3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_saldoPorCuenta",
          "descripcion": "saldoPorCuenta(periodo) -> Map<IdCuenta, Importe>"
        },
        {
          "nombre": "_balanza",
          "descripcion": "balanza(periodo) -> Balanza (sumas y saldos)"
        },
        {
          "nombre": "_movimientosDe",
          "descripcion": "movimientosDe(cuenta, periodo) -> List<Apunte>"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: derivacion del diario propia; ningun modulo del inventario lleva mayor/balanza."
    },
    {
      "slug": "traza-asiento",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.traza.anotar.request",
        "contabilidad.traza.consultar.request",
        "contabilidad.asiento_asentado",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.traza_anotada",
        "contabilidad.traza.anotar.response",
        "contabilidad.traza.anotar.failed",
        "contabilidad.traza.consultar.response",
        "contabilidad.traza.consultar.failed",
        "contabilidad.traza_anotada.failed"
      ],
      "proposito": "Registro INMUTABLE (append-only) de quien y cuando creo cada asiento. Solo crece; nunca se reescribe ni se borra.",
      "clases": [
        "B4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_anotar",
          "descripcion": "anotar(quien, cuando, que) — escritor unico: el ESCRITOR_DIARIO"
        },
        {
          "nombre": "_consultar",
          "descripcion": "consultar(claveNatural) -> EntradaTraza"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: la traza del asiento es requisito de auditoria y de Verifactu; no existe en el inventario."
    },
    {
      "slug": "asiento-ajuste",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "escritor-diario",
        "traza-asiento"
      ],
      "eventos_sube": [
        "contabilidad.ajuste.recibir.request"
      ],
      "eventos_publica": [
        "contabilidad.asiento.ajustar.request",
        "contabilidad.ajuste_recibido",
        "contabilidad.ajuste.recibir.failed",
        "contabilidad.ajuste.recibir.response",
        "contabilidad.asiento.ajustar.failed",
        "contabilidad.ajuste_recibido.failed"
      ],
      "proposito": "Plano 1 de correccion: por donde la correccion del asesor ENTRA al libro SIN BORRAR (suma). Traza intacta.",
      "clases": [
        "B5"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_recibir",
          "descripcion": "recibir(correccion: Asiento) -> senal al diario (B2)"
        },
        {
          "nombre": "_verificarNoBorrado",
          "descripcion": "verificarNoBorrado() -> ok — el original sigue en la traza"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la correccion que suma sobre el libro es propia del dominio contable."
    },
    {
      "slug": "estados-contables",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "mayor-balanza",
        "inmovilizado",
        "valoracion-existencia"
      ],
      "eventos_sube": [
        "contabilidad.estado.balance.request",
        "contabilidad.estado.resultado.request"
      ],
      "eventos_publica": [
        "contabilidad.balance_calculado",
        "contabilidad.resultado_calculado",
        "contabilidad.estado.balance.response",
        "contabilidad.estado.balance.failed",
        "contabilidad.estado.resultado.response",
        "contabilidad.estado.resultado.failed",
        "contabilidad.balance_calculado.failed",
        "contabilidad.resultado_calculado.failed"
      ],
      "proposito": "Balance de situacion (C1) y cuenta de resultados (C2) DERIVADOS del mayor + valoraciones. No se \"arregla\" un resultado: se explica con su base y su cobertura.",
      "clases": [
        "C1",
        "C2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_componerBalance",
          "descripcion": "componerBalance(periodo) -> Balance {activo, pasivo, patrimonio} (C1)"
        },
        {
          "nombre": "_cuadrar",
          "descripcion": "cuadrar() -> ok | ERROR_ACTIVO_NO_CUADRA (C1)"
        },
        {
          "nombre": "_componerResultado",
          "descripcion": "componerResultado(periodo) -> Resultado {ingresos, gastos, resultado} (C2)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: los estados contables no existen en el inventario; son la derivacion del mayor."
    },
    {
      "slug": "periodificacion",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.periodo.imputar.request"
      ],
      "eventos_publica": [
        "contabilidad.periodo_imputado",
        "contabilidad.periodo.imputar.response",
        "contabilidad.periodo.imputar.failed",
        "contabilidad.periodo_imputado.failed"
      ],
      "proposito": "Imputa cada hecho a su periodo con el CRITERIO DECLARADO y CONSERVA las dos fechas (operacion != valor). No elige ni adivina.",
      "clases": [
        "C3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_imputarPeriodo",
          "descripcion": "imputarPeriodo(hecho) -> IdPeriodo (criterio declarado, nunca cableado)"
        },
        {
          "nombre": "_conservarFechas",
          "descripcion": "conservarFechas(hecho) -> (fechaOperacion, fechaValor)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la periodificacion con dos fechas y criterio declarable es propia de la vertical."
    },
    {
      "slug": "cierre-ejercicio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "escritor-diario",
        "mayor-balanza",
        "periodificacion",
        "inmovilizado",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.cierre.cerrar.request",
        "contabilidad.cierre.estado.request",
        "contabilidad.hecho_admitido",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.cierre_realizado",
        "contabilidad.apertura_generada",
        "contabilidad.cierre.cerrar.response",
        "contabilidad.cierre.cerrar.failed",
        "contabilidad.cierre.estado.response",
        "contabilidad.cierre.estado.failed",
        "contabilidad.cierre_realizado.failed",
        "contabilidad.apertura_generada.failed"
      ],
      "proposito": "Cierra el periodo con ajustes: IRREVERSIBLE salvo ajuste posterior (B5). DOS niveles de cierre (dia del negocio · mes del asesor).",
      "clases": [
        "C4",
        "C5"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_cerrar",
          "descripcion": "cerrar(periodo, ajustes) -> Cierre | ERROR_PERIODO_YA_CERRADO"
        },
        {
          "nombre": "_esIrreversible",
          "descripcion": "esIrreversible() -> Bool"
        },
        {
          "nombre": "_nivel1",
          "descripcion": "NIVEL 1 caja del dia: consume el hecho CIERRE_JORNADA admitido por la puerta (clave natural: proyecto+jornada)"
        },
        {
          "nombre": "_nivel2",
          "descripcion": "NIVEL 2 mes natural: ajustes, periodificacion, amortizaciones, IVA devengado/soportado, regularizacion (clave: proyecto+ejercicio+mes)"
        },
        {
          "nombre": "_generarApertura",
          "descripcion": "generarApertura(cierreAnterior) -> List<Asiento> (C5): los saldos de apertura son los de cierre, nunca inventados"
        },
        {
          "nombre": "_arrastrarSaldos",
          "descripcion": "arrastrarSaldos() -> Balance (C5)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el cierre de caja diario de la OPERACION no se toca: entra como hecho observado. El cierre contable con ajustes no existe en el inventario."
    },
    {
      "slug": "aviso-cuadre",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "completitud-cobertura",
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.cobertura_calculada",
        "contabilidad.cierre_realizado"
      ],
      "eventos_publica": [
        "contabilidad.cuadre_evaluado",
        "contabilidad.aviso.solicitar.request",
        "contabilidad.cuadre.failed",
        "contabilidad.cuadre_evaluado.failed",
        "contabilidad.aviso.solicitar.failed"
      ],
      "proposito": "NO FINGE el cuadre: si falta cobertura, AVISA. VISTA de la metrica unica (A12), no una segunda metrica.",
      "clases": [
        "C6"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_evaluar",
          "descripcion": "evaluar(cierre) -> Cuadra | FaltaCobertura (lee la metrica unica, no recalcula)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el aviso de cuadre bebe de la metrica de cobertura de ESTA vertical."
    },
    {
      "slug": "puerto-extracto",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "credential-manager"
      ],
      "eventos_sube": [
        "contabilidad.extracto.leer.request",
        "contabilidad.extracto.registrar_forma.request"
      ],
      "eventos_publica": [
        "contabilidad.extracto_leido",
        "contabilidad.extracto.leer.response",
        "contabilidad.extracto.leer.failed",
        "contabilidad.extracto.registrar_forma.response",
        "contabilidad.extracto.registrar_forma.failed",
        "contabilidad.extracto_leido.failed"
      ],
      "proposito": "Frontera del canal/formato del extracto bancario: un adaptador por fuente, puesto en el sitio. Si falta una fuente -> SE CREA.",
      "clases": [
        "E2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_leer",
          "descripcion": "leer(canal) -> List<MovimientoBancario>"
        },
        {
          "nombre": "_registrarAdaptador",
          "descripcion": "registrarAdaptador(canal) -> ok — catalogo declarable; credenciales via credential-manager"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: ningun modulo del inventario lee extractos bancarios (conciliacion = 0 modulos)."
    },
    {
      "slug": "conciliacion-bancaria",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "mayor-balanza",
        "puerto-extracto",
        "regla-movimiento-bancario",
        "maestro-cuentas-bancarias"
      ],
      "eventos_sube": [
        "contabilidad.conciliacion.cruzar.request",
        "contabilidad.conciliacion.informe.request"
      ],
      "eventos_publica": [
        "contabilidad.conciliacion_realizada",
        "contabilidad.movimiento_sin_cruzar",
        "contabilidad.conciliacion.cruzar.response",
        "contabilidad.conciliacion.cruzar.failed",
        "contabilidad.conciliacion.informe.response",
        "contabilidad.conciliacion.informe.failed",
        "contabilidad.conciliacion_realizada.failed",
        "contabilidad.movimiento_sin_cruzar.failed"
      ],
      "proposito": "El CRUCE extracto <-> libro por clave natural y reglas es DETERMINISTA; el juicio vive en sus satelites E7 (fuzzy) y E8 (custodio).",
      "clases": [
        "E1",
        "E3",
        "E9",
        "E10"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_cruzar",
          "descripcion": "cruzar(extracto, libro) -> List<Conciliacion> (E1)"
        },
        {
          "nombre": "_sinCruzar",
          "descripcion": "sinCruzar(extracto, libro) -> List<MovimientoBancario> -> E7"
        },
        {
          "nombre": "_cuadrarMovimiento",
          "descripcion": "cuadrarMovimiento(movimiento, cobroOPago) -> Ok | Descuadre (E3, clave natural compartida)"
        },
        {
          "nombre": "_explicarDesfase",
          "descripcion": "explicarDesfase() -> List<PartidaEnTransito> (E9: cheque no cobrado, cobro no apuntado)"
        },
        {
          "nombre": "_componerInforme",
          "descripcion": "componerInforme() -> DocumentoCuadre (E10: saldo banco <-> saldo contable ajustado)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la conciliacion bancaria no existe en el inventario; el cruce deterministico es propio."
    },
    {
      "slug": "partida-no-identificada",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "conciliacion-bancaria",
        "regla-movimiento-bancario",
        "cola-revision"
      ],
      "eventos_sube": [
        "contabilidad.movimiento_sin_cruzar"
      ],
      "eventos_publica": [
        "contabilidad.partida_clasificada",
        "contabilidad.excepcion.encolar.request",
        "contabilidad.partida_clasificada.failed",
        "contabilidad.excepcion.encolar.failed"
      ],
      "proposito": "El movimiento SIN contrapartida llega con descripcion ambigua -> INTERPRETAR. Una vez existe la regla (E8) pasa a automatico; lo no reconocible va a cola. NO se ignora.",
      "clases": [
        "E7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_reconocer",
          "descripcion": "reconocer(movimiento) -> Clasificacion | SIN_REGLA — FUZZY (comision/interes/devolucion)"
        },
        {
          "nombre": "_proponerContrapartida",
          "descripcion": "proponerContrapartida(movimiento) -> Contrapartida"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: la interpretacion de partidas bancarias es propia; no existe en el inventario."
    },
    {
      "slug": "regla-movimiento-bancario",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.regla_movimiento.leer.request",
        "contabilidad.regla_movimiento.declarar.request",
        "contabilidad.regla_movimiento.aprender.request",
        "contabilidad.regla_ratificada",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.regla_movimiento_declarada",
        "contabilidad.regla_movimiento_aprendida",
        "contabilidad.regla_movimiento.leer.response",
        "contabilidad.regla_movimiento.leer.failed",
        "contabilidad.regla_movimiento.declarar.response",
        "contabilidad.regla_movimiento.declarar.failed",
        "contabilidad.regla_movimiento.aprender.response",
        "contabilidad.regla_movimiento.aprender.failed",
        "contabilidad.regla_movimiento_declarada.failed",
        "contabilidad.regla_movimiento_aprendida.failed"
      ],
      "proposito": "Repositorio de reglas \"esta comision -> esta cuenta\", declaradas o aprendidas. Comparte la PUERTA UNICA de ratificacion (L10).",
      "clases": [
        "E8"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, regla) — un solo escritor (DUENO/ASESOR)"
        },
        {
          "nombre": "_aplicar",
          "descripcion": "aplicar(movimiento) -> Contrapartida | SIN_COBERTURA"
        },
        {
          "nombre": "_aprender",
          "descripcion": "aprender(rol, regla, evidencia) — hidratada por E7/desatasco; RATIFICADA por L10"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe regla de clasificacion bancaria en el inventario."
    },
    {
      "slug": "saldo-tesoreria",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "maestro-cuentas-bancarias",
        "conciliacion-bancaria",
        "cuenta-terceros",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.tesoreria.saldo.request",
        "contabilidad.tesoreria.prevision.request"
      ],
      "eventos_publica": [
        "contabilidad.saldo_tesoreria_calculado",
        "contabilidad.caja_proyectada",
        "contabilidad.tesoreria.saldo.response",
        "contabilidad.tesoreria.saldo.failed",
        "contabilidad.tesoreria.prevision.response",
        "contabilidad.tesoreria.prevision.failed",
        "contabilidad.saldo_tesoreria_calculado.failed",
        "contabilidad.caja_proyectada.failed"
      ],
      "proposito": "Posicion REAL de dinero por cuenta (E4) + prevision de caja desde los compromisos con la POLITICA DECLARADA (E5). Los umbrales los declara el dueno.",
      "clases": [
        "E4",
        "E5"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_saldoPorCuenta",
          "descripcion": "saldoPorCuenta(idCuentaBancaria) -> Importe (E4)"
        },
        {
          "nombre": "_posicionReal",
          "descripcion": "posicionReal() -> Map<IdCuentaBancaria, Importe> (E4: la real, no la contable)"
        },
        {
          "nombre": "_proyectar",
          "descripcion": "proyectar(desde, hasta) -> CajaProyectada (E5)"
        },
        {
          "nombre": "_alertarUmbral",
          "descripcion": "alertarUmbral(prevision, umbral) -> senal (K2); umbral declarable (Q24)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la posicion real de tesoreria y la prevision de caja no existen en el inventario."
    },
    {
      "slug": "maestro-cuentas-bancarias",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.cuenta_bancaria.declarar.request",
        "contabilidad.cuenta_bancaria.listar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.cuenta_bancaria_declarada",
        "contabilidad.cuenta_bancaria.declarar.response",
        "contabilidad.cuenta_bancaria.declarar.failed",
        "contabilidad.cuenta_bancaria.listar.response",
        "contabilidad.cuenta_bancaria.listar.failed",
        "contabilidad.cuenta_bancaria_declarada.failed"
      ],
      "proposito": "Catalogo DECLARABLE de cuentas y su MONEDA. Sin el, \"el banco\" es un solo numero falso. Multi-moneda: parametro declarable.",
      "clases": [
        "E11"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, cuenta, moneda) — un solo escritor (DUENO)"
        },
        {
          "nombre": "_cuentas",
          "descripcion": "cuentas() -> List<CuentaBancaria>"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe maestro de cuentas bancarias; ningun modulo del inventario toca banca."
    },
    {
      "slug": "vista-revisable",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "mayor-balanza",
        "traza-asiento",
        "expediente-documental"
      ],
      "eventos_sube": [
        "contabilidad.asiento.explicar.request",
        "contabilidad.muestra.seleccionar.request"
      ],
      "eventos_publica": [
        "contabilidad.vista_explicada",
        "contabilidad.muestra_seleccionada",
        "contabilidad.asiento.explicar.response",
        "contabilidad.asiento.explicar.failed",
        "contabilidad.muestra.seleccionar.response",
        "contabilidad.muestra.seleccionar.failed",
        "contabilidad.vista_explicada.failed",
        "contabilidad.muestra_seleccionada.failed"
      ],
      "proposito": "TODO asiento/calculo EXPLICADO (cifra, base, origen, estado) + seleccion por excepcion y MUESTRA (no revisar todo). No caja negra.",
      "clases": [
        "L2",
        "L8"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_explicar",
          "descripcion": "explicar(asientoOCalculo) -> Vista {cifra, base, origen, estado} (L2, composicion determinista de la traza)"
        },
        {
          "nombre": "_seleccionarMuestra",
          "descripcion": "seleccionarMuestra(conjuntoAsientos) -> Muestra por senales DURAS DECLARADAS: alto importe, sin regla, contrapartida nueva, cuadre dudoso (L8)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la explicabilidad de cada cifra es requisito de la medida maestra (que el asesor la acepte)."
    },
    {
      "slug": "flujo-firma",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "asiento-ajuste",
        "regla-contrapartida",
        "regla-movimiento-bancario",
        "facturacion/asesoria"
      ],
      "eventos_sube": [
        "contabilidad.firma.marcar.request",
        "contabilidad.firma.delta.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.firma_registrada",
        "contabilidad.delta_revision_calculado",
        "contabilidad.firma.marcar.response",
        "contabilidad.firma.marcar.failed",
        "contabilidad.firma.delta.response",
        "contabilidad.firma.delta.failed",
        "contabilidad.firma_registrada.failed",
        "contabilidad.delta_revision_calculado.failed"
      ],
      "proposito": "Marca de revisado/firmado POR EL ASESOR: el sistema NO firma, solo registra. El delta da al asesor solo lo que cambio desde su ultimo visto bueno.",
      "clases": [
        "L3",
        "L9"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_marcarRevisado",
          "descripcion": "marcarRevisado(rol, alcance) -> ok (un solo escritor: el ASESOR)"
        },
        {
          "nombre": "_firmar",
          "descripcion": "firmar(rol, alcance) -> MarcaFirma (L3); el nivel (periodo/estado/documento) es declarable"
        },
        {
          "nombre": "_calcularDelta",
          "descripcion": "calcularDelta(desdeUltimaFirma) -> Delta {asientosNuevos, ajustes, reglasCambiadas} (L9)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe flujo de firma del asesor en el inventario."
    },
    {
      "slug": "expediente-documental",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "filesystem"
      ],
      "eventos_sube": [
        "contabilidad.expediente.archivar.request",
        "contabilidad.expediente.recuperar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.cifra_archivada",
        "contabilidad.expediente.archivar.response",
        "contabilidad.expediente.archivar.failed",
        "contabilidad.expediente.recuperar.response",
        "contabilidad.expediente.recuperar.failed",
        "contabilidad.cifra_archivada.failed"
      ],
      "proposito": "Cada cifra con el documento origen ARCHIVADO y ENLAZADO: LA PRUEBA que sostiene la firma ante una inspeccion. L2 explica; el expediente CONSERVA.",
      "clases": [
        "L7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_archivar",
          "descripcion": "archivar(cifra, documentoOrigen) -> ok (single-writer; archivo via filesystem)"
        },
        {
          "nombre": "_recuperar",
          "descripcion": "recuperar(cifra) -> IdDocumento"
        },
        {
          "nombre": "_verificarEnlace",
          "descripcion": "verificarEnlace() -> ok | ERROR_CIFRA_SIN_PRUEBA"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el enlace cifra<->documento de origen es propio de la vertical; `filesystem` es el almacen, no el expediente."
    },
    {
      "slug": "ratificacion-regla-aprendida",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-libro",
      "depende_de": [
        "regla-contrapartida",
        "regla-movimiento-bancario"
      ],
      "eventos_sube": [
        "contabilidad.regla_aprendida"
      ],
      "eventos_publica": [
        "contabilidad.regla.ratificar.request",
        "contabilidad.regla_ratificada",
        "contabilidad.regla.ratificar.failed",
        "contabilidad.regla_ratificada.failed"
      ],
      "proposito": "PUERTA UNICA de ratificacion: el asesor ratifica o BLOQUEA la regla aprendida ANTES de que actue sobre el volumen. Vencida sin respuesta -> NO actua.",
      "clases": [
        "L10"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_solicitarRatificacion",
          "descripcion": "solicitarRatificacion(regla) -> SolicitudDecision (el sistema NO resuelve)"
        },
        {
          "nombre": "_aplicarRatificacion",
          "descripcion": "aplicarRatificacion(regla, decision) -> ok | bloqueada"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: cubre DOS repositorios (A6.2 contrapartida + E8 movimiento bancario) con UNA sola puerta; no existe en el inventario."
    },
    {
      "slug": "perfil-administrativo",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.perfil.declarar.request",
        "contabilidad.perfil.aplicables.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.perfil_declarado",
        "contabilidad.perfil.declarar.response",
        "contabilidad.perfil.declarar.failed",
        "contabilidad.perfil.aplicables.response",
        "contabilidad.perfil.aplicables.failed",
        "contabilidad.perfil_declarado.failed"
      ],
      "proposito": "Que administraciones y obligaciones aplican al negocio (territorio + regimen). Cuatro territorios posibles; el sistema no asume uno.",
      "clases": [
        "D15"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, sociedad, perfil) — un solo escritor (DUENO/ASESOR)"
        },
        {
          "nombre": "_aplicables",
          "descripcion": "aplicables(sociedad) -> Set<IdObligacion>"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe perfil fiscal por sociedad en el inventario (fiscal = 0 modulos)."
    },
    {
      "slug": "calendario-fiscal",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "perfil-administrativo",
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.calendario.declarar.request",
        "contabilidad.calendario.proximos.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.plazo_declarado",
        "contabilidad.plazo_proximo",
        "contabilidad.calendario.declarar.response",
        "contabilidad.calendario.declarar.failed",
        "contabilidad.calendario.proximos.response",
        "contabilidad.calendario.proximos.failed",
        "contabilidad.plazo_declarado.failed",
        "contabilidad.plazo_proximo.failed"
      ],
      "proposito": "Plazos DECLARABLES por ejercicio (cambian: prorrogas, festivos, domiciliacion). Dispara aviso proactivo; nunca fija una fecha de memoria.",
      "clases": [
        "D6"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, ejercicio, plazos) — un solo escritor (ASESOR/DUENO)"
        },
        {
          "nombre": "_proximos",
          "descripcion": "proximos(hoy) -> List<Plazo>"
        },
        {
          "nombre": "_dispararAviso",
          "descripcion": "dispararAviso(plazo) -> senal a K2"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el calendario fiscal con plazos declarables no existe en el inventario."
    },
    {
      "slug": "liquidacion-iva",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "mayor-balanza",
        "perfil-administrativo",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.iva.liquidar.request",
        "contabilidad.modelo.303.request",
        "contabilidad.modelo.390.request"
      ],
      "eventos_publica": [
        "contabilidad.iva_liquidado",
        "contabilidad.modelo_construido",
        "contabilidad.iva.liquidar.response",
        "contabilidad.iva.liquidar.failed",
        "contabilidad.modelo.303.response",
        "contabilidad.modelo.303.failed",
        "contabilidad.modelo.390.response",
        "contabilidad.modelo.390.failed",
        "contabilidad.iva_liquidado.failed",
        "contabilidad.modelo_construido.failed"
      ],
      "proposito": "Impuesto indirecto DERIVADO del libro con los tipos DECLARADOS (IVA/IGIC/IPSI segun territorio) + sus modelos 303 y 390. Ningun tipo cableado.",
      "clases": [
        "D1",
        "D2",
        "D3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_devengado",
          "descripcion": "devengado(periodo) -> Importe (D1)"
        },
        {
          "nombre": "_soportado",
          "descripcion": "soportado(periodo) -> Importe (D1)"
        },
        {
          "nombre": "_liquidar",
          "descripcion": "liquidar(periodo) -> Liquidacion {devengado, deducible, resultado} (D1)"
        },
        {
          "nombre": "_construir303",
          "descripcion": "construir303(periodo) -> Modelo (D2)"
        },
        {
          "nombre": "_resumir390",
          "descripcion": "resumir390(ejercicio) -> Modelo (D3)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: IVA/modelos no existen en el inventario (verificado: 0 modulos). La ley entra como DATO declarable."
    },
    {
      "slug": "retenciones-is-irpf",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "mayor-balanza",
        "estados-contables",
        "perfil-administrativo",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.retenciones.calcular.request",
        "contabilidad.estimacion.calcular.request"
      ],
      "eventos_publica": [
        "contabilidad.retenciones_calculadas",
        "contabilidad.cuota_estimada",
        "contabilidad.retenciones.calcular.response",
        "contabilidad.retenciones.calcular.failed",
        "contabilidad.estimacion.calcular.response",
        "contabilidad.estimacion.calcular.failed",
        "contabilidad.retenciones_calculadas.failed",
        "contabilidad.cuota_estimada.failed"
      ],
      "proposito": "Retenciones practicadas/soportadas (D4) y estimacion IS/IRPF con base declarada (D5). El sujeto fiscal es parametro POR SOCIEDAD.",
      "clases": [
        "D4",
        "D5"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_practicadas",
          "descripcion": "practicadas(periodo) -> Importe (D4: profesionales, alquileres, trabajo — todos parametros)"
        },
        {
          "nombre": "_soportadas",
          "descripcion": "soportadas(periodo) -> Importe (D4)"
        },
        {
          "nombre": "_estimar",
          "descripcion": "estimar(periodo) -> CuotaEstimada (D5: IS sociedad | IRPF persona fisica, declarable)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: IRPF/IS y retenciones no existen en el inventario."
    },
    {
      "slug": "estado-presentacion-fiscal",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "perfil-administrativo",
        "calendario-fiscal"
      ],
      "eventos_sube": [
        "contabilidad.obligacion.avanzar.request",
        "contabilidad.obligacion.estado.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.obligacion_avanzada",
        "contabilidad.obligacion.avanzar.response",
        "contabilidad.obligacion.avanzar.failed",
        "contabilidad.obligacion.estado.response",
        "contabilidad.obligacion.estado.failed",
        "contabilidad.obligacion_avanzada.failed"
      ],
      "proposito": "Ciclo de vida de cada obligacion (pendiente -> generada -> presentada -> justificada -> atrasada): sin el, el calendario avisa pero nadie sabe en que punto esta.",
      "clases": [
        "D12"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_avanzar",
          "descripcion": "avanzar(obligacion, estado) — escritor SISTEMA+ASESOR"
        },
        {
          "nombre": "_estadoDe",
          "descripcion": "estadoDe(obligacion) -> EstadoObligacion"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: no existe estado de obligacion fiscal en el inventario."
    },
    {
      "slug": "generador-modelo",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "liquidacion-iva",
        "retenciones-is-irpf",
        "estado-presentacion-fiscal",
        "filesystem"
      ],
      "eventos_sube": [
        "contabilidad.modelo.generar.request"
      ],
      "eventos_publica": [
        "contabilidad.modelo_generado",
        "contabilidad.modelo_entregado",
        "contabilidad.modelo.generar.failed",
        "contabilidad.modelo.generar.response",
        "contabilidad.modelo_generado.failed",
        "contabilidad.modelo_entregado.failed"
      ],
      "proposito": "Salida al programa del asesor por PUERTO (formato abierto y declarable). Si el sistema solo PREPARA, aqui termina su responsabilidad.",
      "clases": [
        "D7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_generar",
          "descripcion": "generar(modelo) -> DocumentoModelo"
        },
        {
          "nombre": "_entregar",
          "descripcion": "entregar(documento) -> ok | NO_DECLARADO (presentar es declarable; D34)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la generacion de modelos fiscales con puerto abierto no existe; hay que construirlo."
    },
    {
      "slug": "registro-verifactu",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "emision-factura-venta"
      ],
      "eventos_sube": [
        "contabilidad.registro.anotar.request",
        "contabilidad.registro.verificar.request",
        "contabilidad.factura_emitida",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.registro_verifactu_anotado",
        "contabilidad.registro.anotar.response",
        "contabilidad.registro.anotar.failed",
        "contabilidad.registro.verificar.response",
        "contabilidad.registro.verificar.failed",
        "contabilidad.registro_verifactu_anotado.failed"
      ],
      "proposito": "Registro INTERNO Y NO ALTERABLE de la facturacion: huella + encadenamiento. Solo crece. Distinto de la emision (O1) y del formato (D9).",
      "clases": [
        "D8"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_encadenar",
          "descripcion": "encadenar(factura) -> Huella"
        },
        {
          "nombre": "_anotar",
          "descripcion": "anotar(factura, huella) — append-only"
        },
        {
          "nombre": "_verificarCadena",
          "descripcion": "verificarCadena() -> ok | ERROR_CADENA_ROTA"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: Verifactu no existe en el inventario (0 modulos); es requisito legal de la factura emitida."
    },
    {
      "slug": "factura-electronica",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "emision-factura-venta"
      ],
      "eventos_sube": [
        "contabilidad.factura.estructurar.request",
        "contabilidad.factura.interpretar.request"
      ],
      "eventos_publica": [
        "contabilidad.factura_estructurada",
        "contabilidad.factura_interpretada",
        "contabilidad.factura.estructurar.response",
        "contabilidad.factura.estructurar.failed",
        "contabilidad.factura.interpretar.response",
        "contabilidad.factura.interpretar.failed",
        "contabilidad.factura_estructurada.failed",
        "contabilidad.factura_interpretada.failed"
      ],
      "proposito": "Frontera del FORMATO ESTRUCTURADO de la factura (emitir y recibir). Un solo cruce; un documento estructurado entra SIN extraccion (no pasa por A4.1).",
      "clases": [
        "D9"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_emitirEstructurada",
          "descripcion": "emitirEstructurada(factura) -> DocumentoEstructurado"
        },
        {
          "nombre": "_interpretarEstructurado",
          "descripcion": "interpretarEstructurado(documento) -> Factura"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la factura electronica estructurada no existe en el inventario; el formato concreto es declarable."
    },
    {
      "slug": "acuse-presentacion",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "estado-presentacion-fiscal",
        "generador-modelo",
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.acuse.recibir.request"
      ],
      "eventos_publica": [
        "contabilidad.acuse_ligado",
        "contabilidad.acuse.recibir.failed",
        "contabilidad.acuse.recibir.response",
        "contabilidad.acuse_ligado.failed"
      ],
      "proposito": "Recoge y LIGA el justificante/acuse de la administracion a su modelo y a su asiento: cierra el bucle hacia fuera. Sin acuse -> obligacion no justificada -> aviso.",
      "clases": [
        "D13"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_recibir",
          "descripcion": "recibir(justificante) -> ok (canal declarable; credenciales via credential-manager)"
        },
        {
          "nombre": "_ligar",
          "descripcion": "ligar(acuse, modelo, asiento) -> ok"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el retorno del acuse administrativo no existe en el inventario."
    },
    {
      "slug": "rectificacion-declaracion",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "estado-presentacion-fiscal",
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.declaracion.rectificar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.declaracion_rectificada",
        "contabilidad.declaracion.rectificar.response",
        "contabilidad.declaracion.rectificar.failed",
        "contabilidad.declaracion_rectificada.failed"
      ],
      "proposito": "Plano 4 de correccion: correccion POSTERIOR a la presentacion (complementaria/sustitutiva). NO se confunde con el ajuste contable ni con la rectificativa comercial.",
      "clases": [
        "D14"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_rectificar",
          "descripcion": "rectificar(declaracionOriginal, tipo) -> Rectificacion — un solo escritor (ASESOR)"
        },
        {
          "nombre": "_enlazar",
          "descripcion": "enlazar(original, rectificacion) -> ok"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: la rectificacion fiscal posterior a la presentacion no existe en el inventario."
    },
    {
      "slug": "puerto-nomina",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.nomina.recibir.request"
      ],
      "eventos_publica": [
        "contabilidad.nomina_recibida",
        "contabilidad.nomina.recibir.response",
        "contabilidad.nomina.recibir.failed",
        "contabilidad.nomina_recibida.failed"
      ],
      "proposito": "Origen DECLARABLE del dato de nomina. El sistema NO calcula nomina por defecto: la RECIBE (calcular es capacidad opcional, G5 declarable).",
      "clases": [
        "G4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_recibir",
          "descripcion": "recibir(hechoNomina) -> ok"
        },
        {
          "nombre": "_conectar",
          "descripcion": "conectar(origen) -> ok | NO_DECLARADO; si no existe el origen -> se crea"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe puerto de nomina en el inventario (nominas = 0 modulos)."
    },
    {
      "slug": "recibo-nomina",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "puerto-nomina",
        "catalogo-cuentas",
        "cola-declaraciones-criterio",
        "escritor-diario"
      ],
      "eventos_sube": [
        "contabilidad.nomina.procesar.request",
        "contabilidad.nomina.desglosar.request",
        "contabilidad.nomina.liquidar.request",
        "contabilidad.nomina_recibida"
      ],
      "eventos_publica": [
        "contabilidad.nomina_formada",
        "contabilidad.asiento.asentar.request",
        "contabilidad.nomina.procesar.response",
        "contabilidad.nomina.procesar.failed",
        "contabilidad.nomina.desglosar.response",
        "contabilidad.nomina.desglosar.failed",
        "contabilidad.nomina.liquidar.response",
        "contabilidad.nomina.liquidar.failed",
        "contabilidad.nomina_formada.failed",
        "contabilidad.asiento.asentar.failed"
      ],
      "proposito": "Del recibo al ASIENTO EQUILIBRADO y EXPLICABLE: obligacion con la Seguridad Social, desglose bruto/retencion/cotizacion/neto, anticipos, conceptos extra y liquidacion de baja.",
      "clases": [
        "G1",
        "G2",
        "G3",
        "G6",
        "G8",
        "G9",
        "G10"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_admitir",
          "descripcion": "admitir(recibo) -> ReciboFormado (G1: cero juicio; si el negocio no calcula, el recibo LLEGA hecho)"
        },
        {
          "nombre": "_calcularObligacion",
          "descripcion": "calcularObligacion(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS} (G2, tipos declarables)"
        },
        {
          "nombre": "_construirAsiento",
          "descripcion": "construirAsiento(recibo) -> AsientoEquilibrado (G3)"
        },
        {
          "nombre": "_desglosar",
          "descripcion": "desglosar(recibo) -> Lineas {bruto, retencion, cotizacionTrabajador, neto} (G6)"
        },
        {
          "nombre": "_aplicarAnticipo",
          "descripcion": "aplicarAnticipo(empleado, recibo) -> NetoAjustado (G8)"
        },
        {
          "nombre": "_imputarConcepto",
          "descripcion": "imputarConcepto(concepto, recibo) -> List<Apunte> (G9: dietas, especie, pagas extra, finiquitos)"
        },
        {
          "nombre": "_liquidar",
          "descripcion": "liquidar(empleado) -> AsientoCierre + SaldoCero (G10: una cuenta de empleado sin cerrar es un error de estado)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe modulo de nomina en el inventario; el asiento de personal y su desglose son propios."
    },
    {
      "slug": "acceso-nomina",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-fiscal",
      "depende_de": [
        "aislamiento-negocio"
      ],
      "eventos_sube": [
        "contabilidad.nomina.autorizar.request",
        "contabilidad.nomina.puede_ver.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.acceso_nomina_autorizado",
        "contabilidad.nomina.autorizar.response",
        "contabilidad.nomina.autorizar.failed",
        "contabilidad.nomina.puede_ver.response",
        "contabilidad.nomina.puede_ver.failed",
        "contabilidad.acceso_nomina_autorizado.failed"
      ],
      "proposito": "Aisla la nomina como DATO PERSONAL: cada uno ve la suya. Eje de aislamiento DENTRO del negocio (distinto de I4, entre negocios).",
      "clases": [
        "G7"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_autorizar",
          "descripcion": "autorizar(rol, empleado, visor) — un solo escritor (DUENO)"
        },
        {
          "nombre": "_puedeVer",
          "descripcion": "puedeVer(visor, empleado) -> Bool"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el aislamiento de la nomina como dato personal no existe en el inventario."
    },
    {
      "slug": "inmovilizado",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "escritor-diario",
        "mayor-balanza",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.activo.alta.request",
        "contabilidad.amortizacion.generar.request",
        "contabilidad.activo.baja.request",
        "contabilidad.activo.valor_neto.request",
        "contabilidad.cierre_realizado",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.activo_dado_de_alta",
        "contabilidad.amortizacion_generada",
        "contabilidad.activo_dado_de_baja",
        "contabilidad.activo.alta.response",
        "contabilidad.activo.alta.failed",
        "contabilidad.amortizacion.generar.response",
        "contabilidad.amortizacion.generar.failed",
        "contabilidad.activo.baja.response",
        "contabilidad.activo.baja.failed",
        "contabilidad.activo.valor_neto.response",
        "contabilidad.activo.valor_neto.failed",
        "contabilidad.activo_dado_de_alta.failed",
        "contabilidad.amortizacion_generada.failed",
        "contabilidad.activo_dado_de_baja.failed"
      ],
      "proposito": "El bien duradero y su amortizacion: alta declarada (no estimada), cuota que dispara EN EL CIERRE con parametros declarables, baja que calcula resultado y valor neto contable.",
      "clases": [
        "F1",
        "F2",
        "F3",
        "F4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_registrar",
          "descripcion": "registrar(rol, activo) -> ok (F1, un solo escritor DUENO/ASESOR)"
        },
        {
          "nombre": "_valorarAlta",
          "descripcion": "valorarAlta(activo) -> Importe (F1, reflejo hidratador)"
        },
        {
          "nombre": "_generarCuota",
          "descripcion": "generarCuota(activo, periodo) -> AsientoAmortizacion | NADA (F2; metodo/coeficiente/anios DECLARABLES, ningun coeficiente cableado)"
        },
        {
          "nombre": "_dispararEnCierre",
          "descripcion": "dispararEnCierre(cierre) -> ok (F2: la cuota se genera CUANDO TOCA)"
        },
        {
          "nombre": "_calcularResultadoBaja",
          "descripcion": "calcularResultadoBaja(activo) -> Perdida | Beneficio (F3)"
        },
        {
          "nombre": "_imputar",
          "descripcion": "imputar(resultado) -> Asiento (F3: la baja no borra la historia del bien, suma un asiento)"
        },
        {
          "nombre": "_calcularValorNeto",
          "descripcion": "calcular(activo) -> Importe coste - amortizacion acumulada (F4, al balance C1)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el inmovilizado y la amortizacion no existen en el inventario (0 modulos); la amortizacion es un hecho que produce el TIEMPO y aqui se genera en el cierre."
    },
    {
      "slug": "aislamiento-negocio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "single-writer"
      ],
      "eventos_sube": [
        "contabilidad.parcela_negocio.registrar.request",
        "contabilidad.parcela_negocio.escribir.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.parcela_negocio_registrada",
        "contabilidad.parcela_negocio.registrar.response",
        "contabilidad.parcela_negocio.registrar.failed",
        "contabilidad.parcela_negocio.escribir.response",
        "contabilidad.parcela_negocio.escribir.failed",
        "contabilidad.parcela_negocio_registrada.failed"
      ],
      "proposito": "Multi-negocio SIN FUGA: un dueno por parcela; ningun calculo lee ni escribe la parcela de otro salvo consolidacion declarada.",
      "clases": [
        "I4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_parcela",
          "descripcion": "parcela(negocio) -> Parcela"
        },
        {
          "nombre": "_escribir",
          "descripcion": "escribir(negocio, rol, cambio) -> ok | ERROR_FUGA_ENTRE_NEGOCIOS"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el aislamiento por parcela de negocio es la invariante 13 del dominio; la capa de proyecto (PosPersistencia) NO la sustituye."
    },
    {
      "slug": "cola-declaraciones-criterio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.criterio.declarar.request",
        "contabilidad.criterio.leer.request",
        "contabilidad.criterio.pendientes.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.criterio_declarado",
        "contabilidad.criterio_pendiente",
        "contabilidad.criterio.declarar.response",
        "contabilidad.criterio.declarar.failed",
        "contabilidad.criterio.leer.response",
        "contabilidad.criterio.leer.failed",
        "contabilidad.criterio.pendientes.response",
        "contabilidad.criterio.pendientes.failed",
        "contabilidad.criterio_declarado.failed",
        "contabilidad.criterio_pendiente.failed"
      ],
      "proposito": "UNA sola cola declarativa donde el jefe/asesor fija o ratifica TODOS los criterios (plan, periodo, plazos, amortizacion, dimensiones, tipos fiscales, consolidacion, unidad_de_cierre).",
      "clases": [
        "K9"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, criterio, valor) -> ParametroDeclarable — un solo escritor (JEFE/ASESOR)"
        },
        {
          "nombre": "_leer",
          "descripcion": "leer(criterio) -> ParametroDeclarable | AUSENTE"
        },
        {
          "nombre": "_pendientes",
          "descripcion": "pendientes() -> List<IdCriterio> — las 23 piezas [ABIERTO]; lo no declarado NO se estima"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: es la PUERTA DECLARATIVA del dominio; ninguna pieza del inventario recoge criterios contables."
    },
    {
      "slug": "onboarding-negocio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "cola-declaraciones-criterio",
        "project-manager"
      ],
      "eventos_sube": [
        "contabilidad.negocio.configurar.request",
        "contabilidad.negocio.estado.request",
        "contabilidad.negocio.activar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.negocio_configurado",
        "contabilidad.vertical_activada",
        "contabilidad.negocio.configurar.response",
        "contabilidad.negocio.configurar.failed",
        "contabilidad.negocio.estado.response",
        "contabilidad.negocio.estado.failed",
        "contabilidad.negocio.activar.response",
        "contabilidad.negocio.activar.failed",
        "contabilidad.negocio_configurado.failed",
        "contabilidad.vertical_activada.failed"
      ],
      "proposito": "Recoge los datos DECLARABLES del negocio (plan, fuentes, parametros) y enciende la vertical. Sin parametros declarados el negocio queda INCOMPLETO: se declara el hueco.",
      "clases": [
        "K1",
        "K4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_recoger",
          "descripcion": "recoger(rol, negocio, datos) -> ok (K1, un solo escritor DUENO)"
        },
        {
          "nombre": "_estado",
          "descripcion": "estado(negocio) -> CONFIGURADO | FALTA [ABIERTO] (K1)"
        },
        {
          "nombre": "_activar",
          "descripcion": "activar(negocio) -> ok (K4: mecanico, cero juicio; sin parametros NO se activa)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el onboarding de un negocio contable no existe; `project-manager` gestiona el proyecto, no la configuracion contable."
    },
    {
      "slug": "motor-avisos",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.aviso.solicitar.request",
        "contabilidad.aviso.catalogo.declarar.request"
      ],
      "eventos_publica": [
        "contabilidad.aviso_producido",
        "contabilidad.aviso.enrutar.request",
        "contabilidad.aviso.solicitar.response",
        "contabilidad.aviso.solicitar.failed",
        "contabilidad.aviso.catalogo.declarar.response",
        "contabilidad.aviso.catalogo.declarar.failed",
        "contabilidad.aviso_producido.failed",
        "contabilidad.aviso.enrutar.failed"
      ],
      "proposito": "PRODUCE el aviso a partir de senales REALES (nunca de pantalla muda): descuadre, excepcion, IVA, vencimiento, plazo, desviacion, cierre, amortizacion, rectificacion, hueco.",
      "clases": [
        "K2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_producir",
          "descripcion": "producir(senal) -> Aviso (catalogo declarable K6)"
        },
        {
          "nombre": "_enrutar",
          "descripcion": "enrutar(aviso, destinatario) -> ok"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe motor de avisos contables en el inventario; recibe senales de A8.2, C6, D6, E5, J4, A15 y R1."
    },
    {
      "slug": "consolidacion-grupo",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "estados-contables",
        "aislamiento-negocio",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.consolidacion.agregar.request"
      ],
      "eventos_publica": [
        "contabilidad.grupo_consolidado",
        "contabilidad.consolidacion.agregar.response",
        "contabilidad.consolidacion.agregar.failed",
        "contabilidad.grupo_consolidado.failed"
      ],
      "proposito": "Estados del CONJUNTO con criterio declarado: marca de sociedad, eliminacion intercompany y agregacion. Dos niveles: por negocio (aislado) y del grupo.",
      "clases": [
        "I1",
        "I2",
        "I3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_etiquetar",
          "descripcion": "etiquetar(asiento, sociedad) -> Asiento (I1, mecanico)"
        },
        {
          "nombre": "_detectarCruceInterno",
          "descripcion": "detectarCruceInterno() -> List<Cruce> (I2)"
        },
        {
          "nombre": "_eliminar",
          "descripcion": "eliminar(cruces) -> List<Eliminacion> (I2)"
        },
        {
          "nombre": "_agregar",
          "descripcion": "agregar(sociedades) -> EstadosConsolidados (I3, criterio declarado)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la consolidacion multi-sociedad no existe en el inventario (grupo = 0 modulos)."
    },
    {
      "slug": "frontera-ficha-producto",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [],
      "eventos_sube": [
        "contabilidad.ficha.coste.request"
      ],
      "eventos_publica": [
        "contabilidad.coste_leido",
        "contabilidad.ficha.coste.response",
        "contabilidad.ficha.coste.failed",
        "contabilidad.coste_leido.failed"
      ],
      "proposito": "Puerto DECLARABLE del coste de cada negocio: por donde cruza el coste de la ficha al dato interno. Si falta -> se crea. Nunca se inventa un coste.",
      "clases": [
        "H2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_leerCoste",
          "descripcion": "leerCoste(producto) -> Coste | AUSENTE"
        },
        {
          "nombre": "_crearFrontera",
          "descripcion": "crearFrontera(negocio) -> ok (invariante de puerto abierto)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la frontera de coste (ficha/receta/otro) es declarable por negocio; `pizzepos/escandallo` es mono-negocio y se pone POR ENCIMA, no se toca."
    },
    {
      "slug": "valoracion-existencia",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "frontera-ficha-producto",
        "inventario",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.existencia.valorar.request",
        "contabilidad.inventario.ajuste.request"
      ],
      "eventos_publica": [
        "contabilidad.existencia_valorada",
        "contabilidad.ajuste_inventario_calculado",
        "contabilidad.existencia.valorar.response",
        "contabilidad.existencia.valorar.failed",
        "contabilidad.inventario.ajuste.response",
        "contabilidad.inventario.ajuste.failed",
        "contabilidad.existencia_valorada.failed",
        "contabilidad.ajuste_inventario_calculado.failed"
      ],
      "proposito": "Capa de VALOR sobre el stock existente (no duplica el inventario): metodo declarable (FIFO/PMP; LIFO no), ajuste de merma y variacion valorada.",
      "clases": [
        "H1",
        "H3",
        "H4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_valorar",
          "descripcion": "valorar(producto, cantidad, fecha) -> Importe (H1, metodo parametro declarable)"
        },
        {
          "nombre": "_capaDeValor",
          "descripcion": "capaDeValor(inventarioExistente) -> Valoracion (H1: NO duplica el inventario)"
        },
        {
          "nombre": "_calcularDiferencia",
          "descripcion": "calcularDiferencia() -> Importe (H3: merma/rotura)"
        },
        {
          "nombre": "_regularizar",
          "descripcion": "regularizar(diferencia) -> Asiento + aviso (H3: el asiento SUMA)"
        },
        {
          "nombre": "_valorarEntrada",
          "descripcion": "valorarEntrada(compra) -> Importe (H4)"
        },
        {
          "nombre": "_valorarSalida",
          "descripcion": "valorarSalida(consumo) -> Importe (H4: el hecho de stock lo emite la fuente; contabilidad lo VALORA)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: `inventario` custodia el stock real; la VALORACION contable (capa de valor, merma, coste del consumo) no existe en el inventario."
    },
    {
      "slug": "etiquetado-analitico",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "cola-declaraciones-criterio",
        "cola-revision"
      ],
      "eventos_sube": [
        "contabilidad.etiqueta.aplicar.request"
      ],
      "eventos_publica": [
        "contabilidad.etiqueta_aplicada",
        "contabilidad.excepcion.encolar.request",
        "contabilidad.etiqueta.aplicar.response",
        "contabilidad.etiqueta.aplicar.failed",
        "contabilidad.etiqueta_aplicada.failed",
        "contabilidad.excepcion.encolar.failed"
      ],
      "proposito": "Asigna centro/linea/producto con REGLA declarable; cuando la regla no cubre, clasificar es JUICIO -> lo dudoso va a cola.",
      "clases": [
        "J1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_etiquetar",
          "descripcion": "etiquetar(hecho) -> Etiqueta {centro, linea, producto} | SIN_REGLA (caso cubierto por regla = reflejo)"
        },
        {
          "nombre": "_proponerEtiqueta",
          "descripcion": "proponerEtiqueta(hecho) -> Etiqueta — FUZZY"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el etiquetado analitico por dimensiones declaradas no existe en el inventario."
    },
    {
      "slug": "margen-analitico",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "mayor-balanza",
        "valoracion-existencia",
        "etiquetado-analitico",
        "cola-declaraciones-criterio"
      ],
      "eventos_sube": [
        "contabilidad.margen.calcular.request",
        "contabilidad.indirecto.repartir.request",
        "contabilidad.tablero.cruzar.request"
      ],
      "eventos_publica": [
        "contabilidad.margen_calculado",
        "contabilidad.indirecto_repartido",
        "contabilidad.tablero_calculado",
        "contabilidad.margen.calcular.response",
        "contabilidad.margen.calcular.failed",
        "contabilidad.indirecto.repartir.response",
        "contabilidad.indirecto.repartir.failed",
        "contabilidad.tablero.cruzar.response",
        "contabilidad.tablero.cruzar.failed",
        "contabilidad.margen_calculado.failed",
        "contabilidad.indirecto_repartido.failed",
        "contabilidad.tablero_calculado.failed"
      ],
      "proposito": "Margen por dimension (ingreso - coste imputado), reparto DECLARADO de gastos no directos y cruce margen x dimension bajo lente de conjunto.",
      "clases": [
        "J2",
        "J5",
        "J10"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_calcular",
          "descripcion": "calcular(dimension) -> Margen (J2: enlaza existencias con analitica)"
        },
        {
          "nombre": "_repartir",
          "descripcion": "repartir(gasto, criterio) -> Map<IdDimension, Importe> (J5: criterio declarado)"
        },
        {
          "nombre": "_cruzar",
          "descripcion": "cruzar(margen, dimension) -> Tablero (J10: por centro, familia o sociedad)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el coste indirecto multi-sociedad y por periodos NO lo cubre la pieza existente (escandallo, mono-negocio)."
    },
    {
      "slug": "presupuesto",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "estados-contables",
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.presupuesto.declarar.request",
        "contabilidad.desviacion.calcular.request",
        "contabilidad.periodos.comparar.request",
        "project.activated"
      ],
      "eventos_publica": [
        "contabilidad.presupuesto_declarado",
        "contabilidad.desviacion_calculada",
        "contabilidad.comparacion_calculada",
        "contabilidad.presupuesto.declarar.response",
        "contabilidad.presupuesto.declarar.failed",
        "contabilidad.desviacion.calcular.response",
        "contabilidad.desviacion.calcular.failed",
        "contabilidad.periodos.comparar.response",
        "contabilidad.periodos.comparar.failed",
        "contabilidad.presupuesto_declarado.failed",
        "contabilidad.desviacion_calculada.failed",
        "contabilidad.comparacion_calculada.failed"
      ],
      "proposito": "Cifra OBJETIVO por dimension (un solo escritor: el jefe) + desviacion real-vs-presupuesto con umbral declarado + comparador de periodos que REUTILIZA ambos, no los duplica.",
      "clases": [
        "J3",
        "J4",
        "J9"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declarar",
          "descripcion": "declarar(rol, dimension, cifra) — un solo escritor (JEFE) (J3)"
        },
        {
          "nombre": "_objetivo",
          "descripcion": "objetivo(dimension, periodo) -> CifraObjetivo (J3)"
        },
        {
          "nombre": "_calcular",
          "descripcion": "calcular(real, presupuesto) -> Desviacion (J4)"
        },
        {
          "nombre": "_dispararSiExcede",
          "descripcion": "dispararSiExcede(desviacion) -> senal a K2 con el umbral declarado (J4)"
        },
        {
          "nombre": "_comparar",
          "descripcion": "comparar(a, b) -> Delta (J9: ejercicio vs ejercicio, mes vs mes, real vs presupuesto)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: `marketing-budget` es presupuesto de marketing y declara \"custodia contable\" solo de nombre: contabilidad lo LEE, no lo absorbe (solape registrado)."
    },
    {
      "slug": "cuadro-mando-contable",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "saldo-tesoreria",
        "estados-contables",
        "margen-analitico",
        "presupuesto",
        "cierre-ejercicio"
      ],
      "eventos_sube": [
        "contabilidad.cuadro_mando.agregar.request"
      ],
      "eventos_publica": [
        "contabilidad.cuadro_mando_calculado",
        "contabilidad.cuadro_mando.agregar.response",
        "contabilidad.cuadro_mando.agregar.failed",
        "contabilidad.cuadro_mando_calculado.failed"
      ],
      "proposito": "Agregacion de CONJUNTO para el jefe (caja, resultado, margen, desviacion, ejercicio) SIN bajar al asiento.",
      "clases": [
        "J8"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_agregar",
          "descripcion": "agregar(lente: CONJUNTO) -> CuadroMando"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: no existe cuadro de mando contable; reutiliza J2/J3/J4/E4/E5/C1/C2 por RPC sin duplicarlos."
    },
    {
      "slug": "informe-rico",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "estados-contables",
        "cierre-ejercicio",
        "completitud-cobertura"
      ],
      "eventos_sube": [
        "contabilidad.informe.componer.request"
      ],
      "eventos_publica": [
        "contabilidad.informe_compuesto",
        "contabilidad.informe.componer.response",
        "contabilidad.informe.componer.failed",
        "contabilidad.informe_compuesto.failed"
      ],
      "proposito": "Nucleo de informe rico: cifra ya calculada + contexto declarado (periodo, origen, comparativas, cobertura). No un numero pelado.",
      "clases": [
        "K3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_componer",
          "descripcion": "componer(cifra, contexto) -> InformeRico — mecanico"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: el nucleo de informe rico se sirve en idiomas distintos (dueno Q2 / cliente R3); no existe en el inventario."
    },
    {
      "slug": "consulta-dueno",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "completitud-cobertura",
        "traza-asiento",
        "flujo-firma",
        "informe-rico"
      ],
      "eventos_sube": [
        "contabilidad.consulta.responder.request"
      ],
      "eventos_publica": [
        "contabilidad.consulta_respondida",
        "contabilidad.consulta.responder.response",
        "contabilidad.consulta.responder.failed",
        "contabilidad.consulta_respondida.failed"
      ],
      "proposito": "Puerta PULL: el dueno pregunta cuando quiere y el sistema contesta, con SELLO DE COBERTURA y MARCA de borrador/revisado/firmado (sin cadencia impuesta).",
      "clases": [
        "Q1",
        "Q3",
        "Q4"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_responder",
          "descripcion": "responder(pregunta) -> ResultadoCalculo (Q1: puerta declarable; el canal es puerto)"
        },
        {
          "nombre": "_sinCadencia",
          "descripcion": "sinCadencia() -> Bool (Q1: != cuadro del jefe J8, que impone cadencia)"
        },
        {
          "nombre": "_sellarCobertura",
          "descripcion": "sellarCobertura(resultadoCalculo) -> con sello (Q3: vista de la metrica unica A12, fuera de ciclo)"
        },
        {
          "nombre": "_derivarEstado",
          "descripcion": "derivarEstado(periodo) -> EN_CURSO | REVISADO | FIRMADO (Q4: deriva de B4 + L3)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: la cara pull del dueno sobre la contabilidad no existe en el inventario."
    },
    {
      "slug": "puente-lenguaje-dueno",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "informe-rico",
        "consulta-dueno"
      ],
      "eventos_sube": [
        "contabilidad.dueno.preguntar.request",
        "contabilidad.dueno.cifra.presentar.request"
      ],
      "eventos_publica": [
        "contabilidad.consulta.responder.request",
        "contabilidad.cifra_presentada",
        "contabilidad.dueno.preguntar.response",
        "contabilidad.dueno.preguntar.failed",
        "contabilidad.dueno.cifra.presentar.response",
        "contabilidad.dueno.cifra.presentar.failed",
        "contabilidad.consulta.responder.failed",
        "contabilidad.cifra_presentada.failed"
      ],
      "proposito": "Traductor BIDIRECCIONAL: su pregunta -> consulta contable; calculo -> cifra en su idioma (caja, deuda, resultado, \"puedo pagar X?\").",
      "clases": [
        "Q2"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_traducirPregunta",
          "descripcion": "traducirPregunta(preguntaNatural) -> ConsultaContable — FUZZY"
        },
        {
          "nombre": "_traducirCifra",
          "descripcion": "traducirCifra(resultado) -> CifraEnSuIdioma — FUZZY; vocabulario declarable"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: el puente de lenguaje del dueno no existe; comparte el nucleo de informe (K3) con R3, no el traductor."
    },
    {
      "slug": "aviso-al-negocio",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "motor-avisos"
      ],
      "eventos_sube": [
        "contabilidad.aviso.enrutar.request"
      ],
      "eventos_publica": [
        "contabilidad.aviso_entregado",
        "contabilidad.aviso_confirmado",
        "contabilidad.aviso.enrutar.response",
        "contabilidad.aviso.enrutar.failed",
        "contabilidad.aviso_entregado.failed",
        "contabilidad.aviso_confirmado.failed"
      ],
      "proposito": "Cara de ENTREGA del aviso al negocio cliente: sin confirmacion de entrega el aviso NO consta como recibido. El canal es un puerto.",
      "clases": [
        "R1"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_entregar",
          "descripcion": "entregar(aviso) -> ok (canal declarable: K7)"
        },
        {
          "nombre": "_confirmar",
          "descripcion": "confirmar(entrega) -> Confirmacion (honestidad: nadie da por entregado sin confirmacion)"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo"
      ],
      "nota": "NO REUTILIZA: completa K2 (que solo PRODUCE); la entrega al negocio contable no existe en el inventario."
    },
    {
      "slug": "informe-accionable",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "eje": "contabilidad-analitica",
      "depende_de": [
        "informe-rico",
        "estados-contables",
        "aviso-al-negocio"
      ],
      "eventos_sube": [
        "contabilidad.informe.accionable.request",
        "contabilidad.estados.narrar.request"
      ],
      "eventos_publica": [
        "contabilidad.informe_accionable",
        "contabilidad.estados_narrados",
        "contabilidad.informe.accionable.response",
        "contabilidad.informe.accionable.failed",
        "contabilidad.estados.narrar.response",
        "contabilidad.estados.narrar.failed",
        "contabilidad.informe_accionable.failed",
        "contabilidad.estados_narrados.failed"
      ],
      "proposito": "Todo informe que recibe el cliente lleva QUE HACER con el (R2) y los estados van narrados a su lenguaje (R3).",
      "clases": [
        "R2",
        "R3"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_recomendar",
          "descripcion": "recomendar(informe) -> InformeAccionable — FUZZY"
        },
        {
          "nombre": "_narrar",
          "descripcion": "narrar(estados) -> Narracion \"esto es lo que te ha pasado y lo que viene\" — FUZZY"
        }
      ],
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "nota": "NO REUTILIZA: la recomendacion accionable y la narracion de estados son juicio (fuzzy) propio de la vertical."
    }
  ]
}
```
