//! La operacion `publicar` — la receta entera, paso a paso, con mirada nueva.
//!
//! Aqui se junta todo lo que el aparato sabe hacer: A1 mira, U1 comprueba de
//! quien es la sesion, A3 ejecuta **un** paso, A5 decide que hacer si el paso
//! falla. Este fichero es el bucle, y el bucle es justo lo que A3 no hace.
//!
//! # La regla que este fichero existe para cumplir
//!
//! ```text
//! antes de CADA paso: una mirada nueva
//! nunca: dos pasos con la misma foto
//! ```
//!
//! No es un detalle de estilo. Un `publicar` que mire una vez y toque cinco
//! veces esta tocando a ciegas a partir del segundo gesto: si el primero abrio
//! un dialogo, el segundo toca lo que haya debajo.
//!
//! # Las cuatro puertas antes de cada gesto
//!
//! 1. **Se mira** (A1). Sin mirada no hay paso: `Desenlace::Parado`.
//! 2. **Se comprueba la cuenta** (U1). Si la sesion que se ve no es la que se
//!    esperaba, no se toca nada — ni el primer gesto ni el quinto.
//! 3. **Se comprueba la consecuencia del paso anterior.** Es el uso natural de
//!    la mirada nueva: la foto que abre el paso N es tambien la que confirma
//!    el paso N-1. Si la consecuencia no esta, NO se sigue: encadenar sobre un
//!    paso que no ocurrio es la forma mas limpia de publicar la mitad.
//! 4. **Se comprueba el presupuesto** (el techo de la receta, medido con el
//!    reloj que entra por argumento). Sin presupuesto no se empieza un gesto
//!    mas: se para y se dice cuanto se consumio.
//!
//! # Los tres desenlaces, y ninguno miente
//!
//! ```text
//! publicado      — los pasos corrieron y la postcondicion se vio DESPUES
//! sin_confirmar  — los pasos corrieron y no se puede afirmar que ocurriera
//! parado         — se paro antes de terminar
//! ```
//!
//! `parado` **no** significa "no paso nada": dice que no se termino. Los pasos
//! que si se ejecutaron ya tocaron el mundo, y por eso el informe lleva
//! `gestos` y `pudo_cambiar_el_mundo()`. Quien lea `parado` con `gestos > 0`
//! sabe que hay que mirar la cuenta antes de intentarlo otra vez — no que se
//! pueda repetir la operacion desde el principio.
//!
//! Y `publicado` exige postcondicion vista. Sin ancla de postcondicion no hay
//! `publicado`: hay `sin_confirmar`, porque "los pasos corrieron" no es "se
//! publico". A4.1 ya dice que una receta sin postcondicion no es una receta.
//!
//! # Lo que este fichero NO hace
//!
//!   - **No decide politica.** Cuando un paso se para, la decision la toma A5
//!     (`escalera.rs`); aqui solo se obedece: `Reintentar` -> un intento mas con
//!     mirada nueva; `Volver` y `Escalar` -> se para y se informa.
//!   - **No lee el reloj.** El `momento` de cada mirada entra por el puerto
//!     `reloj` (un `FnMut() -> u64`), como en A1. El mismo guion produce el
//!     mismo informe.
//!   - **No habla por red.** El bus no esta aqui.
//!
//! # Sin dependencias
//!
//! Solo `std`. La superficie de gestos y la fuente del arbol entran por puerto:
//! en los tests, `Simulador` + `SuperficieGrabada`; en el aparato,
//! `Accesibilidad.kt` + `Gestos.kt`.

use std::fmt;

use crate::mano::ejecutor::{Ejecutor, ParadaDePaso, Paso, Resultado, Superficie};
use crate::mano::escalera::{Decision, Escalera, HechoDeFallo};
use crate::mano::exclusividad::{comprobar, HechoVisible as HechoDeCuenta, Parada as ParadaDeCuenta};
use crate::percepcion::observador::{
    Ancla, Desconocido, FuenteDeArbol, HechoVisible as HechoObservado, Observador, SelloDeCuenta,
    Vista,
};

/// Tope duro de reintentos que este bucle obedece, pase lo que pase.
///
/// La escalera ya no concede mas de `techo` reintentos, asi que este tope no
/// deberia alcanzarse nunca; esta para que un error en la configuracion no se
/// convierta en un bucle que publica sin fin.
pub const LIMITE_DURO_DE_REINTENTOS: u32 = 3;

