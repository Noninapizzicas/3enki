//! A3 · EjecutorDeElemento · PUENTE del aparato.
//!
//! Ejecuta **un** paso de una receta: localiza su ancla en el arbol que le dan,
//! actua una sola vez y se para. El paso siguiente no lo empieza este fichero:
//! lo empieza **otra** llamada a `ejecutar` con **otra** foto.
//!
//! # Las tres reglas duras
//!
//! ```text
//! 1. mirada nueva obligatoria  -> dos pasos con la misma foto: PROHIBIDO
//! 2. sin ancla NO se improvisa -> se para y se nombra el paso
//! 3. el catalogo esta cerrado  -> una accion desconocida se RECHAZA;
//!                                 no se degrada a `tocar`
//! ```
//!
//! ## 1 · La foto no se reutiliza
//!
//! Es la tentacion comoda de la mano: mirar una vez y encadenar tres gestos
//! sobre la misma foto porque "la pantalla no habra cambiado". Si el primer
//! gesto abrio un dialogo, el segundo toca donde ya no hay nada: se publica en
//! el sitio equivocado y, en una red social, eso ya no se deshace.
//!
//! El ejecutor **se acuerda de la foto con la que actuo** y se niega a actuar
//! dos veces con ella. Una foto se identifica por su `version_del_arbol` y su
//! `momento` (las dos cosas las pone A1): si las dos coinciden, es literalmente
//! la misma foto, no una mirada nueva que vio lo mismo. Si la pantalla no
//! cambio, la mirada nueva trae el mismo `version` pero **otro** `momento`:
//! eso si vale, porque hubo una lectura.
//!
//! Consecuencia practica: **el reloj es un puerto**. Quien llama tiene que dar
//! un `momento` nuevo en cada mirada (A1 ya lo exige asi). Dar dos veces el
//! mismo instante es indistinguible de reutilizar la foto, y este fichero lo
//! trata como lo que parece.
//!
//! ## 2 · Sin ancla se para, y se nombra el paso
//!
//! No hay camino en el que un ancla ausente se sustituya por "toco donde toque
//! el ultimo paso" ni por "el nodo mas parecido". Si el ancla no esta, el paso
//! se para con `AnclaAusente` y con **su numero**. Un fallo sin numero de paso
//! no se puede contar (C4) ni reparar (F1).
//!
//! Y con una mirada PARCIAL la ausencia no se afirma: es `NoSeSabe`, igual que
//! en A1. Una sola regla en dos sitios, no dos reglas distintas.
//!
//! ## 3 · El catalogo de acciones esta cerrado
//!
//! `tocar`, `escribir`, `desplazar`, `esperar`. Es el mismo catalogo que valida
//! `core/forma-receta.js`. Una accion que llega como `arrastrar`,
//! `pulsar_largo` o `deslizar_dos_dedos` **no se ejecuta** y **no se convierte
//! en un toque**: se rechaza nombrando el tipo. Degradar una accion
//! desconocida a `tocar` es la forma mas silenciosa de tocar lo que no era.
//!
//! # Lo que este fichero NO hace
//!
//!   - **No mira.** El arbol entra por argumento (`ejecutar(&hecho, ...)`):
//!     A1 es quien mira y quien decide cuando hay mirada nueva. Si A3 leyera el
//!     arbol por su cuenta habria dos relojes y dos verdades.
//!   - **No encadena.** Un `Paso` por llamada, sin bucles aqui dentro. El bucle
//!     con mirada nueva entre pasos vive en `publicar.rs`, que es la operacion.
//!   - **No decide que hacer ante un fallo.** Eso es A5 (`escalera.rs`). A3
//!     reporta el `EfectoEnElMundo` con tres valores honestos y se calla:
//!     `SinEfecto`, `EfectoPosible`, `Indeterminado`.
//!   - **No espera a que la pantalla se asiente.** Si un paso necesita que la
//!     plataforma respire, la receta declara un paso `esperar` con su
//!     `ventana_ms`: el lenguage de recetas ya lo tiene y no hace falta que el
//!     ejecutor invente tiempos.
//!
//! # Sin dependencias
//!
//! Solo `std`. El reloj no se lee aqui; la red no se toca; y el aparato entra
//! por el puerto `Superficie`, que en los tests es `SuperficieGrabada` y en
//! produccion es `Gestos.kt` (Android).

