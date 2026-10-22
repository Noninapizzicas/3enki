# Contrato — ENTRADA DOCUMENTAL (ticket · albarán · factura)

> Diseño congelado. Los tres módulos se construyen contra ESTE contrato.
> Repo/worktree de trabajo: `/home/admin/3enki-entrada-doc` (rama `hermes/entrada-documental`).
> NO tocar `main`, NO commitear (el padre audita y commitea).

## La cadena (una sola dirección, todo por EVENTO)

```
canal (telegram / carpeta)
  → puerto-documento-digital.recibir.request            [A5, ya existe]
      · hecho  contabilidad.documento_recibido
      · encadena (FÍSICO) lector-documento.leer.request
  → lector-documento.leer                              [NUEVO · convierte bytes en TEXTO]
      · hecho  contabilidad.documento_leido {texto, source_kind, evidencia}
      · encadena clasificador-documento.clasificar.request
  → clasificador-documento.clasificar                   [NUEVO · decide QUÉ documento es]
      · hecho  contabilidad.documento_clasificado {tipo, confianza, motivos}
      · encadena extraccion-dato.juzgar.request CON el esquema del tipo
  → extraccion-dato.juzgar                              [A4.1, ya existe; no se toca]
      · encadena control-cuadre-documento.cuadra.request + encolado-excepcion
  → normalizador-hecho → contabilidad.hecho_recibido → escritor-diario (asienta)
```

Regla de honestidad (invariante de toda la vertical): **dato ausente = desconocido**.
Ningún módulo inventa un campo, un tipo ni un importe. Lo que no se puede leer o no casa
con un patrón declarado se declara en `abierto` y sigue por la cola de excepciones.

## Convenciones de módulo (obligatorias, copiadas de la vertical)

- Fichero `modules/contabilidad-entrada/<slug>/index.js` + `module.json`. Sin blueprint
  (la vertical es reflejo puro; `blueprint_driven` NO se usa aquí).
- `class X extends require('../../_shared/modulo-hibrido-reflejo')`, `this.name = '<slug>'`,
  `this.version = 'reflejo-0.1.0'`.
- Un handler `on<Op>Request(e)` de UNA línea que delega en
  `this._atender(e, '<op>', '<slug>.<op>.response', fn)`.
- `fn` devuelve `{status, data}` o `{status, error}`; usa `this._invalid('campo')` para 400.
- Publishes declarados en `module.json.publishes`; NADA de publicar eventos no declarados.
- `ui_handlers: []` (las ops son PREGUNTA por el bus).
- Sin dependencias npm nuevas. Sin `_shared` de dominio. Sin estado en disco (salvo los
  stores que ya existen). Comentario de cabecera en español explicando el PORQUÉ.
- `node --check index.js` limpio.

## A · `lector-documento` — bytes → TEXTO (determinista, sin LLM)

**Op** `leer` (PREGUNTA).

Entrada `{project_id, documento:{path|file_path, mime?, nombre?}, path?, ruta_absoluta?}`.

Resolución de la ruta (en este orden):
1. `ruta_absoluta` (SOLO pruebas locales; el módulo no la usa en producción).
2. `documento.path` / `documento.file_path` / `path` → se lee por el bus:
   `this._rpc('fs.read.request', {project_id, path, encoding:'base64'})` → `Buffer.from(content,'base64')`.
   Respuesta nula / sin `content` → `404 RESOURCE_NOT_FOUND`.

Estrategia (en este orden):
1. **PDF**: escribir los bytes en `tmp_dir` y ejecutar `pdftotext -layout -enc UTF-8 <tmp> -`
   (`child_process.execFile`, timeout). Si el texto limpio (trim) tiene `>= min_chars_digital`
   caracteres → `source_kind:'digital'`, `motor:'pdftotext'`. Sin tocar OCR.
