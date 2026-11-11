//! U1 · VerificadorDeExclusividad · REFLEJO del aparato.
//!
//! Antes de cada operacion se comprueba que la cuenta que se ve en pantalla es
//! la cuenta que se esperaba. Si no lo es, no se toca nada. La comprobacion es
//! local y previa: el padron (B1) vive en el cerebro, pero la parada ocurre aqui,
//! delante de la pantalla, porque el mundo solo cambia en el aparato.
//!
//! # La regla dura: indeterminado se trata como NO COINCIDE
//!
//! `Indeterminado` no es "puede que si". Es "no lo se", y lo que no se sabe no
//! autoriza a tocar la cuenta de nadie. Por eso:
//!
//! ```text
//! Coincide       -> permite operar
//! NoCoincide     -> para
//! Indeterminado  -> para (igual que NoCoincide)
//! ```
//!
//! Y sin embargo el veredicto NO se convierte en `NoCoincide`: se conserva la
//! etiqueta `Indeterminado` con su motivo, porque un `no_lo_se` disfrazado de
//! `no` es la primera mentira comoda del sistema. La etiqueta dice la verdad; la
//! decision es la misma que la de un no. Quien lea el resultado sabra que hay
//! que mirar, no que se comprobo y fallo.
//!
//! Casos que caen en `Indeterminado`, todos por el lado seguro:
//!   - no hay handle visible (`cuenta_visible = None` o vacio tras normalizar),
//!   - la mirada fue parcial (no se vio la pantalla entera),
//!   - no se sabe que cuenta se esperaba (esperada vacia): sin expectativa no
//!     hay comprobacion posible.
//!
//! # Normalizacion
//!
//! Un handle de Instagram es insensible a mayusculas y se escribe con o sin `@`.
//! Comparar `@Taller.A` con `taller.a` y decir "no coincide" seria un falso
//! negativo que para el puente sin motivo. Se normaliza: se recorta, se quita el
//! `@` inicial (y una barra final si alguien pego una URL), se pasa a minusculas.
//!
//! Puro: sin reloj, sin red, sin estado. Todo lo que necesita entra por
//! argumento y todo lo que decide sale por el valor devuelto.

use std::fmt;

/// Como de entera fue la mirada que produjo el hecho.
///
/// Espejo del campo `mirada` de `HechoVisible` en `core/formas.js`
/// (`completa | parcial`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mirada {
    Completa,
    Parcial,
}

impl Mirada {
    pub fn como_str(&self) -> &'static str {
        match self {
            Mirada::Completa => "completa",
            Mirada::Parcial => "parcial",
        }
    }
}

/// Lo que el aparato vio, reducido a lo que U1 necesita para decidir.
///
/// El `HechoVisible` completo (sello, pantalla, nodos, motivo de la mirada
/// parcial) es el contrato del bloque 5/6 y viaja con serde. Aqui solo entra la
/// parte que U1 mira: que cuenta se ve y como de entera fue la mirada. Pedir
/// menos datos es lo que permite que U1 sea una pieza pequena y sin dependencias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HechoVisible<'a> {
    /// Handle que se lee en pantalla. `None` = no se vio ninguno.
    pub cuenta_visible: Option<&'a str>,
    pub mirada: Mirada,
}

impl<'a> HechoVisible<'a> {
    pub fn nueva(cuenta_visible: Option<&'a str>, mirada: Mirada) -> Self {
        Self { cuenta_visible, mirada }
    }

    /// Mirada entera con una cuenta leida: el caso bueno.
    pub fn completa(cuenta_visible: &'a str) -> Self {
        Self { cuenta_visible: Some(cuenta_visible), mirada: Mirada::Completa }
    }

    /// Mirada parcial. Puede traer o no la cuenta; en ambos casos U1 no autoriza.
    pub fn parcial(cuenta_visible: Option<&'a str>) -> Self {
        Self { cuenta_visible, mirada: Mirada::Parcial }
    }
}