use std::fmt;

use crate::percepcion::observador::{Ancla, Desconocido, HechoVisible};
use crate::percepcion::Mirada;

// ---------------------------------------------------------------------------
// El catalogo cerrado de acciones (espejo de `ACCIONES` en forma-receta.js)
// ---------------------------------------------------------------------------

/// Distancia por defecto de un `desplazar` que no la declara.
///
/// `core/forma-receta.js` la trata como opcional, asi que alguien tiene que
/// poner un numero. Este no es un valor inventado sobre la RECETA: es una
/// medida fisica de la pantalla, y por eso es una constante nombrada y no un
/// relleno silencioso. Cuando la receta la declara, manda la receta.
pub const DISTANCIA_POR_DEFECTO: i32 = 600;

/// Las cuatro direcciones del `desplazar` (espejo de `DIRECCIONES`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direccion {
    Arriba,
    Abajo,
    Izquierda,
    Derecha,
}

impl Direccion {
    pub fn como_str(&self) -> &'static str {
        match self {
            Direccion::Arriba => "arriba",
            Direccion::Abajo => "abajo",
            Direccion::Izquierda => "izquierda",
            Direccion::Derecha => "derecha",
        }
    }

    /// Desde el nombre del bus. `None` si no es ninguna de las cuatro: una
    /// direccion desconocida no se sustituye por `abajo`.
    pub fn desde_str(v: &str) -> Option<Direccion> {
        match v.trim().to_ascii_lowercase().as_str() {
            "arriba" => Some(Direccion::Arriba),
            "abajo" => Some(Direccion::Abajo),
            "izquierda" => Some(Direccion::Izquierda),
            "derecha" => Some(Direccion::Derecha),
            _ => None,
        }
    }
}

impl fmt::Display for Direccion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// La accion TAL Y COMO llega declarada por la receta (texto del bus).
///
/// No es un enum todavia a proposito: si lo fuera, seria imposible representar
/// una accion fuera del catalogo y el test de "no se degrada" no podria existir.
/// La validacion (`AccionDeclarada::validar`) es la puerta: o sale una `Accion`
/// del catalogo cerrado, o sale el motivo del rechazo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccionDeclarada {
    pub tipo: String,
    pub texto: Option<String>,
    pub direccion: Option<String>,
    pub distancia: Option<i32>,
    pub ventana_ms: Option<u64>,
}

impl AccionDeclarada {
    pub fn nueva(tipo: impl Into<String>) -> Self {
        Self {
            tipo: tipo.into(),
            texto: None,
            direccion: None,
            distancia: None,
            ventana_ms: None,
        }
    }

    pub fn tocar() -> Self {
        Self::nueva("tocar")
    }

    pub fn escribir(texto: impl Into<String>) -> Self {
        Self { texto: Some(texto.into()), ..Self::nueva("escribir") }
    }

    pub fn desplazar(direccion: impl Into<String>, distancia: i32) -> Self {
        Self {
            direccion: Some(direccion.into()),
            distancia: Some(distancia),
            ..Self::nueva("desplazar")
        }
    }

    pub fn esperar(ventana_ms: u64) -> Self {
        Self { ventana_ms: Some(ventana_ms), ..Self::nueva("esperar") }
    }

