//! Canal con el bus de Enki.
//!
//! Se habla MQTT 3.1.1 sobre WebSocket seguro contra la ruta publica del broker
//! (`wss://<host>/mqtt?k=<llave>`), que es el mismo camino del panel de cocina.
//!
//! Se usa un cliente MQTT minimo escrito aqui (CONNECT / SUBSCRIBE / PUBLISH /
//! PINGREQ sobre QoS 0) porque los clientes ya hechos descartan el path y la
//! query de la URL, y la llave viaja en la query.
use async_tungstenite::tungstenite::client::IntoClientRequest;
use async_tungstenite::tungstenite::Message;
use futures_util::StreamExt;

/// Topic donde Enki deja las ordenes para este movil.
pub const TOPIC_ORDENES: &str = "core/core-a/events/bridge/orden/#";
/// Topic donde el movil publica lo que ha hecho.
pub const TOPIC_RESULTADOS: &str = "core/core-a/events/bridge/resultado";

/// Mensaje que llega del bus.
#[derive(Debug, Clone)]
pub struct Recibido {
    pub topic: String,
    pub payload: Vec<u8>,
}

/// Sesion viva contra el broker.
pub struct Sesion {
    ws: async_tungstenite::WebSocketStream<
        async_tungstenite::tokio::ConnectStream,
    >,
    siguiente_id: u16,
    /// Bytes recibidos que aun no forman un paquete MQTT completo.
    ///
    /// Algunos brokers WebSocket entregan cada byte en su propio frame, asi que
    /// el framing MQTT no puede asumir un paquete por mensaje.
    buffer: Vec<u8>,
}

impl Sesion {
    /// Abre el WebSocket seguro y completa el handshake MQTT.
    pub async fn abrir(url: &str, id_cliente: &str) -> Result<Self, String> {
        let mut peticion = url.into_client_request().map_err(|e| format!("URL invalida: {e}"))?;
        // El broker exige el subprotocolo "mqtt" en el handshake.
        peticion
            .headers_mut()
            .insert("Sec-WebSocket-Protocol", "mqtt".parse().map_err(|_| "cabecera invalida")?);

        let (mut ws, _respuesta) = async_tungstenite::tokio::connect_async(peticion)
            .await
            .map_err(|e| format!("no se pudo abrir el WebSocket: {e}"))?;

        ws.send(Message::Binary(paquete_connect(id_cliente).into()))
            .await
            .map_err(|e| format!("fallo enviando CONNECT: {e}"))?;

        // Esperar CONNACK (0x20) antes de dar la sesion por buena.
        let mut buffer: Vec<u8> = Vec::new();
        loop {
            if let Some(paquete) = extraer_paquete(&mut buffer) {
                if paquete.first().map(|b| b >> 4) != Some(2) {
                    continue;
                }
                let codigo = paquete.get(3).copied().unwrap_or(0);
                if codigo != 0 {
                    return Err(format!("el broker rechazo la conexion (codigo {codigo})"));
                }
                return Ok(Self { ws, siguiente_id: 1, buffer });
            }
            match ws.next().await {
                Some(Ok(Message::Binary(bytes))) => buffer.extend_from_slice(&bytes),
                Some(Ok(_)) => continue,
                Some(Err(e)) => return Err(format!("error en el handshake: {e}")),
                None => return Err("el broker cerro la conexion durante el handshake".into()),
            }
        }
    }

    /// Se suscribe a un filtro de topic (QoS 0).
    pub async fn suscribir(&mut self, filtro: &str) -> Result<(), String> {
        let id = self.siguiente_id;
        self.siguiente_id = self.siguiente_id.wrapping_add(1).max(1);
        self.ws
            .send(Message::Binary(paquete_subscribe(id, filtro).into()))
            .await
            .map_err(|e| format!("fallo enviando SUBSCRIBE: {e}"))
    }

    /// Publica un mensaje (QoS 0).
    pub async fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), String> {
        self.ws
            .send(Message::Binary(paquete_publish(topic, payload).into()))
            .await
            .map_err(|e| format!("fallo enviando PUBLISH: {e}"))
    }

    /// Espera el siguiente mensaje. Devuelve `None` si el socket se cerro.
    ///
    /// Los PINGRESP y los ACK se ignoran: el llamador solo ve PUBLISH reales.
    pub async fn siguiente(&mut self) -> Option<Result<Recibido, String>> {
        loop {
            if let Some(paquete) = extraer_paquete(&mut self.buffer) {
                match paquete.first()? >> 4 {
                    3 => match leer_publish(&paquete) {
                        Some(r) => return Some(Ok(r)),
                        None => return Some(Err("PUBLISH malformado".into())),
                    },
                    _ => continue,
                }
            }
            match self.ws.next().await {
                Some(Ok(Message::Binary(bytes))) => self.buffer.extend_from_slice(&bytes),
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => continue,
                Some(Ok(Message::Close(_))) | None => return None,
                Some(Ok(_)) => continue,
                Some(Err(e)) => return Some(Err(format!("error de socket: {e}"))),
            }
        }
    }
}

