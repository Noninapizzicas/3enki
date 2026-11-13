//! D5 · LectorDeAvisosPlataforma · micro-agente REFLEJO del aparato.
//!
//! Lee el aviso que la plataforma pone delante y contesta **que hace falta**. No
//! contesta "error": un aviso de la plataforma no es una averia del puente, es
//! una instruccion (abrir sesion, esperar, verificar identidad, actualizar).
//! Confundir las dos cosas es lo que hace que un puente reintente durante tres
//! dias contra un muro que pedia una contrasena.
//!
//! # Tabla cerrada
//!
//! Los avisos reconocidos estan en una tabla CERRADA: codigo canonico y alias
//! exactos (normalizados). No hay parecido, ni distancia de edicion, ni LLM: o el
//! aviso es uno de la tabla, o no lo es. Un modelo que "interprete" un aviso
//! desconocido puede inventarse que es un limite temporal y dejar al puente
//! esperando para siempre.
//!
//! # Un aviso NO PREVISTO se trata como "exige persona"
//!
//! Es la regla dura de la pieza. Lo que no esta en la tabla no se adivina: se
//! escala a una persona con el texto del aviso. El coste de molestar a alguien de
//! mas es una notificacion; el coste de adivinar mal es una cuenta bloqueada.
//!
//! # Lo que la pieza NO hace
//!
//! No toca nada, no espera, no reintenta: dictamina y se para. Quien ejecuta el
//! remedio es el regulador (G6), la escalera (A5) o D2, cada uno en su casa.
//! El `momento` no lo usa: leer un aviso es una foto, y la foto no caduca aqui.

use std::fmt;

use crate::contrato::fallo::Remedio;

/// Un aviso tal como llega de la pantalla. `codigo` es el identificador que la
/// app expone (view-id, resource-name o etiqueta corta); `texto` es lo que se ve.
/// Puede faltar el codigo: entonces se intenta el texto, y si tampoco encaja, no
/// se reconoce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Aviso<'a> {
    pub codigo: Option<&'a str>,
    pub texto: &'a str,
}

impl<'a> Aviso<'a> {
    pub fn nuevo(codigo: &'a str, texto: &'a str) -> Self {
        Self {
            codigo: Some(codigo),
            texto,
        }
    }

    pub fn solo_texto(texto: &'a str) -> Self {
        Self {
            codigo: None,
            texto,
        }
    }

    /// Lo que se intenta reconocer primero: el codigo; si no hay, el texto.
    fn candidato(&self) -> &'a str {
        self.codigo.unwrap_or(self.texto)
    }
}

/// Que pide el aviso, en grande. `NoPrevisto` es una clase propia, no un
/// `ExigePersona` disfrazado: asi el informe puede decir "no lo reconozco".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaseDeAviso {
    /// Hace falta una persona delante (sesion, identidad, terminos, captcha).
    ExigePersona,
    /// No hay nada roto: la plataforma frena y hay que esperar.
    Esperar,
    /// No esta en la tabla. Se trata como `ExigePersona`, pero se dice.
    NoPrevisto,
}

impl ClaseDeAviso {
    pub fn como_str(&self) -> &'static str {
        match self {
            ClaseDeAviso::ExigePersona => "exige_persona",
            ClaseDeAviso::Esperar => "esperar",
            ClaseDeAviso::NoPrevisto => "no_previsto",
        }
    }
}

impl fmt::Display for ClaseDeAviso {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// El dictamen de UN aviso. Siempre lleva `que_hace_falta`: un aviso sin
/// instruccion es un aviso que no se ha leido.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Veredicto {
    /// Si el aviso esta en la tabla cerrada.
    pub reconocido: bool,
    pub clase: ClaseDeAviso,
    /// Codigo canonico de la tabla (el de la entrada, no el del alias).
    pub codigo: Option<&'static str>,
    /// El texto normalizado que se uso para reconocer (util para diagnosticar).
    pub clave: String,
    pub exige_persona: bool,
    pub remedio: Remedio,
    pub que_hace_falta: &'static str,
    /// Espera sugerida SOLO como dato; quien decide es G6.
    pub espera_sugerida_ms: Option<u64>,
}