    /// Resuelve la accion declarada contra el catalogo cerrado.
    ///
    /// Las tres salidas son las de A4.1: la accion, `AccionFueraDelCatalogo` o
    /// el campo que falta / no vale. **No hay cuarta salida** y en particular
    /// no hay una que devuelva `Tocar` "por si acaso".
    pub fn validar(&self) -> Result<Accion, MotivoDeParada> {
        let tipo = self.tipo.trim().to_ascii_lowercase();
        if tipo.is_empty() {
            return Err(MotivoDeParada::AccionIncompleta { campo: "tipo" });
        }

        match tipo.as_str() {
            "tocar" => Ok(Accion::Tocar),
            "escribir" => match util(&self.texto) {
                Some(texto) => Ok(Accion::Escribir { texto: texto.to_string() }),
                None => Err(MotivoDeParada::AccionIncompleta { campo: "texto" }),
            },
            "desplazar" => match self.direccion.as_deref().map(str::trim) {
                Some(direccion) if !direccion.is_empty() => {
                    match Direccion::desde_str(direccion) {
                        Some(dir) => {
                            let distancia = self.distancia.unwrap_or(DISTANCIA_POR_DEFECTO);
                            if distancia <= 0 {
                                return Err(MotivoDeParada::AccionInvalida {
                                    campo: "distancia",
                                    valor: distancia.to_string(),
                                });
                            }
                            Ok(Accion::Desplazar { direccion: dir, distancia })
                        }
                        None => Err(MotivoDeParada::AccionInvalida {
                            campo: "direccion",
                            valor: direccion.to_string(),
                        }),
                    }
                }
                _ => Err(MotivoDeParada::AccionIncompleta { campo: "direccion" }),
            },
            "esperar" => match self.ventana_ms {
                Some(ms) if ms > 0 => Ok(Accion::Esperar { ventana_ms: ms }),
                Some(_) => Err(MotivoDeParada::AccionInvalida {
                    campo: "ventana_ms",
                    valor: self.ventana_ms.unwrap_or(0).to_string(),
                }),
                None => Err(MotivoDeParada::AccionIncompleta { campo: "ventana_ms" }),
            },
            otro => Err(MotivoDeParada::AccionFueraDelCatalogo { tipo: otro.to_string() }),
        }
    }
}

fn util(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// La accion ya validada. Solo existen estas cuatro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Accion {
    Tocar,
    Escribir { texto: String },
    Desplazar { direccion: Direccion, distancia: i32 },
    Esperar { ventana_ms: u64 },
}

impl Accion {
    pub fn como_str(&self) -> &'static str {
        match self {
            Accion::Tocar => "tocar",
            Accion::Escribir { .. } => "escribir",
            Accion::Desplazar { .. } => "desplazar",
            Accion::Esperar { .. } => "esperar",
        }
    }

    /// ¿Esta accion puede cambiar el mundo?
    ///
    /// `esperar` no: el reloj corre y nada mas. Es la unica accion que se puede
    /// repetir sin miedo, y por eso se distingue aqui en vez de dejarlo al
    /// criterio de quien informe.
    pub fn puede_cambiar_el_mundo(&self) -> bool {
        !matches!(self, Accion::Esperar { .. })
    }
}

// ---------------------------------------------------------------------------
// El paso (espejo de un paso de receta)
// ---------------------------------------------------------------------------

/// Un paso de receta, en la forma que A3 necesita.
///
/// Las cuatro partes de un paso segun A4.1: `ancla_esperada`, `accion`,
/// `consecuencia_esperada` y `espera_maxima`. La consecuencia se declara como
/// ancla (`Option<Ancla>`) porque es lo unico que se puede COMPROBAR con una
/// mirada; una consecuencia que solo es una frase es una esperanza.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paso {
    /// Numero 1..N. Viaja en cada parada: un fallo sin numero no se repara.
    pub numero: usize,
    pub ancla: Ancla,
    pub accion: AccionDeclarada,
    /// Que tiene que verse despues. `None` = el paso no se vigila (posible,
    /// pero el informe lo dira).
    pub consecuencia: Option<Ancla>,
    /// Techo declarado del paso. Este fichero lo transporta y lo informa; el
    /// reloj y los tiempos no son de A3.
    pub espera_maxima: u64,
}

impl Paso {
    pub fn nuevo(numero: usize, ancla: Ancla, accion: AccionDeclarada) -> Self {
        Self {
            numero,
            ancla,
            accion,
            consecuencia: None,
            espera_maxima: 0,
        }
    }