2. **Imagen o PDF escaneado** (texto insuficiente): OCR en DOS pasos, con el orden MEDIDO:
   a) **tesseract local** (`tesseract <img> - --psm 4 -l spa+eng`; un PDF escaneado se rasteriza
      antes con `pdftoppm -r 300 -png`, máximo 8 páginas). `--psm 4` **conserva el orden de línea**:
      `TOTAL 69,96` llega junto a su importe. Medido con el ticket de prueba: tesseract devuelve
      `BASE IMPONIBLE: 63,60 / IVA 10%: 6,36 / TOTAL: 69,96`; OCR4RS agrupa por bloques y deja los
      importes al final, con lo que un patrón "TOTAL <importe>" captura la cifra equivocada.
      Si saca texto → `source_kind:'ocr'`, `motor:'tesseract'`.
   b) Si (a) no saca texto → `POST {base_url}/ocr` con los bytes crudos,
      `content-type: application/octet-stream`, timeout `timeout_ocr_ms`.
      Respuesta `{text, pages:[{n,text,lines}]}` → `source_kind:'ocr'`, `motor:'ocr4rs'`.
   Motor caído / timeout **y** tesseract sin texto → `502 MOTOR_OCR_NO_DISPONIBLE` (con `abierto.texto`).
3. Texto final vacío o < 8 caracteres → `422 TEXTO_VACIO` (con `abierto.texto`).

Salida 200:
```json
{ "project_id":"...", "tipo":"lector-documento",
  "documento":{"path":"inbox/f.jpg","nombre":"f.jpg","mime":"image/jpeg"},
  "texto":"...", "paginas":[{"n":0,"texto":"..."}],
  "source_kind":"digital|ocr", "motor":"pdftotext|ocr4rs",
  "evidencia":{"sha256":"...","bytes":12345},
  "ms":812, "abierto":{"texto":null} }
```
- Publica el HECHO `contabilidad.documento_leido` (mismo contenido, sin `paginas` completas si
  abulta: `{project_id, documento, texto, source_kind, motor, evidencia, correlation_id}`).
- Encadena `clasificador-documento.clasificar.request` con
  `{project_id, documento, texto, source_kind, evidencia, correlation_id}`.
- Errores → `.failed` (`{status, error, request_id}`).

Config (module.json `config` + defaults en código): `base_url:'http://localhost:8090'`,
`timeout_ocr_ms:60000`, `min_chars_digital:40`, `tmp_dir: os.tmpdir()`.
Extensión/mime: `.pdf|.jpg|.jpeg|.png|.webp|.tif|.tiff` (mime real inferido por extensión si falta).
Cualquier otra → `415 FORMATO_NO_SOPORTADO`.

## B · `clasificador-documento` — TEXTO → TIPO + ESQUEMA (determinista)

**Op** `clasificar` (PREGUNTA). Entrada `{project_id, texto, documento?, source_kind?}`.
Sin `texto` (o < 8 chars) → `400 INVALID_INPUT texto`.

Tipos: `factura` | `albaran` | `ticket` | `otro`.

Señales (case-insensitive, sobre el texto completo; se guardan como `motivos`):
- `albaran`: `/\balbar[áa]n(?:es)?\b/i`, `/\bnota de entrega\b/i`, `/\bdelivery note\b/i` → peso 3
- `factura`: `/\bfactura\b/i`, `/\binvoice\b/i`, `/\bfactura simplificada\b/i` → peso 3;
  `/base imponible/i` + `/iva/i` → peso 2; `/\bn[º°o]\.?\s*(?:de\s*)?factura/i` → peso 2
- `ticket`: `/\bticket\b/i`, `/\btique\b/i`, `/\bsimplificad[oa]\b/i`, `/gracias por su compra/i` → peso 3
- NIF español `/[A-Z]\s?-?\s?\d{7}\s?-?\s?[0-9A-J]/i` → peso 1 (refuerza factura/albarán)

Desempate (determinista, documentado en el código):
1. Gana el tipo con mayor peso.
2. Empate → `factura` si el texto tiene NIF y desglose base+IVA; `albaran` si además hay
   "entrega"/"pedido"; si no, `ticket`.
3. Ningún peso > 0 → `otro`, `confianza:0`, `abierto.tipo` declarado (no se inventa).

`confianza` = `min(1, peso_ganador / 6)` redondeado a 2 decimales.

