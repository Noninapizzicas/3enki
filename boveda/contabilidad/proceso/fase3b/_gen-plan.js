#!/usr/bin/env node
/* Generador del plan F3b de la vertical CONTABILIDAD.
   Construye plan-construccion.md (prosa + 7 etapas por hoja + espina enki-plan) desde UNA
   sola tabla de datos, de forma que la espina y las tablas de eventos NO puedan divergir.
   Uso: node _gen-plan.js  (escribe ../fase3b/plan-construccion.md junto a este script) */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'plan-construccion.md');

/* ---------- eje -> vertical ---------- */
const V = {
  entrada: 'contabilidad-entrada',
  libro: 'contabilidad-libro',
  fiscal: 'contabilidad-fiscal',
  analitica: 'contabilidad-analitica',
  transversal: 'transversal'
};
/* normaliza el eje de CUALQUIER hoja (REUTILIZAR o CONSTRUIR) a la vertical final.
   BUG que esto cierra: los REUTILIZAR declaraban la clave corta ('entrada','libro')
   y los CONSTRUIR el valor largo (V.entrada='contabilidad-entrada'), de modo que la
   espina salia con DOS vocabularios de eje mezclados (entrada:2 / contabilidad-entrada:20).
   El tracking de F4 agrupa por vertical -> necesita UNA sola nomenclatura. */
const ejeV = (x) => V[x] || x;

/* ---------- REUTILIZAR (8) — contrato REAL verificado por el padre ---------- */
const REUT = [
  { s: 'filesystem', f: 'reflejo', a: 'REUTILIZAR', v: 'transversal', c: [], d: [],
    sub: ['fs.read.request', 'fs.write.request', 'fs.edit.request', 'fs.list.request', 'fs.exists.request', 'project.activated', 'project.deactivated'],
    pub: ['fs.read.response', 'fs.write.response', 'fs.edit.response', 'fs.list.response', 'fs.exists.response'],
    p: 'Infraestructura de storage scopeada por el project_id de la PETICION (multi-tenant real).',
    n: 'v2.4.0 — 23 subs / 27 pubs / 17 tools (fs.list/read/write/edit/...). Base de TODO store de la vertical.' },
  { s: 'project-manager', f: 'reflejo', a: 'REUTILIZAR', v: 'transversal', c: [], d: [],
    sub: ['project.activate', 'project.create', 'project.get.request', 'project.list.request', 'project.state.request', 'project.update'],
    pub: ['project.activated', 'project.created', 'project.deactivated', 'project.state', 'project.get.response', 'project.list.response'],
    p: 'Lifecycle del proyecto: la activacion de la vertical y el scope de PosPersistencia.',
    n: 'v4.2.0 — 11 subs / 13 pubs. `project.activated` es el arranque de todo custodio (restaura su store por project_id).' },
  { s: 'credential-manager', f: 'reflejo', a: 'REUTILIZAR', v: 'transversal', c: [], d: [],
    sub: ['credential.resolve.request', 'credential.create.request', 'credential.update.request', 'credential.delete.request', 'credential.state.request'],
    pub: ['credential.resolve.response', 'credential.saved', 'credential.updated', 'credential.deleted', 'credential.state'],
    p: 'Credenciales por-tenant (bancos, FACe, SII, buzon digital) resueltas por cascada.',
    n: 'v2.2.0 — tools `credential.list`. Lo consumen los puentes de extracto, acuse y recepcion digital.' },
  { s: 'facturas', f: 'custodio', a: 'REUTILIZAR', v: 'entrada', c: ['A3', 'A4.1'], d: [],
    sub: ['factura.entrada'],
    pub: ['factura.recibida', 'factura.procesada', 'factura.error', 'factura.exportada', 'telegram.send_message.request'],
    p: 'CUBRE la admision del documento (A3) y la conversion documento->dato (A4.1).',
    n: 'v3.0.0 — pipeline step-based (Intake/Convert/Prepare/OCR/Structure) + tools `facturas.procesar` (OCR+IA), `facturas.listar`, `facturas.estadisticas`. El hecho extraido entra a contabilidad por `factura.procesada`.' },
  { s: 'facturacion/fuentes', f: 'puente', a: 'REUTILIZAR', v: 'entrada', c: ['A5', 'A4.2'], d: [],
    sub: ['telegram.photo.received', 'telegram.document.received'],
    pub: ['factura.entrada'],
    p: 'CUBRE el puerto de documento digital (A5) y el canal declarable de A4.2.',
    n: 'v2.0.0 — adaptador strategy-pattern de FUENTES (Telegram push, Gmail pull, extensible). El catalogo de fuentes/formas es DATO declarable (A10).' },
  { s: 'inventario', f: 'custodio', a: 'REUTILIZAR', v: 'analitica', c: [], d: [],
    sub: ['pedido.completado', 'pedido.cancelado'],
    pub: ['inventario.reserva.creada', 'inventario.reserva.expirada', 'inventario.reserva.liberada', 'inventario.confirmado', 'inventario.ajustado', 'inventario.stock.bajo_minimo'],
    p: 'CUBRE el STOCK REAL por proyecto (sustrato del grupo H): contabilidad lo VALORA, nunca lo duplica.',
    n: 'v1.0.0 — stock_real + reservas con expiracion, data/projects/<slug>/inventario.json. Tools consultar/reservar/confirmar/liberar/ajustar.' },
  { s: 'metricas', f: 'reflejo', a: 'REUTILIZAR', v: 'libro', c: [], d: [],
    sub: ['*.creado', '*.actualizado', '*.eliminado', '*.error', '*.completado'],
    pub: ['metricas.snapshot'],
    p: 'Instrumentacion PASIVA (wildcards): contadores y gauges que sostienen la observabilidad de la vertical.',
    n: 'v2.0.0 — ninguna hoja de contabilidad escribe contadores: emiten sus eventos de dominio y `metricas` los absorbe.' },
  { s: 'facturacion/asesoria', f: 'puente', a: 'REUTILIZAR', v: 'libro', c: ['L1'], d: [],
    sub: [],
    pub: ['asesoria.paquete.generado', 'asesoria.paquete.error'],
    p: 'CUBRE el puerto de exportacion al asesor (L1): CSV en formato espanol + ZIP con los originales.',
    n: 'v2.0.0 — tools `asesoria.generar-paquete`, `asesoria.historial`. Lee las facturas procesadas; el FORMATO exigido por cada asesor concreto queda declarable (L6).' }
];

/* ---------- CONSTRUIR (72) ---------- */
const K = (s, f, v, c, d, sub, pub, p, pr, n) => ({ s, f, a: 'CONSTRUIR', v, c, d, sub, pub, p, pr: pr || [], n: n || '' });

const hojas = [];
/* ===== OLEADA 1 · contabilidad-entrada (20) ===== */
hojas.push(K('contrato-hecho-minimo', 'custodio', V.entrada, ['A11'], [],
  ['contabilidad.contrato.declarar.request', 'contabilidad.contrato.exigir.request', 'contabilidad.contrato.cubre.request', 'project.activated'],
  ['contabilidad.contrato_declarado'],
  'El minimo EXIGIBLE por fuente (declarado por dueno/jefe), visto desde la fuente: no un formato impuesto.',
  [['_declarar', 'declarar(rol, vertical, campos) — un solo escritor del minimo por vertical'],
   ['_exigir', 'exigir(vertical) -> Set<Campo>'],
   ['_cubre', 'cubre(vertical, hecho) -> ok | Set<Campo> faltantes']],
  'NO REUTILIZA: ningun modulo del inventario declara un contrato minimo de hecho por vertical; los contratos de entrada viven en cada vertical productora.'));
hojas.push(K('anclaje-cierre-vertical', 'custodio', V.entrada, ['A14'], [],
  ['contabilidad.anclaje.declarar.request', 'contabilidad.anclaje.anclar.request', 'project.activated'],
  ['contabilidad.anclaje_declarado'],
  'Declara POR FUENTE que es un cierre y como se identifica; ancla la clave natural. Su contenido pende de la unidad_de_cierre (M4, declarable).',
  [['_declarar', 'declarar(rol, vertical, definicion) — un solo escritor (DUENO)'],
   ['_anclar', 'anclar(vertical, hecho) -> ClaveNatural']],
  'NO REUTILIZA: la definicion de cierre por vertical no existe en el inventario; el cierre de caja existente es de la operacion (mono-negocio) y aqui llega como HECHO observado.'));
hojas.push(K('cola-revision', 'custodio', V.entrada, ['A8.1'], [],
  ['contabilidad.excepcion.encolar.request', 'contabilidad.excepcion.resolver.request', 'contabilidad.excepcion.siguiente.request', 'project.activated'],
  ['contabilidad.excepcion_encolada', 'contabilidad.excepcion_resuelta'],
  'DOS colas de excepciones (asesor / dueno) por naturaleza; el flujo NUNCA se bloquea. Un solo escritor por cola.',
  [['_encolar', 'routing por naturaleza de la excepcion -> cola ASESOR | cola DUENO'],
   ['_siguiente', 'siguiente(cola) -> Excepcion | VACIA'],
   ['_resolver', 'resolver(rol, excepcion, resolucion) — guard de escritor por cola']],
  'NO REUTILIZA: no existe modulo de cola de revision contable en el inventario; `manejo-fallo` (nichos) es fallo de canal, otro dominio (patron tomado).'));
hojas.push(K('regla-contrapartida', 'custodio', V.entrada, ['A6.2'], [],
  ['contabilidad.regla.leer.request', 'contabilidad.regla.declarar.request', 'contabilidad.regla.aprender.request', 'contabilidad.regla_ratificada', 'project.activated'],
  ['contabilidad.regla_declarada', 'contabilidad.regla_aprendida'],
  'Repositorio de reglas declaradas/aprendidas ("este proveedor -> esta cuenta"). Una regla APRENDIDA no actua hasta ser RATIFICADA (L10).',
  [['_declarar', 'declarar(rol, regla) — un solo escritor (DUENO/ASESOR)'],
   ['_aplicar', 'aplicar(hecho) -> Contrapartida | SIN_COBERTURA'],
   ['_aprender', 'aprender(rol, regla, evidencia) — el aprendizaje entra HIDRATADO y queda PENDIENTE de ratificacion']],
  'NO REUTILIZA: repositorio de reglas contables por negocio; `reglas-aprendidas` (nichos) es umbrales de viabilidad, otro dominio (patron tomado).'));
hojas.push(K('clave-natural', 'reflejo', V.libro, ['M3'], ['anclaje-cierre-vertical', 'cola-declaraciones-criterio'],
  ['contabilidad.clave.calcular.request', 'contabilidad.clave.repeticion.request'],
  ['contabilidad.clave_calculada'],
  'CERROJO 3 · idempotencia: mismos componentes => mismo hecho => mismo asiento. Un solo calculador de la clave.',
  [['_calcular', 'calcular(hechoODocumento) -> ClaveNatural (cuelga de A14 / unidad_de_cierre)'],
   ['_esRepeticion', 'esRepeticion(clave, yaAsentados) -> Bool — test unitario lo afirma']],
  'NO REUTILIZA: la clave natural es la invariante anti-bucle de ESTA vertical; ningun modulo del inventario la calcula.'));
hojas.push(K('single-writer', 'custodio', V.libro, ['M2'], [],
  ['contabilidad.parcela.registrar.request', 'contabilidad.parcela.autorizar.request', 'project.activated'],
  ['contabilidad.parcela_registrada', 'contabilidad.parcela_autorizada'],
  'CERROJO 2 · la ley que gobierna a TODO custodio: un unico escritor por parcela. Los custodios registran su parcela y su rol autorizado.',
  [['_autorizar', 'autorizar(parcela, rol) -> ok'],
   ['_escribir', 'escribir(parcela, rol, cambio) -> ok | ERROR_DOS_ESCRITORES']],
  'NO REUTILIZA: el guard de escritor por parcela es la invariante transversal del dominio; no existe modulo que lo gobierne.'));
hojas.push(K('frontera-planos', 'reflejo', V.libro, ['M1'], [],
  ['contabilidad.frontera_planos.verificar.request'],
  ['contabilidad.frontera_planos_verificada'],
  'CERROJO 1 · anti-realimentacion: contabilidad emite CALCULOS; si un contrato pretende ser un HECHO de negocio -> rechazo determinista.',
  [['_verificar', 'verificar(emision) -> ok | ERROR_FUGA (prefijo del espacio de CALCULOS contabilidad.*)']],
  'NO REUTILIZA: cerrojo propio del dominio contable (la identidad "observadora que no produce hechos" se verifica aqui).'));
hojas.push(K('lote-admision', 'reflejo', V.entrada, ['A9'], [],
  ['contabilidad.lote.despachar.request'],
  ['contabilidad.lote_despachado'],
  'DESACOPLE del cuello: la admision no se hace en serie (N hechos en paralelo). Mecanico, cero juicio.',
  [['_lotear', 'lotear(cola) -> List<Hecho>'],
   ['_despachar', 'despachar(lote) -> ok — consumido por AMBAS puertas (hechos y documentos)']],
  'NO REUTILIZA: el paralelismo declarable de la admision no existe en el inventario.'));
hojas.push(K('puerto-evento-vertical', 'puente', V.entrada, ['A1'], ['contrato-hecho-minimo'],
  ['contabilidad.hecho.admitir.request', 'contabilidad.contrato_declarado', 'project.activated'],
  ['contabilidad.hecho_admitido'],
  'PUERTA de los hechos ya emitidos por las verticales. Contabilidad LEE, no impone: la fuente manda en formato, granularidad y ritmo.',
  [['_admitir', 'admitir(hecho) -> ok — valida la forma minima de entrada, no el contenido'],
   ['_reconectar', 'reconectar(fuente) — el puerto es reemplazable, la fuente manda'],
   ['_declararHueco', 'si no hay fuente -> senal a A15, nunca se fuerza']],
  'NO REUTILIZA: ningun modulo del inventario recibe hechos heterogeneos de otras verticales; un adaptador por fuente se pone en el sitio de despliegue.'));
