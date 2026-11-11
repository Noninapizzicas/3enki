//! El bucle de ordenes del canal: `bridge/orden` -> la mano -> `bridge/resultado`.
//!
//! # El contrato (el de la skill, sin inventar campos)
//!
//! ```text
//! core/core-a/events/bridge/orden/#      Enki -> aparato   (ordenes)
//! core/core-a/events/bridge/resultado    aparato -> Enki   (resultados)
//!
//! {"accion":"publicar","red":"instagram","texto":"...",
//!  "archivo":"/sdcard/f.jpg","simulacion":true}
//! ```
//!
//! # Las tres reglas de este fichero
//!
//! 1. **Una orden que no se entiende no se ejecuta y se contesta.** El payload
//!    se valida contra un catalogo **cerrado** de acciones y de redes: una
//!    `accion` desconocida no se degrada a `publicar` por comodidad, se nombra
//!    (`accion_fuera_del_catalogo`). Un payload que no es JSON tampoco se
//!    adivina: `json_invalido`.
//! 2. **La mano solo se mueve si `simulacion != false`.** Ausente se lee como
//!    simulacion: ejecutar de verdad sin que nadie lo haya pedido es
//!    irreversible, simular de mas solo cuesta un mensaje.
//! 3. **Siempre par de fallo.** Un resultado es `{ok, motivo}` y **nunca** sale
//!    `ok:true` de una simulacion: si nada salio del aparato, decir "hecho" es
//!    mentir. La unica forma de `ok:true` es que la mano confirme la
//!    publicacion con su postcondicion vista (`publicado`), y eso hoy no puede
//!    pasar en este binario: aqui no hay arbol ni gestos.
//!
//! # Lo que este fichero NO hace
//!
//!   - **No decide si se puede publicar.** Ritmo, autonomia, ventana, recetas
//!     y permisos son del cerebro y del regulador (bloques 7 y 9). Aqui se
//!     obedece una orden que ya paso por alli: si el bucle empezara a decidir,
//!     habria dos politicas y la del aparato ganaria por estar mas cerca.
//!   - **No ejecuta gestos.** Los pide a `ManoDeOrdenes` (A3 detras). En este
//!     binario de escritorio la unica mano es `ManoAusente`, que lo dice con su
//!     nombre en vez de fingir que toco algo.
//!   - **No reintenta.** Un PUBLISH de resultado en QoS 0 no tiene acuse; un
//!     reintento ciego duplicaria resultados. El cerebro que no lo reciba pedira
//!     otra orden, y esa decision es suya.

use crate::canal::json::{self, Valor};
use crate::canal::mqtt::{Canal, FalloDeCanal, PublicacionRecibida};

/// La suscripcion del aparato: todas las ordenes del bridge.
pub const TOPIC_ORDENES: &str = "core/core-a/events/bridge/orden/#";

/// El prefijo que tiene que llevar el topic de un mensaje para ser una orden.
///
/// Un mensaje que llegue por otro sitio (un `#` mal puesto en el broker, por
/// ejemplo) **no se ejecuta**: se cuenta como ignorado.
pub const PREFIJO_ORDENES: &str = "core/core-a/events/bridge/orden/";

/// Donde se contesta. Un solo topic: el aparato no elige destinatario.
pub const TOPIC_RESULTADO: &str = "core/core-a/events/bridge/resultado";

/// El catalogo CERRADO de acciones (espejo del contrato de la skill).
///
/// Hoy solo hay `publicar`. Añadir una accion es una decision de contrato, no un
/// `match` mas: si estuviera abierta, una orden con `accion:"borrar_todo"` seria
/// representable y alguien acabaria mapeandola a lo que hubiera a mano.
pub const ACCIONES: &[&str] = &["publicar"];

/// Las plataformas que este crate opera. Es un crate de Instagram: una orden
/// para otra red no es "casi esto", es una orden que no se sabe hacer.
pub const REDES: &[&str] = &["instagram"];

