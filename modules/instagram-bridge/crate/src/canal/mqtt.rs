//! El canal con el bus: WebSocket seguro + MQTT 3.1.1 minimo, hecho a mano.
//!
//! # Por que a mano
//!
//! Los clientes MQTT ya hechos (y sus variantes sobre WebSocket) **se quedan con
//! host y puerto de la URL y descartan el path y la query**. En el bus de Enki la
//! llave de la puerta viaja exactamente ahi:
//!
//! ```text
//! wss://enki-ai.online/mqtt?k=<llave>
//! ```
//!
//! Con un cliente de libreria la llave se pierde antes del handshake y el broker
//! contesta 401. La unica salida es un cliente que controle su propia URL: el
//! handshake lo pone `tungstenite` (RFC 6455) y el dialogo MQTT —que son cuatro
//! paquetes— lo pone este fichero.
//!
//! # Las tres trampas, resueltas aqui y con su nombre
//!
//! 1. **Subprotocolo.** El handshake tiene que declarar `Sec-WebSocket-Protocol:
//!    mqtt`. Sin esa cabecera el broker cierra con 400 y el sintoma que se ve es
//!    "no conecta" sin mas pista. Se pone en `peticion_websocket`.
//! 2. **Proveedor criptografico.** Con `rustls` hay que instalar el proveedor
//!    **antes** de construir cualquier configuracion TLS, o el proceso aborta al
//!    conectar. Lo hace `instalar_proveedor`, una sola vez por proceso (`Once`),
//!    y se llama al principio de `Canal::conectar`, antes de tocar TLS.
//! 3. **Framer.** Algunos brokers entregan el CONNACK partido en frames de un
//!    byte (1 byte por mensaje WebSocket). Leer "un paquete por mensaje" da
//!    `[0x20]`, que parece un rechazo y no lo es. El `Framer` **acumula bytes** y
//!    extrae paquetes completos por la longitud variable de MQTT; los tests de
//!    particion (`tests/mqtt_framer.rs`) son los que protegen esto.
//!
//! # Lo que este fichero NO es
//!
//!   - No es un cliente MQTT completo: hay CONNECT, SUBSCRIBE, PUBLISH QoS 0,
//!     PINGREQ/PINGRESP y DISCONNECT. No hay QoS 1/2, ni sesiones persistentes,
//!     ni last-will, ni reconexion automatica (eso es politica del bucle).
//!   - No ejecuta ordenes ni interpreta payloads: eso es `bucle`.
//!   - No mira el arbol ni toca el aparato: es transporte y nada mas.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Once};
use std::time::{Duration, Instant};

use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, RootCertStore, StreamOwned};
use tungstenite::client::ClientRequestBuilder;
use tungstenite::http::Uri;
use tungstenite::{Message, WebSocket};

// ---------------------------------------------------------------------------
// Los tipos de paquete (MQTT 3.1.1, seccion 2.2.1)
// ---------------------------------------------------------------------------

pub const CONNECT: u8 = 1;
pub const CONNACK: u8 = 2;
pub const PUBLISH: u8 = 3;
pub const SUBSCRIBE: u8 = 8;
pub const SUBACK: u8 = 9;
pub const PINGREQ: u8 = 12;
pub const PINGRESP: u8 = 13;
pub const DISCONNECT: u8 = 14;

/// Nivel de protocolo MQTT 3.1.1 (seccion 3.1.2.2).
pub const NIVEL_MQTT: u8 = 4;

/// Tamano maximo de paquete que este cliente acepta acumular.
///
/// La longitud variable de MQTT llega a 256 MiB y un byte mal leido puede pedir
/// un buffer enorme. Un paquete del bus `bridge/*` es una orden con un texto y
/// una ruta de fichero: 1 MiB sobra y corta el caso "el broker escupe basura".
pub const MAXIMO_PAQUETE: usize = 1024 * 1024;

/// Tiempo de espera por defecto de una lectura (no de una operacion completa).
pub const PLAZO_LECTURA: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------
// El framer: ACUMULA bytes y extrae paquetes completos
// ---------------------------------------------------------------------------

/// Acumulador de bytes -> paquetes MQTT completos.
///
/// La regla, que es la trampa 3 de la skill: **un mensaje WebSocket no es un
/// paquete MQTT**. Puede traer medio paquete, un paquete, o tres. Y al reves: un
/// paquete puede llegar en veinte mensajes de un byte.
///
/// Por eso el framer no interpreta al recibir: empuja y, cuando puede, extrae.
/// La longitud variable de MQTT (`1..=4` bytes con el bit de continuacion) es la
/// unica fuente de verdad sobre donde acaba un paquete.
#[derive(Debug, Default, Clone)]
pub struct Framer {
    buf: Vec<u8>,
    excedido: bool,
}

impl Framer {
    pub fn nuevo() -> Self {
        Self::default()
    }