hojas.push(K('historial-proceso-contable', 'custodio', V.entrada, ['P2'], [],
  ['contabilidad.historial.anotar.request', 'contabilidad.historial.consultar.request', 'contabilidad.hecho_admitido', 'contabilidad.excepcion_encolada', 'contabilidad.excepcion_resuelta', 'project.activated'],
  ['contabilidad.historial_anotado'],
  'Registro append-only de lo PROCESADO y lo FALLADO con su rastro. Solo crece; nunca se reescribe.',
  [['_anotar', 'anotar(entrada) — single-writer ADMISION'],
   ['_consultar', 'consultar(desde, hasta) -> Historial']],
  'NO REUTILIZA: es el historial del PROCESO de entrada, distinto de `traza-asiento` (B4, del asiento) y de `historial-nicho` (otro dominio).'));
hojas.push(K('maestro-terceros', 'custodio', V.entrada, ['N1', 'N2'], [],
  ['contabilidad.tercero.declarar.request', 'contabilidad.tercero.ficha.request', 'contabilidad.tercero.identificar.request', 'contabilidad.tercero.historial.request', 'project.activated'],
  ['contabilidad.tercero_declarado', 'contabilidad.tercero_identificado'],
  'MAESTRO UNICO del tercero con ROLES (conflicto 1 resuelto): ficha funcional + identidad por NIF en la MISMA parcela.',
  [['_declarar', 'declarar(rol, tercero) — un solo escritor (DUENO/ASESOR)'],
   ['_ficha', 'ficha(idTercero) -> Tercero'],
   ['_historial', 'historial(idTercero) -> List<IdAsiento|IdDocumento>'],
   ['_anadirRol', 'anadirRol(idTercero, rol) — cliente+proveedor NO duplica al tercero'],
   ['_identificar', 'identificar(nif, nombreFiscal) -> IdTercero (N2, faceta de identidad)'],
   ['_unificar', 'unificar(idA, idB, evidencia) -> IdTercero — "un proveedor escrito de tres formas = uno"']],
  'NO REUTILIZA: no existe maestro fiscal de terceros en el inventario (N1+N2 se funden en UNA parcela, decision del dueno).'));
hojas.push(K('normalizador-hecho', 'conversor', V.entrada, ['A2', 'A4.3'], ['puerto-evento-vertical', 'contrato-hecho-minimo', 'facturas', 'facturacion/fuentes', 'lote-admision'],
  ['contabilidad.hecho.normalizar.request', 'contabilidad.hecho_admitido', 'factura.procesada'],
  ['contabilidad.hecho_normalizado', 'contabilidad.documento_descuadrado'],
  'UNICA puerta de FORMATO (A2) + control de cuadre del documento (A4.3): homogeneiza a forma asentable y jamas asienta "casi cuadrado".',
  [['_homogeneizar', 'homogeneizar(hechoCrudo) -> Hecho — unica puerta de formato'],
   ['_mapear', 'mapear(camposFuente, camposInternos) -> Hecho'],
   ['_detectarFaltantes', 'detectarFaltantes(hecho) -> Set<Campo> -> excepcion/pregunta (lo que falta NO se rellena)'],
   ['_cuadrarDocumento', 'cuadrarDocumento(campos) -> Cuadrado | Descuadre (suma bases + suma impuestos = total; tolerancia declarable)']],
  'NO REUTILIZA: `facturas` entrega el dato extraido, no la forma asentable de contabilidad (contrato A11 + clave natural A14). El cuadre determinista es propio.'));
hojas.push(K('deduplicacion-hecho', 'reflejo', V.entrada, ['A7'], ['clave-natural'],
  ['contabilidad.duplicado.verificar.request', 'contabilidad.hecho_normalizado'],
  ['contabilidad.hecho_nuevo', 'contabilidad.hecho_duplicado'],
  'ANTI-BUCLE: aplica la clave natural. Reprocesar NO duplica; un rectificativo no es duplicado.',
  [['_esDuplicado', 'esDuplicado(hecho) -> Duplicado | Nuevo (determinista, test lo afirma)'],
   ['_marcarProcesado', 'marcarProcesado(clave) -> ok']],
  'NO REUTILIZA: la idempotencia por clave natural es el cerrojo 3 del dominio; ningun modulo del inventario lo aplica.'));
hojas.push(K('resolucion-contrapartida', 'micro-agente', V.entrada, ['A6.1'], ['normalizador-hecho', 'catalogo-cuentas', 'regla-contrapartida', 'maestro-terceros', 'deduplicacion-hecho'],
  ['contabilidad.contrapartida.proponer.request', 'contabilidad.hecho_nuevo'],
  ['contabilidad.contrapartida_propuesta'],
  'PROPONE cuenta/tercero/periodo (juicio con ambiguedad contra el plan declarado). El corte DURO lo fija la regla (A6.2).',
  [['_proponer', 'proponer(hecho) -> ContrapartidaPropuesta {cuenta, tercero, periodo} — FUZZY (LLM)'],
   ['_justificar', 'justificar(propuesta) -> Explicacion (base de L2)'],
   ['_alzarExcepcion', 'ambiguedad alta y sin regla -> excepcion a cola (A8.1), no se asienta']],
  'NO REUTILIZA: no existe resolucion de contrapartida contable en el inventario (IVA/plan/diario = 0 modulos).'));
hojas.push(K('completitud-cobertura', 'reflejo', V.entrada, ['A12'], ['clave-natural', 'anclaje-cierre-vertical'],
  ['contabilidad.cobertura.calcular.request', 'contabilidad.anclaje_declarado', 'contabilidad.hecho_admitido'],
  ['contabilidad.cobertura_calculada'],
  'EL UNICO CALCULADOR de cobertura (conflicto 2 resuelto): esperados / recibidos / huecos / tasa. Q3, P4 y C6 son VISTAS suyas.',
  [['_calcular', 'calcular(periodo) -> Cobertura {esperados, recibidos, huecos, tasa}'],
   ['_huecos', 'huecos() -> Set<ClaveHecho> — alimenta A15, C6, Q3, P4']],
  'NO REUTILIZA: la metrica de cobertura de la ENTRADA es el corazon del cuello; no existe equivalente en el inventario.'));
hojas.push(K('hecho-rectificativo', 'puente', V.entrada, ['A13'], ['clave-natural'],
  ['contabilidad.rectificativo.emparejar.request', 'contabilidad.hecho_admitido'],
  ['contabilidad.hecho_rectificado'],
  'Plano 2 de los 4 planos de correccion: el hecho posterior que corrige/anula casa con su original POR CLAVE NATURAL. NO borra: ANADE.',
  [['_emparejar', 'emparejar(rectificativo, original) -> ok | ERROR_ORIGINAL_NO_HALLADO'],
   ['_emitir', 'emitir(hecho, ajuste) -> asiento de ajuste (B5), nunca borrado']],
  'NO REUTILIZA: la correccion no destructiva por clave natural es propia del dominio contable.'));
hojas.push(K('panel-proceso-contable', 'reflejo', V.entrada, ['P1', 'P4'], ['cola-revision', 'historial-proceso-contable', 'completitud-cobertura'],
  ['contabilidad.panel.latido.request'],
  ['contabilidad.panel_latido'],
  'Latido del proceso de admision (que entra, que se procesa, que esta en cola, que falla) + la TASA que PRUEBA la promesa "sin una persona digitando".',
  [['_latido', 'latido() -> Panel — agregacion determinista'],
   ['_tasaCobertura', 'tasaCobertura() -> Tasa (P4, vista de la metrica unica A12)']],
  'NO REUTILIZA: no existe panel de proceso contable; es el "display" de la entrada.'));
hojas.push(K('desatasco-entrada', 'micro-agente', V.entrada, ['P3'], ['cola-revision', 'catalogo-cuentas', 'regla-contrapartida', 'regla-movimiento-bancario', 'ratificacion-regla-aprendida'],
  ['contabilidad.desatasco.resolver.request', 'contabilidad.excepcion_encolada'],
  ['contabilidad.excepcion_desatascada', 'contabilidad.regla_aprendida'],
  'LA ACCION que completa la cola: resolver / reencolar / descartar con MOTIVO. Produce la regla candidata que NO actua hasta ser ratificada (L10).',
  [['_resolver', 'resolver(excepcion, decision) -> Resolucion | REENColar | DescartarConMotivo — FUZZY'],
   ['_producirRegla', 'producirRegla(resolucion, evidencia) -> ReglaDeclarada candidata (aprendizaje hidratado)']],
  'NO REUTILIZA: el bucle excepcion -> regla -> menos excepciones es el corazon del cuello y no existe en el inventario.'));
hojas.push(K('cuenta-terceros', 'reflejo', V.entrada, ['N3', 'N4', 'N6', 'N8'], ['maestro-terceros', 'mayor-balanza', 'cola-declaraciones-criterio'],
  ['contabilidad.cuenta_terceros.saldo.request', 'contabilidad.cuenta_terceros.extracto.request', 'contabilidad.cuenta_terceros.vencimiento.request', 'contabilidad.cuenta_terceros.aging.request'],
  ['contabilidad.cuenta_terceros_calculada'],
  'Mayor AUXILIAR del tercero DERIVADO del libro (nunca almacen paralelo): facturas vivas, saldo, extracto confrontable, vencimientos y antiguedad por lado.',
  [['_facturasVivas', 'facturasVivas(idTercero) -> List<IdAsiento> (N3)'],
   ['_saldo', 'saldo(idTercero) -> Importe (N3)'],
   ['_extracto', 'extracto(idTercero, desde, hasta) -> DocumentoConfrontable (N4)'],
   ['_calcularVencimiento', 'calcularVencimiento(factura) -> Fecha desde la politica declarada (N6)'],
   ['_estaVencido', 'estaVencido(factura, hoy) -> Bool (N6)'],
   ['_clasificarPorVencimiento', 'clasificarPorVencimiento(lado, hoy) -> AgingReport POR_COBRAR | POR_PAGAR (N8)']],
  'NO REUTILIZA: las vistas por rol del tercero (auxiliar, extracto, vencimientos) cuelgan del libro de ESTA vertical.'));
hojas.push(K('compra-proveedor', 'reflejo', V.entrada, ['N5', 'N7'], ['mayor-balanza', 'maestro-terceros'],
  ['contabilidad.compra.cotejar.request', 'contabilidad.compra.coste_real.request'],
  ['contabilidad.compra_cotejada'],
  'La compra VERIFICADA antes de asentar: cotejo pedido <-> recepcion <-> factura (N5) y ajuste del coste real por rappels/anticipos (N7).',
  [['_cotejar', 'cotejar(pedido, recepcion, factura) -> Cuadra | Descuadre -> cola (N5). Si el negocio no coteja (declarable), se asienta directo y SE DECLARA'],
   ['_ajustarCosteReal', 'ajustarCosteReal(factura) -> Importe a lo realmente pagado (N7); el ajuste SUMA']],
  'NO REUTILIZA: no existe cotejo compra/recepcion/factura en el inventario.'));
hojas.push(K('emision-factura-venta', 'custodio', V.entrada, ['O1', 'O2'], ['maestro-terceros', 'catalogo-cuentas', 'escritor-diario'],
  ['contabilidad.factura.emitir.request', 'contabilidad.factura.rectificar.request', 'contabilidad.factura.series.request', 'project.activated'],
  ['contabilidad.factura_emitida', 'contabilidad.factura_rectificada'],
  'Cara EMITIDA con serie/numeracion fiscal: numeracion correlativa SIN SALTOS. Un solo escritor (numero duplicado = corrupcion).',
  [['_emitir', 'emitir(factura) -> FacturaEmitida — asigna numero correlativo; ticket o factura completa segun el TIPO (dato del hecho)'],
   ['_series', 'series() -> List<IdSerie> (por negocio/canal/unica — declarable)'],
   ['_rectificarSustitutiva', 'rectificarSustitutiva(serie, rectificativa) -> OK | ERROR (O2)'],
   ['_calcularAjuste', 'calcularAjuste(original, motivo) -> Importe — abono/devolucion/descuento; NO borra (O2)']],
  'NO REUTILIZA: no existe emision de factura con serie fiscal en el inventario (fiscal en Enki = 0 modulos). `prisma/ticket` formatea texto, no emite documento fiscal (patron de formato tomado).'));
hojas.push(K('declaracion-fuente-faltante', 'puente', V.entrada, ['A15'], ['completitud-cobertura', 'motor-avisos'],
  ['contabilidad.cobertura_calculada'],
  ['contabilidad.fuente_faltante_declarada', 'contabilidad.aviso.solicitar.request', 'contabilidad.fuente_faltante.failed'],
  'Si una vertical NO publica un hecho que se necesita, se DECLARA el hueco (abierto + aviso). NUNCA se obliga a la fuente a producirlo.',
  [['_detectarHueco', 'detectarHueco(cobertura) -> Hueco (reflejo interno)'],
   ['_declarar', 'declarar(hueco) -> aviso (K2) + marca [ABIERTO]']],
  'NO REUTILIZA: la asimetria con la vertical subordinada es propia de esta vertical (fuente: prisma de interlocutor `verticales`).'));
hojas.push(K('aviso-revision', 'puente', V.entrada, ['A8.2'], ['cola-revision', 'motor-avisos'],
  ['contabilidad.excepcion_encolada'],
  ['contabilidad.aviso.solicitar.request', 'contabilidad.aviso_revision_solicitado', 'contabilidad.aviso.solicitar.failed'],
  'Empujon al motor de avisos: "esto necesita revision". Conecta por senal; no resuelve ni decide nada.',
  [['_avisar', 'avisar(excepcion) -> senal a motor-avisos (K2) con el motivo y la cola de destino']],
  'NO REUTILIZA: el aviso de revision nace de la cola de ESTA vertical; K2 (motor-avisos) solo lo produce/entrega.'));