Salida 200:
```json
{ "project_id":"...", "tipo":"clasificador-documento",
  "clase":"factura|albaran|ticket|otro",
  "confianza":0.83, "motivos":["factura (3)","nif (1)","base+iva (2)"],
  "senales":{"factura":5,"albaran":0,"ticket":0,"nif":true},
  "esquema":{"nif":{"regex":"...","flags":"i"},"total":{"regex":"...","flags":"i"}},
  "obligatorios":["nif","fecha","total"],
  "encadenado_a":"extraccion-dato",
  "abierto":{"tipo":null} }
```
- El `esquema` va en el formato EXACTO que consume `extraccion-dato._extraer`:
  `{campo: {regex, flags}}` — el valor capturado es el **grupo 1**.
- Esquemas por tipo (campos comunes, todos regex tolerantes a OCR):
  - `nif`: `(?:NIF|CIF|C\.I\.F\.|N\.I\.F\.)[^\nA-Z0-9]{0,15}([A-Z]\s?-?\s?\d{7}\s?-?\s?[0-9A-J])`
  - `fecha`: `(?:FECHA|EMISI[ÓO]N|F\.?\s*FACTURA)[^\d]{0,15}(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})`
  - `numero` factura/albarán: `(?:FACTURA|ALBAR[ÁA]N|N[º°O]\.?)[^\n\d]{0,25}(\d[\w\-\/]{2,})`
  - `numero` ticket: `(?:TICKET|TIQUE|N[º°O]\.?)[^\n\d]{0,25}(\d[\w\-\/]{2,})`
  - `base`: `BASE\s*IMPONIBLE[^\d]{0,20}([\d.,]+)`
  - `iva_pct`: `IVA[^\d%]{0,10}(\d{1,2})\s*%`
  - `iva_importe`: `IVA\s*\d{1,2}\s*%[^\d]{0,15}([\d.,]+)`
  - `total`: `TOTAL(?:\s*A\s*PAGAR)?[^\d]{0,25}([\d.,]+)`
  - `proveedor`: `^([A-Z0-9][^\n]{2,60}?(?:S\.?L\.?U?\.?|S\.?A\.?|C\.?B\.?|S\.?C\.?O\.?P\.?))` flags `im`
- `obligatorios`: factura/albarán → `["nif","fecha","total"]`; ticket → `["fecha","total"]`;
  `otro` → `[]` y `esquema:{}` (sin esquema `extraccion-dato` declara abierto y encola: correcto).
- Publica el HECHO `contabilidad.documento_clasificado` con
  `{project_id, documento, clase, confianza, motivos, source_kind, correlation_id}`.
- Encadena SIEMPRE `extraccion-dato.juzgar.request` con
  `{project_id, documento:{...documento, texto}, texto, esquema, obligatorios, correlation_id}`
  (aun con `otro`, para que la cola de excepciones lo recoja: nada se pierde en silencio).

## C · `ingesta-documental` — CANALES → puerto digital

**Ops** (ORDEN → sí lleva `ui_handlers`):
- `barrer` — barre una carpeta declarada y entrega lo nuevo.
- `entregar` — entrega un documento concreto que ya está en el storage.

Entrada `barrer`: `{project_id, carpeta?}` (default `inbox/`, relativa al storage del proyecto).
- Lista por bus `fs.list.request {project_id, path:carpeta}`; si no existe → `404`.
- Para cada fichero con extensión soportada: calcula `sha256` tras leerlo (`fs.read` base64).
  Idempotencia: mantiene en memoria el set de `sha256` ya entregados (NO persiste; el
  `deduplicacion-hecho` de la vertical es el que decide de verdad). Devuelve `{entregados, ignorados}`.
- Por cada uno publica `puerto-documento-digital.recibir.request`
  `{project_id, fuente:'carpeta', documento:{path, nombre, mime, sha256}}` con `request_id` nuevo.

Entrada `entregar`: `{project_id, path, mime?, nombre?, fuente?}` → una sola entrega, misma forma.

**Escucha** `telegram.photo.received` y `telegram.document.received` (fire-and-forget):
- Payload real: `{botName, chatId, messageId, from, fileId, fileSize, mimeType, caption, sizes?}`
  (documento: además `fileName`).
