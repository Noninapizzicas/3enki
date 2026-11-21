//! `puente` — CLI de escritorio del aparato.
//!
//! Tres cosas, y ninguna finge mas de lo que el crate sabe hacer:
//!
//! ```text
//! puente --comprobar <cuenta_esperada> <cuenta_visible>   U1, sin bus y sin aparato
//! puente --simular --llave <k> --url <wss://...>           abre el canal y NO ejecuta nada
//! puente --orden '<json>' --simular                        atiende UNA orden en seco
//! ```
//!
//! # Por que `--simular` con el canal no ejecuta nada
//!
//! Porque la mano no esta en este binario: el arbol de accesibilidad y los
//! gestos viven en la capa Android. `--simular` sirve para lo que si se puede
//! comprobar en un servidor —que la llave vale, que el handshake lleva el
//! subprotocolo `mqtt`, que el CONNACK llega entero y que la suscripcion se
//! concede— sin poder tocar una cuenta real ni por accidente. Si alguna vez
//! ejecutara una orden, este comando seria la forma mas comoda de publicar en
//! produccion desde una terminal.
//!
//! # Codigos de salida
//!
//! ```text
//! 0 = lo que se pidio se hizo y se puede operar
//! 1 = parada / rechazo (cuenta ajena, canal no operativo, orden no atendida)
//! 2 = uso incorrecto
//! ```
//!
//! El binario falla cerrado, igual que la libreria: cualquier cosa que no sea
//! una comprobacion positiva sale con 1.

use std::process::ExitCode;
use std::time::Duration;

use enki_instagram_bridge::canal::bucle::{
    atender, ManoAusente, Orden, ACCION_OBSERVAR, TOPIC_ORDENES, TOPIC_RESULTADO,
};
use enki_instagram_bridge::canal::mqtt::{self, url_con_llave, Canal};
use enki_instagram_bridge::mano::exclusividad::{comprobar, HechoVisible, Mirada};
use enki_instagram_bridge::VERSION;

const USO: &str = "uso:
  puente --comprobar <cuenta_esperada> <cuenta_visible>
  puente --simular --llave <llave> [--url <wss://host/mqtt>]
  puente --orden '<json>'                       atiende UNA orden en seco (no conecta)";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.is_empty() {
        println!("puente {VERSION} — escritorio (sin capa Android todavia)");
        println!("{USO}");
        return ExitCode::SUCCESS;
    }

    // `--comprobar` se queda exactamente como estaba: es el banco de pruebas de
    // U1 y no tiene nada que ver con el canal.
    if args[0] == "--comprobar" {
        return comprobar_exclusividad(&args[1..]);
    }

    match parsear(&args) {
        Ok(opciones) => ejecutar(opciones),
        Err(motivo) => {
            eprintln!("{motivo}");
            eprintln!("{USO}");
            ExitCode::from(2)
        }
    }
}

// ---------------------------------------------------------------------------
// U1 (lo que ya hacia)
// ---------------------------------------------------------------------------

fn comprobar_exclusividad(args: &[String]) -> ExitCode {
    match args {
        [esperada, visible] => {
            let hecho = if visible.trim().is_empty() {
                HechoVisible::nueva(None, Mirada::Completa)
            } else {
                HechoVisible::completa(visible)
            };
            let c = comprobar(esperada, &hecho);
            println!(
                "veredicto={} motivo={} permite_operar={} esperada={} visible={}",
                c.veredicto.como_str(),
                c.motivo.como_str(),
                c.permite_operar(),
                c.esperada.as_deref().unwrap_or("-"),
                c.visible.as_deref().unwrap_or("-")
            );
            if c.permite_operar() {
                ExitCode::SUCCESS
            } else {
                eprintln!("{}", c.motivo.descripcion());
                ExitCode::FAILURE
            }
        }
        _ => {
            eprintln!("{USO}");
            ExitCode::from(2)
        }
    }
}

// ---------------------------------------------------------------------------
// Las opciones del canal
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct Opciones {
    simular: bool,
    orden: Option<String>,
    llave: Option<String>,
    url: Option<String>,
}

fn parsear(args: &[String]) -> Result<Opciones, String> {
    let mut opciones = Opciones::default();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--simular" => {
                opciones.simular = true;
                i += 1;
            }
            "--orden" => {
                let valor = args
                    .get(i + 1)
                    .ok_or_else(|| "--orden necesita el json de la orden".to_string())?;
                opciones.orden = Some(valor.clone());
                i += 2;
            }
            "--llave" => {
                let valor = args
                    .get(i + 1)
                    .ok_or_else(|| "--llave necesita la llave del bus".to_string())?;
                opciones.llave = Some(valor.clone());
                i += 2;
            }
            "--url" => {
                let valor = args
                    .get(i + 1)
                    .ok_or_else(|| "--url necesita una url wss://".to_string())?;
                opciones.url = Some(valor.clone());
                i += 2;
            }
            otro => return Err(format!("opcion desconocida: {otro}")),
        }
    }
    Ok(opciones)
}

fn ejecutar(opciones: Opciones) -> ExitCode {
    match opciones.orden {
        // Una orden en seco: se valida y se atiende por el MISMO codigo que el
        // bucle. El resultado se imprime tal cual se publicaria.
        Some(json) => {
            if opciones.llave.is_some() || opciones.url.is_some() {
                // El CLI no manda ordenes al bus: eso lo hace el bucle, con el
                // resultado de vuelta. Aceptar `--llave` aqui en silencio haria
                // creer que la orden se envio.
                eprintln!("nota: --llave/--url no se usan con --orden: la orden se atiende en seco");
            }
            orden_en_seco(&json)
        }
        None => abrir_canal(&opciones),
    }
}