/* ===== OLEADA 2 · contabilidad-libro (22) ===== */
hojas.push(K('catalogo-cuentas', 'custodio', V.libro, ['B1', 'B6'], ['cola-declaraciones-criterio'],
  ['contabilidad.cuenta.declarar.request', 'contabilidad.cuenta.resolver.request', 'contabilidad.plan.importar.request', 'contabilidad.plan.exportar.request', 'project.activated'],
  ['contabilidad.cuenta_declarada', 'contabilidad.plan_importado', 'contabilidad.plan_exportado'],
  'Plan contable DECLARABLE/IMPORTABLE (lo aporta el negocio o el asesor) + frontera unica de codificacion (B6). Un solo escritor.',
  [['_declarar', 'declarar(rol, cuenta) — un solo escritor'],
   ['_resolver', 'resolver(codigo) -> Cuenta | NO_EXISTE'],
   ['_importar', 'importar(origen) -> List<Cuenta> (B6, unico cruce de formatos del plan)'],
   ['_exportar', 'exportar(catalogo) -> DocumentoPlan (B6)']],
  'NO REUTILIZA: no existe plan contable en el inventario; el formato declarable del asesor es DATO (K9).'));
hojas.push(K('escritor-diario', 'custodio', V.libro, ['B2'], ['catalogo-cuentas', 'clave-natural', 'single-writer'],
  ['contabilidad.asiento.asentar.request', 'contabilidad.asiento.apertura.request', 'contabilidad.asiento.cierre.request', 'contabilidad.asiento.ajustar.request', 'contabilidad.contrapartida_propuesta', 'project.activated'],
  ['contabilidad.asiento_asentado', 'contabilidad.asiento_rechazado'],
  'EL custodio del libro: single-writer por parcela, verifica partida doble ANTES de aceptar y rechaza duplicados por clave natural. Aqui entrega el cuello.',
  [['_asentar', 'asentar(rol, asiento) -> ok | ERROR_DESCUADRE | ERROR_DUPLICADO (suma debe = suma haber)'],
   ['_registrarApertura', 'registrarApertura(apertura) -> ok'],
   ['_registrarCierre', 'registrarCierre(cierre) -> ok'],
   ['_componerDesdeContrapartida', 'compone los apuntes desde el hecho + la contrapartida recibida (proyeccion interna; no hay orquestador)']],
  'NO REUTILIZA: no existe diario de partida doble en el inventario (verificado: fiscal/contable = 0 modulos).'));
hojas.push(K('mayor-balanza', 'reflejo', V.libro, ['B3'], ['escritor-diario'],
  ['contabilidad.mayor.saldo.request', 'contabilidad.mayor.balanza.request', 'contabilidad.mayor.movimientos.request'],
  ['contabilidad.balanza_calculada'],
  'Saldos por cuenta DERIVADOS del diario (nunca almacen paralelo). Determinista; un test lo afirma.',
  [['_saldoPorCuenta', 'saldoPorCuenta(periodo) -> Map<IdCuenta, Importe>'],
   ['_balanza', 'balanza(periodo) -> Balanza (sumas y saldos)'],
   ['_movimientosDe', 'movimientosDe(cuenta, periodo) -> List<Apunte>']],
  'NO REUTILIZA: derivacion del diario propia; ningun modulo del inventario lleva mayor/balanza.'));
hojas.push(K('traza-asiento', 'custodio', V.libro, ['B4'], ['escritor-diario'],
  ['contabilidad.traza.anotar.request', 'contabilidad.traza.consultar.request', 'contabilidad.asiento_asentado', 'project.activated'],
  ['contabilidad.traza_anotada'],
  'Registro INMUTABLE (append-only) de quien y cuando creo cada asiento. Solo crece; nunca se reescribe ni se borra.',
  [['_anotar', 'anotar(quien, cuando, que) — escritor unico: el ESCRITOR_DIARIO'],
   ['_consultar', 'consultar(claveNatural) -> EntradaTraza']],
  'NO REUTILIZA: la traza del asiento es requisito de auditoria y de Verifactu; no existe en el inventario.'));
hojas.push(K('asiento-ajuste', 'puente', V.libro, ['B5'], ['escritor-diario', 'traza-asiento'],
  ['contabilidad.ajuste.recibir.request'],
  ['contabilidad.asiento.ajustar.request', 'contabilidad.ajuste_recibido', 'contabilidad.ajuste.recibir.failed'],
  'Plano 1 de correccion: por donde la correccion del asesor ENTRA al libro SIN BORRAR (suma). Traza intacta.',
  [['_recibir', 'recibir(correccion: Asiento) -> senal al diario (B2)'],
   ['_verificarNoBorrado', 'verificarNoBorrado() -> ok — el original sigue en la traza']],
  'NO REUTILIZA: la correccion que suma sobre el libro es propia del dominio contable.'));
hojas.push(K('estados-contables', 'reflejo', V.libro, ['C1', 'C2'], ['mayor-balanza', 'inmovilizado', 'valoracion-existencia'],
  ['contabilidad.estado.balance.request', 'contabilidad.estado.resultado.request'],
  ['contabilidad.balance_calculado', 'contabilidad.resultado_calculado'],
  'Balance de situacion (C1) y cuenta de resultados (C2) DERIVADOS del mayor + valoraciones. No se "arregla" un resultado: se explica con su base y su cobertura.',
  [['_componerBalance', 'componerBalance(periodo) -> Balance {activo, pasivo, patrimonio} (C1)'],
   ['_cuadrar', 'cuadrar() -> ok | ERROR_ACTIVO_NO_CUADRA (C1)'],
   ['_componerResultado', 'componerResultado(periodo) -> Resultado {ingresos, gastos, resultado} (C2)']],
  'NO REUTILIZA: los estados contables no existen en el inventario; son la derivacion del mayor.'));
hojas.push(K('periodificacion', 'reflejo', V.libro, ['C3'], ['cola-declaraciones-criterio'],
  ['contabilidad.periodo.imputar.request'],
  ['contabilidad.periodo_imputado'],
  'Imputa cada hecho a su periodo con el CRITERIO DECLARADO y CONSERVA las dos fechas (operacion != valor). No elige ni adivina.',
  [['_imputarPeriodo', 'imputarPeriodo(hecho) -> IdPeriodo (criterio declarado, nunca cableado)'],
   ['_conservarFechas', 'conservarFechas(hecho) -> (fechaOperacion, fechaValor)']],
  'NO REUTILIZA: la periodificacion con dos fechas y criterio declarable es propia de la vertical.'));
hojas.push(K('cierre-ejercicio', 'custodio', V.libro, ['C4', 'C5'], ['escritor-diario', 'mayor-balanza', 'periodificacion', 'inmovilizado', 'cola-declaraciones-criterio'],
  ['contabilidad.cierre.cerrar.request', 'contabilidad.cierre.estado.request', 'contabilidad.hecho_admitido', 'project.activated'],
  ['contabilidad.cierre_realizado', 'contabilidad.apertura_generada'],
  'Cierra el periodo con ajustes: IRREVERSIBLE salvo ajuste posterior (B5). DOS niveles de cierre (dia del negocio · mes del asesor).',
  [['_cerrar', 'cerrar(periodo, ajustes) -> Cierre | ERROR_PERIODO_YA_CERRADO'],
   ['_esIrreversible', 'esIrreversible() -> Bool'],
   ['_nivel1', 'NIVEL 1 caja del dia: consume el hecho CIERRE_JORNADA admitido por la puerta (clave natural: proyecto+jornada)'],
   ['_nivel2', 'NIVEL 2 mes natural: ajustes, periodificacion, amortizaciones, IVA devengado/soportado, regularizacion (clave: proyecto+ejercicio+mes)'],
   ['_generarApertura', 'generarApertura(cierreAnterior) -> List<Asiento> (C5): los saldos de apertura son los de cierre, nunca inventados'],
   ['_arrastrarSaldos', 'arrastrarSaldos() -> Balance (C5)']],
  'NO REUTILIZA: el cierre de caja diario de la OPERACION no se toca: entra como hecho observado. El cierre contable con ajustes no existe en el inventario.'));
hojas.push(K('aviso-cuadre', 'puente', V.libro, ['C6'], ['completitud-cobertura', 'motor-avisos'],
  ['contabilidad.cobertura_calculada', 'contabilidad.cierre_realizado'],
  ['contabilidad.cuadre_evaluado', 'contabilidad.aviso.solicitar.request', 'contabilidad.cuadre.failed'],
  'NO FINGE el cuadre: si falta cobertura, AVISA. VISTA de la metrica unica (A12), no una segunda metrica.',
  [['_evaluar', 'evaluar(cierre) -> Cuadra | FaltaCobertura (lee la metrica unica, no recalcula)']],
  'NO REUTILIZA: el aviso de cuadre bebe de la metrica de cobertura de ESTA vertical.'));
hojas.push(K('puerto-extracto', 'conversor', V.libro, ['E2'], ['credential-manager'],
  ['contabilidad.extracto.leer.request', 'contabilidad.extracto.registrar_forma.request'],
  ['contabilidad.extracto_leido'],
  'Frontera del canal/formato del extracto bancario: un adaptador por fuente, puesto en el sitio. Si falta una fuente -> SE CREA.',
  [['_leer', 'leer(canal) -> List<MovimientoBancario>'],
   ['_registrarAdaptador', 'registrarAdaptador(canal) -> ok — catalogo declarable; credenciales via credential-manager']],
  'NO REUTILIZA: ningun modulo del inventario lee extractos bancarios (conciliacion = 0 modulos).'));
hojas.push(K('conciliacion-bancaria', 'reflejo', V.libro, ['E1', 'E3', 'E9', 'E10'], ['mayor-balanza', 'puerto-extracto', 'regla-movimiento-bancario', 'maestro-cuentas-bancarias'],
  ['contabilidad.conciliacion.cruzar.request', 'contabilidad.conciliacion.informe.request'],
  ['contabilidad.conciliacion_realizada', 'contabilidad.movimiento_sin_cruzar'],
  'El CRUCE extracto <-> libro por clave natural y reglas es DETERMINISTA; el juicio vive en sus satelites E7 (fuzzy) y E8 (custodio).',
  [['_cruzar', 'cruzar(extracto, libro) -> List<Conciliacion> (E1)'],
   ['_sinCruzar', 'sinCruzar(extracto, libro) -> List<MovimientoBancario> -> E7'],
   ['_cuadrarMovimiento', 'cuadrarMovimiento(movimiento, cobroOPago) -> Ok | Descuadre (E3, clave natural compartida)'],
   ['_explicarDesfase', 'explicarDesfase() -> List<PartidaEnTransito> (E9: cheque no cobrado, cobro no apuntado)'],
   ['_componerInforme', 'componerInforme() -> DocumentoCuadre (E10: saldo banco <-> saldo contable ajustado)']],
  'NO REUTILIZA: la conciliacion bancaria no existe en el inventario; el cruce deterministico es propio.'));
hojas.push(K('partida-no-identificada', 'micro-agente', V.libro, ['E7'], ['conciliacion-bancaria', 'regla-movimiento-bancario', 'cola-revision'],
  ['contabilidad.movimiento_sin_cruzar'],
  ['contabilidad.partida_clasificada', 'contabilidad.excepcion.encolar.request'],
  'El movimiento SIN contrapartida llega con descripcion ambigua -> INTERPRETAR. Una vez existe la regla (E8) pasa a automatico; lo no reconocible va a cola. NO se ignora.',
  [['_reconocer', 'reconocer(movimiento) -> Clasificacion | SIN_REGLA — FUZZY (comision/interes/devolucion)'],
   ['_proponerContrapartida', 'proponerContrapartida(movimiento) -> Contrapartida']],
  'NO REUTILIZA: la interpretacion de partidas bancarias es propia; no existe en el inventario.'));
hojas.push(K('regla-movimiento-bancario', 'custodio', V.libro, ['E8'], [],
  ['contabilidad.regla_movimiento.leer.request', 'contabilidad.regla_movimiento.declarar.request', 'contabilidad.regla_movimiento.aprender.request', 'contabilidad.regla_ratificada', 'project.activated'],
  ['contabilidad.regla_movimiento_declarada', 'contabilidad.regla_movimiento_aprendida'],
  'Repositorio de reglas "esta comision -> esta cuenta", declaradas o aprendidas. Comparte la PUERTA UNICA de ratificacion (L10).',
  [['_declarar', 'declarar(rol, regla) — un solo escritor (DUENO/ASESOR)'],
   ['_aplicar', 'aplicar(movimiento) -> Contrapartida | SIN_COBERTURA'],
   ['_aprender', 'aprender(rol, regla, evidencia) — hidratada por E7/desatasco; RATIFICADA por L10']],
  'NO REUTILIZA: no existe regla de clasificacion bancaria en el inventario.'));
hojas.push(K('saldo-tesoreria', 'reflejo', V.libro, ['E4', 'E5'], ['maestro-cuentas-bancarias', 'conciliacion-bancaria', 'cuenta-terceros', 'cola-declaraciones-criterio'],
  ['contabilidad.tesoreria.saldo.request', 'contabilidad.tesoreria.prevision.request'],
  ['contabilidad.saldo_tesoreria_calculado', 'contabilidad.caja_proyectada'],
  'Posicion REAL de dinero por cuenta (E4) + prevision de caja desde los compromisos con la POLITICA DECLARADA (E5). Los umbrales los declara el dueno.',
  [['_saldoPorCuenta', 'saldoPorCuenta(idCuentaBancaria) -> Importe (E4)'],
   ['_posicionReal', 'posicionReal() -> Map<IdCuentaBancaria, Importe> (E4: la real, no la contable)'],
   ['_proyectar', 'proyectar(desde, hasta) -> CajaProyectada (E5)'],
   ['_alertarUmbral', 'alertarUmbral(prevision, umbral) -> senal (K2); umbral declarable (Q24)']],
  'NO REUTILIZA: la posicion real de tesoreria y la prevision de caja no existen en el inventario.'));