/// Lo que U1 dictamina. Tres salidas, ninguna parcial.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Veredicto {
    Coincide,
    NoCoincide,
    Indeterminado,
}

impl Veredicto {
    /// Nombre estable para el payload del bus (`coincide: true|false|"indeterminado"`).
    pub fn como_str(&self) -> &'static str {
        match self {
            Veredicto::Coincide => "coincide",
            Veredicto::NoCoincide => "no_coincide",
            Veredicto::Indeterminado => "indeterminado",
        }
    }
}

/// Por que se dictamino eso. Un rechazo tiene que decir que falla, no solo que no.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motivo {
    Coincide,
    CuentaEsperadaAusente,
    CuentaNoVisible,
    MiradaParcial,
    CuentaDistinta,
}

impl Motivo {
    /// Nombre estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            Motivo::Coincide => "coincide",
            Motivo::CuentaEsperadaAusente => "cuenta_esperada_ausente",
            Motivo::CuentaNoVisible => "cuenta_no_visible",
            Motivo::MiradaParcial => "mirada_parcial",
            Motivo::CuentaDistinta => "cuenta_distinta",
        }
    }

    /// Frase para una persona. R2 la reescribira con su vocabulario; aqui se
    /// dice que pasa y que hace falta, sin nombres de pantallas ni de nodos.
    pub fn descripcion(&self) -> &'static str {
        match self {
            Motivo::Coincide => "la cuenta que se ve es la que se esperaba",
            Motivo::CuentaEsperadaAusente => {
                "no se sabe que cuenta se esperaba: sin expectativa no hay comprobacion"
            }
            Motivo::CuentaNoVisible => {
                "no se pudo leer la cuenta en pantalla; hay que abrir el perfil de la cuenta"
            }
            Motivo::MiradaParcial => {
                "la pantalla no se vio entera; no se puede afirmar de quien es la sesion"
            }
            Motivo::CuentaDistinta => "la sesion abierta es de otra cuenta; no se toca nada",
        }
    }
}

/// El resultado completo de la comprobacion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comprobacion {
    pub veredicto: Veredicto,
    pub motivo: Motivo,
    /// Handle esperado ya normalizado (`None` si no se sabia cual se esperaba).
    pub esperada: Option<String>,
    /// Handle visible ya normalizado (`None` si no se vio ninguno).
    pub visible: Option<String>,
}

impl Comprobacion {
    /// La unica pregunta que importa antes de tocar: ¿se puede operar?
    ///
    /// Solo `Coincide` devuelve `true`; `Indeterminado` y `NoCoincide` devuelven
    /// `false`. Falla cerrado por construccion: no hay ninguna rama que devuelva
    /// `true` sin una igualdad comprobada.
    pub fn permite_operar(&self) -> bool {
        self.veredicto == Veredicto::Coincide
    }

    /// El veredicto para el payload del bus: `true`, `false` o `"indeterminado"`.
    ///
    /// Mantiene las tres etiquetas separadas: quien recibe `"indeterminado"` sabe
    /// que hay que mirar; quien recibe `false` sabe que se miró y no era.
    pub fn para_payload(&self) -> PayloadVeredicto {
        match self.veredicto {
            Veredicto::Coincide => PayloadVeredicto::Si,
            Veredicto::NoCoincide => PayloadVeredicto::No,
            Veredicto::Indeterminado => PayloadVeredicto::Indeterminado,
        }
    }

    /// La puerta: `Ok(())` solo si se puede operar; si no, una `Parada` que dice
    /// por que. Es el metodo que llama A3 antes del primer gesto.
    pub fn parar_si_no_coincide(&self) -> Result<(), Parada> {
        if self.permite_operar() {
            return Ok(());
        }
        Err(Parada {
            veredicto: self.veredicto,
            motivo: self.motivo,
            explicacion: self.motivo.descripcion().to_string(),
        })
    }
}