    /// Bytes recibidos que todavia no forman un paquete completo.
    pub fn en_espera(&self) -> usize {
        self.buf.len()
    }

    /// ¿Se supero `MAXIMO_PAQUETE`? Cuando pasa, el canal esta roto y hay que
    /// decirlo, no seguir acumulando.
    pub fn excedido(&self) -> bool {
        self.excedido
    }

    /// Anade bytes tal y como llegan del WebSocket (sin interpretarlos).
    pub fn empujar(&mut self, trozo: &[u8]) {
        if trozo.is_empty() {
            return;
        }
        self.buf.extend_from_slice(trozo);
    }

    /// El siguiente paquete completo, si ya lo hay.
    ///
    /// `None` significa **"todavia no"**, nunca "no hay nada": los bytes que
    /// faltan siguen en el buffer y se completaran con el proximo `empujar`. Un
    /// framer que devolviera lo que tiene seria el que da un falso CONNACK
    /// rechazado.
    pub fn siguiente(&mut self) -> Option<Vec<u8>> {
        if self.buf.len() < 2 {
            return None;
        }

        let (restante, bytes_de_longitud) = match longitud_variable(&self.buf[1..]) {
            Some(par) => par,
            None => {
                // Longitud incompleta (o imposible): se espera, salvo que ya no
                // quepan mas bytes de longitud.
                if self.buf.len() > 5 {
                    self.excedido = true;
                }
                return None;
            }
        };

        let total = 1 + bytes_de_longitud + restante;
        if total > MAXIMO_PAQUETE {
            self.excedido = true;
            return None;
        }
        if self.buf.len() < total {
            return None;
        }

        let paquete = self.buf[..total].to_vec();
        self.buf.drain(..total);
        Some(paquete)
    }

    /// Devuelve un paquete ya extraido al FRENTE del buffer.
    ///
    /// Se usa cuando en medio de una espera (un SUBACK, por ejemplo) llega un
    /// PUBLISH: tirarlo seria perder una orden sin decirlo. El paquete vuelve a
    /// estar delante de los bytes que aun estaban pendientes, asi que el orden
    /// de llegada se respeta.
    pub fn anteponer(&mut self, paquete: &[u8]) {
        if paquete.is_empty() {
            return;
        }
        // Inverso de `drain(..total)`: se reinserta delante sin copiar el buffer
        // entero dos veces.
        self.buf.splice(0..0, paquete.iter().copied());
    }

    /// Siguiente paquete ya completo, o `None`. Igual que `siguiente` pero
    /// dejando el framer limpio se descarta lo que hubiera: se usa al cerrar.
    pub fn vaciar(&mut self) {
        self.buf.clear();
        self.excedido = false;
    }
}

/// Lee la longitud variable de MQTT desde el byte siguiente a la cabecera.
///
/// Devuelve `(valor, bytes_consumidos)` o `None` si aun no hay bytes suficientes
/// para saberla. Un quinto byte de continuacion es un paquete invalido segun el
/// estandar y tambien devuelve `None` (el framer lo marca como excedido).
pub fn longitud_variable(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut valor: usize = 0;
    let mut multiplicador: usize = 1;
    for (i, b) in bytes.iter().take(4).enumerate() {
        valor += (b & 0x7f) as usize * multiplicador;
        if b & 0x80 == 0 {
            return Some((valor, i + 1));
        }
        multiplicador *= 128;
    }
    None
}

/// Escribe la longitud variable de MQTT (1..=4 bytes).
pub fn escribir_longitud_variable(mut valor: usize, salida: &mut Vec<u8>) {
    debug_assert!(valor <= 268_435_455, "la longitud variable de MQTT llega a 256 MiB");
    loop {
        let mut byte = (valor % 128) as u8;
        valor /= 128;
        if valor > 0 {
            byte |= 0x80;
        }
        salida.push(byte);
        if valor == 0 {
            break;
        }
    }
}

/// La cabecera fija: tipo y flags arriba, longitud variable detras.
fn cabecera(tipo_y_flags: u8, resto: &[u8], salida: &mut Vec<u8>) {
    salida.push(tipo_y_flags);
    escribir_longitud_variable(resto.len(), salida);
    salida.extend_from_slice(resto);
}

fn cadena_utf8(t: &str, salida: &mut Vec<u8>) {
    salida.extend_from_slice(&(t.len() as u16).to_be_bytes());
    salida.extend_from_slice(t.as_bytes());
}

// ---------------------------------------------------------------------------
// Los paquetes que este cliente sabe construir
// ---------------------------------------------------------------------------