    pub fn con_consecuencia(mut self, ancla: Ancla) -> Self {
        self.consecuencia = Some(ancla);
        self
    }

    pub fn con_espera_maxima(mut self, ms: u64) -> Self {
        self.espera_maxima = ms;
        self
    }
}

// ---------------------------------------------------------------------------
// El puerto de gestos
// ---------------------------------------------------------------------------

/// A donde se dirige un gesto: el id del nodo y su punto en pantalla.
///
/// Los dos hacen falta y por eso van juntos: el id sirve para que el aparato
/// encuentre el nodo en el arbol vivo (`ACTION_SET_TEXT`), el punto para un
/// gesto de coordenadas (`GestureDescription`). Dar solo uno obliga al otro
/// lado a adivinar, y adivinar es lo que este fichero existe para no hacer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Objetivo {
    pub id: String,
    pub punto: (i32, i32),
}

/// Por que el aparato no pudo entregar el gesto. Texto del aparato, sin
/// interpretar: `servicio_caido`, `gesto_cancelado`, `nodo_perdido`...
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FalloDeGesto {
    pub motivo: String,
}

impl FalloDeGesto {
    pub fn nuevo(motivo: impl Into<String>) -> Self {
        Self { motivo: motivo.into() }
    }
}

impl fmt::Display for FalloDeGesto {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.motivo)
    }
}

/// El puerto hacia el aparato: lo que de verdad toca.
///
/// En produccion lo implementa `Gestos.kt` (Android, `dispatchGesture` +
/// `ACTION_SET_TEXT`); en los tests, `SuperficieGrabada`. A3 no sabe cual de
/// los dos esta detras y no le importa.
pub trait Superficie {
    fn tocar(&mut self, objetivo: &Objetivo) -> Result<(), FalloDeGesto>;
    fn escribir(&mut self, objetivo: &Objetivo, texto: &str) -> Result<(), FalloDeGesto>;
    fn desplazar(&mut self, direccion: Direccion, distancia: i32) -> Result<(), FalloDeGesto>;
    fn esperar(&mut self, ms: u64) -> Result<(), FalloDeGesto>;
}

/// Un gesto entregado, tal y como lo registro la superficie falsa.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Gesto {
    Tocar { objetivo: Objetivo },
    Escribir { objetivo: Objetivo, texto: String },
    Desplazar { direccion: Direccion, distancia: i32 },
    Esperar { ms: u64 },
}

impl Gesto {
    pub fn como_str(&self) -> &'static str {
        match self {
            Gesto::Tocar { .. } => "tocar",
            Gesto::Escribir { .. } => "escribir",
            Gesto::Desplazar { .. } => "desplazar",
            Gesto::Esperar { .. } => "esperar",
        }
    }
}

/// La superficie FALSA: la que apunta lo que se le pide en vez de tocar nada.
///
/// Vive en el crate, como el `Simulador` del arbol, y por el mismo motivo: la
/// mano entera se prueba en escritorio, sin movil y sin cuenta, y los tests de
/// A3 y de `publicar` usan el mismo doble en vez de dos copias que se separen.
#[derive(Debug, Clone, Default)]
pub struct SuperficieGrabada {
    gestos: Vec<Gesto>,
    fallo: Option<String>,
}

impl SuperficieGrabada {
    pub fn nueva() -> Self {
        Self::default()
    }

    /// Una superficie que no puede entregar gestos: cada intento devuelve
    /// `Err` con este motivo y NO queda registrado como gesto entregado (lo
    /// que se apunta es el fallo, no el gesto que no ocurrio).
    pub fn que_falla(motivo: impl Into<String>) -> Self {
        Self { gestos: Vec::new(), fallo: Some(motivo.into()) }
    }

    pub fn gestos(&self) -> &[Gesto] {
        &self.gestos
    }

    pub fn cuantos(&self) -> usize {
        self.gestos.len()
    }