/// El motivo con el que se contesta una simulacion. Nunca se omite: quien lea
/// `ok:false` tiene que poder saber si fallo algo o si nadie apreto el boton.
pub const MOTIVO_SIMULACION: &str = "simulacion";

/// El motivo con el que se contesta una orden que pide ejecucion real en un
/// binario que no la tiene.
pub const MOTIVO_SIN_MANO_REAL: &str = "ejecucion_real_no_habilitada";

// ---------------------------------------------------------------------------
// La orden (lo que entra)
// ---------------------------------------------------------------------------

/// Una orden ya validada.
///
/// Que exista este tipo es la mitad de la garantia: si `atender` llega a tener
/// una `Orden`, el payload paso el catalogo cerrado y los tipos. No hay ninguna
/// rama que construya una `Orden` a medias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Orden {
    /// El identificador que puso el cerebro, si lo puso. Sin el, una respuesta
    /// no se puede emparejar con su orden; se conserva tal cual y vacio si no
    /// venia, en vez de inventar uno.
    pub id: String,
    pub accion: String,
    pub red: String,
    pub texto: String,
    /// Ruta del fichero a publicar, si la orden la trae.
    pub archivo: Option<String>,
    /// Modo seco. Ausente = `true` (ver la regla 2 de arriba).
    pub simulacion: bool,
}

impl Orden {
    /// Valida un payload de texto contra el contrato.
    pub fn desde_payload(payload: &str) -> Result<Orden, FalloDeOrden> {
        let valor = json::leer(payload).map_err(|e| FalloDeOrden::JsonInvalido(e.to_string()))?;
        Orden::desde_valor(&valor)
    }

    /// Valida un payload ya parseado.
    pub fn desde_valor(valor: &Valor) -> Result<Orden, FalloDeOrden> {
        if !matches!(valor, Valor::Objeto(_)) {
            return Err(FalloDeOrden::PayloadNoObjeto { tipo: valor.tipo() });
        }

        let accion = texto_obligatorio(valor, "accion")?;
        if !ACCIONES.contains(&accion.as_str()) {
            return Err(FalloDeOrden::AccionFueraDelCatalogo { accion });
        }

        let red = texto_obligatorio(valor, "red")?;
        if !REDES.contains(&red.as_str()) {
            return Err(FalloDeOrden::RedDesconocida { red });
        }

        let texto = texto_obligatorio(valor, "texto")?;

        let archivo = match valor.obtener("archivo") {
            None | Some(Valor::Nulo) => None,
            Some(Valor::Texto(t)) if t.trim().is_empty() => {
                return Err(FalloDeOrden::CampoVacio { campo: "archivo" })
            }
            Some(Valor::Texto(t)) => Some(t.clone()),
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "archivo",
                    esperaba: "texto o nulo",
                    llego: otro.tipo(),
                })
            }
        };

        // Ausente = simulacion. Presente tiene que ser un booleano de verdad: el
        // texto "false" no es `false` y tratarlo como tal es como se ejecuta lo
        // que no se pidio.
        let simulacion = match valor.obtener("simulacion") {
            None | Some(Valor::Nulo) => true,
            Some(Valor::Bool(b)) => *b,
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "simulacion",
                    esperaba: "booleano",
                    llego: otro.tipo(),
                })
            }
        };

        let id = match valor.obtener("id").or_else(|| valor.obtener("orden_id")) {
            None | Some(Valor::Nulo) => String::new(),
            Some(Valor::Texto(t)) => t.clone(),
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "id",
                    esperaba: "texto",
                    llego: otro.tipo(),
                })
            }
        };

        Ok(Orden { id, accion, red, texto, archivo, simulacion })
    }
}

fn texto_obligatorio(valor: &Valor, campo: &'static str) -> Result<String, FalloDeOrden> {
    match valor.obtener(campo) {
        None => Err(FalloDeOrden::CampoAusente { campo }),
        Some(Valor::Texto(t)) if t.trim().is_empty() => Err(FalloDeOrden::CampoVacio { campo }),
        Some(Valor::Texto(t)) => Ok(t.clone()),
        Some(otro) => Err(FalloDeOrden::CampoDeTipoEquivocado {
            campo,
            esperaba: "texto",
            llego: otro.tipo(),
        }),
    }
}