/// CONNECT (seccion 3.1) con sesion limpia y sin last-will.
pub fn paquete_connect(cliente_id: &str, mantener_vivo_s: u16) -> Vec<u8> {
    let mut variable = Vec::new();
    cadena_utf8("MQTT", &mut variable);
    variable.push(NIVEL_MQTT);
    // Flags: bit 1 = Clean Session. Sin usuario, sin clave, sin last-will, sin
    // "reserved": un flag de mas y el broker cierra con un motivo que no dice
    // cual era.
    variable.push(0b0000_0010);
    variable.extend_from_slice(&mantener_vivo_s.to_be_bytes());

    let mut cuerpo = variable;
    cadena_utf8(cliente_id, &mut cuerpo);

    let mut salida = Vec::with_capacity(cuerpo.len() + 2);
    cabecera(0x10, &cuerpo, &mut salida);
    salida
}

/// SUBSCRIBE (seccion 3.8) de un solo filtro, con su id de paquete.
pub fn paquete_subscribe(id: u16, filtro: &str, qos: u8) -> Vec<u8> {
    let mut cuerpo = Vec::new();
    cuerpo.extend_from_slice(&id.to_be_bytes());
    cadena_utf8(filtro, &mut cuerpo);
    cuerpo.push(qos & 0b0000_0011);

    let mut salida = Vec::with_capacity(cuerpo.len() + 2);
    // 0x82: SUBSCRIBE con los flags obligatorios (0010).
    cabecera(0x82, &cuerpo, &mut salida);
    salida
}

/// PUBLISH QoS 0 (seccion 3.3): sin id de paquete, sin acuse.
pub fn paquete_publish(topic: &str, payload: &[u8]) -> Vec<u8> {
    let mut cuerpo = Vec::with_capacity(2 + topic.len() + payload.len());
    cadena_utf8(topic, &mut cuerpo);
    cuerpo.extend_from_slice(payload);

    let mut salida = Vec::with_capacity(cuerpo.len() + 2);
    // 0x30: PUBLISH, QoS 0, sin retener, sin duplicado.
    cabecera(0x30, &cuerpo, &mut salida);
    salida
}

pub fn paquete_pingreq() -> Vec<u8> {
    vec![0xC0, 0x00]
}

pub fn paquete_disconnect() -> Vec<u8> {
    vec![0xE0, 0x00]
}

// ---------------------------------------------------------------------------
// Los paquetes que este cliente sabe leer
// ---------------------------------------------------------------------------

/// El tipo de paquete (nibble alto de la cabecera fija).
pub fn tipo_de(paquete: &[u8]) -> Option<u8> {
    paquete.first().map(|b| b >> 4)
}

/// El cuerpo del paquete (sin cabecera fija ni longitud variable).
pub fn cuerpo_de(paquete: &[u8]) -> Option<&[u8]> {
    let (restante, bytes) = longitud_variable(paquete.get(1..)?)?;
    let inicio = 1 + bytes;
    let fin = inicio + restante;
    paquete.get(inicio..fin)
}

/// Una publicacion recibida.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicacionRecibida {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: u8,
}

/// Lee un PUBLISH. `None` si el paquete no lo es o viene truncado.
///
/// Solo se soporta QoS 0 en lectura: en QoS 1 hay un id de paquete delante del
/// payload y contestar sin `PUBACK` dejaria al broker reintentando para siempre.
/// Un QoS 1 se rechaza con nombre en vez de leerse mal.
pub fn leer_publish(paquete: &[u8]) -> Option<PublicacionRecibida> {
    if tipo_de(paquete)? != PUBLISH {
        return None;
    }
    let qos = (paquete[0] >> 1) & 0b11;
    if qos != 0 {
        return None;
    }
    let cuerpo = cuerpo_de(paquete)?;
    if cuerpo.len() < 2 {
        return None;
    }
    let largo = u16::from_be_bytes([cuerpo[0], cuerpo[1]]) as usize;
    let topic = std::str::from_utf8(cuerpo.get(2..2 + largo)?).ok()?;
    Some(PublicacionRecibida {
        topic: topic.to_string(),
        payload: cuerpo.get(2 + largo..)?.to_vec(),
        qos,
    })
}

// ---------------------------------------------------------------------------
// El fallo del canal (con nombre, para el resultado del bus)
// ---------------------------------------------------------------------------

/// Por que el canal no esta operativo. Cada variante tiene un codigo estable,
/// sin tildes, que viaja en el resultado al cerebro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeCanal {
    /// La URL no tiene la forma esperada.
    UrlInvalida(String),
    /// Esquema distinto de `wss`. Un bus sin TLS no se acepta.
    UrlNoSegura(String),
    /// No se pudo abrir el TCP (DNS, red, puerto cerrado).
    Red(String),
    /// El TLS no se pudo establecer (certificado, SNI, proveedor).
    Tls(String),
    /// El broker respondio al handshake con algo que no es 101.
    HandshakeRechazado(String),
    /// CONNACK con codigo distinto de 0.
    ConnackRechazado { codigo: u8 },
    /// SUBACK con un codigo que no es exito.
    SubackRechazado { codigo: u8 },
    /// El broker no contesta lo que toca dentro del plazo.
    SinRespuesta { esperaba: &'static str, plazo_ms: u64 },
    /// El transporte se rompio, o el broker cerro.
    Transporte(String),
    /// Lo que llego no es MQTT valido (o es demasiado grande).
    Protocolo(String),
    /// El broker cerro la conexion.
    Cerrado,
}