// ---------------------------------------------------------------------------
// La publicacion (lo que entra)
// ---------------------------------------------------------------------------

/// Una publicacion: la receta concreta que se va a ejecutar y de quien es la
/// cuenta en la que se va a ejecutar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Publicacion<'a> {
    /// Capacidad de la receta (`publicar_foto`, `publicar_reel`...). Va al
    /// informe: sin ella, un fallo no se puede atribuir a una receta.
    pub capacidad: String,
    /// La cuenta que se espera ver en pantalla. U1 la comprueba antes de cada
    /// gesto; si no coincide, no se toca nada.
    pub cuenta_esperada: String,
    pub pasos: &'a [Paso],
    /// Techo declarado de la receta, en milisegundos del reloj inyectado.
    /// `None` = la receta no declara presupuesto y no se comprueba.
    pub techo_ms: Option<u64>,
    /// Lo que tiene que verse al terminar. Sin esto no hay `publicado`.
    pub postcondicion: Option<&'a Ancla>,
}

impl<'a> Publicacion<'a> {
    pub fn nueva(
        capacidad: impl Into<String>,
        cuenta_esperada: impl Into<String>,
        pasos: &'a [Paso],
    ) -> Self {
        Self {
            capacidad: capacidad.into(),
            cuenta_esperada: cuenta_esperada.into(),
            pasos,
            techo_ms: None,
            postcondicion: None,
        }
    }

    pub fn con_techo(mut self, techo_ms: u64) -> Self {
        self.techo_ms = Some(techo_ms);
        self
    }

    pub fn con_postcondicion(mut self, ancla: &'a Ancla) -> Self {
        self.postcondicion = Some(ancla);
        self
    }
}

// ---------------------------------------------------------------------------
// El informe (lo que sale)
// ---------------------------------------------------------------------------

/// Como acabo la publicacion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Desenlace {
    /// Los pasos corrieron y la postcondicion se vio despues.
    Publicado,
    /// Los pasos corrieron (o algunos) y no se puede afirmar el resultado.
    SinConfirmar,
    /// Se paro antes de terminar. NO significa que no se toco nada.
    Parado,
}

impl Desenlace {
    pub fn como_str(&self) -> &'static str {
        match self {
            Desenlace::Publicado => "publicado",
            Desenlace::SinConfirmar => "sin_confirmar",
            Desenlace::Parado => "parado",
        }
    }
}

impl fmt::Display for Desenlace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Por que no se llego a `publicado`. Siempre con nombre y, cuando es de un
/// paso, con su numero.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MotivoDePublicacion {
    /// La receta no trae pasos: no es una receta, es una intencion.
    SinPasos,
    /// No se pudo mirar antes de un paso.
    SinMirada(Desconocido),
    /// U1: la cuenta que se ve no es la que se esperaba (o no se sabe).
    CuentaAjena(ParadaDeCuenta),
    /// A3 paro el paso.
    Paso(ParadaDePaso),
    /// La consecuencia del paso anterior no se vio: no se sigue a ciegas.
    ConsecuenciaNoVista { paso: usize, ancla: Ancla },
    /// Se acabo el presupuesto declarado por la receta.
    PresupuestoAgotado { techo_ms: u64, transcurrido_ms: u64 },
    /// La postcondicion no se vio al terminar: no se puede afirmar.
    PostcondicionNoVista { ancla: Ancla },
    /// La receta no declara postcondicion: no hay con que confirmar.
    SinConQueConfirmar,
}