/// Por que una orden no se acepto. Todas las variantes llevan el nombre del
/// campo o del valor: "payload invalido" a secas no se puede arreglar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeOrden {
    JsonInvalido(String),
    PayloadNoObjeto { tipo: &'static str },
    CampoAusente { campo: &'static str },
    CampoVacio { campo: &'static str },
    CampoDeTipoEquivocado { campo: &'static str, esperaba: &'static str, llego: &'static str },
    AccionFueraDelCatalogo { accion: String },
    RedDesconocida { red: String },
}

impl FalloDeOrden {
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeOrden::JsonInvalido(_) => "json_invalido",
            FalloDeOrden::PayloadNoObjeto { .. } => "payload_no_objeto",
            FalloDeOrden::CampoAusente { .. } => "campo_ausente",
            FalloDeOrden::CampoVacio { .. } => "campo_vacio",
            FalloDeOrden::CampoDeTipoEquivocado { .. } => "campo_de_tipo_equivocado",
            FalloDeOrden::AccionFueraDelCatalogo { .. } => "accion_fuera_del_catalogo",
            FalloDeOrden::RedDesconocida { .. } => "red_desconocida",
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDeOrden::JsonInvalido(motivo) => format!("el payload no es json: {motivo}"),
            FalloDeOrden::PayloadNoObjeto { tipo } => {
                format!("el payload tiene que ser un objeto y llego un {tipo}")
            }
            FalloDeOrden::CampoAusente { campo } => format!("a la orden le falta '{campo}'"),
            FalloDeOrden::CampoVacio { campo } => format!("la orden trae '{campo}' en blanco"),
            FalloDeOrden::CampoDeTipoEquivocado { campo, esperaba, llego } => format!(
                "el campo '{campo}' tenia que ser {esperaba} y llego un {llego}"
            ),
            FalloDeOrden::AccionFueraDelCatalogo { accion } => format!(
                "la accion '{accion}' no esta en el catalogo ({})",
                ACCIONES.join(", ")
            ),
            FalloDeOrden::RedDesconocida { red } => {
                format!("la red '{red}' no es de este crate ({})", REDES.join(", "))
            }
        }
    }
}

impl std::fmt::Display for FalloDeOrden {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// La mano (el puerto hacia A3)
// ---------------------------------------------------------------------------

/// Lo que la mano devuelve despues de intentar una orden.
///
/// `publicado` es la unica afirmacion fuerte y solo puede venir de una
/// postcondicion vista (O1/O2). `ejecutado` sin `publicado` es "se corrieron
/// pasos y no se puede afirmar el resultado".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HechoDeMano {
    pub ejecutado: bool,
    pub publicado: bool,
    /// Gestos entregados al aparato: los que pudieron cambiar el mundo.
    pub gestos: u64,
    pub motivo: Option<String>,
    pub detalle: Option<String>,
}

impl HechoDeMano {
    /// La mano no llego a hacer nada, y lo dice.
    pub fn nada(motivo: impl Into<String>, detalle: impl Into<String>) -> Self {
        Self {
            ejecutado: false,
            publicado: false,
            gestos: 0,
            motivo: Some(motivo.into()),
            detalle: Some(detalle.into()),
        }
    }
}

/// El puerto hacia la mano (A3 detras).
///
/// En el aparato lo implementa la capa Android (arbol de accesibilidad + gestos).
/// En este binario, `ManoAusente`: no hay arbol que mirar en un servidor, y una
/// mano que no mira no puede tocar.
pub trait ManoDeOrdenes {
    fn ejecutar(&mut self, orden: &Orden) -> HechoDeMano;
}

/// La mano del escritorio: no hay.
///
/// Existe para que el bucle tenga siempre una mano enchufada y para que el
/// resultado lleve el motivo correcto (`sin_mano`) en vez de un `ok:true`
/// optimista. Cuando la capa Android llegue, se cambia esta pieza y nada mas.
#[derive(Debug, Clone, Default)]
pub struct ManoAusente;

impl ManoAusente {
    pub fn nueva() -> Self {
        Self
    }
}

impl ManoDeOrdenes for ManoAusente {
    fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
        HechoDeMano::nada(
            "sin_mano",
            "este binario no tiene arbol de accesibilidad ni gestos: la mano vive en la capa Android",
        )
    }
}