impl FalloDeCanal {
    /// Codigo estable, sin tildes, para payloads y logs.
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeCanal::UrlInvalida(_) => "url_invalida",
            FalloDeCanal::UrlNoSegura(_) => "url_no_segura",
            FalloDeCanal::Red(_) => "red",
            FalloDeCanal::Tls(_) => "tls",
            FalloDeCanal::HandshakeRechazado(_) => "handshake_rechazado",
            FalloDeCanal::ConnackRechazado { .. } => "connack_rechazado",
            FalloDeCanal::SubackRechazado { .. } => "suback_rechazado",
            FalloDeCanal::SinRespuesta { .. } => "sin_respuesta",
            FalloDeCanal::Transporte(_) => "transporte",
            FalloDeCanal::Protocolo(_) => "protocolo",
            FalloDeCanal::Cerrado => "cerrado",
        }
    }

    /// Frase para una persona: lo que paso y, cuando se sabe, por que.
    pub fn descripcion(&self) -> String {
        match self {
            FalloDeCanal::UrlInvalida(url) => {
                format!("la url del bus no vale: '{url}' (se espera wss://host[:puerto]/ruta?k=llave)")
            }
            FalloDeCanal::UrlNoSegura(esquema) => format!(
                "el bus solo se alcanza por wss:// y la url usa '{esquema}': sin TLS no se conecta"
            ),
            FalloDeCanal::Red(motivo) => format!("no se pudo abrir la conexion: {motivo}"),
            FalloDeCanal::Tls(motivo) => format!("el TLS no se establecio: {motivo}"),
            FalloDeCanal::HandshakeRechazado(motivo) => {
                format!("el broker rechazo el handshake: {motivo}")
            }
            FalloDeCanal::ConnackRechazado { codigo } => format!(
                "el broker rechazo el CONNECT con el codigo {codigo} ({}): revisar llave y url",
                motivo_connack(*codigo)
            ),
            FalloDeCanal::SubackRechazado { codigo } => {
                format!("el broker rechazo la suscripcion con el codigo {codigo}")
            }
            FalloDeCanal::SinRespuesta { esperaba, plazo_ms } => {
                format!("el broker no mando {esperaba} en {plazo_ms} ms")
            }
            FalloDeCanal::Transporte(motivo) => format!("el canal se rompio: {motivo}"),
            FalloDeCanal::Protocolo(motivo) => format!("lo que llego no es MQTT valido: {motivo}"),
            FalloDeCanal::Cerrado => "el broker cerro la conexion".to_string(),
        }
    }
}

impl std::fmt::Display for FalloDeCanal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

impl std::error::Error for FalloDeCanal {}

/// Los codigos de CONNACK de MQTT 3.1.1 (tabla 3.1), en castellano.
pub fn motivo_connack(codigo: u8) -> &'static str {
    match codigo {
        0 => "aceptado",
        1 => "version de protocolo inaceptable",
        2 => "identificador de cliente rechazado",
        3 => "servidor no disponible",
        4 => "usuario o clave incorrectos",
        5 => "no autorizado",
        _ => "codigo desconocido",
    }
}

// ---------------------------------------------------------------------------
// El proveedor criptografico (trampa 2)
// ---------------------------------------------------------------------------

static PROVEEDOR: Once = Once::new();