impl MotivoDePublicacion {
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDePublicacion::SinPasos => "sin_pasos",
            MotivoDePublicacion::SinMirada(_) => "sin_mirada",
            MotivoDePublicacion::CuentaAjena(_) => "cuenta_ajena",
            MotivoDePublicacion::Paso(_) => "paso",
            MotivoDePublicacion::ConsecuenciaNoVista { .. } => "consecuencia_no_vista",
            MotivoDePublicacion::PresupuestoAgotado { .. } => "presupuesto_agotado",
            MotivoDePublicacion::PostcondicionNoVista { .. } => "postcondicion_no_vista",
            MotivoDePublicacion::SinConQueConfirmar => "sin_con_que_confirmar",
        }
    }

    /// El numero de paso al que se imputa, si es de uno.
    pub fn paso(&self) -> Option<usize> {
        match self {
            MotivoDePublicacion::Paso(p) => Some(p.paso),
            MotivoDePublicacion::ConsecuenciaNoVista { paso, .. } => Some(*paso),
            _ => None,
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            MotivoDePublicacion::SinPasos => {
                "la receta no trae pasos: no hay nada que ejecutar".to_string()
            }
            MotivoDePublicacion::SinMirada(motivo) => {
                format!("no se pudo mirar antes del paso: {motivo}")
            }
            MotivoDePublicacion::CuentaAjena(parada) => format!(
                "la sesion que se ve no es la esperada ({}): no se toca nada",
                parada.motivo.como_str()
            ),
            MotivoDePublicacion::Paso(parada) => parada.to_string(),
            MotivoDePublicacion::ConsecuenciaNoVista { paso, ancla } => format!(
                "el paso {paso} no dejo ver lo que tenia que dejar ('{}'): no se sigue a ciegas",
                ancla.nombre_visible
            ),
            MotivoDePublicacion::PresupuestoAgotado { techo_ms, transcurrido_ms } => format!(
                "se agoto el techo de la receta: {transcurrido_ms} ms de {techo_ms} ms"
            ),
            MotivoDePublicacion::PostcondicionNoVista { ancla } => format!(
                "los pasos corrieron pero no se ve '{}': no se puede afirmar que se publicara",
                ancla.nombre_visible
            ),
            MotivoDePublicacion::SinConQueConfirmar => {
                "la receta no declara postcondicion: los pasos corrieron y no hay con que afirmarlo"
                    .to_string()
            }
        }
    }
}

impl fmt::Display for MotivoDePublicacion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// El informe de una publicacion: que paso, hasta donde se llego y con que
/// decision de A5.
///
/// `gestos` es el numero que impide leer `parado` como "no paso nada".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Informe {
    pub capacidad: String,
    pub desenlace: Desenlace,
    pub motivo: Option<MotivoDePublicacion>,
    /// Paso en el que se paro (o en el que se quedo sin confirmar).
    pub paso: Option<usize>,
    pub pasos_totales: usize,
    /// Pasos que A3 dio por ejecutados.
    pub pasos_ejecutados: usize,
    /// Gestos entregados al aparato: los que pudieron cambiar el mundo.
    pub gestos: u64,
    pub miradas: u64,
    /// Lo que dicto A5, en orden. Vacio si no hubo ningun fallo.
    pub decisiones: Vec<Decision>,
    pub transcurrido_ms: u64,
}

impl Informe {
    /// ¿Pudo cambiar el mundo esta publicacion?
    ///
    /// La pregunta que hay que hacerse ANTES de reintentar la operacion entera:
    /// si es `true`, repetirla puede duplicar.
    pub fn pudo_cambiar_el_mundo(&self) -> bool {
        self.gestos > 0
    }

    pub fn publicado(&self) -> bool {
        self.desenlace == Desenlace::Publicado
    }
}