hojas.push(K('maestro-cuentas-bancarias', 'custodio', V.libro, ['E11'], [],
  ['contabilidad.cuenta_bancaria.declarar.request', 'contabilidad.cuenta_bancaria.listar.request', 'project.activated'],
  ['contabilidad.cuenta_bancaria_declarada'],
  'Catalogo DECLARABLE de cuentas y su MONEDA. Sin el, "el banco" es un solo numero falso. Multi-moneda: parametro declarable.',
  [['_declarar', 'declarar(rol, cuenta, moneda) — un solo escritor (DUENO)'],
   ['_cuentas', 'cuentas() -> List<CuentaBancaria>']],
  'NO REUTILIZA: no existe maestro de cuentas bancarias; ningun modulo del inventario toca banca.'));
hojas.push(K('vista-revisable', 'reflejo', V.libro, ['L2', 'L8'], ['mayor-balanza', 'traza-asiento', 'expediente-documental'],
  ['contabilidad.asiento.explicar.request', 'contabilidad.muestra.seleccionar.request'],
  ['contabilidad.vista_explicada', 'contabilidad.muestra_seleccionada'],
  'TODO asiento/calculo EXPLICADO (cifra, base, origen, estado) + seleccion por excepcion y MUESTRA (no revisar todo). No caja negra.',
  [['_explicar', 'explicar(asientoOCalculo) -> Vista {cifra, base, origen, estado} (L2, composicion determinista de la traza)'],
   ['_seleccionarMuestra', 'seleccionarMuestra(conjuntoAsientos) -> Muestra por senales DURAS DECLARADAS: alto importe, sin regla, contrapartida nueva, cuadre dudoso (L8)']],
  'NO REUTILIZA: la explicabilidad de cada cifra es requisito de la medida maestra (que el asesor la acepte).'));
hojas.push(K('flujo-firma', 'custodio', V.libro, ['L3', 'L9'], ['asiento-ajuste', 'regla-contrapartida', 'regla-movimiento-bancario', 'facturacion/asesoria'],
  ['contabilidad.firma.marcar.request', 'contabilidad.firma.delta.request', 'project.activated'],
  ['contabilidad.firma_registrada', 'contabilidad.delta_revision_calculado'],
  'Marca de revisado/firmado POR EL ASESOR: el sistema NO firma, solo registra. El delta da al asesor solo lo que cambio desde su ultimo visto bueno.',
  [['_marcarRevisado', 'marcarRevisado(rol, alcance) -> ok (un solo escritor: el ASESOR)'],
   ['_firmar', 'firmar(rol, alcance) -> MarcaFirma (L3); el nivel (periodo/estado/documento) es declarable'],
   ['_calcularDelta', 'calcularDelta(desdeUltimaFirma) -> Delta {asientosNuevos, ajustes, reglasCambiadas} (L9)']],
  'NO REUTILIZA: no existe flujo de firma del asesor en el inventario.'));
hojas.push(K('expediente-documental', 'custodio', V.libro, ['L7'], ['filesystem'],
  ['contabilidad.expediente.archivar.request', 'contabilidad.expediente.recuperar.request', 'project.activated'],
  ['contabilidad.cifra_archivada'],
  'Cada cifra con el documento origen ARCHIVADO y ENLAZADO: LA PRUEBA que sostiene la firma ante una inspeccion. L2 explica; el expediente CONSERVA.',
  [['_archivar', 'archivar(cifra, documentoOrigen) -> ok (single-writer; archivo via filesystem)'],
   ['_recuperar', 'recuperar(cifra) -> IdDocumento'],
   ['_verificarEnlace', 'verificarEnlace() -> ok | ERROR_CIFRA_SIN_PRUEBA']],
  'NO REUTILIZA: el enlace cifra<->documento de origen es propio de la vertical; `filesystem` es el almacen, no el expediente.'));
hojas.push(K('ratificacion-regla-aprendida', 'puente', V.libro, ['L10'], ['regla-contrapartida', 'regla-movimiento-bancario'],
  ['contabilidad.regla_aprendida'],
  ['contabilidad.regla.ratificar.request', 'contabilidad.regla_ratificada', 'contabilidad.regla.ratificar.failed'],
  'PUERTA UNICA de ratificacion: el asesor ratifica o BLOQUEA la regla aprendida ANTES de que actue sobre el volumen. Vencida sin respuesta -> NO actua.',
  [['_solicitarRatificacion', 'solicitarRatificacion(regla) -> SolicitudDecision (el sistema NO resuelve)'],
   ['_aplicarRatificacion', 'aplicarRatificacion(regla, decision) -> ok | bloqueada']],
  'NO REUTILIZA: cubre DOS repositorios (A6.2 contrapartida + E8 movimiento bancario) con UNA sola puerta; no existe en el inventario.'));

/* ===== OLEADA 3 · contabilidad-fiscal (13) ===== */
hojas.push(K('perfil-administrativo', 'custodio', V.fiscal, ['D15'], ['cola-declaraciones-criterio'],
  ['contabilidad.perfil.declarar.request', 'contabilidad.perfil.aplicables.request', 'project.activated'],
  ['contabilidad.perfil_declarado'],
  'Que administraciones y obligaciones aplican al negocio (territorio + regimen). Cuatro territorios posibles; el sistema no asume uno.',
  [['_declarar', 'declarar(rol, sociedad, perfil) — un solo escritor (DUENO/ASESOR)'],
   ['_aplicables', 'aplicables(sociedad) -> Set<IdObligacion>']],
  'NO REUTILIZA: no existe perfil fiscal por sociedad en el inventario (fiscal = 0 modulos).'));
hojas.push(K('calendario-fiscal', 'custodio', V.fiscal, ['D6'], ['perfil-administrativo', 'motor-avisos'],
  ['contabilidad.calendario.declarar.request', 'contabilidad.calendario.proximos.request', 'project.activated'],
  ['contabilidad.plazo_declarado', 'contabilidad.plazo_proximo'],
  'Plazos DECLARABLES por ejercicio (cambian: prorrogas, festivos, domiciliacion). Dispara aviso proactivo; nunca fija una fecha de memoria.',
  [['_declarar', 'declarar(rol, ejercicio, plazos) — un solo escritor (ASESOR/DUENO)'],
   ['_proximos', 'proximos(hoy) -> List<Plazo>'],
   ['_dispararAviso', 'dispararAviso(plazo) -> senal a K2']],
  'NO REUTILIZA: el calendario fiscal con plazos declarables no existe en el inventario.'));
hojas.push(K('liquidacion-iva', 'reflejo', V.fiscal, ['D1', 'D2', 'D3'], ['mayor-balanza', 'perfil-administrativo', 'cola-declaraciones-criterio'],
  ['contabilidad.iva.liquidar.request', 'contabilidad.modelo.303.request', 'contabilidad.modelo.390.request'],
  ['contabilidad.iva_liquidado', 'contabilidad.modelo_construido'],
  'Impuesto indirecto DERIVADO del libro con los tipos DECLARADOS (IVA/IGIC/IPSI segun territorio) + sus modelos 303 y 390. Ningun tipo cableado.',
  [['_devengado', 'devengado(periodo) -> Importe (D1)'],
   ['_soportado', 'soportado(periodo) -> Importe (D1)'],
   ['_liquidar', 'liquidar(periodo) -> Liquidacion {devengado, deducible, resultado} (D1)'],
   ['_construir303', 'construir303(periodo) -> Modelo (D2)'],
   ['_resumir390', 'resumir390(ejercicio) -> Modelo (D3)']],
  'NO REUTILIZA: IVA/modelos no existen en el inventario (verificado: 0 modulos). La ley entra como DATO declarable.'));
hojas.push(K('retenciones-is-irpf', 'reflejo', V.fiscal, ['D4', 'D5'], ['mayor-balanza', 'estados-contables', 'perfil-administrativo', 'cola-declaraciones-criterio'],
  ['contabilidad.retenciones.calcular.request', 'contabilidad.estimacion.calcular.request'],
  ['contabilidad.retenciones_calculadas', 'contabilidad.cuota_estimada'],
  'Retenciones practicadas/soportadas (D4) y estimacion IS/IRPF con base declarada (D5). El sujeto fiscal es parametro POR SOCIEDAD.',
  [['_practicadas', 'practicadas(periodo) -> Importe (D4: profesionales, alquileres, trabajo — todos parametros)'],
   ['_soportadas', 'soportadas(periodo) -> Importe (D4)'],
   ['_estimar', 'estimar(periodo) -> CuotaEstimada (D5: IS sociedad | IRPF persona fisica, declarable)']],
  'NO REUTILIZA: IRPF/IS y retenciones no existen en el inventario.'));
hojas.push(K('estado-presentacion-fiscal', 'custodio', V.fiscal, ['D12'], ['perfil-administrativo', 'calendario-fiscal'],
  ['contabilidad.obligacion.avanzar.request', 'contabilidad.obligacion.estado.request', 'project.activated'],
  ['contabilidad.obligacion_avanzada'],
  'Ciclo de vida de cada obligacion (pendiente -> generada -> presentada -> justificada -> atrasada): sin el, el calendario avisa pero nadie sabe en que punto esta.',
  [['_avanzar', 'avanzar(obligacion, estado) — escritor SISTEMA+ASESOR'],
   ['_estadoDe', 'estadoDe(obligacion) -> EstadoObligacion']],
  'NO REUTILIZA: no existe estado de obligacion fiscal en el inventario.'));
hojas.push(K('generador-modelo', 'puente', V.fiscal, ['D7'], ['liquidacion-iva', 'retenciones-is-irpf', 'estado-presentacion-fiscal', 'filesystem'],
  ['contabilidad.modelo.generar.request'],
  ['contabilidad.modelo_generado', 'contabilidad.modelo_entregado', 'contabilidad.modelo.generar.failed'],
  'Salida al programa del asesor por PUERTO (formato abierto y declarable). Si el sistema solo PREPARA, aqui termina su responsabilidad.',
  [['_generar', 'generar(modelo) -> DocumentoModelo'],
   ['_entregar', 'entregar(documento) -> ok | NO_DECLARADO (presentar es declarable; D34)']],
  'NO REUTILIZA: la generacion de modelos fiscales con puerto abierto no existe; hay que construirlo.'));
hojas.push(K('registro-verifactu', 'custodio', V.fiscal, ['D8'], ['emision-factura-venta'],
  ['contabilidad.registro.anotar.request', 'contabilidad.registro.verificar.request', 'contabilidad.factura_emitida', 'project.activated'],
  ['contabilidad.registro_verifactu_anotado'],
  'Registro INTERNO Y NO ALTERABLE de la facturacion: huella + encadenamiento. Solo crece. Distinto de la emision (O1) y del formato (D9).',
  [['_encadenar', 'encadenar(factura) -> Huella'],
   ['_anotar', 'anotar(factura, huella) — append-only'],
   ['_verificarCadena', 'verificarCadena() -> ok | ERROR_CADENA_ROTA']],
  'NO REUTILIZA: Verifactu no existe en el inventario (0 modulos); es requisito legal de la factura emitida.'));
hojas.push(K('factura-electronica', 'conversor', V.fiscal, ['D9'], ['emision-factura-venta'],
  ['contabilidad.factura.estructurar.request', 'contabilidad.factura.interpretar.request'],
  ['contabilidad.factura_estructurada', 'contabilidad.factura_interpretada'],
  'Frontera del FORMATO ESTRUCTURADO de la factura (emitir y recibir). Un solo cruce; un documento estructurado entra SIN extraccion (no pasa por A4.1).',
  [['_emitirEstructurada', 'emitirEstructurada(factura) -> DocumentoEstructurado'],
   ['_interpretarEstructurado', 'interpretarEstructurado(documento) -> Factura']],
  'NO REUTILIZA: la factura electronica estructurada no existe en el inventario; el formato concreto es declarable.'));
hojas.push(K('acuse-presentacion', 'puente', V.fiscal, ['D13'], ['estado-presentacion-fiscal', 'generador-modelo', 'escritor-diario'],
  ['contabilidad.acuse.recibir.request'],
  ['contabilidad.acuse_ligado', 'contabilidad.acuse.recibir.failed'],
  'Recoge y LIGA el justificante/acuse de la administracion a su modelo y a su asiento: cierra el bucle hacia fuera. Sin acuse -> obligacion no justificada -> aviso.',
  [['_recibir', 'recibir(justificante) -> ok (canal declarable; credenciales via credential-manager)'],
   ['_ligar', 'ligar(acuse, modelo, asiento) -> ok']],
  'NO REUTILIZA: el retorno del acuse administrativo no existe en el inventario.'));
hojas.push(K('rectificacion-declaracion', 'custodio', V.fiscal, ['D14'], ['estado-presentacion-fiscal', 'escritor-diario'],
  ['contabilidad.declaracion.rectificar.request', 'project.activated'],
  ['contabilidad.declaracion_rectificada'],
  'Plano 4 de correccion: correccion POSTERIOR a la presentacion (complementaria/sustitutiva). NO se confunde con el ajuste contable ni con la rectificativa comercial.',
  [['_rectificar', 'rectificar(declaracionOriginal, tipo) -> Rectificacion — un solo escritor (ASESOR)'],
   ['_enlazar', 'enlazar(original, rectificacion) -> ok']],
  'NO REUTILIZA: la rectificacion fiscal posterior a la presentacion no existe en el inventario.'));