/// Instala el proveedor criptografico de `rustls` una sola vez por proceso.
///
/// **Antes de cualquier TLS.** `ClientConfig::builder()` toma el proveedor por
/// defecto del proceso: si no hay ninguno instalado, `rustls` entra en panico y
/// el proceso aborta — con un mensaje que habla de `CryptoProvider` y no del
/// canal, que es lo que hace perder la tarde. Se llama al principio de
/// `Canal::conectar`, antes de leer una linea de TLS.
pub fn instalar_proveedor() {
    PROVEEDOR.call_once(|| {
        // Si ya lo instalo otro (una segunda llamada al crate), el error es
        // "ya hay uno" y no es un fallo: se ignora a proposito.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

// ---------------------------------------------------------------------------
// La URL: la llave viaja en la query y no se pierde
// ---------------------------------------------------------------------------

/// Lo que hace falta para abrir el TCP y el handshake.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Destino {
    pub host: String,
    pub puerto: u16,
    /// Path y query, tal cual (`/mqtt?k=...`). Es la parte que los clientes de
    /// libreria tiran, y la razon por la que este cliente existe.
    pub ruta: String,
}

impl Destino {
    /// El `Host` del handshake, con puerto solo si no es el de por defecto.
    pub fn autoridad(&self) -> String {
        if self.puerto == 443 {
            self.host.clone()
        } else {
            format!("{}:{}", self.host, self.puerto)
        }
    }
}

/// Parte una url `wss://host[:puerto][/ruta][?query]`.
///
/// Se rechaza `ws://` (sin TLS), una url sin host y una url con usuario/clave
/// embebidos (una llave en `user:pass` acaba en logs; la llave va en la query y
/// se compone con `url_con_llave`).
pub fn partir_url(url: &str) -> Result<Destino, FalloDeCanal> {
    let url = url.trim();
    let (esquema, resto) = match url.split_once("://") {
        Some(par) => par,
        None => return Err(FalloDeCanal::UrlInvalida(url.to_string())),
    };
    if esquema != "wss" {
        return Err(FalloDeCanal::UrlNoSegura(esquema.to_string()));
    }

    let (autoridad, ruta) = match resto.find('/') {
        Some(i) => (&resto[..i], &resto[i..]),
        None => (resto, "/"),
    };

    if autoridad.is_empty() || autoridad.contains('@') {
        return Err(FalloDeCanal::UrlInvalida(url.to_string()));
    }

    let (host, puerto) = match autoridad.rsplit_once(':') {
        Some((h, p)) => {
            let puerto = p
                .parse::<u16>()
                .map_err(|_| FalloDeCanal::UrlInvalida(url.to_string()))?;
            (h, puerto)
        }
        None => (autoridad, 443u16),
    };
    if host.is_empty() {
        return Err(FalloDeCanal::UrlInvalida(url.to_string()));
    }

    Ok(Destino {
        host: host.to_string(),
        puerto,
        ruta: ruta.to_string(),
    })
}

/// Compone la url del bus con la llave en la query.
///
/// Si la url ya trae `k=`, manda la de la url: no se duplica el parametro (dos
/// `k` en la query es una llave que el otro lado lee distinto que nosotros).
pub fn url_con_llave(url: &str, llave: &str) -> String {
    let url = url.trim();
    if llave.trim().is_empty() || url.contains("k=") {
        return url.to_string();
    }
    let separador = if url.contains('?') { '&' } else { '?' };
    format!("{url}{separador}k={}", llave.trim())
}

// ---------------------------------------------------------------------------
// El transporte (para poder doblarlo en los tests)
// ---------------------------------------------------------------------------

/// Lo que el WebSocket necesita de debajo: leer y escribir bytes.
///
/// Existe por dos motivos: que el `Canal` no sea generico en su tipo (el
/// `StreamOwned<ClientConnection, TcpStream>` de `rustls` no tiene por que
/// aparecer en ninguna firma) y que un test pueda meter un transporte en
/// memoria. El plazo de lectura es parte del transporte porque es una propiedad
/// del socket, no del WebSocket.
pub trait Transporte: Read + Write {
    /// Fija el plazo de una lectura. No tiene implementacion por defecto a
    /// proposito: la pone quien tiene un socket, y un transporte en memoria no
    /// la necesita porque nunca bloquea.
    fn fijar_plazo(&mut self, plazo: Duration);
}

/// La caja que borra el tipo concreto del transporte.
///
/// `Box<dyn Transporte>` no basta: hay que reenviar `Read`/`Write` a mano para
/// no depender de que `std` implemente esos rasgos para una caja (lo hace, pero
/// esto es el borde de seguridad del canal y no se deja a una suposicion).
pub struct Caja(Box<dyn Transporte>);

impl Caja {
    pub fn nueva(t: impl Transporte + 'static) -> Self {
        Self(Box::new(t))
    }
}

impl Read for Caja {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.0.read(buf)
    }
}

impl Write for Caja {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.0.flush()
    }
}

impl Transporte for Caja {
    fn fijar_plazo(&mut self, plazo: Duration) {
        self.0.fijar_plazo(plazo);
    }
}

/// El transporte de produccion: TLS de `rustls` sobre un TCP.
struct TransporteTls {
    flujo: StreamOwned<ClientConnection, TcpStream>,
}

impl TransporteTls {
    fn nuevo(flujo: StreamOwned<ClientConnection, TcpStream>) -> Self {
        Self { flujo }
    }
}

impl Read for TransporteTls {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.flujo.read(buf)
    }
}

impl Write for TransporteTls {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.flujo.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.flujo.flush()
    }
}

impl Transporte for TransporteTls {
    fn fijar_plazo(&mut self, plazo: Duration) {
        // `StreamOwned` expone su socket: el plazo se pone en el TCP, que es
        // quien bloquea. El error se ignora porque un socket sin plazos sigue
        // siendo un canal usable: solo pierde la cota de espera.
        let _ = self.flujo.sock.set_read_timeout(Some(plazo));
    }
}

// ---------------------------------------------------------------------------
// El canal
// ---------------------------------------------------------------------------