    pub fn ultimo(&self) -> Option<&Gesto> {
        self.gestos.last()
    }

    fn entregar(&mut self, gesto: Gesto) -> Result<(), FalloDeGesto> {
        match &self.fallo {
            Some(motivo) => Err(FalloDeGesto::nuevo(motivo.clone())),
            None => {
                self.gestos.push(gesto);
                Ok(())
            }
        }
    }
}

impl Superficie for SuperficieGrabada {
    fn tocar(&mut self, objetivo: &Objetivo) -> Result<(), FalloDeGesto> {
        self.entregar(Gesto::Tocar { objetivo: objetivo.clone() })
    }

    fn escribir(&mut self, objetivo: &Objetivo, texto: &str) -> Result<(), FalloDeGesto> {
        self.entregar(Gesto::Escribir { objetivo: objetivo.clone(), texto: texto.to_string() })
    }

    fn desplazar(&mut self, direccion: Direccion, distancia: i32) -> Result<(), FalloDeGesto> {
        self.entregar(Gesto::Desplazar { direccion, distancia })
    }

    fn esperar(&mut self, ms: u64) -> Result<(), FalloDeGesto> {
        self.entregar(Gesto::Esperar { ms })
    }
}

// ---------------------------------------------------------------------------
// El efecto en el mundo: la unica pregunta que A5 necesita
// ---------------------------------------------------------------------------

/// ¿Cambio el mundo este paso?
///
/// Tres valores, ni dos ni cuatro, porque la respuesta honesta tiene tres
/// formas: no se toco nada, se entrego un gesto que pudo cambiar algo, o no se
/// sabe si el gesto llego. **`Indeterminado` no es "puede que no"**: es "no lo
/// se", y A5 lo trata como el lado caro (no se reintenta).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EfectoEnElMundo {
    /// Nada se entrego al aparato: la parada es anterior al primer gesto, o la
    /// accion era `esperar` (que no toca nada).
    SinEfecto,
    /// Un gesto se entrego. Pudo cambiar el mundo y no hay forma de deshacerlo.
    EfectoPosible,
    /// El aparato fallo al entregar el gesto: no se sabe si llego a ocurrir.
    Indeterminado,
}