/// CONNECT (MQTT 3.1.1, clean session, keepalive 30).
fn paquete_connect(id_cliente: &str) -> Vec<u8> {
    let mut cuerpo = Vec::new();
    escribir_cadena(&mut cuerpo, "MQTT");
    cuerpo.push(4); // nivel 3.1.1
    cuerpo.push(0b0000_0010); // clean session
    cuerpo.extend_from_slice(&30u16.to_be_bytes()); // keepalive
    escribir_cadena(&mut cuerpo, id_cliente);

    let mut paquete = vec![0x10];
    escribir_longitud(&mut paquete, cuerpo.len());
    paquete.extend_from_slice(&cuerpo);
    paquete
}

/// SUBSCRIBE (QoS 0).
fn paquete_subscribe(id: u16, filtro: &str) -> Vec<u8> {
    let mut cuerpo = Vec::new();
    cuerpo.extend_from_slice(&id.to_be_bytes());
    escribir_cadena(&mut cuerpo, filtro);
    cuerpo.push(0); // QoS 0

    let mut paquete = vec![0x82];
    escribir_longitud(&mut paquete, cuerpo.len());
    paquete.extend_from_slice(&cuerpo);
    paquete
}

/// PUBLISH (QoS 0).
fn paquete_publish(topic: &str, payload: &[u8]) -> Vec<u8> {
    let mut cuerpo = Vec::new();
    escribir_cadena(&mut cuerpo, topic);
    cuerpo.extend_from_slice(payload);

    let mut paquete = vec![0x30];
    escribir_longitud(&mut paquete, cuerpo.len());
    paquete.extend_from_slice(&cuerpo);
    paquete
}

fn escribir_cadena(destino: &mut Vec<u8>, texto: &str) {
    destino.extend_from_slice(&(texto.len() as u16).to_be_bytes());
    destino.extend_from_slice(texto.as_bytes());
}

/// Longitud variable de MQTT (7 bits por byte, el ultimo con el bit alto).
fn escribir_longitud(destino: &mut Vec<u8>, mut valor: usize) {
    loop {
        let mut byte = (valor % 128) as u8;
        valor /= 128;
        if valor > 0 {
            byte |= 0x80;
        }
        destino.push(byte);
        if valor == 0 {
            break;
        }
    }
}

/// Extrae un paquete MQTT completo del buffer, si ya lo esta.
///
/// Devuelve `None` mientras falten bytes. El paquete devuelto incluye la
/// cabecera fija y la longitud variable.
fn extraer_paquete(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    if buffer.len() < 2 {
        return None;
    }

    // Calcular cuanto ocupa la longitud variable.
    let mut i = 1;
    let mut longitud: usize = 0;
    let mut multiplicador: usize = 1;
    loop {
        let b = *buffer.get(i)?;
        longitud += (b & 0x7F) as usize * multiplicador;
        multiplicador *= 128;
        i += 1;
        if b & 0x80 == 0 {
            break;
        }
        if i > 4 {
            return None; // longitud invalida
        }
    }

    let total = i + longitud;
    if buffer.len() < total {
        return None;
    }

    let paquete: Vec<u8> = buffer.drain(..total).collect();
    Some(paquete)
}

/// Lee un PUBLISH ya completo (cabecera fija + longitud + resto).
fn leer_publish(bytes: &[u8]) -> Option<Recibido> {
    let qos = (bytes.first()? >> 1) & 0x03;
    let mut i = 1;
    // Saltar la longitud variable.
    loop {
        let b = *bytes.get(i)?;
        i += 1;
        if b & 0x80 == 0 {
            break;
        }
    }
    let largo_topic = u16::from_be_bytes([*bytes.get(i)?, *bytes.get(i + 1)?]) as usize;
    i += 2;
    let topic = String::from_utf8(bytes.get(i..i + largo_topic)?.to_vec()).ok()?;
    i += largo_topic;
    if qos > 0 {
        i += 2; // id de paquete
    }
    let payload = bytes.get(i..)?.to_vec();
    Some(Recibido { topic, payload })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_longitud_variable_usa_7_bits_por_byte() {
        let mut v = Vec::new();
        escribir_longitud(&mut v, 0);
        assert_eq!(v, vec![0]);
        v.clear();
        escribir_longitud(&mut v, 128);
        assert_eq!(v, vec![0x80, 0x01]);
    }

    #[test]
    fn un_publish_se_lee_de_vuelta() {
        let paquete = paquete_publish("a/b", b"hola");
        let r = leer_publish(&paquete).expect("debe leer");
        assert_eq!(r.topic, "a/b");
        assert_eq!(r.payload, b"hola");
    }

    #[test]
    fn el_framer_espera_al_paquete_completo() {
        let paquete = paquete_publish("a", b"xy");
        let mut buffer = vec![paquete[0], paquete[1]];
        assert!(extraer_paquete(&mut buffer).is_none(), "faltan bytes");
        buffer.extend_from_slice(&paquete[2..]);
        let completo = extraer_paquete(&mut buffer).expect("ya esta completo");
        assert_eq!(completo, paquete);
        assert!(buffer.is_empty());
    }

    #[test]
    fn el_connect_lleva_el_protocolo_mqtt() {
        let p = paquete_connect("x");
        assert_eq!(p[0], 0x10);
        assert!(p.windows(4).any(|w| w == b"MQTT"));
    }
}