hojas.push(K('puerto-nomina', 'puente', V.fiscal, ['G4'], [],
  ['contabilidad.nomina.recibir.request'],
  ['contabilidad.nomina_recibida'],
  'Origen DECLARABLE del dato de nomina. El sistema NO calcula nomina por defecto: la RECIBE (calcular es capacidad opcional, G5 declarable).',
  [['_recibir', 'recibir(hechoNomina) -> ok'],
   ['_conectar', 'conectar(origen) -> ok | NO_DECLARADO; si no existe el origen -> se crea']],
  'NO REUTILIZA: no existe puerto de nomina en el inventario (nominas = 0 modulos).'));
hojas.push(K('recibo-nomina', 'reflejo', V.fiscal, ['G1', 'G2', 'G3', 'G6', 'G8', 'G9', 'G10'], ['puerto-nomina', 'catalogo-cuentas', 'cola-declaraciones-criterio', 'escritor-diario'],
  ['contabilidad.nomina.procesar.request', 'contabilidad.nomina.desglosar.request', 'contabilidad.nomina.liquidar.request', 'contabilidad.nomina_recibida'],
  ['contabilidad.nomina_formada', 'contabilidad.asiento.asentar.request'],
  'Del recibo al ASIENTO EQUILIBRADO y EXPLICABLE: obligacion con la Seguridad Social, desglose bruto/retencion/cotizacion/neto, anticipos, conceptos extra y liquidacion de baja.',
  [['_admitir', 'admitir(recibo) -> ReciboFormado (G1: cero juicio; si el negocio no calcula, el recibo LLEGA hecho)'],
   ['_calcularObligacion', 'calcularObligacion(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS} (G2, tipos declarables)'],
   ['_construirAsiento', 'construirAsiento(recibo) -> AsientoEquilibrado (G3)'],
   ['_desglosar', 'desglosar(recibo) -> Lineas {bruto, retencion, cotizacionTrabajador, neto} (G6)'],
   ['_aplicarAnticipo', 'aplicarAnticipo(empleado, recibo) -> NetoAjustado (G8)'],
   ['_imputarConcepto', 'imputarConcepto(concepto, recibo) -> List<Apunte> (G9: dietas, especie, pagas extra, finiquitos)'],
   ['_liquidar', 'liquidar(empleado) -> AsientoCierre + SaldoCero (G10: una cuenta de empleado sin cerrar es un error de estado)']],
  'NO REUTILIZA: no existe modulo de nomina en el inventario; el asiento de personal y su desglose son propios.'));
hojas.push(K('acceso-nomina', 'custodio', V.fiscal, ['G7'], ['aislamiento-negocio'],
  ['contabilidad.nomina.autorizar.request', 'contabilidad.nomina.puede_ver.request', 'project.activated'],
  ['contabilidad.acceso_nomina_autorizado'],
  'Aisla la nomina como DATO PERSONAL: cada uno ve la suya. Eje de aislamiento DENTRO del negocio (distinto de I4, entre negocios).',
  [['_autorizar', 'autorizar(rol, empleado, visor) — un solo escritor (DUENO)'],
   ['_puedeVer', 'puedeVer(visor, empleado) -> Bool']],
  'NO REUTILIZA: el aislamiento de la nomina como dato personal no existe en el inventario.'));

/* ===== OLEADA 4 · contabilidad-analitica (17) ===== */
hojas.push(K('inmovilizado', 'custodio', V.analitica, ['F1', 'F2', 'F3', 'F4'], ['escritor-diario', 'mayor-balanza', 'cola-declaraciones-criterio'],
  ['contabilidad.activo.alta.request', 'contabilidad.amortizacion.generar.request', 'contabilidad.activo.baja.request', 'contabilidad.activo.valor_neto.request', 'contabilidad.cierre_realizado', 'project.activated'],
  ['contabilidad.activo_dado_de_alta', 'contabilidad.amortizacion_generada', 'contabilidad.activo_dado_de_baja'],
  'El bien duradero y su amortizacion: alta declarada (no estimada), cuota que dispara EN EL CIERRE con parametros declarables, baja que calcula resultado y valor neto contable.',
  [['_registrar', 'registrar(rol, activo) -> ok (F1, un solo escritor DUENO/ASESOR)'],
   ['_valorarAlta', 'valorarAlta(activo) -> Importe (F1, reflejo hidratador)'],
   ['_generarCuota', 'generarCuota(activo, periodo) -> AsientoAmortizacion | NADA (F2; metodo/coeficiente/anios DECLARABLES, ningun coeficiente cableado)'],
   ['_dispararEnCierre', 'dispararEnCierre(cierre) -> ok (F2: la cuota se genera CUANDO TOCA)'],
   ['_calcularResultadoBaja', 'calcularResultadoBaja(activo) -> Perdida | Beneficio (F3)'],
   ['_imputar', 'imputar(resultado) -> Asiento (F3: la baja no borra la historia del bien, suma un asiento)'],
   ['_calcularValorNeto', 'calcular(activo) -> Importe coste - amortizacion acumulada (F4, al balance C1)']],
  'NO REUTILIZA: el inmovilizado y la amortizacion no existen en el inventario (0 modulos); la amortizacion es un hecho que produce el TIEMPO y aqui se genera en el cierre.'));
hojas.push(K('aislamiento-negocio', 'custodio', V.analitica, ['I4'], ['single-writer'],
  ['contabilidad.parcela_negocio.registrar.request', 'contabilidad.parcela_negocio.escribir.request', 'project.activated'],
  ['contabilidad.parcela_negocio_registrada'],
  'Multi-negocio SIN FUGA: un dueno por parcela; ningun calculo lee ni escribe la parcela de otro salvo consolidacion declarada.',
  [['_parcela', 'parcela(negocio) -> Parcela'],
   ['_escribir', 'escribir(negocio, rol, cambio) -> ok | ERROR_FUGA_ENTRE_NEGOCIOS']],
  'NO REUTILIZA: el aislamiento por parcela de negocio es la invariante 13 del dominio; la capa de proyecto (PosPersistencia) NO la sustituye.'));
hojas.push(K('cola-declaraciones-criterio', 'custodio', V.analitica, ['K9'], [],
  ['contabilidad.criterio.declarar.request', 'contabilidad.criterio.leer.request', 'contabilidad.criterio.pendientes.request', 'project.activated'],
  ['contabilidad.criterio_declarado', 'contabilidad.criterio_pendiente'],
  'UNA sola cola declarativa donde el jefe/asesor fija o ratifica TODOS los criterios (plan, periodo, plazos, amortizacion, dimensiones, tipos fiscales, consolidacion, unidad_de_cierre).',
  [['_declarar', 'declarar(rol, criterio, valor) -> ParametroDeclarable — un solo escritor (JEFE/ASESOR)'],
   ['_leer', 'leer(criterio) -> ParametroDeclarable | AUSENTE'],
   ['_pendientes', 'pendientes() -> List<IdCriterio> — las 23 piezas [ABIERTO]; lo no declarado NO se estima']],
  'NO REUTILIZA: es la PUERTA DECLARATIVA del dominio; ninguna pieza del inventario recoge criterios contables.'));
hojas.push(K('onboarding-negocio', 'custodio', V.analitica, ['K1', 'K4'], ['cola-declaraciones-criterio', 'project-manager'],
  ['contabilidad.negocio.configurar.request', 'contabilidad.negocio.estado.request', 'contabilidad.negocio.activar.request', 'project.activated'],
  ['contabilidad.negocio_configurado', 'contabilidad.vertical_activada'],
  'Recoge los datos DECLARABLES del negocio (plan, fuentes, parametros) y enciende la vertical. Sin parametros declarados el negocio queda INCOMPLETO: se declara el hueco.',
  [['_recoger', 'recoger(rol, negocio, datos) -> ok (K1, un solo escritor DUENO)'],
   ['_estado', 'estado(negocio) -> CONFIGURADO | FALTA [ABIERTO] (K1)'],
   ['_activar', 'activar(negocio) -> ok (K4: mecanico, cero juicio; sin parametros NO se activa)']],
  'NO REUTILIZA: el onboarding de un negocio contable no existe; `project-manager` gestiona el proyecto, no la configuracion contable.'));
hojas.push(K('motor-avisos', 'puente', V.analitica, ['K2'], ['cola-declaraciones-criterio'],
  ['contabilidad.aviso.solicitar.request', 'contabilidad.aviso.catalogo.declarar.request'],
  ['contabilidad.aviso_producido', 'contabilidad.aviso.enrutar.request'],
  'PRODUCE el aviso a partir de senales REALES (nunca de pantalla muda): descuadre, excepcion, IVA, vencimiento, plazo, desviacion, cierre, amortizacion, rectificacion, hueco.',
  [['_producir', 'producir(senal) -> Aviso (catalogo declarable K6)'],
   ['_enrutar', 'enrutar(aviso, destinatario) -> ok']],
  'NO REUTILIZA: no existe motor de avisos contables en el inventario; recibe senales de A8.2, C6, D6, E5, J4, A15 y R1.'));
hojas.push(K('consolidacion-grupo', 'reflejo', V.analitica, ['I1', 'I2', 'I3'], ['estados-contables', 'aislamiento-negocio', 'cola-declaraciones-criterio'],
  ['contabilidad.consolidacion.agregar.request'],
  ['contabilidad.grupo_consolidado'],
  'Estados del CONJUNTO con criterio declarado: marca de sociedad, eliminacion intercompany y agregacion. Dos niveles: por negocio (aislado) y del grupo.',
  [['_etiquetar', 'etiquetar(asiento, sociedad) -> Asiento (I1, mecanico)'],
   ['_detectarCruceInterno', 'detectarCruceInterno() -> List<Cruce> (I2)'],
   ['_eliminar', 'eliminar(cruces) -> List<Eliminacion> (I2)'],
   ['_agregar', 'agregar(sociedades) -> EstadosConsolidados (I3, criterio declarado)']],
  'NO REUTILIZA: la consolidacion multi-sociedad no existe en el inventario (grupo = 0 modulos).'));
hojas.push(K('frontera-ficha-producto', 'conversor', V.analitica, ['H2'], [],
  ['contabilidad.ficha.coste.request'],
  ['contabilidad.coste_leido'],
  'Puerto DECLARABLE del coste de cada negocio: por donde cruza el coste de la ficha al dato interno. Si falta -> se crea. Nunca se inventa un coste.',
  [['_leerCoste', 'leerCoste(producto) -> Coste | AUSENTE'],
   ['_crearFrontera', 'crearFrontera(negocio) -> ok (invariante de puerto abierto)']],
  'NO REUTILIZA: la frontera de coste (ficha/receta/otro) es declarable por negocio; `pizzepos/escandallo` es mono-negocio y se pone POR ENCIMA, no se toca.'));
hojas.push(K('valoracion-existencia', 'reflejo', V.analitica, ['H1', 'H3', 'H4'], ['frontera-ficha-producto', 'inventario', 'cola-declaraciones-criterio'],
  ['contabilidad.existencia.valorar.request', 'contabilidad.inventario.ajuste.request'],
  ['contabilidad.existencia_valorada', 'contabilidad.ajuste_inventario_calculado'],
  'Capa de VALOR sobre el stock existente (no duplica el inventario): metodo declarable (FIFO/PMP; LIFO no), ajuste de merma y variacion valorada.',
  [['_valorar', 'valorar(producto, cantidad, fecha) -> Importe (H1, metodo parametro declarable)'],
   ['_capaDeValor', 'capaDeValor(inventarioExistente) -> Valoracion (H1: NO duplica el inventario)'],
   ['_calcularDiferencia', 'calcularDiferencia() -> Importe (H3: merma/rotura)'],
   ['_regularizar', 'regularizar(diferencia) -> Asiento + aviso (H3: el asiento SUMA)'],
   ['_valorarEntrada', 'valorarEntrada(compra) -> Importe (H4)'],
   ['_valorarSalida', 'valorarSalida(consumo) -> Importe (H4: el hecho de stock lo emite la fuente; contabilidad lo VALORA)']],
  'NO REUTILIZA: `inventario` custodia el stock real; la VALORACION contable (capa de valor, merma, coste del consumo) no existe en el inventario.'));
hojas.push(K('etiquetado-analitico', 'micro-agente', V.analitica, ['J1'], ['cola-declaraciones-criterio', 'cola-revision'],
  ['contabilidad.etiqueta.aplicar.request'],
  ['contabilidad.etiqueta_aplicada', 'contabilidad.excepcion.encolar.request'],
  'Asigna centro/linea/producto con REGLA declarable; cuando la regla no cubre, clasificar es JUICIO -> lo dudoso va a cola.',
  [['_etiquetar', 'etiquetar(hecho) -> Etiqueta {centro, linea, producto} | SIN_REGLA (caso cubierto por regla = reflejo)'],
   ['_proponerEtiqueta', 'proponerEtiqueta(hecho) -> Etiqueta — FUZZY']],
  'NO REUTILIZA: el etiquetado analitico por dimensiones declaradas no existe en el inventario.'));
hojas.push(K('margen-analitico', 'reflejo', V.analitica, ['J2', 'J5', 'J10'], ['mayor-balanza', 'valoracion-existencia', 'etiquetado-analitico', 'cola-declaraciones-criterio'],
  ['contabilidad.margen.calcular.request', 'contabilidad.indirecto.repartir.request', 'contabilidad.tablero.cruzar.request'],
  ['contabilidad.margen_calculado', 'contabilidad.indirecto_repartido', 'contabilidad.tablero_calculado'],
  'Margen por dimension (ingreso - coste imputado), reparto DECLARADO de gastos no directos y cruce margen x dimension bajo lente de conjunto.',
  [['_calcular', 'calcular(dimension) -> Margen (J2: enlaza existencias con analitica)'],
   ['_repartir', 'repartir(gasto, criterio) -> Map<IdDimension, Importe> (J5: criterio declarado)'],
   ['_cruzar', 'cruzar(margen, dimension) -> Tablero (J10: por centro, familia o sociedad)']],
  'NO REUTILIZA: el coste indirecto multi-sociedad y por periodos NO lo cubre la pieza existente (escandallo, mono-negocio).'));