/// Las tres salidas tal y como caben en `instagram.cuenta.exclusividad.comprobar`
/// (`coincide: true / false / "indeterminado"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PayloadVeredicto {
    Si,
    No,
    Indeterminado,
}

impl PayloadVeredicto {
    pub fn como_json(&self) -> &'static str {
        match self {
            PayloadVeredicto::Si => "true",
            PayloadVeredicto::No => "false",
            PayloadVeredicto::Indeterminado => "\"indeterminado\"",
        }
    }

    pub fn permite_operar(&self) -> bool {
        matches!(self, PayloadVeredicto::Si)
    }
}

/// La parada. No es un error del sistema: es la decision correcta cuando no se
/// puede afirmar de quien es la sesion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parada {
    pub veredicto: Veredicto,
    pub motivo: Motivo,
    pub explicacion: String,
}

impl fmt::Display for Parada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "parada ({}): {}", self.motivo.como_str(), self.explicacion)
    }
}

impl std::error::Error for Parada {}

/// Normaliza un handle para poder compararlo.
///
/// Recorta, quita un `@` inicial, quita una barra final (por si alguien pego
/// `instagram.com/taller/`) y pasa a minusculas ASCII. No intenta adivinar una
/// cuenta a partir de una URL: solo limpia lo que es cosmetico.
pub fn normalizar(handle: &str) -> String {
    let mut h = handle.trim();
    if let Some(resto) = h.strip_prefix('@') {
        h = resto;
    }
    let h = h.trim_end_matches('/');
    h.to_ascii_lowercase()
}

/// Comprueba si la cuenta que se ve es la esperada.
///
/// El orden de las comprobaciones es deliberado: primero "¿se que esperaba?",
/// luego "¿pude mirar bien?", luego "¿vi algo?", y solo al final la igualdad.
/// Asi un `Indeterminado` nunca se disfraza de `NoCoincide` por accidente y un
/// `NoCoincide` solo se emite cuando de verdad se compararon dos handles.
pub fn comprobar(esperada: &str, hecho: &HechoVisible<'_>) -> Comprobacion {
    let esperada_norm = normalizar(esperada);
    let visible_norm = hecho.cuenta_visible.map(normalizar);
    let visible_util = visible_norm.as_deref().filter(|v| !v.is_empty());

    if esperada_norm.is_empty() {
        return Comprobacion {
            veredicto: Veredicto::Indeterminado,
            motivo: Motivo::CuentaEsperadaAusente,
            esperada: None,
            visible: visible_util.map(str::to_string),
        };
    }

    if hecho.mirada == Mirada::Parcial {
        return Comprobacion {
            veredicto: Veredicto::Indeterminado,
            motivo: Motivo::MiradaParcial,
            esperada: Some(esperada_norm),
            visible: visible_util.map(str::to_string),
        };
    }

    let Some(visible) = visible_util else {
        return Comprobacion {
            veredicto: Veredicto::Indeterminado,
            motivo: Motivo::CuentaNoVisible,
            esperada: Some(esperada_norm),
            visible: None,
        };
    };

    if visible != esperada_norm {
        return Comprobacion {
            veredicto: Veredicto::NoCoincide,
            motivo: Motivo::CuentaDistinta,
            esperada: Some(esperada_norm),
            visible: Some(visible.to_string()),
        };
    }

    Comprobacion {
        veredicto: Veredicto::Coincide,
        motivo: Motivo::Coincide,
        esperada: Some(esperada_norm),
        visible: Some(visible.to_string()),
    }
}

/// Atajo de la puerta: comprueba y devuelve `Result`.
///
/// Existe para que el ejecutor (A3) no pueda olvidarse de mirar el veredicto:
/// llamar a esta funcion y usar `?` es lo unico que hace falta para no tocar una
/// cuenta ajena.
pub fn parar_si_no_coincide(
    esperada: &str,
    hecho: &HechoVisible<'_>,
) -> Result<Comprobacion, Parada> {
    let c = comprobar(esperada, hecho);
    c.parar_si_no_coincide()?;
    Ok(c)
}