// ---------------------------------------------------------------------------
// El resultado (lo que sale)
// ---------------------------------------------------------------------------

/// El resultado que se publica en `bridge/resultado`.
///
/// `ok` y `motivo` van **siempre los dos** en el JSON (motivo `null` cuando
/// `ok:true`): un resultado sin motivo es un resultado que no se puede auditar
/// cuando sale mal, y el par es lo que impide leer un fallo como un exito.
///
/// `simulacion` significa "no salio nada de este aparato hacia la red", y por
/// eso es `true` tambien cuando la orden ni se entendio: un payload invalido no
/// es una ejecucion real por mucho que la pidiera.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resultado {
    pub id: String,
    pub accion: String,
    pub red: String,
    pub ok: bool,
    pub simulacion: bool,
    pub motivo: Option<String>,
    pub detalle: Option<String>,
    pub gestos: u64,
}

impl Resultado {
    /// Un fallo con nombre y detalle. La unica forma de construirlo es esta:
    /// no hay `Resultado::ok()` que se pueda llamar sin prueba.
    pub fn fallo(
        id: impl Into<String>,
        accion: impl Into<String>,
        red: impl Into<String>,
        simulacion: bool,
        motivo: impl Into<String>,
        detalle: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            accion: accion.into(),
            red: red.into(),
            ok: false,
            simulacion,
            motivo: Some(motivo.into()),
            detalle: Some(detalle.into()),
            gestos: 0,
        }
    }

    /// JSON del resultado. El orden de las claves es fijo (ver `json::Valor`).
    pub fn a_json(&self) -> String {
        let texto = |v: &Option<String>| match v {
            Some(t) => Valor::Texto(t.clone()),
            None => Valor::Nulo,
        };
        Valor::objeto(vec![
            ("id", Valor::Texto(self.id.clone())),
            ("accion", Valor::Texto(self.accion.clone())),
            ("red", Valor::Texto(self.red.clone())),
            ("ok", Valor::Bool(self.ok)),
            ("simulacion", Valor::Bool(self.simulacion)),
            ("motivo", texto(&self.motivo)),
            ("detalle", texto(&self.detalle)),
            ("gestos", Valor::Numero(self.gestos as f64)),
        ])
        .a_texto()
    }
}

impl std::fmt::Display for Resultado {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "orden {} {} ok={} simulacion={} motivo={} gestos={}",
            if self.id.is_empty() { "-" } else { &self.id },
            self.accion,
            self.ok,
            self.simulacion,
            self.motivo.as_deref().unwrap_or("-"),
            self.gestos
        )
    }
}

// ---------------------------------------------------------------------------
// Atender UNA orden
// ---------------------------------------------------------------------------