/// Un canal abierto contra el bus: CONNECT hecho, CONNACK aceptado.
pub struct Canal {
    ws: WebSocket<Caja>,
    framer: Framer,
    siguiente_id: u16,
    cliente_id: String,
    cerrado: bool,
}

impl std::fmt::Debug for Canal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Canal")
            .field("cliente_id", &self.cliente_id)
            .field("cerrado", &self.cerrado)
            .field("en_espera", &self.framer.en_espera())
            .finish()
    }
}

impl Canal {
    /// Abre el canal: TCP, TLS, handshake WebSocket con `mqtt`, CONNECT y CONNACK.
    ///
    /// Cualquier fallo se nombra con su variante: no hay un `Err("fallo")` que
    /// obligue a adivinar si fue la llave, el DNS o el subprotocolo.
    pub fn conectar(url: &str, cliente_id: &str) -> Result<Canal, FalloDeCanal> {
        let destino = partir_url(url)?;

        // Trampa 2: primero el proveedor, despues TLS. Nunca al reves.
        instalar_proveedor();

        let uri: Uri = url
            .trim()
            .parse()
            .map_err(|_| FalloDeCanal::UrlInvalida(url.to_string()))?;

        let tcp = TcpStream::connect((destino.host.as_str(), destino.puerto))
            .map_err(|e| FalloDeCanal::Red(e.to_string()))?;
        tcp.set_nodelay(true).map_err(|e| FalloDeCanal::Red(e.to_string()))?;
        // El plazo de lectura se pone aqui, antes del handshake: si el broker
        // acepta el TCP y se queda callado, el handshake no cuelga para siempre.
        tcp.set_read_timeout(Some(Duration::from_secs(10)))
            .map_err(|e| FalloDeCanal::Red(e.to_string()))?;

        let mut raices = RootCertStore::empty();
        raices.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let configuracion = ClientConfig::builder()
            .with_root_certificates(raices)
            .with_no_client_auth();

        let nombre = ServerName::try_from(destino.host.clone())
            .map_err(|e| FalloDeCanal::Tls(format!("nombre de servidor no valido: {e}")))?;
        let conexion = ClientConnection::new(Arc::new(configuracion), nombre)
            .map_err(|e| FalloDeCanal::Tls(e.to_string()))?;
        let flujo = StreamOwned::new(conexion, tcp);
        let caja = Caja::nueva(TransporteTls::nuevo(flujo));

        // Trampa 1: el subprotocolo. tungstenite falla el handshake si pedimos
        // `mqtt` y la respuesta no lo devuelve, asi que la trampa se convierte
        // en un error con nombre en vez de en un canal mudo.
        let peticion = ClientRequestBuilder::new(uri)
            .with_sub_protocol("mqtt")
            .with_header("Host", destino.autoridad());

        let (mut ws, respuesta) = tungstenite::client::client_with_config(peticion, caja, None)
            .map_err(|e| FalloDeCanal::HandshakeRechazado(e.to_string()))?;
        if respuesta.status().as_u16() != 101 {
            return Err(FalloDeCanal::HandshakeRechazado(format!(
                "estado {}",
                respuesta.status().as_u16()
            )));
        }
        // El buffer de escritura por defecto de tungstenite son 128 KiB: sin
        // esto, un CONNECT puede quedarse esperando a llenar el buffer y el
        // broker nunca contesta. `0` = cada mensaje sale al momento.
        ws.get_mut().fijar_plazo(Duration::from_secs(10));

        let mut canal = Canal {
            ws,
            framer: Framer::nuevo(),
            siguiente_id: 1,
            cliente_id: cliente_id.to_string(),
            cerrado: false,
        };

        canal.enviar(&paquete_connect(cliente_id, 60))?;
        canal.esperar(CONNACK, Duration::from_secs(10))?;
        Ok(canal)
    }

    /// El id con el que este canal se presenta al broker.
    pub fn cliente_id(&self) -> &str {
        &self.cliente_id
    }

    /// ¿El canal esta cerrado? Un canal cerrado no se reabre: se construye otro.
    /// La reconexion (cuantas veces, cada cuanto) es politica del bucle, no del
    /// transporte.
    pub fn cerrado(&self) -> bool {
        self.cerrado
    }

    fn enviar(&mut self, paquete: &[u8]) -> Result<(), FalloDeCanal> {
        if self.cerrado {
            return Err(FalloDeCanal::Cerrado);
        }
        self.ws
            .send(Message::Binary(paquete.to_vec().into()))
            .map_err(|e| FalloDeCanal::Transporte(e.to_string()))?;
        // Sin `flush` el paquete se queda en el buffer de escritura de
        // tungstenite (128 KiB por defecto): un CONNECT que no sale es un
        // CONNACK que nunca llega, y el sintoma es "el broker no contesta".
        self.ws
            .flush()
            .map_err(|e| FalloDeCanal::Transporte(e.to_string()))
    }