hojas.push(K('presupuesto', 'custodio', V.analitica, ['J3', 'J4', 'J9'], ['estados-contables', 'motor-avisos'],
  ['contabilidad.presupuesto.declarar.request', 'contabilidad.desviacion.calcular.request', 'contabilidad.periodos.comparar.request', 'project.activated'],
  ['contabilidad.presupuesto_declarado', 'contabilidad.desviacion_calculada', 'contabilidad.comparacion_calculada'],
  'Cifra OBJETIVO por dimension (un solo escritor: el jefe) + desviacion real-vs-presupuesto con umbral declarado + comparador de periodos que REUTILIZA ambos, no los duplica.',
  [['_declarar', 'declarar(rol, dimension, cifra) — un solo escritor (JEFE) (J3)'],
   ['_objetivo', 'objetivo(dimension, periodo) -> CifraObjetivo (J3)'],
   ['_calcular', 'calcular(real, presupuesto) -> Desviacion (J4)'],
   ['_dispararSiExcede', 'dispararSiExcede(desviacion) -> senal a K2 con el umbral declarado (J4)'],
   ['_comparar', 'comparar(a, b) -> Delta (J9: ejercicio vs ejercicio, mes vs mes, real vs presupuesto)']],
  'NO REUTILIZA: `marketing-budget` es presupuesto de marketing y declara "custodia contable" solo de nombre: contabilidad lo LEE, no lo absorbe (solape registrado).'));
hojas.push(K('cuadro-mando-contable', 'reflejo', V.analitica, ['J8'], ['saldo-tesoreria', 'estados-contables', 'margen-analitico', 'presupuesto', 'cierre-ejercicio'],
  ['contabilidad.cuadro_mando.agregar.request'],
  ['contabilidad.cuadro_mando_calculado'],
  'Agregacion de CONJUNTO para el jefe (caja, resultado, margen, desviacion, ejercicio) SIN bajar al asiento.',
  [['_agregar', 'agregar(lente: CONJUNTO) -> CuadroMando']],
  'NO REUTILIZA: no existe cuadro de mando contable; reutiliza J2/J3/J4/E4/E5/C1/C2 por RPC sin duplicarlos.'));
hojas.push(K('informe-rico', 'reflejo', V.analitica, ['K3'], ['estados-contables', 'cierre-ejercicio', 'completitud-cobertura'],
  ['contabilidad.informe.componer.request'],
  ['contabilidad.informe_compuesto'],
  'Nucleo de informe rico: cifra ya calculada + contexto declarado (periodo, origen, comparativas, cobertura). No un numero pelado.',
  [['_componer', 'componer(cifra, contexto) -> InformeRico — mecanico']],
  'NO REUTILIZA: el nucleo de informe rico se sirve en idiomas distintos (dueno Q2 / cliente R3); no existe en el inventario.'));
hojas.push(K('consulta-dueno', 'puente', V.analitica, ['Q1', 'Q3', 'Q4'], ['completitud-cobertura', 'traza-asiento', 'flujo-firma', 'informe-rico'],
  ['contabilidad.consulta.responder.request'],
  ['contabilidad.consulta_respondida'],
  'Puerta PULL: el dueno pregunta cuando quiere y el sistema contesta, con SELLO DE COBERTURA y MARCA de borrador/revisado/firmado (sin cadencia impuesta).',
  [['_responder', 'responder(pregunta) -> ResultadoCalculo (Q1: puerta declarable; el canal es puerto)'],
   ['_sinCadencia', 'sinCadencia() -> Bool (Q1: != cuadro del jefe J8, que impone cadencia)'],
   ['_sellarCobertura', 'sellarCobertura(resultadoCalculo) -> con sello (Q3: vista de la metrica unica A12, fuera de ciclo)'],
   ['_derivarEstado', 'derivarEstado(periodo) -> EN_CURSO | REVISADO | FIRMADO (Q4: deriva de B4 + L3)']],
  'NO REUTILIZA: la cara pull del dueno sobre la contabilidad no existe en el inventario.'));
hojas.push(K('puente-lenguaje-dueno', 'micro-agente', V.analitica, ['Q2'], ['informe-rico', 'consulta-dueno'],
  ['contabilidad.dueno.preguntar.request', 'contabilidad.dueno.cifra.presentar.request'],
  ['contabilidad.consulta.responder.request', 'contabilidad.cifra_presentada'],
  'Traductor BIDIRECCIONAL: su pregunta -> consulta contable; calculo -> cifra en su idioma (caja, deuda, resultado, "puedo pagar X?").',
  [['_traducirPregunta', 'traducirPregunta(preguntaNatural) -> ConsultaContable — FUZZY'],
   ['_traducirCifra', 'traducirCifra(resultado) -> CifraEnSuIdioma — FUZZY; vocabulario declarable']],
  'NO REUTILIZA: el puente de lenguaje del dueno no existe; comparte el nucleo de informe (K3) con R3, no el traductor.'));
hojas.push(K('aviso-al-negocio', 'puente', V.analitica, ['R1'], ['motor-avisos'],
  ['contabilidad.aviso.enrutar.request'],
  ['contabilidad.aviso_entregado', 'contabilidad.aviso_confirmado'],
  'Cara de ENTREGA del aviso al negocio cliente: sin confirmacion de entrega el aviso NO consta como recibido. El canal es un puerto.',
  [['_entregar', 'entregar(aviso) -> ok (canal declarable: K7)'],
   ['_confirmar', 'confirmar(entrega) -> Confirmacion (honestidad: nadie da por entregado sin confirmacion)']],
  'NO REUTILIZA: completa K2 (que solo PRODUCE); la entrega al negocio contable no existe en el inventario.'));
hojas.push(K('informe-accionable', 'micro-agente', V.analitica, ['R2', 'R3'], ['informe-rico', 'estados-contables', 'aviso-al-negocio'],
  ['contabilidad.informe.accionable.request', 'contabilidad.estados.narrar.request'],
  ['contabilidad.informe_accionable', 'contabilidad.estados_narrados'],
  'Todo informe que recibe el cliente lleva QUE HACER con el (R2) y los estados van narrados a su lenguaje (R3).',
  [['_recomendar', 'recomendar(informe) -> InformeAccionable — FUZZY'],
   ['_narrar', 'narrar(estados) -> Narracion "esto es lo que te ha pasado y lo que viene" — FUZZY']],
  'NO REUTILIZA: la recomendacion accionable y la narracion de estados son juicio (fuzzy) propio de la vertical.'));

/* ---------- reglas de derivacion ---------- */
const FORMAS = ['reflejo', 'custodio', 'conversor', 'puente', 'micro-agente'];
const ACCIONES = ['CONSTRUIR', 'ADAPTAR', 'REUTILIZAR'];
const WAVE = { transversal: 0, entrada: 1, libro: 2, fiscal: 3, analitica: 4 };

function all() { return REUT.concat(hojas); }

/* Contrato publicado de cada hoja.
   - REUTILIZAR: se reproduce el contrato REAL del module.json (+ el .response de cada RPC que atiende).
     NO se fabrica nada: si su module.json no declara par de fallo, se dice asi.
   - CONSTRUIR: el diseno manda "todo flujo cierra su circulo": por CADA op que atiende
     (`.response` + `.failed`) y por CADA evento de dominio que publica (`<evento>.failed`). */
function pubOf(h) {
  const out = h.pub.slice();
  const add = t => { if (!out.includes(t)) out.push(t); };
  for (const t of h.sub) if (t.endsWith('.request')) {
    const base = t.slice(0, -'.request'.length);
    add(base + '.response');
    if (h.a === 'CONSTRUIR') add(base + '.failed');
  }
  if (h.a === 'CONSTRUIR') for (const t of h.pub) {
    if (t.includes('*') || t.endsWith('.response') || t.endsWith('.failed') || t.endsWith('.error')) continue;
    add(t.endsWith('.request') ? t.slice(0, -'.request'.length) + '.failed' : t + '.failed');
  }
  return out;
}
function isOwnTopic(h, t) { return t.startsWith('contabilidad.') || t.startsWith(h.s.split('/').pop() + '.'); }

/* ---------- orden topologico (REUTILIZAR primero, luego CONSTRUIR por oleadas) ---------- */
function topo() {
  const H = all();
  const bySlug = new Map(H.map(h => [h.s, h]));
  const pending = H.slice();
  const done = new Set();
  const out = [];
  const prio = h => (h.a === 'REUTILIZAR' ? '0' : '1') + WAVE[h.v] + String(H.indexOf(h)).padStart(3, '0');
  let guard = 0;
  while (pending.length && guard++ < 10000) {
    const ready = pending.filter(h => h.d.every(s => done.has(s)))
      .sort((x, y) => prio(x) < prio(y) ? -1 : 1);
    if (!ready.length) throw new Error('CICLO o dependencia colgante: ' + pending.map(h => h.s + '<-' + h.d.join(',')).join(' | '));
    const h = ready[0];
    out.push(h.s); done.add(h.s); pending.splice(pending.indexOf(h), 1);
  }
  return out;
}

/* ---------- tabla clase -> hoja ---------- */
function claseMap() {
  const m = {};
  for (const h of all()) for (const c of (h.c || [])) m[c] = h.s;
  return m;
}
const CODES = { entrada: ['A1','A2','A3','A4.1','A4.2','A4.3','A5','A6.1','A6.2','A7','A8.1','A8.2','A9','A11','A12','A13','A14','A15','N1','N2','N3','N4','N5','N6','N7','N8','O1','O2','P1','P2','P3','P4'],
  libro: ['B1','B2','B3','B4','B5','B6','C1','C2','C3','C4','C5','C6','E1','E2','E3','E4','E5','E7','E8','E9','E10','E11','L1','L2','L3','L7','L8','L9','L10','M1','M2','M3'],
  fiscal: ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D12','D13','D14','D15','G1','G2','G3','G4','G6','G7','G8','G9','G10'],
  analitica: ['F1','F2','F3','F4','H1','H2','H3','H4','I1','I2','I3','I4','J1','J2','J3','J4','J5','J8','J9','J10','K1','K2','K3','K4','K9','Q1','Q2','Q3','Q4','R1','R2','R3'] };

/* ---------- helpers de prosa ---------- */
const pascal = s => s.split('/').pop().split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const reqOps = h => h.sub.filter(t => t.endsWith('.request')).map(t => t.slice(0, -'.request'.length).split('.').pop());
const fmtList = a => a.length ? a.map(x => '`' + x + '`').join(' · ') : '(ninguno)';

/* ---------- §3 · bloques de 7 etapas ---------- */
function bloque7(h) {
  const ops = reqOps(h);
  const shared = h.f === 'custodio' ? '_shared/modulo-hibrido-reflejo + PosPersistencia + project.activated (persiste estado por proyecto)'
    : h.f === 'micro-agente' ? '_shared/modulo-hibrido-reflejo + PosPersistencia (hibrido: reflejo + op fuzzy en cajon de blueprint; gate validate-hibridos: la op fuzzy NO va en module.json.subscribes)'
      : '_shared/modulo-hibrido-reflejo (sin persistencia de estado)';
  const verif = h.f === 'custodio' ? 'ficheros en disco + guard single-writer (segundo escritor RECHAZADO) + smoke de su RPC + `project.activated` restaura el store'
    : h.f === 'micro-agente' ? 'ficheros en disco + smoke de la op fuzzy (entrada ambigua -> propuesta | excepcion a cola) + gate `scripts/validate-hibridos.js`'
      : h.f === 'conversor' ? 'ficheros en disco + smoke leer/escribir en las dos direcciones del formato + caso de forma NO declarada'
        : h.f === 'puente' ? 'ficheros en disco + smoke contra puerto stub (cableado en el sitio) + caso de puerto ausente -> se declara, no se asume'
          : 'ficheros en disco + test unitario de la proyeccion (determinista: mismas entradas -> mismas salidas)';
  const lines = [];
  lines.push('### ' + h.s + ' — ' + h.f + ' (CONSTRUIR · ' + h.v + ')');
  lines.push('```');
  lines.push('A. DEPENDENCIAS        ' + shared + '.');
  lines.push('                       Escucha: ' + fmtList(h.sub) + '.');
  lines.push('                       Depende (por EVENTO, sin require cruzado): ' + fmtList(h.d) + '.');
  lines.push('B. MODULE.JSON         name:"' + h.s + '" (SIN prefijo de vertical);');
  lines.push('                       subscribes: ' + JSON.stringify(h.sub) + ';');
  lines.push('                       publishes:  ' + JSON.stringify(pubOf(h)) + ';');
  lines.push('                       _doc: "' + h.p + '".');
  lines.push('C. INDEX.JS            class ' + pascal(h.s) + ' extends ModuloHibridoReflejo; ' +
    (h.f === 'custodio' ? 'onProjectActivated restaura el store; guard de escritor (rol autorizado); onUnload flush.' :
      h.f === 'micro-agente' ? 'cajon de blueprint para la op fuzzy; reflejo para la parte determinista; onUnload flush.' :
        'sin estado que persistir.'));
  lines.push('D. PROYECCIONES        ' + h.pr.length + ' metodos puros _op(input) -> {status, data} — LA LOGICA DE DOMINIO VIVE AQUI:');
  for (const p of h.pr) lines.push('                       · ' + p[0] + ' — ' + p[1]);
  if (!h.pr.length) lines.push('                       · (modulo REUTILIZADO: logica ya viva en el modulo real)');
  lines.push('E. HANDLERS RPC        ' + (ops.length ? ops.map(o => 'on' + o[0].toUpperCase() + o.slice(1) + 'Request -> _atender(e, \'' + o + '\', ...)' ).join(' | ') : 'no declara ops propias: solo reacciona a eventos de dominio') + '.');
  lines.push('F. EVENTOS DE DOMINIO  publica ' + fmtList(pubOf(h).filter(t => !t.endsWith('.response'))) + ' (fire-and-forget + par .failed; el .response cierra su RPC).');
  lines.push('VERIFICACION           ' + verif + '.');
  if (h.n) lines.push('NO REUTILIZA / NOTA    ' + h.n);
  lines.push('```');
  return lines.join('\n');
}