/// Valida y atiende una orden en seco.
///
/// Es la pieza que usan el bucle y el CLI (`--orden ... --simular`), para que
/// probar una orden a mano y recibirla del bus pasen por el MISMO codigo. Dos
/// caminos distintos acabarian en dos validaciones distintas.
pub fn atender(payload: &str, mano: &mut dyn ManoDeOrdenes) -> Resultado {
    let orden = match Orden::desde_payload(payload) {
        Ok(orden) => orden,
        Err(fallo) => {
            // Sin orden valida no hay ni accion ni red que citar: se nombran
            // vacias en vez de rellenarlas con lo que nos gustaria.
            return Resultado::fallo("", "", "", true, fallo.codigo(), fallo.descripcion());
        }
    };

    if !orden.simulacion {
        // Veto del bloque 16: este binario no tiene mano real. Se dice con
        // nombre y no se toca nada. Este `if` es el UNICO sitio donde se
        // habilita la ejecucion real: el dia que exista la mano Android, se
        // cambia aqui y en ningun otro lado.
        return Resultado::fallo(
            orden.id.clone(),
            orden.accion.clone(),
            orden.red.clone(),
            false,
            MOTIVO_SIN_MANO_REAL,
            "la orden pide ejecucion real (simulacion:false) y este binario solo tiene la mano simulada",
        );
    }

    let hecho = mano.ejecutar(&orden);

    // Regla 3: en simulacion NUNCA `ok:true`, diga lo que diga la mano. Nada
    // salio del aparato: como mucho se recorrio el flujo.
    let mut detalle = hecho
        .detalle
        .clone()
        .or_else(|| hecho.motivo.clone())
        .unwrap_or_else(|| "flujo recorrido sin pulsar el paso irreversible".to_string());
    if hecho.publicado {
        // Contradiccion que se conserva en vez de taparse: si la mano dice
        // "publicado" durante una simulacion, el resultado lo cuenta y `ok`
        // sigue siendo `false`.
        detalle = format!("{detalle}; la mano informo publicado, pero fue una simulacion");
    }

    Resultado {
        id: orden.id.clone(),
        accion: orden.accion.clone(),
        red: orden.red.clone(),
        ok: false,
        simulacion: true,
        motivo: Some(MOTIVO_SIMULACION.to_string()),
        detalle: Some(detalle),
        gestos: hecho.gestos,
    }
}

// ---------------------------------------------------------------------------
// El bus (el puerto hacia el canal)
// ---------------------------------------------------------------------------

/// Lo que el bucle necesita del canal: tres verbos y nada mas.
///
/// Existe para poder probar el bucle entero sin red (un bus en memoria) y para
/// que el dia que el transporte cambie (otro broker, otro framing) el bucle no
/// se entere.
pub trait Bus {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal>;
    fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal>;
    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal>;
}

/// Lo que puede pasar al esperar: un paquete, nada (plazo agotado) o el cierre.
///
/// "Nada" no es "el bus se cerro": en un aparato que vive dias, un plazo sin
/// trafico es lo normal. Confundir los dos haria que el bucle terminase cada vez
/// que el bus esta tranquilo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Opcion {
    Paquete(PublicacionRecibida),
    Nada,
    Cerrado,
}

impl Bus for Canal {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal> {
        Canal::suscribir(self, filtro, 0)
    }

    fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal> {
        Canal::publicar(self, topic, payload)
    }

    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal> {
        match self.leer_paquete(crate::canal::mqtt::PLAZO_LECTURA) {
            Ok(Some(paquete)) => match crate::canal::mqtt::leer_publish(&paquete) {
                Some(publicacion) => Ok(Opcion::Paquete(publicacion)),
                // Un paquete que no es un PUBLISH QoS 0 (un PINGRESP, un SUBACK)
                // no es trafico de ordenes: se descarta en silencio.
                None => Ok(Opcion::Nada),
            },
            Ok(None) => {
                // El canal distingue "plazo agotado" de "cerrado" con su bandera.
                if self.cerrado() {
                    Ok(Opcion::Cerrado)
                } else {
                    Ok(Opcion::Nada)
                }
            }
            Err(FalloDeCanal::Cerrado) => Ok(Opcion::Cerrado),
            Err(e) => Err(e),
        }
    }
}

/// Cuenta de lo que hizo el bucle. Sin esto, un bucle que ignora todo lo que
/// llega parece un bucle sano.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Resumen {
    pub atendidas: u64,
    pub contestadas: u64,
    pub fallos: u64,
    pub ignoradas: u64,
}