    /// Manda un SUBSCRIBE y espera su SUBACK.
    pub fn suscribir(&mut self, filtro: &str, qos: u8) -> Result<(), FalloDeCanal> {
        let id = self.siguiente_id;
        self.siguiente_id = self.siguiente_id.wrapping_add(1).max(1);
        self.enviar(&paquete_subscribe(id, filtro, qos))?;

        let paquete = self.esperar(SUBACK, Duration::from_secs(10))?;
        let cuerpo = cuerpo_de(&paquete)
            .ok_or_else(|| FalloDeCanal::Protocolo("SUBACK sin cuerpo".to_string()))?;
        // cuerpo = [id_msb, id_lsb, codigo_1, codigo_2...]
        if cuerpo.len() < 3 {
            return Err(FalloDeCanal::Protocolo("SUBACK corto".to_string()));
        }
        let id_recibido = u16::from_be_bytes([cuerpo[0], cuerpo[1]]);
        if id_recibido != id {
            return Err(FalloDeCanal::Protocolo(format!(
                "el SUBACK es del paquete {id_recibido} y se pidio el {id}"
            )));
        }
        // Un solo filtro: un solo codigo. `0x80` es "no autorizado" y los
        // demas valores son el QoS concedido.
        let codigo = cuerpo[2];
        if codigo & 0x80 != 0 {
            return Err(FalloDeCanal::SubackRechazado { codigo });
        }
        Ok(())
    }

    /// PUBLISH QoS 0. No hay acuse: si el broker no lo recibe, no se entera
    /// nadie, y por eso el resultado del bucle nunca da un envio por hecho.
    pub fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal> {
        self.enviar(&paquete_publish(topic, payload))
    }

    /// PINGREQ y espera PINGRESP. Sirve para saber que el canal sigue vivo sin
    /// publicar nada.
    pub fn ping(&mut self) -> Result<(), FalloDeCanal> {
        self.enviar(&paquete_pingreq())?;
        self.esperar(PINGRESP, Duration::from_secs(10))?;
        Ok(())
    }

    /// DISCONNECT limpio. Un canal que se cae sin despedirse deja al broker
    /// creyendo que hay una sesion viva.
    pub fn desconectar(&mut self) {
        if !self.cerrado {
            let _ = self.enviar(&paquete_disconnect());
            let _ = self.ws.close(None);
            let _ = self.ws.flush();
            self.cerrado = true;
        }
    }

    /// Espera un paquete de un tipo concreto, saltando los que no lo son.
    fn esperar(&mut self, tipo: u8, plazo: Duration) -> Result<Vec<u8>, FalloDeCanal> {
        let limite = Instant::now() + plazo;
        loop {
            match self.leer_paquete(plazo.max(Duration::from_millis(50)))? {
                Some(paquete) => {
                    if tipo_de(&paquete) == Some(tipo) {
                        if tipo == CONNACK {
                            self.comprobar_connack(&paquete)?;
                        }
                        return Ok(paquete);
                    }
                    // Otro tipo de paquete antes del esperado: si es un PUBLISH
                    // se devuelve al frente del framer en vez de tirarlo (puede
                    // ser una orden que llega entre el CONNECT y el SUBACK, y
                    // perderla es perder una orden sin decirlo).
                    if tipo_de(&paquete) == Some(PUBLISH) {
                        self.framer.anteponer(&paquete);
                    }
                }
                None => {
                    if Instant::now() >= limite {
                        return Err(FalloDeCanal::SinRespuesta {
                            esperaba: nombre_de_paquete(tipo),
                            plazo_ms: plazo.as_millis() as u64,
                        });
                    }
                }
            }
        }
    }

    fn comprobar_connack(&self, paquete: &[u8]) -> Result<(), FalloDeCanal> {
        let cuerpo = cuerpo_de(paquete)
            .ok_or_else(|| FalloDeCanal::Protocolo("CONNACK sin cuerpo".to_string()))?;
        if cuerpo.len() < 2 {
            return Err(FalloDeCanal::Protocolo("CONNACK corto".to_string()));
        }
        // cuerpo[0] = flags de sesion presente, cuerpo[1] = codigo de retorno.
        let codigo = cuerpo[1];
        if codigo != 0 {
            return Err(FalloDeCanal::ConnackRechazado { codigo });
        }
        Ok(())
    }

