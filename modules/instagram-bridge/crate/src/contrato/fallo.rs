//! R1 · TaxonomiaDeFallos — el enum ESPEJO de `core/fallos.js`.
//!
//! Las seis familias son CONTRATO y estan cerradas. Este fichero no inventa una
//! taxonomia paralela: es la misma, con los mismos codigos, el mismo remedio y
//! el mismo dueno. `tests/fallos.test.js` LEE este fichero, extrae las variantes
//! del enum y falla si las dos orillas divergen. Si anades una familia aqui y no
//! alli (o al reves), el test se pone rojo: no hay dos listas mantenidas a mano.
//!
//! # La regla que este enum existe para no romper
//!
//! ```text
//! LimiteAlcanzado -> NO es un error -> es un INPUT del regulador (G2/G6)
//! ```
//!
//! Cuando la plataforma frena no hay nada averiado: hay una senal de castigo.
//! Tratarla como averia hace que el sistema reintente, cuente fallo y empeore el
//! castigo. Por eso `LimiteAlcanzado` declara `es_error() == false`,
//! `es_reintentable() == false`, `va_al_regulador() == true` y su remedio es
//! `Remedio::Regular`, que no es un remedio de error.
//!
//! # Sin dependencias externas
//!
//! Nada de serde todavia: el enum se serializa a mano con `codigo()`, que es la
//! misma cuerda que viaja como `familia_fallo` en el topic D7. Un enum con
//! `#[derive(Serialize)]` acoplaria el contrato del aparato a una version de
//! serde antes de que el bloque 5 lo necesite.
//!
//! Puro: sin IO, sin reloj, sin estado. Todo entra por argumento y sale por el
//! valor devuelto.

use std::fmt;

/// Las seis familias de fallo (R1). Cerradas: no hay septima.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FamiliaDeFallo {
    Sesion,
    Aparato,
    Interfaz,
    Plataforma,
    DatoQueFalta,
    LimiteAlcanzado,
}

/// Que puede hacer el sistema ante una familia.
///
/// Vocabulario cerrado del diseno (R1): reintentar · volver · escalar ·
/// pedir_persona · declarar_rotura · esperar · preguntar, mas `regular`, que es
/// la entrega de la senal al regulador y **no** un remedio de error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Remedio {
    Reintentar,
    Volver,
    Escalar,
    PedirPersona,
    DeclararRotura,
    Esperar,
    Preguntar,
    Regular,
}

impl Remedio {
    /// Codigo estable (snake_case), identico al de `core/fallos.js`.
    pub const fn codigo(self) -> &'static str {
        match self {
            Remedio::Reintentar => "reintentar",
            Remedio::Volver => "volver",
            Remedio::Escalar => "escalar",
            Remedio::PedirPersona => "pedir_persona",
            Remedio::DeclararRotura => "declarar_rotura",
            Remedio::Esperar => "esperar",
            Remedio::Preguntar => "preguntar",
            Remedio::Regular => "regular",
        }
    }

    /// `Regular` no es un remedio de error: es la senal que va al regulador.
    pub const fn es_remedio_de_error(self) -> bool {
        match self {
            Remedio::Regular => false,
            _ => true,
        }
    }
}

impl FamiliaDeFallo {
    /// Las seis, en el orden del diseno. El test de paridad compara el orden.
    pub const TODAS: [FamiliaDeFallo; 6] = [
        FamiliaDeFallo::Sesion,
        FamiliaDeFallo::Aparato,
        FamiliaDeFallo::Interfaz,
        FamiliaDeFallo::Plataforma,
        FamiliaDeFallo::DatoQueFalta,
        FamiliaDeFallo::LimiteAlcanzado,
    ];