impl Veredicto {
    /// La invariante de la pieza, comprobable: siempre dice una accion, nunca
    /// "error". Existe para que un aviso mudo no pueda viajar como veredicto.
    pub fn dice_que_hace_falta(&self) -> bool {
        !self.que_hace_falta.trim().is_empty() && !self.que_hace_falta.contains("error")
    }

    /// Una linea para el log y el payload (sin serde: el borde lo formatea).
    pub fn como_linea(&self) -> String {
        format!(
            "clase={} reconocido={} exige_persona={} remedio={} espera_ms={:?} que_hace_falta={}",
            self.clase.como_str(),
            self.reconocido,
            self.exige_persona,
            self.remedio.codigo(),
            self.espera_sugerida_ms,
            self.que_hace_falta
        )
    }
}

impl fmt::Display for Veredicto {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.como_linea())
    }
}

/// Una entrada de la tabla. `codigo` es el canonico; `alias` son los otros
/// nombres exactos con los que la misma plataforma lo publica.
struct Entrada {
    codigo: &'static str,
    alias: &'static [&'static str],
    clase: ClaseDeAviso,
    remedio: Remedio,
    que_hace_falta: &'static str,
    espera_sugerida_ms: Option<u64>,
}

const ALIAS_SESION: &[&str] = &["sesion_expirada", "sesion_cerrada", "inicia_sesion", "log_in"];
const ALIAS_IDENTIDAD: &[&str] = &[
    "challenge_required",
    "verificacion_de_identidad",
    "confirma_que_eres_tu",
    "security_check",
];
const ALIAS_LIMITE: &[&str] = &[
    "try_again_later",
    "demasiadas_solicitudes",
    "accion_bloqueada_temporal",
    "limitado_temporalmente",
];
const ALIAS_RESTRINGIDA: &[&str] = &["cuenta_restringida", "accion_bloqueada", "restricted"];
const ALIAS_VERSION: &[&str] = &["actualizacion_requerida", "actualiza_la_app", "version_no_soportada"];
const ALIAS_TERMINOS: &[&str] = &["terminos_actualizados", "nuevos_terminos", "terms_updated"];
const ALIAS_CAPTCHA: &[&str] = &["captcha", "verifica_que_eres_humano"];
const ALIAS_DOS_FACTORES: &[&str] = &["two_factor_required", "codigo_de_seguridad", "2fa"];

/// La tabla CERRADA. Anadir un aviso es decidir su clase, su remedio y lo que
/// hace falta; no se anade a la ligera.
const TABLA: &[Entrada] = &[
    Entrada {
        codigo: "login_required",
        alias: ALIAS_SESION,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "abrir sesion con la cuenta del padron en el aparato: solo una persona escribe la contrasena",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "checkpoint_required",
        alias: ALIAS_IDENTIDAD,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "resolver la verificacion de identidad en la app, con el movil en la mano de una persona",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "rate_limit",
        alias: ALIAS_LIMITE,
        clase: ClaseDeAviso::Esperar,
        remedio: Remedio::Esperar,
        que_hace_falta: "esperar a que la plataforma levante el freno (horas, no segundos); el regulador decide cuando volver",
        espera_sugerida_ms: Some(3_600_000),
    },
    Entrada {
        codigo: "action_blocked",
        alias: ALIAS_RESTRINGIDA,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::Escalar,
        que_hace_falta: "revisar la cuenta en la app y decidir si se apela: la plataforma la ha restringido",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "update_required",
        alias: ALIAS_VERSION,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "actualizar la app de Instagram en el aparato (una persona)",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "terms_updated",
        alias: ALIAS_TERMINOS,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "aceptar los terminos nuevos en la app (una persona)",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "captcha",
        alias: ALIAS_CAPTCHA,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "resolver el captcha delante de la pantalla (una persona)",
        espera_sugerida_ms: None,
    },
    Entrada {
        codigo: "two_factor_required",
        alias: ALIAS_DOS_FACTORES,
        clase: ClaseDeAviso::ExigePersona,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "introducir el codigo de dos factores: lo tiene la persona, no el puente",
        espera_sugerida_ms: None,
    },
];