- Resuelve el proyecto por `botName` SOLO si el módulo tiene config
  `vinculos: {"<botName>":"<project_id UUID>"}`. Sin vínculo → se ignora y se loguea
  (`abierto.proyecto`), NUNCA se adivina el proyecto.
- Descarga por bus: `telegram.get_file.request {request_id, botName, fileId, download:true, destPath}`
  con `destPath` en `os.tmpdir()` (el servicio descarga en el host, NO en el storage del proyecto).
  Después: leer el fichero descargado en base64 y subirlo al storage con
  `fs.write.request {project_id, path:'inbox/<messageId>-<fileId>.<ext>', content:<base64>, encoding:'base64'}`;
  borrar el tmp; entregar con `puerto-documento-digital.recibir.request` (fuente `'telegram'`).
  Forma real de `fs.list.response`: `{files:[{name,type,size,modified,path,extension}], count}`.
- Ignora `caption`/texto: para eso ya está el chat, no este módulo.

### Canal EMAIL (Gmail) — op `barrer_email` (ORDEN)

Entrada `{project_id, cuenta?, query?, maxResults?}`. `query` por defecto
`has:attachment -in:trash`. Secuencia, toda por el bus:
`local.gmail.search` → `local.gmail.read {format:'full'}` → `local.gmail.attachments.download`
(devuelve `content` en base64) → `fs.write` en `inbox/email-<messageId>-<nombre>` → entrega con
`fuente:'gmail'` y en el documento `mensaje_id`, `remitente`, `asunto`.

- Solo se ingieren adjuntos con extensión soportada; el resto → `ignorados[{motivo:'adjunto_no_soportado'}]`.
- El CUERPO del correo no es el documento: es el transporte.
- `invalid_grant`/token caducado → **401 `GMAIL_NO_AUTORIZADO`** (hay que rehacer el OAuth con
  `scripts/gmail-oauth-setup.js`); servicio ausente → 502 `GMAIL_NO_DISPONIBLE`.

Salida de las ops: `{project_id, entregados:[{path,sha256}], ignorados:[{path,motivo}]}`.

## Tests (obligatorio, uno por módulo)

`node tests/unit/entrada__<slug>.test.js`, sin framework (assert + node puro), con `process.exitCode`.
- Instanciar el módulo SIN core: `new Modulo()` + asignar `eventBus` falso
  (`{publish(ev,p){...}, subscribe(){return ()=>{}}}`) y `logger` falso.
- `lector`: (1) sin project_id → 400; (2) extensión no soportada → 415; (3) PDF digital —
  inyectar `ruta_absoluta` apuntando a un PDF de fixtures generado en el test con texto
  (`pdftotext` real) → `source_kind:'digital'`; (4) motor OCR caído (base_url a un puerto muerto)
  → 502 y NO publica `contabilidad.documento_leido`.
- `clasificador`: factura/albarán/ticket/otro sintéticos → clase correcta + esquema no vacío;
  `otro` → `esquema:{}` y aun así encadena a `extraccion-dato`.
- `ingesta`: `barrer` con `fs.list`/`fs.read` simulados → publica N `puerto-documento-digital.recibir.request`
  y es idempotente en la segunda pasada; sin `vinculos` un `telegram.photo.received` NO entrega nada.


## D · `hecho-compra` — EXTRACCIÓN → HECHO CONTABLE CON ASIENTO (determinista)

Este es el eslabón que hoy NO existe: convierte los campos de un documento de compra en el
HECHO que `escritor-diario` sabe asentar. Sin él la entrada se queda en propuesta y en cola.

**Op** `componer` (PREGUNTA).

Entrada: `{project_id, clase:'factura'|'ticket'|'albaran'|'otro', extraido:{proveedor,nif,numero,fecha,base,iva_pct,iva_importe,total,moneda?}, documento?, cuenta_gasto?}`.

Reglas (PGC español, deterministas, sin inventar NADA):
1. **Albarán NO asienta**: un albarán no devenga gasto; se declara `asienta:false`,
   `motivo:'albaran_pendiente_de_factura'`, `hecho:null` y se encadena
   `cruce-factura-recepcion.cotejar.request` (N5) para esperar la factura. NO es un error.