/* ---------- generacion de secciones ---------- */
const orden = topo();
const H = all();
const bySlug = new Map(H.map(h => [h.s, h]));

/* espina */
const espina = {
  proyecto: 'contabilidad',
  proyecto_id: 'contabilidad',
  origen: 'fase3/diseno-oop.md (135 clases = 118 de dominio por eje 32/32/22/32 + 17 de soporte) + fase2/esquemas/esquema.md (118 hojas con su FORMA, innegociable) + fase3b/reutilizables-verificados.md (8 REUTILIZAR verificados contra el module.json REAL) + fase3b/inventario-modulos-enki.json (248 modulos reales)',
  inventario: '248 modulos reales consultados en fase3b/inventario-modulos-enki.json (contrato leido de events.subscribes/events.publishes, NO por nombre; `banco` = banco de NICHOS, no banca)',
  regla: 'modulos-isla event-driven: CLASE con estado -> CUSTODIO (single-writer); CLASE que solo calcula -> PROYECCION INTERNA del modulo que la usa (jamas en _shared/); CLASE que orquesta -> MICRO-AGENTE; CLASE que habla con el exterior -> PUENTE; frontera de formato -> CONVERSOR; dependencia entre clases -> EVENTO request/response, nunca require. _shared/ SOLO infraestructura.',
  verticales: ['contabilidad-entrada', 'contabilidad-libro', 'contabilidad-fiscal', 'contabilidad-analitica'],
  orden,
  hojas: []
};
for (const h of H) {
  espina.hojas.push({
    slug: h.s,
    forma: h.f,
    accion: h.a,
    eje: ejeV(h.v),
    depende_de: h.d,
    eventos_sube: h.sub,
    eventos_publica: pubOf(h),
    proposito: h.p,
    clases: h.c || [],
    proyecciones_internas: (h.pr || []).map(p => ({ nombre: p[0], descripcion: p[1] })),
    reutiliza: h.a === 'REUTILIZAR' ? [h.s] : ['_shared/modulo-hibrido-reflejo'].concat(h.f === 'custodio' || h.f === 'micro-agente' ? ['_shared/pos-persistencia'] : []),
    nota: h.n || undefined
  });
}

/* validaciones */
const errs = [];
const sinpar = [];
const REQ = ['slug', 'forma', 'accion', 'eje', 'depende_de', 'eventos_sube', 'eventos_publica', 'proposito'];
for (const e of espina.hojas) {
  for (const f of REQ) if (!(f in e)) errs.push('falta campo ' + f + ' en ' + e.slug);
  if (!FORMAS.includes(e.forma)) errs.push('forma invalida en ' + e.slug + ': ' + e.forma);
  if (!ACCIONES.includes(e.accion)) errs.push('accion invalida en ' + e.slug + ': ' + e.accion);
  if (!/[^\x00-\x7F]/.test('') ) { /* noop */ }
  for (const t of e.eventos_sube.concat(e.eventos_publica)) if (/[^\x00-\x7F]/.test(t)) errs.push('topico NO ASCII en ' + e.slug + ': ' + t);
  for (const d of e.depende_de) if (!bySlug.has(d)) errs.push('depende_de inexistente en ' + e.slug + ': ' + d);
  // todo flujo cierra su circulo: RPC con .failed explicito, o evento de dominio con par de fallo declarado
  if (e.accion === 'CONSTRUIR' && !e.eventos_publica.some(t => t.endsWith('.failed') || t.endsWith('.error'))) errs.push('sin par de fallo en ' + e.slug);
  if (e.accion === 'REUTILIZAR' && !e.eventos_publica.some(t => t.endsWith('.failed') || t.endsWith('.error'))) sinpar.push(e.slug);
}
for (const s of espina.orden) if (!bySlug.has(s)) errs.push('orden con slug inexistente: ' + s);
if (espina.orden.length !== H.length || new Set(espina.orden).size !== H.length) errs.push('orden no cubre exactamente las hojas');
for (const e of espina.hojas) if (e.accion === 'REUTILIZAR' && e.proyecciones_internas.length) errs.push('REUTILIZAR con proyecciones: ' + e.slug);
const cm = claseMap();
const cob = { entrada: 0, libro: 0, fiscal: 0, analitica: 0 };
for (const k in CODES) for (const c of CODES[k]) { if (!cm[c]) errs.push('clase SIN hoja: ' + c + ' (' + k + ')'); else cob[k]++; }
if (cob.entrada !== 32 || cob.libro !== 32 || cob.fiscal !== 22 || cob.analitica !== 32) errs.push('reparto de clases ' + JSON.stringify(cob));
const nCon = H.filter(h => h.a === 'CONSTRUIR').length, nReu = H.filter(h => h.a === 'REUTILIZAR').length;

/* ---------- prosa ---------- */
const L = [];
const hoy = '2026-09-28';