// ---------------------------------------------------------------------------
// `--orden '<json>' [--simular]`
// ---------------------------------------------------------------------------

fn orden_en_seco(json: &str) -> ExitCode {
    // Se valida y se atiende por el MISMO codigo que el bucle: la validacion y
    // el par de fallo no se reimplementan aqui.
    let resultado = atender(json, &mut ManoAusente::nueva());
    println!("{}", resultado.a_json());

    if resultado.ok {
        eprintln!("orden atendida: {resultado}");
        return ExitCode::SUCCESS;
    }

    // El diagnostico para quien esta en la terminal, distinto del payload: el
    // payload dice QUE paso, esto dice que hacer con ello.
    match Orden::desde_payload(json) {
        Err(fallo) => eprintln!("orden rechazada: {fallo}"),
        // `observar` no pasa por el veto de simulacion (es lectura pura): el
        // diagnostico que habla de "no se toco nada" no aplica, y decirlo seria
        // mentir sobre lo que hizo el binario.
        Ok(orden) if orden.accion == ACCION_OBSERVAR => eprintln!(
            "lectura pedida: este binario no tiene arbol de accesibilidad, asi que no hay volcado (sin_mano)"
        ),
        Ok(orden) if !orden.simulacion => eprintln!(
            "la orden pide ejecucion real (simulacion:false) y este binario solo tiene la mano simulada: no se toco nada"
        ),
        Ok(_) => eprintln!("orden atendida en seco: {resultado}"),
    }

    // `ok:false` es lo que viajaria al bus: el CLI sale 1, nunca mas optimista
    // que su propio payload.
    ExitCode::FAILURE
}

// ---------------------------------------------------------------------------
// `--simular --llave <k> [--url <wss://...>]`
// ---------------------------------------------------------------------------

const URL_POR_DEFECTO: &str = "wss://enki-ai.online/mqtt";

fn abrir_canal(opciones: &Opciones) -> ExitCode {
    let llave = match opciones.llave.as_deref() {
        Some(l) if !l.trim().is_empty() => l,
        _ => {
            eprintln!("--simular sin --orden necesita la llave del bus (--llave <k>)");
            eprintln!("{USO}");
            return ExitCode::from(2);
        }
    };

    let base = opciones.url.as_deref().unwrap_or(URL_POR_DEFECTO);
    let url = url_con_llave(base, llave);

    // Solo se imprime la url sin la query: la llave no va a un log.
    println!("canal: conectando a {} (llave en la query)", sin_query(&url));

    let cliente_id = format!("enki-puente-{VERSION}-escritorio");
    let mut canal = match Canal::conectar(&url, &cliente_id) {
        Ok(canal) => canal,
        Err(e) => {
            eprintln!("canal NO operativo: {e}");
            return ExitCode::FAILURE;
        }
    };
    println!("canal: CONNACK aceptado (cliente_id={})", canal.cliente_id());

    if let Err(e) = canal.suscribir(TOPIC_ORDENES, 0) {
        eprintln!("canal: no se pudo suscribir a {TOPIC_ORDENES}: {e}");
        canal.desconectar();
        return ExitCode::FAILURE;
    }
    println!("canal: suscrito a {TOPIC_ORDENES}");

    if let Err(e) = canal.ping() {
        eprintln!("canal: el PINGREQ no volvio: {e}");
        canal.desconectar();
        return ExitCode::FAILURE;
    }
    println!("canal: PINGRESP recibido (el broker contesta)");

    // Ni una orden se ejecuta aqui. Se mira si llega algo, se dice QUE llego y
    // se va: es la comprobacion de que el canal sirve, no un modo de operacion.
    println!("canal: escuchando 5 s sin ejecutar nada (Ctrl-C para salir antes)");
    let limite = std::time::Instant::now() + Duration::from_secs(5);
    let mut vistos = 0u32;
    while std::time::Instant::now() < limite {
        match canal.leer_paquete(Duration::from_millis(500)) {
            Ok(Some(paquete)) => match mqtt::leer_publish(&paquete) {
                Some(publicacion) => {
                    vistos += 1;
                    let texto = String::from_utf8_lossy(&publicacion.payload);
                    println!(
                        "canal: llegaria una orden en {} ({} bytes) — NO se ejecuta: {}",
                        publicacion.topic,
                        publicacion.payload.len(),
                        recortar(&texto, 120)
                    );
                }
                None => {
                    println!(
                        "canal: paquete tipo {} (no es una orden)",
                        mqtt::nombre_de_paquete(mqtt::tipo_de(&paquete).unwrap_or(0))
                    );
                }
            },
            Ok(None) => continue,
            Err(e) => {
                eprintln!("canal: se rompio leyendo: {e}");
                canal.desconectar();
                return ExitCode::FAILURE;
            }
        }
    }

    canal.desconectar();
    println!(
        "canal: cerrado limpiamente. ordenes vistas={vistos}; nada se ejecuto (resultado iria a {TOPIC_RESULTADO})"
    );
    ExitCode::SUCCESS
}

/// La url sin su query, para poder imprimirla sin la llave dentro.
fn sin_query(url: &str) -> &str {
    match url.find('?') {
        Some(i) => &url[..i],
        None => url,
    }
}

fn recortar(texto: &str, maximo: usize) -> String {
    let limpio = texto.replace('\n', " ");
    if limpio.chars().count() <= maximo {
        limpio
    } else {
        let recorte: String = limpio.chars().take(maximo).collect();
        format!("{recorte}...")
    }
}