impl EfectoEnElMundo {
    pub fn como_str(&self) -> &'static str {
        match self {
            EfectoEnElMundo::SinEfecto => "sin_efecto",
            EfectoEnElMundo::EfectoPosible => "efecto_posible",
            EfectoEnElMundo::Indeterminado => "indeterminado",
        }
    }

    /// La pregunta de A5 en un solo sitio: `Some(false)` no cambio nada,
    /// `Some(true)` pudo cambiarlo, `None` no se sabe.
    ///
    /// Existe para que la regla sagrada de la escalera no tenga que reescribir
    /// este `match` y equivocarse: `None` cae siempre del lado de no reintentar.
    pub fn cambio_el_mundo(&self) -> Option<bool> {
        match self {
            EfectoEnElMundo::SinEfecto => Some(false),
            EfectoEnElMundo::EfectoPosible => Some(true),
            EfectoEnElMundo::Indeterminado => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Los motivos de parada
// ---------------------------------------------------------------------------

/// Por que un paso no se ejecuto. Siempre con nombre: un "no se pudo" sin
/// motivo es una laguna disfrazada de dato.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MotivoDeParada {
    /// La foto es la misma con la que ya se actuo: no se encadena a ciegas.
    FotoRepetida { version: u64, momento: u64 },
    /// Mirada completa y el ancla no estaba. No se improvisa.
    AnclaAusente,
    /// No se puede afirmar ni que este ni que no (mirada parcial, ancla sin
    /// nombre). Reutiliza el vocabulario de A1 en vez de inventar otro.
    NoSeSabe(Desconocido),
    /// El ancla esta pero el aparato dice que no es tocable. No se toca al
    /// padre "que seguro que recibe el toque": eso es improvisar.
    AnclaNoTocable,
    /// El ancla esta pero su caja no ocupa sitio: no hay punto que tocar, y
    /// tocar (0,0) es tocar la esquina de la pantalla.
    AnclaSinSitio,
    /// Accion que no esta en el catalogo. Se rechaza; NO se degrada a `tocar`.
    AccionFueraDelCatalogo { tipo: String },
    /// Accion del catalogo a la que le falta un campo obligatorio.
    AccionIncompleta { campo: &'static str },
    /// Accion del catalogo con un valor que no vale.
    AccionInvalida { campo: &'static str, valor: String },
    /// El aparato no pudo entregar el gesto: no se sabe si ocurrio.
    GestoFallo { motivo: String },
}

impl MotivoDeParada {
    /// Nombre estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDeParada::FotoRepetida { .. } => "foto_repetida",
            MotivoDeParada::AnclaAusente => "ancla_ausente",
            MotivoDeParada::NoSeSabe(_) => "no_se_sabe",
            MotivoDeParada::AnclaNoTocable => "ancla_no_tocable",
            MotivoDeParada::AnclaSinSitio => "ancla_sin_sitio",
            MotivoDeParada::AccionFueraDelCatalogo { .. } => "accion_fuera_del_catalogo",
            MotivoDeParada::AccionIncompleta { .. } => "accion_incompleta",
            MotivoDeParada::AccionInvalida { .. } => "accion_invalida",
            MotivoDeParada::GestoFallo { .. } => "gesto_fallo",
        }
    }

    /// Frase para una persona.
    pub fn descripcion(&self) -> String {
        match self {
            MotivoDeParada::FotoRepetida { version, momento } => format!(
                "se iba a actuar con la misma foto del paso anterior (version {version}, momento {momento}): hay que volver a mirar"
            ),
            MotivoDeParada::AnclaAusente => {
                "el ancla del paso no esta en la pantalla; no se toca nada".to_string()
            }
            MotivoDeParada::NoSeSabe(motivo) => format!("no se puede afirmar: {motivo}"),
            MotivoDeParada::AnclaNoTocable => {
                "el ancla esta pero el aparato no la da por tocable; no se toca otra cosa en su lugar"
                    .to_string()
            }
            MotivoDeParada::AnclaSinSitio => {
                "el ancla esta pero su caja no ocupa sitio: no hay punto que tocar".to_string()
            }
            MotivoDeParada::AccionFueraDelCatalogo { tipo } => format!(
                "la accion '{tipo}' no esta en el catalogo (tocar, escribir, desplazar, esperar): no se ejecuta ni se convierte en un toque"
            ),
            MotivoDeParada::AccionIncompleta { campo } => {
                format!("a la accion le falta el campo '{campo}'")
            }
            MotivoDeParada::AccionInvalida { campo, valor } => {
                format!("el campo '{campo}' de la accion no vale: '{valor}'")
            }
            MotivoDeParada::GestoFallo { motivo } => format!(
                "el aparato no pudo entregar el gesto ({motivo}): no se sabe si llego a ocurrir"
            ),
        }
    }

    /// La familia de fallo (R1) a la que pertenece esta parada.
    ///
    /// Es lo que A5 necesita para decidir: la taxonomia ya dice, por familia,
    /// que remedio tiene sentido. Sin este mapeo, la escalera tendria que
    /// adivinar de que se esta quejando el paso.
    pub fn familia(&self) -> crate::contrato::fallo::FamiliaDeFallo {
        use crate::contrato::fallo::FamiliaDeFallo;
        match self {
            MotivoDeParada::NoSeSabe(Desconocido::NoSePudoMirar(_)) => FamiliaDeFallo::Aparato,
            MotivoDeParada::NoSeSabe(_) => FamiliaDeFallo::Interfaz,
            MotivoDeParada::GestoFallo { .. } => FamiliaDeFallo::Aparato,
            // AnclaAusente, ancla que no se deja tocar, caja sin sitio, foto
            // repetida y acciones mal declaradas: la pantalla (o la receta) ya
            // no es lo que la receta supone. Eso es `interfaz`, y su remedio es
            // declarar la rotura.
            _ => FamiliaDeFallo::Interfaz,
        }
    }
}

impl fmt::Display for MotivoDeParada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// El resultado de UN paso
// ---------------------------------------------------------------------------

/// La foto con la que se actuo. Dos campos y no uno: la version sola no
/// distingue dos miradas que vieron lo mismo, y el momento solo no distingue
/// una foto de otra si el reloj no avanzo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Foto {
    pub version: u64,
    pub momento: u64,
}