L.push('# PLAN DE CONSTRUCCION — Vertical CONTABILIDAD (Fase 3b · ADAPTADOR)');
L.push('');
L.push('> **Proyecto:** contabilidad · **Vertical(es):** `contabilidad-entrada` · `contabilidad-libro` · `contabilidad-fiscal` · `contabilidad-analitica`');
L.push('> **Fase:** 3b · ADAPTADOR (adaptador de disenos Enki — traducir el diseno OOP a modulos-isla event-driven)');
L.push('> **Fecha:** ' + hoy + ' · **Ejecutor:** `prisma-universal` en lente de ADAPTADOR');
L.push('>');
L.push('> **Fuentes (leidas, no de memoria):**');
L.push('> 1. `fase3/diseno-oop.md` — FASE 3 · PLASMA: **135 clases** (118 de dominio, una por hoja atomica de F2, + 17 de soporte), 4 ejes (32/32/22/32), 16 puertos abiertos, 23 piezas `[ABIERTO]` como parametros declarables.');
L.push('> 2. `fase2/esquemas/esquema.md` — FASE 2: 118 hojas atomicas con su **FORMA** (60 REFLEJO · 29 CUSTODIO · 14 PUENTE · 8 MICRO-AGENTE · 7 CONVERSOR) y la particion en 4 verticales. **La forma no se negocia.**');
L.push('> 3. `fase3b/reutilizables-verificados.md` — verificacion **YA HECHA por el padre** contra el `module.json` REAL (contrato/tools/eje) + descartados con motivo. **No se re-verifica.**');
L.push('> 4. `fase3b/inventario-modulos-enki.json` — 248 modulos reales (contrato leido de `events.subscribes`/`events.publishes`).');
L.push('> 5. Molde de forma: `boveda/nichos/proceso/fase3b/plan-construccion.md` · Metodo: skill `enki-adaptador-disenos` + `references/espina-enki-plan.md`.');
L.push('>');
L.push('> **Hallazgo que gobierna este plan:** YA EXISTE UN PIPELINE DE FACTURACION (`facturacion/fuentes` -> `facturas` -> `facturacion/asesoria`). La ENTRADA (eslabon limitante) esta **en parte construida**: 4 de sus clases (A3, A4.1, A4.2, A5) y la salida al asesor (L1) se CUBREN con lo reutilizado en vez de re-construirse.');
L.push('');
L.push('---');
L.push('');
L.push('## 1 · Reglas de traduccion aplicadas');
L.push('');
L.push('| Clase OOP | Traduccion Enki |');
L.push('|---|---|');
L.push('| CLASE con estado | modulo **CUSTODIO** (single-writer de su parcela) — `PosPersistencia` + `project.activated` |');
L.push('| CLASE que solo calcula | **PROYECCION INTERNA** del modulo que la usa (metodo puro `_op`) — **JAMAS en `_shared/`** |');
L.push('| CLASE que orquesta | modulo **MICRO-AGENTE / ORQUESTADOR** (op fuzzy en cajon de blueprint, gate `validate-hibridos`) |');
L.push('| CLASE que habla al exterior | modulo **PUENTE** (puerto abierto, adaptador cableado en el sitio) |');
L.push('| Frontera de formato | modulo **CONVERSOR** (unico cruce de formatos de su dominio) |');
L.push('| Dependencia entre clases | **EVENTO request/response**, nunca `import` cruzado |');
L.push('| Logica de negocio | dentro del modulo como proyeccion `_op`; `_shared/` SOLO infraestructura |');
L.push('');
L.push('**Criterio de fusion declarado (clase -> hoja).** Una hoja = un modulo-isla. Para no inflar el numero de modulos sin perder ninguna clase:');
L.push('1. **CUSTODIO** -> 1 modulo. Se funden SOLO si comparten parcela (N1+N2 = un maestro con roles, conflicto 1 resuelto).');
L.push('2. **REFLEJO** -> es PROYECCION INTERNA del modulo consumidor cuando tiene **un solo consumidor** en su cadena; es **modulo propio de forma `reflejo`** cuando lo consumen **varios** modulos o su invariante exige **UN SOLO calculador** (A12 cobertura, M3 clave natural, M1 frontera de planos).');
L.push('3. **PUENTE / CONVERSOR / MICRO-AGENTE** -> 1 modulo (hablan con el exterior, cruzan formatos o ejercen juicio).');
L.push('4. Cada fusion queda declarada en la tabla **§2.6 (clase -> hoja)**: **ninguna clase se pierde**.');
L.push('');
L.push('**Convenciones del bus (innegociables).**');
L.push('- Topicos en **ASCII** (sin tildes ni enye: `dueno`, `anadir`, `senales`, `liquidacion`, `periodificacion`).');
L.push('- RPC: `contabilidad.<modulo>.<op>.request` -> `contabilidad.<modulo>.<op>.response`; fallo: `.failed`.');
L.push('- Evento de dominio: fire-and-forget `contabilidad.<sustantivo>_<participio>`; **todo flujo cierra su circulo con su par `.failed`**.');
L.push('- El espacio `contabilidad.*` es el de **CALCULOS**: nunca realimenta la operacion (cerrojo M1 `frontera-planos`). El hecho de negocio lo emite la OPERACION.');
L.push('- `contabilidad-*` son las 4 verticales (unidad de ORGANIZACION y ACTIVACION): **no son frontera de comunicacion** — todos los modulos son del sistema y se hablan entre si.');
L.push('- **Cero supuestos:** lo no declarado no se estima; es parametro declarable en `cola-declaraciones-criterio` (K9) o queda `[ABIERTO]`.');
L.push('');
L.push('---');
L.push('');
L.push('## 2 · Inventario: REUTILIZAR / ADAPTAR / CONSTRUIR');
L.push('');
L.push('### 2.1 — REUTILIZAR (8) — contrato REAL ya verificado por el padre');
L.push('');
L.push('| slug | forma | v | que CUBRE | eje | contrato real (module.json) |');
L.push('|---|---|---|---|---|---|');
for (const h of REUT) {
  const cl = (h.c && h.c.length) ? h.c.join(' · ') : (h.s === 'inventario' ? 'sustrato de stock (grupo H)' : 'infraestructura');
  L.push('| `' + h.s + '` | ' + h.f + ' | ' + (h.n.match(/v[\d.]+/) || [''])[0] + ' | ' + cl + ' | `' + h.v + '` | sub ' + fmtList(h.sub) + ' · pub ' + fmtList(h.pub.filter(t => !t.endsWith('.response'))) + ' |');
}
L.push('');
L.push('> **Por que se REUTILIZA (y no se construye):** se leyo su `module.json` real — el contrato encaja sin romper su proyecto de origen (PosPersistencia per-proyecto donde toca).');
L.push('> El detalle de la verificacion vive en `fase3b/reutilizables-verificados.md` (trabajo del padre, no repetido aqui).');
L.push('');
L.push('### 2.2 — Clases de F3 CUBIERTAS por lo reutilizado (no se construyen)');
L.push('');
L.push('| clase | la cubre | como |');
L.push('|---|---|---|');
L.push('| `A3 captura-documento` | `facturas` | admision e integridad del documento en su pipeline Intake (v3.0.0) |');
L.push('| `A4.1 extraccion-dato` | `facturas` | `facturas.procesar` = OCR + IA: el juicio de "abrir el documento" ya existe |');
L.push('| `A4.2 puerto-documento` | `facturas` + `facturacion/fuentes` | formas/canales por adaptador (`fuentes`, strategy-pattern); el catalogo es DATO declarable (A10) |');
L.push('| `A5 puerto-documento-digital` | `facturacion/fuentes` | recepcion digital (Telegram hoy; Gmail/extension por el mismo patron) -> `factura.entrada` |');
L.push('| `L1 puerto-exportacion` | `facturacion/asesoria` | CSV formato espanol + ZIP con originales (`asesoria.generar-paquete`) |');
L.push('');
L.push('**Consecuencia de diseno:** la ENTRADA no se construye de cero. Lo que FALTA del cuello es lo que ninguna pieza cubre: **contrato minimo del hecho (A11), anclaje del cierre (A14), cuadre del documento (A4.3), resolucion de contrapartida (A6.1+A6.2), deduplicacion (A7), valvula de 2 colas (A8) y la metrica de cobertura (A12)**.');
L.push('');
L.push('### 2.3 — ADAPTAR: **0**');
L.push('');
L.push('Todo lo que "se parece" es de otro dominio o mono-negocio y ADAPTARlo romperia su proyecto. Se toma su **patron** y se CONSTRUYE para contabilidad. Ver §2.4.');
L.push('');
L.push('### 2.4 — Descartados con motivo (no se adaptan · se toma su patron)');
L.push('');
L.push('| modulo evaluado | por que NO |');
L.push('|---|---|');
L.push('| `pizzepos/escandallo` | **mono-negocio** (receta -> coste). Falta coste indirecto, multi-sociedad y periodos: insuficiente para un grupo. **Se pone POR ENCIMA, no se toca.** Su patron (hibrido) se toma en `margen-analitico`/`frontera-ficha-producto`. |');
L.push('| `marketing-budget` | dominio marketing; declara "custodia contable" pero es presupuesto de marketing. **Contabilidad LEE, no absorbe** (solape registrado; H6). |');
L.push('| `planes-y-tiers` | licencias de OTRO producto (Free/Pro/Agencias). Patron para `modelo-licencia` (K8, `[ABIERTO]`), no se adapta. |');
L.push('| `cuenta-recurrente` | dominio despacho de pan (cliente + pedido base + dia). Patron de custodio, dominio ajeno. |');
L.push('| `agenda-operacion` | operacion diaria de negocio (horarios, demanda). Ajeno. |');
L.push('| `lotes` | ciclo de lotes de produccion. Ajeno (util a la operacion, no a la contabilidad). |');
L.push('| `entrega` | estimacion de reparto. Ajeno. |');
L.push('| `banco` (v0.2.0) | **NOMBRE ENGANOSO**: NO es banca, es *"custodio del banco de NICHOS del radar"*. Los bancos de contabilidad se **CONSTRUYEN** (`maestro-cuentas-bancarias`, `conciliacion-bancaria`). |');
L.push('| `nichos/motor-cobro`, `prisma/cobro`, `pizzepos/cobros`, `pizzepos/pago-gateway` | cobro de OTRO dominio. Contabilidad **observa** el cobro, no lo ejecuta (salvo pasarela declarada: `[ABIERTO]` D21). |');
L.push('| `pizzepos/persistencia-comandero` / `prisma/cierre` | **cierre de caja del DIA** de la operacion, mono-negocio. **No se toca**: entra como HECHO observado (`CIERRE_JORNADA`) por la puerta (A1). El cierre CONTABLE (nivel 2) si se construye. |');
L.push('');
L.push('### 2.5 — CONSTRUIR (' + nCon + ')');
L.push('');
L.push('Cada CONSTRUIR justifica por que no reutiliza (el `NO REUTILIZA` va en su bloque de §3 y en la espina). Motivo de fondo, repetido y honesto: **en el inventario de 248 modulos la contabilidad real (IVA/modelos/diario/conciliacion/nomina/inmovilizado/consolidacion) es CERO modulos**; lo unico contable que existe es el intake de facturas (`facturas`) y el paquete al asesor (`facturacion/asesoria`), ambos REUTILIZADOS.');
L.push('');
L.push('### 2.6 — Cobertura: clase (F3) -> hoja (F3b)');
L.push('');
L.push('> Garantia de que **ninguna de las 118 clases se pierde**: ' + Object.values(CODES).flat().length + ' clases mapeadas a ' + H.length + ' hojas (' + nCon + ' CONSTRUIR + ' + nReu + ' REUTILIZAR).');
L.push('');
for (const k of ['entrada', 'libro', 'fiscal', 'analitica']) {
  L.push('**Eje `' + V[k] + '` — ' + CODES[k].length + ' clases**');
  L.push('');
  L.push('| clase | hoja (slug) | forma |');
  L.push('|---|---|---|');
  for (const c of CODES[k]) { const s = cm[c]; const h = bySlug.get(s); L.push('| `' + c + '` | `' + s + '`' + (h.a === 'REUTILIZAR' ? ' *(REUTILIZAR)*' : '') + ' | ' + h.f + ' |'); }
  L.push('');
}
L.push('---');
L.push('');
L.push('## 3 · Las hojas CONSTRUIR — 7 etapas');
L.push('');
L.push('> Plantilla (skill `enki-adaptador-disenos`): **A** dependencias · **B** `module.json` · **C** `index.js` · **D** proyecciones (`_op`, DONDE VIVE LA LOGICA) · **E** handlers RPC · **F** eventos de dominio · **VERIFICACION**.');
L.push('> No se escribe codigo completo: el PLAN declara cada hoja (slug, forma, proposito, eventos, dependencias, proyecciones). La construccion es la FASE 4.');
L.push('');
L.push('### 3.0 — El eslabon limitante: LA CADENA DE ADMISION (detalle)');
L.push('');
L.push('```');
L.push('[puerto-evento-vertical]   hechos ya emitidos por las verticales (VENTA/COBRO/PAGO/COMPRA/CONSUMO/CIERRE_JORNADA/RECTIFICATIVO)');
L.push('       + [contrato-hecho-minimo]  el minimo EXIGIBLE por fuente (declarado, no impuesto)');
L.push('       |');
L.push('       +-- documentos:  [facturacion/fuentes] -> [facturas] (Intake/Convert/OCR)  == REUTILIZADO');
L.push('       v');
L.push('[normalizador-hecho]  UNICA puerta de formato (A2) + cuadre del documento (A4.3: si no cuadra -> cola)');
L.push('       v  contabilidad.hecho_normalizado');
L.push('[deduplicacion-hecho]  (A7 + M3 clave-natural): reprocesar NO duplica; un rectificativo no es duplicado');
L.push('       v  contabilidad.hecho_nuevo');
L.push('[resolucion-contrapartida]  PROPONE cuenta/tercero/periodo (fuzzy) <- [regla-contrapartida] corte DURO + [maestro-terceros] identidad');
L.push('       v  contabilidad.contrapartida_propuesta');
L.push('[escritor-diario]  EL cuello ENTREGA: partida doble verificada (suma debe = suma haber), single-writer, rechazo de duplicados');
L.push('       |');
L.push('       +-- valvula: lo dudoso NO bloquea -> [cola-revision] (2 colas: asesor | dueno) -> [aviso-revision] -> motor-avisos');
L.push('       +-- accion:  [desatasco-entrada] resuelve/descarta con motivo -> regla candidata -> [ratificacion-regla-aprendida]');
L.push('       +-- medida:  [completitud-cobertura] (metrica UNICA) -> [panel-proceso-contable] (tasa) / [aviso-cuadre] / [sello Q3]');
L.push('       +-- asimetria con la fuente: [anclaje-cierre-vertical] (la fuente declara su cierre) + [declaracion-fuente-faltante] (se DECLARA, no se exige)');
L.push('       +-- desacople: [lote-admision] (N hechos en paralelo; la serie no atasca el embudo)');
L.push('```');
L.push('');
L.push('**Bucle de aprendizaje (no de realimentacion de negocio):** `excepcion -> desatasco-entrada -> regla candidata -> ratificacion-regla-aprendida -> regla-contrapartida/regla-movimiento-bancario -> menos excepciones`. `frontera-planos` (M1) garantiza que nada de esto emite hechos de negocio.');
L.push('');
for (const k of ['entrada', 'libro', 'fiscal', 'analitica']) {
  const wave = { entrada: 1, libro: 2, fiscal: 3, analitica: 4 }[k];
  const set = hojas.filter(h => h.v === V[k]);
  L.push('### 3.' + wave + ' — Oleada ' + wave + ' · `' + V[k] + '` (' + set.length + ' hojas CONSTRUIR)');
  L.push('');
  for (const h of set) { L.push(bloque7(h)); L.push(''); }
}
L.push('---');
L.push('');
L.push('## 4 · Contrato de eventos');
L.push('');
L.push('### 4.1 — Pares request/response (RPC del bus)');
L.push('');
L.push('| Quien pide (`*.request`) | Quien responde | Respuesta | Par de fallo |');
L.push('|---|---|---|---|');
const rpcRows = [];
for (const h of H) for (const t of h.sub) if (t.endsWith('.request')) {
  const base = t.slice(0, -'.request'.length);
  rpcRows.push([t, h.s, base + '.response', base + '.failed']);
}
for (const r of rpcRows) L.push('| `' + r[0] + '` | `' + r[1] + '` | `' + r[2] + '` | `' + r[3] + '` |');
L.push('');
L.push('### 4.2 — Fire-and-forget + par de fallo (todo flujo cierra su circulo)');
L.push('');
L.push('| Evento de dominio | Emisor | Consumidores | Par de fallo |');
L.push('|---|---|---|---|');
const dom = {};
for (const h of H) for (const t of pubOf(h)) {
  if (t.endsWith('.response') || t.endsWith('.failed') || t.endsWith('.request') || t.includes('*')) continue;
  dom[t] = dom[t] || { emisores: [], consumidores: [] };
  dom[t].emisores.push(h.s);
}
for (const h of H) for (const t of h.sub) if (dom[t]) dom[t].consumidores.push(h.s);
for (const t of Object.keys(dom).sort()) {
  const e = dom[t];
  const fail = (e.emisores.map(s => pubOf(bySlug.get(s)).find(x => x.endsWith('.failed') && x.split('.').slice(0, 2).join('.') === t.split('.').slice(0, 2).join('.'))).filter(Boolean))[0]
    || (t.split('.').slice(0, -1).join('.') + '.failed');
  L.push('| `' + t + '` | ' + fmtList(e.emisores) + ' | ' + fmtList(e.consumidores) + ' | `' + fail + '` |');
}
L.push('');
L.push('> Eventos de la FUENTE (verticales): **no se fijan aqui** — entran por el puerto `puerto-evento-vertical` (A1) con el contrato minimo declarado (A11). Cero nombres inventados.');
L.push('');
L.push('---');
L.push('');
L.push('## 5 · Reparto por los 4 ejes (particion decidida por el dueno 2026-09-28)');
L.push('');
L.push('| vertical | hojas | CONSTRUIR | REUTILIZAR | clases F3 |');
L.push('|---|---|---|---|---|');
for (const k of ['entrada', 'libro', 'fiscal', 'analitica']) {
  const set = H.filter(h => h.v === V[k]);
  L.push('| `' + V[k] + '` | ' + (set.filter(h => h.a === 'CONSTRUIR').length + set.filter(h => h.a === 'REUTILIZAR').length) + ' | ' + set.filter(h => h.a === 'CONSTRUIR').length + ' | ' + set.filter(h => h.a === 'REUTILIZAR').length + ' | ' + CODES[k].length + ' |');
}
const trans = H.filter(h => h.v === 'transversal');
L.push('| *(transversal)* | ' + trans.length + ' | ' + trans.filter(h => h.a === 'CONSTRUIR').length + ' | ' + trans.filter(h => h.a === 'REUTILIZAR').length + ' | infraestructura (sirve a los 4) |');
L.push('| **TOTAL** | **' + H.length + '** | **' + nCon + '** | **' + nReu + '** | **118** |');
L.push('');
L.push('**Oleadas (orden de CONSTRUCCION, no de comunicacion):**');
L.push('');
L.push('| oleada | vertical | hojas | por que en este orden |');
L.push('|---|---|---|---|');
L.push('| 0 | *(transversal)* | 3 | infraestructura: `filesystem`, `project-manager`, `credential-manager` — existen y se REUTILIZAN. |');
L.push('| 1 | `contabilidad-entrada` | 22 | **EL CUELLO.** La entrada es el eslabon limitante: si la puerta no se llena sola, nada aguas abajo cuadra. |');
L.push('| 2 | `contabilidad-libro` | 24 | Donde el cuello ENTREGA: diario, mayor, cierre, tesoreria y la revision del asesor (medida maestra). |');
L.push('| 3 | `contabilidad-fiscal` | 13 | Capa fiscal completa (vendible como anadido); se calcula sobre el libro ya vivo. |');
L.push('| 4 | `contabilidad-analitica` | 18 | Inmovilizado, existencias valoradas, grupo, analitica, avisos y caras de actor: LEEN lo ya calculado. |');
L.push('');
L.push('**Nota de dependencias cruzadas (honestidad):** el orden de la espina es **topologico** (dependencias primero) y las oleadas son de **despliegue por vertical**. Cuando una hoja de oleada tardia es dependencia de una temprana (p.ej. `motor-avisos` K2 o `mayor-balanza` B3), la espina la **adelanta**; mientras no exista, el consumidor construye con **contrato TOLERANTE** (su RPC falla -> publica su par `.failed`, nunca basura).');
L.push('');
L.push('**Piezas `[ABIERTO]` (23):** **no son hojas**. Son parametros declarables que viven en `cola-declaraciones-criterio` (K9) o en el `module.json` de su consumidor, y hasta que el dueno/asesor declare el valor la pieza **no actua**. Cero valores estimados.');
L.push('');
L.push('---');
L.push('');
L.push('## 6 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos` en F4)');
L.push('');
L.push('```json enki-plan');
L.push(JSON.stringify(espina, null, 2));
L.push('```');

const md = L.join('\n') + '\n';
fs.writeFileSync(OUT, md, 'utf8');

/* ---------- verificacion del propio entregable ---------- */
const back = fs.readFileSync(OUT, 'utf8');
const m = back.match(/```json enki-plan\n([\s\S]*?)\n```/);
const parsed = JSON.parse(m[1]);
console.log('errores de datos:', errs.length ? errs : 'NINGUNO');
console.log('hojas:', parsed.hojas.length, '| orden:', parsed.orden.length, '| CONSTRUIR:', nCon, '| REUTILIZAR:', nReu, '| ADAPTAR: 0');
console.log('clases por eje:', JSON.stringify(cob), 'total', Object.values(cob).reduce((a, b) => a + b, 0));
console.log('REUTILIZAR sin par de fallo en su module.json real:', sinpar);
console.log('bytes:', back.length, '| lineas:', back.split('\n').length);
process.exit(errs.length ? 1 : 0);