2. **Ticket y factura SÍ asientan** si hay `fecha`, `base`, `iva` y `total` que cuadren
   (`|base + cuota - total| <= 0.02`). Cuota: `iva_importe` si viene; si no `base * iva_pct / 100`
   redondeado a 2 decimales. Sin `iva_pct` ni `iva_importe` → no se inventa el IVA: `asienta:false`
   y `abierto.iva` declarado (se encola).
3. **Cuenta de gasto**: se resuelve en este orden y se declara cuál se usó:
   a) `cuenta_gasto` del input; b) `config.cuenta_gasto_default` si está declarada;
   c) `regla-contrapartida.aplicar.request` (A6.2) con `{project_id, contexto:{nif, proveedor, concepto}}`
   — se usa su `cuenta` si responde. Sin ninguna de las tres → `asienta:false`,
   `abierto.cuenta_gasto` declarado (NUNCA se inventa una cuenta).
4. **Asiento (partida doble, PGC)**:
   - DEBE `cuenta_gasto` por `base`
   - DEBE `472` (HP IVA soportado) por `cuota` (solo si `cuota > 0`)
   - HABER `400` (Proveedores) por `total`
   - `fecha` normalizada a `YYYY-MM-DD` (acepta `dd/mm/yyyy`, `dd-mm-yyyy`, ISO); si no es fecha
     válida → `asienta:false` con `abierto.fecha`.
   - Redondeo a 2 decimales; la suma DEBE == suma HABER (si no, `asienta:false`,
     `abierto.asiento:'la partida doble no cuadra'`).
5. `clase:'otro'` → `asienta:false`, `abierto.clase` declarado.
6. `moneda` por defecto `'EUR'` (se declara en el hecho).

Salida 200:
```json
{ "project_id":"...", "tipo":"hecho-compra", "clase":"factura",
  "hecho":{"fecha":"2026-10-21","concepto":"PANADERIA EL HORNO S.L. F-2026-004512",
           "importe":69.96,"moneda":"EUR","referencia":"2026-004512","vertical":"compras",
           "tercero":{"nif":"B12345678","nombre":"PANADERIA EL HORNO S.L."},
           "asiento":{"fecha":"2026-10-21","concepto":"...","lineas":[
              {"cuenta":"629","debe":63.60,"haber":0,"concepto":"compra"},
              {"cuenta":"472","debe":6.36,"haber":0,"concepto":"IVA soportado"},
              {"cuenta":"400","debe":0,"haber":69.96,"concepto":"proveedor"}]}},
  "asienta":true, "cuenta_gasto":"629", "cuadra":true,
  "motivo":null, "abierto":{"iva":null,"cuenta_gasto":null} }
```
- Si `asienta:true` → publica el HECHO `contabilidad.hecho_recibido` con
  `{project_id, asiento, hecho, origen:'hecho-compra', correlation_id}` (lo asienta `escritor-diario`).
- Si `asienta:false` → NO publica `contabilidad.hecho_recibido`; publica
  `hecho-compra.componer.response` con el motivo y encadena `encolado-excepcion.encolar.request`
  (A8.1) con `{project_id, rol:'ENCOLADO_EXCEPCION', clave:'compra:<nif>:<numero>', motivo, payload}`.
- Errores → `.failed`.

Config: `cuenta_gasto_default` (por defecto `null`: NO se inventa), `cuenta_iva_soportado:'472'`,
`cuenta_proveedores:'400'`, `timeout_regla_ms:6000`.

## Cableado (lo hace el padre, NO la tarea)

`control-cuadre-documento` ya recibe el `extraido` de `extraccion-dato`; cuando `cuadra:true`
encadena `hecho-compra.componer.request` con el `extraido`. Así el asiento sale solo.

## Lo que NO se toca en estas tareas

- `extraccion-dato`, `captura-documento`, `control-cuadre-documento`, `escritor-diario`: YA EXISTEN.
- `config.json`, `main`, deploy. El cableado del puerto y la declaración los hace el padre.