/// Lo que paso con el paso ejecutado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ejecucion {
    pub paso: usize,
    pub ancla: Ancla,
    pub accion: Accion,
    /// Punto tocado. `None` en las acciones que no van a un punto (`esperar`).
    pub punto: Option<(i32, i32)>,
    pub mirada: Mirada,
    pub efecto: EfectoEnElMundo,
    pub foto: Foto,
}

/// La parada de un paso: no se actuo (o no se sabe si se actuo).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParadaDePaso {
    /// El numero de paso. Nunca 0: si no se sabe el numero, el paso no era un
    /// paso.
    pub paso: usize,
    pub motivo: MotivoDeParada,
    pub efecto: EfectoEnElMundo,
}

impl ParadaDePaso {
    /// ¿Se puede intentar otra vez sin haber cambiado nada?
    ///
    /// Solo informativo: quien decide es A5. Aqui se dice lo que A3 sabe del
    /// mundo, no lo que hay que hacer.
    pub fn no_toco_nada(&self) -> bool {
        self.efecto == EfectoEnElMundo::SinEfecto
    }
}

impl fmt::Display for ParadaDePaso {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "paso {}: {}", self.paso, self.motivo)
    }
}

/// El resultado de ejecutar un paso: o se ejecuto, o se paro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resultado {
    Ejecutado(Ejecucion),
    Parado(ParadaDePaso),
}

impl Resultado {
    pub fn como_str(&self) -> &'static str {
        match self {
            Resultado::Ejecutado(_) => "ejecutado",
            Resultado::Parado(_) => "parado",
        }
    }

    pub fn ejecutado(&self) -> bool {
        matches!(self, Resultado::Ejecutado(_))
    }

    pub fn parada(&self) -> Option<&ParadaDePaso> {
        match self {
            Resultado::Parado(p) => Some(p),
            Resultado::Ejecutado(_) => None,
        }
    }
}

fn parar(paso: &Paso, motivo: MotivoDeParada, efecto: EfectoEnElMundo) -> Resultado {
    Resultado::Parado(ParadaDePaso { paso: paso.numero, motivo, efecto })
}

// ---------------------------------------------------------------------------
// A3 · EjecutorDeElemento
// ---------------------------------------------------------------------------

/// La clase A3. Guarda dos cosas: la foto con la que actuo y cuantos gestos
/// entrego. Nada mas, y nada que se pueda leer como "la pantalla esta asi".
#[derive(Debug, Clone, Default)]
pub struct Ejecutor {
    ultima_foto: Option<Foto>,
    gestos: u64,
}

impl Ejecutor {
    pub fn nuevo() -> Self {
        Self::default()
    }

    /// La foto con la que se actuo la ultima vez (o con la que se intento).
    /// Se consume **tambien** cuando el gesto fallo: se intento con ella.
    pub fn ultima_foto(&self) -> Option<Foto> {
        self.ultima_foto
    }

    /// Gestos entregados al aparato, contando desde que se creo el ejecutor.
    pub fn gestos(&self) -> u64 {
        self.gestos
    }