/// El bucle: se suscribe y atiende ordenes hasta que el bus se cierre.
///
/// `limite` corta despues de N ordenes (`None` = hasta que se cierre). Existe
/// para el CLI y para los tests: en el aparato no se pone.
pub fn servir<B, M>(bus: &mut B, mano: &mut M, limite: Option<u64>) -> Result<Resumen, FalloDeCanal>
where
    B: Bus + ?Sized,
    M: ManoDeOrdenes,
{
    bus.suscribir(TOPIC_ORDENES)?;

    let mut resumen = Resumen::default();

    loop {
        match bus.recibir()? {
            Opcion::Nada => continue,
            Opcion::Cerrado => break,
            Opcion::Paquete(publicacion) => {
                if !publicacion.topic.starts_with(PREFIJO_ORDENES) {
                    // El `#` del broker puede traer primos: no se ejecutan.
                    resumen.ignoradas += 1;
                    continue;
                }

                let resultado = match std::str::from_utf8(&publicacion.payload) {
                    Ok(texto) => atender(texto, mano),
                    Err(e) => Resultado::fallo(
                        "",
                        "",
                        "",
                        true,
                        "payload_no_utf8",
                        format!("el payload de la orden no es utf-8: {e}"),
                    ),
                };

                if resultado.ok {
                    resumen.atendidas += 1;
                } else {
                    resumen.fallos += 1;
                }

                match bus.publicar(TOPIC_RESULTADO, resultado.a_json().as_bytes()) {
                    Ok(()) => resumen.contestadas += 1,
                    Err(e) => {
                        // Un resultado que no sale se nombra y se devuelve: un
                        // bucle que sigue sin poder contestar solo acumula
                        // ordenes atendidas que nadie conoce.
                        eprintln!(
                            "canal: no se pudo publicar el resultado en {TOPIC_RESULTADO}: {e}"
                        );
                        return Err(e);
                    }
                }

                if let Some(tope) = limite {
                    if resumen.fallos + resumen.atendidas >= tope {
                        break;
                    }
                }
            }
        }
    }

    Ok(resumen)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Una mano que cuenta si la llamaron y devuelve lo que se le diga.
    #[derive(Default)]
    struct ManoContada {
        llamadas: u32,
        hecho: Option<HechoDeMano>,
    }

    impl ManoDeOrdenes for ManoContada {
        fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
            self.llamadas += 1;
            self.hecho.clone().unwrap_or_else(|| {
                HechoDeMano::nada("sin_receta", "no hay receta declarada en este binario")
            })
        }
    }

    const ORDEN: &str = r#"{"id":"o-1","accion":"publicar","red":"instagram","texto":"hola","simulacion":true}"#;

    #[test]
    fn una_orden_sin_accion_no_se_ejecuta_y_se_contesta() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"borrar_todo","red":"instagram","texto":"x","simulacion":true}"#,
            &mut mano,
        );
        assert_eq!(resultado.motivo.as_deref(), Some("accion_fuera_del_catalogo"));
        assert!(!resultado.ok);
        assert_eq!(mano.llamadas, 0, "no se llama a la mano con una orden invalida");

        let roto = atender("{no es json", &mut mano);
        assert_eq!(roto.motivo.as_deref(), Some("json_invalido"));
        assert_eq!(mano.llamadas, 0);
    }

    #[test]
    fn simulacion_recorre_el_flujo_pero_nunca_da_el_envio_por_hecho() {
        let mut mano = ManoContada::default();
        let resultado = atender(ORDEN, &mut mano);
        assert_eq!(mano.llamadas, 1, "en simulacion se pasa por la mano");
        assert!(!resultado.ok, "una simulacion no publica nada");
        assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIMULACION));
        assert!(resultado.simulacion);
        assert_eq!(resultado.id, "o-1");
    }

    #[test]
    fn sin_simulacion_no_se_toca_nada() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"publicar","red":"instagram","texto":"hola","simulacion":false}"#,
            &mut mano,
        );
        assert_eq!(mano.llamadas, 0, "con simulacion:false este binario no ejecuta");
        assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIN_MANO_REAL));
        assert!(!resultado.ok);
    }

    #[test]
    fn un_simulacion_que_es_texto_no_se_lee_como_permiso() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"publicar","red":"instagram","texto":"hola","simulacion":"false"}"#,
            &mut mano,
        );
        assert_eq!(resultado.motivo.as_deref(), Some("campo_de_tipo_equivocado"));
        assert_eq!(mano.llamadas, 0);
    }
}