impl fmt::Display for Informe {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} {} pasos={}/{} gestos={} miradas={}",
            self.capacidad,
            self.desenlace,
            self.pasos_ejecutados,
            self.pasos_totales,
            self.gestos,
            self.miradas
        )?;
        if let Some(motivo) = &self.motivo {
            write!(f, " motivo={}", motivo.como_str())?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// El publicador
// ---------------------------------------------------------------------------

/// El bucle de la operacion: mira, comprueba, ejecuta, decide, repite.
///
/// Guarda lo que hay que guardar entre pasos: el observador (A1), el ejecutor
/// (A3, que recuerda la ultima foto) y la escalera (A5, que pone el techo).
// Sin `Debug`/`Clone`: A1 (`Observador`) no los declara y este fichero no es
// quien para anadirle rasgos. Lo que si se puede clonar son sus piezas sueltas.
pub struct Publicador {
    observador: Observador,
    ejecutor: Ejecutor,
    escalera: Escalera,
}

impl Default for Publicador {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Publicador {
    pub fn nuevo() -> Self {
        Self {
            observador: Observador::nuevo(),
            ejecutor: Ejecutor::nuevo(),
            escalera: Escalera::nueva(),
        }
    }

    /// Un publicador con otro techo de reintentos. `0` = nunca reintentar.
    pub fn con_techo_de_intentos(techo: u32) -> Self {
        Self {
            observador: Observador::nuevo(),
            ejecutor: Ejecutor::nuevo(),
            escalera: Escalera::con_techo(techo),
        }
    }

    pub fn observador(&self) -> &Observador {
        &self.observador
    }

    pub fn ejecutor(&self) -> &Ejecutor {
        &self.ejecutor
    }

    /// PUBLICAR: recorre los pasos con mirada nueva delante de cada uno.
    ///
    /// `fuente` es el arbol (A1 lo lee por el puerto), `mano` es el aparato
    /// (A3 entrega gestos), `reloj` da el `momento` de cada mirada.
    pub fn publicar<F, S, R>(
        &mut self,
        fuente: &F,
        mano: &mut S,
        ambito: &SelloDeCuenta,
        reloj: &mut R,
        publicacion: &Publicacion,
    ) -> Informe
    where
        F: FuenteDeArbol + ?Sized,
        S: Superficie + ?Sized,
        R: FnMut() -> u64,
    {
        let miradas_antes = self.observador.miradas();
        let gestos_antes = self.ejecutor.gestos();
        let momento_inicio = reloj();

        let mut informe = Informe {
            capacidad: publicacion.capacidad.clone(),
            desenlace: Desenlace::Parado,
            motivo: None,
            paso: None,
            pasos_totales: publicacion.pasos.len(),
            pasos_ejecutados: 0,
            gestos: 0,
            miradas: 0,
            decisiones: Vec::new(),
            transcurrido_ms: 0,
        };

        // 0 · una receta sin pasos no se ejecuta
        if publicacion.pasos.is_empty() {
            informe.motivo = Some(MotivoDePublicacion::SinPasos);
            return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
        }

        let mut anterior: Option<&Paso> = None;

        for paso in publicacion.pasos {
            let mut intentos: u32 = 0;

            // El bucle de intentos de UN paso. Cada vuelta empieza con su
            // propia mirada: no hay ninguna rama que reutilice la foto.
            loop {
                // 1 · la mirada
                let hecho = match self.mirar(fuente, ambito, &mut *reloj) {
                    Ok(hecho) => hecho,
                    Err(motivo) => {
                        informe.motivo = Some(MotivoDePublicacion::SinMirada(motivo));
                        informe.paso = Some(paso.numero);
                        return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                    }
                };

                // 2 · U1: de quien es la pantalla (delante de CADA gesto)
                if let Err(parada) = comprobar_cuenta(&publicacion.cuenta_esperada, &hecho) {
                    informe.motivo = Some(MotivoDePublicacion::CuentaAjena(parada));
                    informe.paso = Some(paso.numero);
                    return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                }

                // 3 · la consecuencia del paso anterior, en esta misma foto
                if let Some(previo) = anterior {
                    if let Some(ancla) = &previo.consecuencia {
                        if !hecho.contiene(ancla) {
                            informe.motivo = Some(MotivoDePublicacion::ConsecuenciaNoVista {
                                paso: previo.numero,
                                ancla: ancla.clone(),
                            });
                            informe.paso = Some(previo.numero);
                            return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                        }
                    }
                }

                // 4 · el presupuesto declarado
                if let Some(techo_ms) = publicacion.techo_ms {
                    let transcurrido = hecho.momento.saturating_sub(momento_inicio);
                    if transcurrido > techo_ms {
                        informe.motivo = Some(MotivoDePublicacion::PresupuestoAgotado {
                            techo_ms,
                            transcurrido_ms: transcurrido,
                        });
                        informe.paso = Some(paso.numero);
                        return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                    }
                }

                // 5 · A3: un paso, una foto
                match self.ejecutor.ejecutar(&hecho, paso, mano) {
                    Resultado::Ejecutado(_) => break,
                    Resultado::Parado(parada) => {
                        // A5 decide. Este fichero obedece.
                        let decision = self.escalera.decidir(
                            &HechoDeFallo::nuevo(paso.numero, parada.motivo.familia(), parada.efecto)
                                .con_intentos(intentos)
                                .con_vuelta(anterior.is_some())
                                .con_ancla(paso.ancla.clone()),
                        );
                        let reintentar = decision.permite_reintentar()
                            && intentos < LIMITE_DURO_DE_REINTENTOS;
                        informe.decisiones.push(decision);

                        if reintentar {
                            intentos += 1;
                            // Se vuelve a mirar: el reintento tambien exige
                            // foto nueva (la anterior la consumio A3).
                            continue;
                        }

                        // Ni `Volver` ni `Escalar` se ejecutan aqui: la
                        // operacion se para y el informe lleva la decision de
                        // A5 con su remedio, que es lo que necesita quien
                        // recoja la senal.
                        informe.motivo = Some(MotivoDePublicacion::Paso(parada.clone()));
                        informe.paso = Some(parada.paso);
                        return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                    }
                }
            }

            informe.pasos_ejecutados += 1;
            anterior = Some(paso);
        }

        // 6 · la confirmacion: mirada nueva al terminar
        let hecho_final = match self.mirar(fuente, ambito, &mut *reloj) {
            Ok(hecho) => hecho,
            Err(motivo) => {
                informe.desenlace = Desenlace::SinConfirmar;
                informe.motivo = Some(MotivoDePublicacion::SinMirada(motivo));
                return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
            }
        };

        // La consecuencia del ultimo paso tambien se mira: si el ultimo paso no
        // dejo lo que tenia que dejar, no hay nada que confirmar.
        if let Some(ultimo) = anterior {
            if let Some(ancla) = &ultimo.consecuencia {
                if !hecho_final.contiene(ancla) {
                    informe.desenlace = Desenlace::SinConfirmar;
                    informe.motivo = Some(MotivoDePublicacion::ConsecuenciaNoVista {
                        paso: ultimo.numero,
                        ancla: ancla.clone(),
                    });
                    informe.paso = Some(ultimo.numero);
                    return self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio);
                }
            }
        }

        match publicacion.postcondicion {
            Some(ancla) if hecho_final.contiene(ancla) => {
                informe.desenlace = Desenlace::Publicado;
            }
            Some(ancla) => {
                informe.desenlace = Desenlace::SinConfirmar;
                informe.motivo = Some(MotivoDePublicacion::PostcondicionNoVista {
                    ancla: ancla.clone(),
                });
                informe.paso = Some(publicacion.pasos.len());
            }
            None => {
                // Sin ancla de postcondicion no se puede afirmar nada: los
                // pasos corrieron y eso es todo lo que se sabe.
                informe.desenlace = Desenlace::SinConfirmar;
                informe.motivo = Some(MotivoDePublicacion::SinConQueConfirmar);
            }
        }

        self.cerrar(informe, miradas_antes, gestos_antes, momento_inicio)
    }

    /// Una mirada nueva por el puerto de A1. Devuelve el hecho o el motivo.
    fn mirar<F, R>(
        &mut self,
        fuente: &F,
        ambito: &SelloDeCuenta,
        reloj: &mut R,
    ) -> Result<HechoObservado, Desconocido>
    where
        F: FuenteDeArbol + ?Sized,
        R: FnMut() -> u64,
    {
        let momento = reloj();
        match self.observador.mirar(fuente, ambito, momento) {
            Vista::Observado(hecho) => Ok(hecho),
            Vista::Desconocido(motivo) => Err(motivo),
        }
    }

    /// Cierra el informe con los contadores medidos (delta, no total).
    fn cerrar(
        &self,
        mut informe: Informe,
        miradas_antes: u64,
        gestos_antes: u64,
        momento_inicio: u64,
    ) -> Informe {
        informe.miradas = self.observador.miradas().saturating_sub(miradas_antes);
        informe.gestos = self.ejecutor.gestos().saturating_sub(gestos_antes);
        informe.transcurrido_ms = self
            .observador
            .ultima_vista()
            .hecho()
            .map(|hecho| hecho.momento.saturating_sub(momento_inicio))
            .unwrap_or(0);
        informe
    }
}

/// U1 delante de la pantalla: ¿la cuenta que se ve es la que se esperaba?
///
/// Se usa el `HechoVisible` reducido de `exclusividad` (cuenta + mirada), que es
/// lo unico que U1 necesita. `Indeterminado` cae del lado de no operar, como ya
/// decidio U1: aqui no se re-decide, se obedece.
fn comprobar_cuenta(esperada: &str, hecho: &HechoObservado) -> Result<(), ParadaDeCuenta> {
    let reducido = HechoDeCuenta::nueva(hecho.cuenta_visible.as_deref(), hecho.mirada);
    comprobar(esperada, &reducido).parar_si_no_coincide()
}