    /// EJECUTAR un paso. Un paso, una foto, una accion.
    ///
    /// El orden de las comprobaciones no es casual:
    ///   1. ¿es la misma foto de antes?          -> parada (no se encadena)
    ///   2. ¿la accion esta en el catalogo?      -> rechazo (no se degrada)
    ///   3. ¿esta el ancla?                      -> parada con el numero de paso
    ///   4. ¿se puede tocar (tocable y con sitio)? -> parada
    ///   5. se entrega EL gesto y se apunta la foto
    ///
    /// Las dos primeras van antes de mirar el arbol a proposito: no se depende
    /// del mundo para rechazar lo que ya esta mal en el paso.
    pub fn ejecutar<S: Superficie + ?Sized>(
        &mut self,
        hecho: &HechoVisible,
        paso: &Paso,
        mano: &mut S,
    ) -> Resultado {
        let foto = Foto { version: hecho.version_del_arbol, momento: hecho.momento };

        // 1 · la regla de no encadenar a ciegas
        if self.ultima_foto == Some(foto) {
            return parar(
                paso,
                MotivoDeParada::FotoRepetida { version: foto.version, momento: foto.momento },
                EfectoEnElMundo::SinEfecto,
            );
        }

        // 2 · el catalogo cerrado, ANTES de buscar donde tocar
        let accion = match paso.accion.validar() {
            Ok(accion) => accion,
            Err(motivo) => return parar(paso, motivo, EfectoEnElMundo::SinEfecto),
        };

        // 3 · el ancla
        if paso.ancla.nombre_visible.trim().is_empty() {
            return parar(
                paso,
                MotivoDeParada::NoSeSabe(Desconocido::AnclaSinNombre),
                EfectoEnElMundo::SinEfecto,
            );
        }
        let nodo = match hecho.nodos.iter().find(|n| n.coincide(&paso.ancla)) {
            Some(nodo) => nodo,
            None => {
                let motivo = if hecho.mirada == Mirada::Parcial {
                    // Con media pantalla, "no lo vi" no es "no esta": la misma
                    // regla que A1, no una mas estricta ni una mas laxa.
                    MotivoDeParada::NoSeSabe(Desconocido::MiradaParcial)
                } else {
                    MotivoDeParada::AnclaAusente
                };
                return parar(paso, motivo, EfectoEnElMundo::SinEfecto);
            }
        };

        // 4 · se puede tocar? (solo `tocar` exige `tocable`: un campo de texto
        //     se rellena por id con ACTION_SET_TEXT y no siempre es clickable)
        let punto = match nodo.punto_de_toque() {
            Some(punto) => punto,
            None => return parar(paso, MotivoDeParada::AnclaSinSitio, EfectoEnElMundo::SinEfecto),
        };
        if matches!(accion, Accion::Tocar) && !nodo.tocable {
            return parar(paso, MotivoDeParada::AnclaNoTocable, EfectoEnElMundo::SinEfecto);
        }

        // 5 · el gesto. La foto se apunta ANTES de saber si el gesto salio: si
        //     falla, la foto ya se consumio y no vale reutilizarla.
        let objetivo = Objetivo { id: nodo.id.clone(), punto };
        let entrega = match &accion {
            Accion::Tocar => mano.tocar(&objetivo),
            Accion::Escribir { texto } => mano.escribir(&objetivo, texto),
            Accion::Desplazar { direccion, distancia } => mano.desplazar(*direccion, *distancia),
            Accion::Esperar { ventana_ms } => mano.esperar(*ventana_ms),
        };

        self.ultima_foto = Some(foto);

        match entrega {
            Ok(()) => {
                self.gestos += 1;
                let efecto = if accion.puede_cambiar_el_mundo() {
                    EfectoEnElMundo::EfectoPosible
                } else {
                    EfectoEnElMundo::SinEfecto
                };
                Resultado::Ejecutado(Ejecucion {
                    paso: paso.numero,
                    ancla: paso.ancla.clone(),
                    punto: match accion {
                        Accion::Esperar { .. } => None,
                        _ => Some(punto),
                    },
                    accion,
                    mirada: hecho.mirada,
                    efecto,
                    foto,
                })
            }
            Err(fallo) => parar(
                paso,
                MotivoDeParada::GestoFallo { motivo: fallo.motivo },
                // No se sabe si el gesto llego: se declara indeterminado y A5
                // no lo reintentara.
                EfectoEnElMundo::Indeterminado,
            ),
        }
    }
}