/// Normaliza para comparar por IGUALDAD, no por parecido: minusculas, y todo lo
/// que no sea alfanumerico se convierte en un unico `_` entre palabras. Asi
/// "Try again later" y "try_again_later" son la misma clave, y nada mas.
fn normalizar(valor: &str) -> String {
    let mut salida = String::new();
    let mut ultimo_separador = true;
    for c in valor.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() {
            salida.push(c);
            ultimo_separador = false;
        } else if !ultimo_separador {
            salida.push('_');
            ultimo_separador = true;
        }
    }
    while salida.ends_with('_') {
        salida.pop();
    }
    salida
}

fn buscar(clave: &str) -> Option<&'static Entrada> {
    if clave.is_empty() {
        return None;
    }
    TABLA
        .iter()
        .find(|e| e.codigo == clave || e.alias.iter().any(|a| *a == clave))
}

/// El no-previsto. Se construye en un solo sitio para que su remedio y su frase
/// no se puedan "mejorar" por comodidad en una rama suelta.
fn no_previsto(clave: String) -> Veredicto {
    Veredicto {
        reconocido: false,
        clase: ClaseDeAviso::NoPrevisto,
        codigo: None,
        clave,
        exige_persona: true,
        remedio: Remedio::PedirPersona,
        que_hace_falta: "una persona delante del aparato: el aviso no esta en la tabla cerrada y el puente no lo adivina",
        espera_sugerida_ms: None,
    }
}

/// Lee UN aviso y dictamina. Sin estado, sin reloj, sin LLM.
pub fn leer(aviso: &Aviso<'_>) -> Veredicto {
    let clave = normalizar(aviso.candidato());
    match buscar(&clave) {
        Some(entrada) => Veredicto {
            reconocido: true,
            clase: entrada.clase,
            codigo: Some(entrada.codigo),
            clave,
            exige_persona: matches!(entrada.clase, ClaseDeAviso::ExigePersona),
            remedio: entrada.remedio,
            que_hace_falta: entrada.que_hace_falta,
            espera_sugerida_ms: entrada.espera_sugerida_ms,
        },
        None => no_previsto(clave),
    }
}

/// La lectura de una pantalla entera: varios avisos, un dictamen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LecturaDeAvisos {
    pub veredictos: Vec<Veredicto>,
    pub exige_persona: bool,
    pub hay_no_previsto: bool,
    /// La instruccion que manda, cuando hay una. Un aviso no previsto manda
    /// sobre los reconocidos: si hay algo que no se entiende, hay persona.
    pub que_hace_falta: Option<&'static str>,
}

impl LecturaDeAvisos {
    pub fn vacia() -> Self {
        Self {
            veredictos: Vec::new(),
            exige_persona: false,
            hay_no_previsto: false,
            que_hace_falta: None,
        }
    }

    pub fn hay_avisos(&self) -> bool {
        !self.veredictos.is_empty()
    }

    pub fn cuantos(&self) -> usize {
        self.veredictos.len()
    }
}

/// D5 · El lector. Un micro-agente sin estado: recibe los avisos que A1 ya vio y
/// devuelve el dictamen de la pantalla.
#[derive(Debug, Clone, Copy, Default)]
pub struct LectorDeAvisosPlataforma;

impl LectorDeAvisosPlataforma {
    pub fn nuevo() -> Self {
        Self
    }

    /// Lee la lista de avisos visibles. Si hay uno no previsto, o uno que exige
    /// persona, la pantalla entera exige persona: no se elige "el mas suave".
    pub fn leer(&self, avisos: &[Aviso<'_>]) -> LecturaDeAvisos {
        if avisos.is_empty() {
            return LecturaDeAvisos::vacia();
        }
        let veredictos: Vec<Veredicto> = avisos.iter().map(leer).collect();
        let hay_no_previsto = veredictos.iter().any(|v| !v.reconocido);
        let exige_persona = veredictos.iter().any(|v| v.exige_persona);

        let que_hace_falta = if hay_no_previsto {
            veredictos
                .iter()
                .find(|v| !v.reconocido)
                .map(|v| v.que_hace_falta)
        } else {
            veredictos
                .iter()
                .find(|v| v.exige_persona)
                .or_else(|| veredictos.first())
                .map(|v| v.que_hace_falta)
        };

        LecturaDeAvisos {
            veredictos,
            exige_persona,
            hay_no_previsto,
            que_hace_falta,
        }
    }
}