    /// Lee el siguiente paquete MQTT completo, si llega dentro del plazo.
    ///
    /// **Aqui esta la trampa 3**: cada mensaje WebSocket se empuja al framer y
    /// solo se devuelve un paquete cuando esta completo. Un CONNACK partido en
    /// cuatro mensajes de un byte produce `None` tres veces y el paquete entero
    /// a la cuarta; nunca `[0x20]` como si fuera un rechazo.
    pub fn leer_paquete(&mut self, plazo: Duration) -> Result<Option<Vec<u8>>, FalloDeCanal> {
        let limite = Instant::now() + plazo;

        loop {
            if let Some(paquete) = self.framer.siguiente() {
                return Ok(Some(paquete));
            }
            if self.framer.excedido() {
                return Err(FalloDeCanal::Protocolo(
                    "el paquete en curso pasa del maximo aceptado".to_string(),
                ));
            }
            if self.cerrado {
                return Err(FalloDeCanal::Cerrado);
            }

            let restante = limite.saturating_duration_since(Instant::now());
            if restante.is_zero() {
                return Ok(None);
            }
            self.ajustar_plazo(restante);

            match self.ws.read() {
                Ok(Message::Binary(bytes)) => {
                    self.framer.empujar(bytes.as_ref());
                }
                Ok(Message::Text(texto)) => {
                    // Un broker puede mandar el paquete como texto si el cliente
                    // no declaro subprotocolo binario. Se acepta: los bytes son
                    // los mismos y el framing MQTT manda.
                    self.framer.empujar(texto.as_bytes());
                }
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
                Ok(Message::Close(_)) => {
                    self.cerrado = true;
                    return Ok(None);
                }
                Ok(Message::Frame(_)) => continue,
                Err(tungstenite::Error::Io(e))
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut =>
                {
                    return Ok(None);
                }
                Err(tungstenite::Error::ConnectionClosed)
                | Err(tungstenite::Error::AlreadyClosed) => {
                    self.cerrado = true;
                    return Ok(None);
                }
                Err(e) => return Err(FalloDeCanal::Transporte(e.to_string())),
            }
        }
    }

    /// Ajusta el plazo de la lectura en curso.
    ///
    /// Sin esto, `leer_paquete(200ms)` esperaria los 10 s del handshake. El
    /// plazo se pone en el TCP (dentro del transporte), que es quien bloquea.
    fn ajustar_plazo(&mut self, plazo: Duration) {
        // Ni menos de 50 ms (un plazo imposible devuelve `WouldBlock` siempre y
        // el bucle giraria en vacio) ni mas de 30 s (un canal colgado tiene que
        // doler antes).
        let plazo = plazo.clamp(Duration::from_millis(50), Duration::from_secs(30));
        self.ws.get_mut().fijar_plazo(plazo);
    }
}

/// Nombre legible de un tipo de paquete, para los mensajes de "no llego".
pub fn nombre_de_paquete(tipo: u8) -> &'static str {
    match tipo {
        CONNECT => "CONNECT",
        CONNACK => "CONNACK",
        PUBLISH => "PUBLISH",
        SUBSCRIBE => "SUBSCRIBE",
        SUBACK => "SUBACK",
        PINGREQ => "PINGREQ",
        PINGRESP => "PINGRESP",
        DISCONNECT => "DISCONNECT",
        _ => "un paquete",
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn la_url_no_pierde_ni_el_path_ni_la_llave() {
        let destino = partir_url("wss://enki-ai.online/mqtt?k=secreta").expect("url valida");
        assert_eq!(destino.host, "enki-ai.online");
        assert_eq!(destino.puerto, 443);
        // La parte que los clientes de libreria tiran: aqui se conserva entera.
        assert_eq!(destino.ruta, "/mqtt?k=secreta");
        assert_eq!(destino.autoridad(), "enki-ai.online");

        let con_puerto = partir_url("wss://bus.local:9001/mqtt").expect("url valida");
        assert_eq!(con_puerto.puerto, 9001);
        assert_eq!(con_puerto.ruta, "/mqtt");
        assert_eq!(con_puerto.autoridad(), "bus.local:9001");
    }

    #[test]
    fn un_bus_sin_tls_se_rechaza_con_su_nombre() {
        assert!(matches!(
            partir_url("ws://enki-ai.online/mqtt"),
            Err(FalloDeCanal::UrlNoSegura(_))
        ));
        assert!(matches!(partir_url("enki-ai.online/mqtt"), Err(FalloDeCanal::UrlInvalida(_))));
        // Un usuario/clave embebidos no se aceptan: la llave va en la query.
        assert!(matches!(
            partir_url("wss://usuario:clave@enki-ai.online/mqtt"),
            Err(FalloDeCanal::UrlInvalida(_))
        ));
    }

    #[test]
    fn la_llave_se_compone_una_sola_vez() {
        assert_eq!(
            url_con_llave("wss://enki-ai.online/mqtt", "abc"),
            "wss://enki-ai.online/mqtt?k=abc"
        );
        assert_eq!(
            url_con_llave("wss://enki-ai.online/mqtt?x=1", "abc"),
            "wss://enki-ai.online/mqtt?x=1&k=abc"
        );
        // Si la url ya trae llave, manda la de la url: dos `k` es una llave que
        // el otro lado lee distinto que nosotros.
        assert_eq!(
            url_con_llave("wss://enki-ai.online/mqtt?k=de-la-url", "otra"),
            "wss://enki-ai.online/mqtt?k=de-la-url"
        );
    }
}