    /// Codigo estable (snake_case). Es CONTRATO: no cambia aunque cambie el
    /// texto de la descripcion, porque viaja en el payload del bus.
    pub const fn codigo(self) -> &'static str {
        match self {
            FamiliaDeFallo::Sesion => "sesion",
            FamiliaDeFallo::Aparato => "aparato",
            FamiliaDeFallo::Interfaz => "interfaz",
            FamiliaDeFallo::Plataforma => "plataforma",
            FamiliaDeFallo::DatoQueFalta => "dato_que_falta",
            FamiliaDeFallo::LimiteAlcanzado => "limite_alcanzado",
        }
    }

    /// Remedio declarado. `reintentar` solo para `Plataforma`: un paso que no
    /// movio nada se puede repetir UNA vez (A5). El techo lo pone la escalera.
    pub const fn remedio(self) -> Remedio {
        match self {
            FamiliaDeFallo::Sesion => Remedio::PedirPersona,
            FamiliaDeFallo::Aparato => Remedio::Escalar,
            FamiliaDeFallo::Interfaz => Remedio::DeclararRotura,
            FamiliaDeFallo::Plataforma => Remedio::Reintentar,
            FamiliaDeFallo::DatoQueFalta => Remedio::Preguntar,
            FamiliaDeFallo::LimiteAlcanzado => Remedio::Regular,
        }
    }

    /// Clase responsable de arreglarlo. Nombrar sin dueno es archivar.
    pub const fn dueno(self) -> &'static str {
        match self {
            FamiliaDeFallo::Sesion => "CaidaYReautenticacion",
            FamiliaDeFallo::Aparato => "AparatoAusente",
            FamiliaDeFallo::Interfaz => "DeclaradorDeRotura",
            FamiliaDeFallo::Plataforma => "EscaleraDeRecuperacion",
            FamiliaDeFallo::DatoQueFalta => "CompletadorDePeticion",
            FamiliaDeFallo::LimiteAlcanzado => "LectorDeCastigo",
        }
    }

    /// Cuenta como averia? Solo `LimiteAlcanzado` es false: un freno de la
    /// plataforma es un input, no una averia.
    pub const fn es_error(self) -> bool {
        match self {
            FamiliaDeFallo::LimiteAlcanzado => false,
            _ => true,
        }
    }

    /// Puede A5 darle un segundo intento? Solo `Plataforma`, y solo si el mundo
    /// no cambio (esa comprobacion es de A5, no de la taxonomia).
    pub const fn es_reintentable(self) -> bool {
        match self {
            FamiliaDeFallo::Plataforma => true,
            _ => false,
        }
    }

    /// Va la senal al regulador (G6) en vez de al camino de error?
    pub const fn va_al_regulador(self) -> bool {
        match self {
            FamiliaDeFallo::LimiteAlcanzado => true,
            _ => false,
        }
    }

    /// Familia a partir del codigo estable del bus. `None` si no es ninguna.
    pub fn desde_codigo(codigo: &str) -> Option<FamiliaDeFallo> {
        FamiliaDeFallo::TODAS
            .iter()
            .copied()
            .find(|familia| familia.codigo() == codigo)
    }

    /// Clasificacion CONSERVADORA: lo que no se reconoce es `Interfaz` hasta que
    /// se demuestre otra cosa. Parar antes que insistir.
    pub fn desde_codigo_o_conservador(codigo: &str) -> FamiliaDeFallo {
        FamiliaDeFallo::desde_codigo(codigo).unwrap_or(FamiliaDeFallo::Interfaz)
    }
}

impl fmt::Display for FamiliaDeFallo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.codigo())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seis_familias_y_codigos_estables() {
        assert_eq!(FamiliaDeFallo::TODAS.len(), 6);

        let codigos: Vec<&str> = FamiliaDeFallo::TODAS.iter().map(|f| f.codigo()).collect();
        assert_eq!(
            codigos,
            vec![
                "sesion",
                "aparato",
                "interfaz",
                "plataforma",
                "dato_que_falta",
                "limite_alcanzado"
            ]
        );

        for familia in FamiliaDeFallo::TODAS {
            assert_eq!(FamiliaDeFallo::desde_codigo(familia.codigo()), Some(familia));
        }
        assert_eq!(FamiliaDeFallo::desde_codigo("septima"), None);
    }

    #[test]
    fn limite_alcanzado_no_es_error_sino_input_del_regulador() {
        let limite = FamiliaDeFallo::LimiteAlcanzado;

        assert!(!limite.es_error(), "un freno de la plataforma no es una averia");
        assert!(limite.va_al_regulador(), "la senal va al regulador");
        assert!(!limite.es_reintentable(), "reintentar contra un castigo lo empeora");
        assert_eq!(limite.remedio(), Remedio::Regular);
        assert!(!limite.remedio().es_remedio_de_error());

        // Las otras cinco SI son errores y ninguna se entrega al regulador.
        for familia in FamiliaDeFallo::TODAS {
            if familia == limite {
                continue;
            }
            assert!(familia.es_error(), "{familia} tiene que contar como averia");
            assert!(!familia.va_al_regulador());
            assert_ne!(familia.remedio(), Remedio::Regular);
        }
    }

    #[test]
    fn solo_plataforma_es_reintentable_y_conservador_cae_en_interfaz() {
        let reintentables: Vec<&str> = FamiliaDeFallo::TODAS
            .iter()
            .filter(|f| f.es_reintentable())
            .map(|f| f.codigo())
            .collect();
        assert_eq!(reintentables, vec!["plataforma"]);

        assert_eq!(
            FamiliaDeFallo::desde_codigo_o_conservador("septima"),
            FamiliaDeFallo::Interfaz
        );
    }
}
