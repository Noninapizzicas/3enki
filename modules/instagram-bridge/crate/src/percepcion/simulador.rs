//! El ARBOL DE NODOS FALSO — la pieza que hace testeable la mano sin un movil.
//!
//! Un `Arbol` es lo que el aparato entrega cuando mira: pantalla, cuenta visible,
//! como de entera fue la mirada y un arbol de nodos con identidad, texto, caja y
//! si se puede tocar. El `Simulador` lo construye en memoria y lo puede MUTAR,
//! que es lo que simula "la pantalla cambio": anadir un dialogo, quitar un boton,
//! moverlo, cegar el servicio.
//!
//! Sin esto, A1 (observador), A3 (ejecutor) y A5 (escalera) solo se podrian
//! probar con un movil delante y una cuenta real. Con esto, `cargo test` en el
//! servidor prueba el bucle entero: mirar, mutar, volver a mirar.
//!
//! Reglas del simulador (las mismas que el aparato real):
//!   - **Ids unicos.** Un id repetido es un error del simulador, no un arbol
//!     raro: el `view-id` de Android identifica un nodo.
//!   - **Lo invisible no se entrega.** Un nodo con `visible_al_usuario = false`
//!     no viaja en el hecho, ni el ni su subarbol: lo que no se ve no es un hecho.
//!   - **Cada mutacion deja version.** `version` sube con cada cambio del arbol,
//!     para que una foto vieja se pueda reconocer como vieja.
//!   - **Cegar no borra.** `Cambio::Cegar` no toca el arbol: hace que la proxima
//!     lectura devuelva `Err(SinMirada)`. Es exactamente lo que pasa cuando el
//!     servicio de accesibilidad se cae con la pantalla llena.
//!
//! Sin dependencias: solo `std`.

use std::fmt;

use super::observador::FuenteDeArbol;
use super::{Mirada, SinMirada};

/// Contador de seguridad del recorrido. El arbol de Android puede ser enorme;
/// un recorrido sin tope es una forma comoda de colgar el aparato.
pub const LIMITE_DE_NODOS: usize = 4000;

/// Las pantallas declaradas. Espejo de `PANTALLAS` en `core/formas.js`: una
/// lista cerrada convierte un typo en un fallo nombrado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pantalla {
    Perfil,
    Inicio,
    Crear,
    Dm,
    Comentarios,
    Desconocida,
}

impl Pantalla {
    pub fn como_str(&self) -> &'static str {
        match self {
            Pantalla::Perfil => "perfil",
            Pantalla::Inicio => "inicio",
            Pantalla::Crear => "crear",
            Pantalla::Dm => "dm",
            Pantalla::Comentarios => "comentarios",
            Pantalla::Desconocida => "desconocida",
        }
    }

    /// Desde el nombre del bus. Lo que no se reconoce es `Desconocida`, que es
    /// un valor declarado y no un relleno.
    pub fn desde_str(v: &str) -> Self {
        match v.trim().to_ascii_lowercase().as_str() {
            "perfil" => Pantalla::Perfil,
            "inicio" => Pantalla::Inicio,
            "crear" => Pantalla::Crear,
            "dm" => Pantalla::Dm,
            "comentarios" => Pantalla::Comentarios,
            _ => Pantalla::Desconocida,
        }
    }
}

impl fmt::Display for Pantalla {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Que es el nodo. Espejo de `TIPOS_ANCLA` en `core/formas.js`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Tipo {
    Boton,
    Campo,
    Texto,
    Imagen,
    Desconocido,
}

impl Tipo {
    pub fn como_str(&self) -> &'static str {
        match self {
            Tipo::Boton => "boton",
            Tipo::Campo => "campo",
            Tipo::Texto => "texto",
            Tipo::Imagen => "imagen",
            Tipo::Desconocido => "desconocido",
        }
    }

    /// Tipo a partir de lo que declara el aparato. Lo que no se reconoce es
    /// `Desconocido`, nombrado: no se adivina por el nombre del boton.
    pub fn desde_str(v: &str) -> Self {
        match v.trim().to_ascii_lowercase().as_str() {
            "boton" | "button" => Tipo::Boton,
            "campo" | "edittext" | "campo_de_texto" => Tipo::Campo,
            "texto" | "text" | "textview" => Tipo::Texto,
            "imagen" | "image" | "imageview" => Tipo::Imagen,
            _ => Tipo::Desconocido,
        }
    }
}

impl fmt::Display for Tipo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// La caja del nodo en coordenadas de pantalla (`getBoundsInScreen`).
///
/// Se guarda tal cual la da el aparato: ni se normaliza ni se redondea. Una
/// caja vacia (ancho o alto cero) es un nodo que existe pero no ocupa sitio, y
/// eso se puede decir sin inventar nada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Caja {
    pub x: i32,
    pub y: i32,
    pub ancho: i32,
    pub alto: i32,
}

impl Caja {
    pub fn nueva(x: i32, y: i32, ancho: i32, alto: i32) -> Self {
        Self { x, y, ancho, alto }
    }

    pub fn esta_vacia(&self) -> bool {
        self.ancho <= 0 || self.alto <= 0
    }

    /// Centro de la caja: el punto que A3 toca cuando el nodo es tocable.
    pub fn centro(&self) -> (i32, i32) {
        (self.x + self.ancho / 2, self.y + self.alto / 2)
    }

    pub fn contiene(&self, x: i32, y: i32) -> bool {
        x >= self.x && x <= self.x + self.ancho && y >= self.y && y <= self.y + self.alto
    }
}

impl fmt::Display for Caja {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{},{} {}x{}]", self.x, self.y, self.ancho, self.alto)
    }
}

/// Un nodo del arbol de accesibilidad, reducido a lo que el puente necesita.
///
/// `id` es la identidad (`getViewIdResourceName`, o un id sintetico por
/// posicion si la app no declara ninguno). `texto` y `descripcion` son las dos
/// cosas que una persona lee; el nombre visible efectivo es `ancla()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nodo {
    pub id: String,
    pub texto: Option<String>,
    pub descripcion: Option<String>,
    pub tipo: Tipo,
    pub caja: Caja,
    pub tocable: bool,
    pub visible_al_usuario: bool,
    pub hijos: Vec<Nodo>,
}

impl Nodo {
    pub fn nuevo(id: impl Into<String>, tipo: Tipo) -> Self {
        Self {
            id: id.into(),
            texto: None,
            descripcion: None,
            tipo,
            caja: Caja::default(),
            tocable: false,
            visible_al_usuario: true,
            hijos: Vec::new(),
        }
    }

    /// Atajo para el caso de todos los dias: un boton tocable con nombre visible.
    pub fn boton(id: impl Into<String>, nombre: impl Into<String>) -> Self {
        Self::nuevo(id, Tipo::Boton).con_texto(nombre).tocable()
    }

    pub fn con_texto(mut self, texto: impl Into<String>) -> Self {
        self.texto = Some(texto.into());
        self
    }

    pub fn con_descripcion(mut self, descripcion: impl Into<String>) -> Self {
        self.descripcion = Some(descripcion.into());
        self
    }

    pub fn con_caja(mut self, caja: Caja) -> Self {
        self.caja = caja;
        self
    }

    pub fn con_caja_en(mut self, x: i32, y: i32, ancho: i32, alto: i32) -> Self {
        self.caja = Caja::nueva(x, y, ancho, alto);
        self
    }

    /// Marca el nodo como tocable (`isClickable` en el aparato).
    pub fn tocable(mut self) -> Self {
        self.tocable = true;
        self
    }

    pub fn no_tocable(mut self) -> Self {
        self.tocable = false;
        self
    }

    /// El nodo existe en el arbol pero no se ve (fuera de pantalla, oculto).
    pub fn oculto(mut self) -> Self {
        self.visible_al_usuario = false;
        self
    }

    pub fn con_hijo(mut self, hijo: Nodo) -> Self {
        self.hijos.push(hijo);
        self
    }

    pub fn con_hijos(mut self, hijos: Vec<Nodo>) -> Self {
        self.hijos.extend(hijos);
        self
    }

    /// El nombre visible efectivo: el texto y, si no hay, la descripcion.
    ///
    /// Es lo que compara un ancla. No se compone "texto + descripcion": un
    /// ancla se busca por UNA etiqueta, no por una frase pegada.
    pub fn ancla(&self) -> Option<&str> {
        util(&self.texto).or_else(|| util(&self.descripcion))
    }

    /// Recorrido que SALTA lo invisible y su subarbol: lo que no se ve no es un
    /// hecho, y los hijos de un contenedor oculto tampoco se ven.
    ///
    /// Con tope (`LIMITE_DE_NODOS`): un arbol de Android puede ser enorme y un
    /// recorrido sin freno es una forma comoda de colgar el aparato.
    pub fn recorrer_visibles<F: FnMut(&Nodo, Option<&str>, usize)>(
        &self,
        padre: Option<&str>,
        profundidad: usize,
        f: &mut F,
    ) {
        let mut restantes = LIMITE_DE_NODOS;
        self.recorrer_visibles_con_tope(padre, profundidad, f, &mut restantes);
    }

    fn recorrer_visibles_con_tope<F: FnMut(&Nodo, Option<&str>, usize)>(
        &self,
        padre: Option<&str>,
        profundidad: usize,
        f: &mut F,
        restantes: &mut usize,
    ) {
        if !self.visible_al_usuario || *restantes == 0 {
            return;
        }
        *restantes -= 1;
        f(self, padre, profundidad);
        for hijo in &self.hijos {
            if *restantes == 0 {
                break;
            }
            hijo.recorrer_visibles_con_tope(Some(&self.id), profundidad + 1, f, restantes);
        }
    }

    pub fn buscar(&self, id: &str) -> Option<&Nodo> {
        if self.id == id {
            return Some(self);
        }
        self.hijos.iter().find_map(|h| h.buscar(id))
    }

    pub fn buscar_mut(&mut self, id: &str) -> Option<&mut Nodo> {
        if self.id == id {
            return Some(self);
        }
        self.hijos.iter_mut().find_map(|h| h.buscar_mut(id))
    }

    /// Quita el nodo con ese id del subarbol. Devuelve `true` si lo encontro.
    pub fn quitar(&mut self, id: &str) -> bool {
        if let Some(pos) = self.hijos.iter().position(|h| h.id == id) {
            self.hijos.remove(pos);
            return true;
        }
        self.hijos.iter_mut().any(|h| h.quitar(id))
    }

}

fn util(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Lo que el aparato entrega al mirar: la foto entera, no una conclusion.
///
/// Lleva la pantalla, la cuenta visible, como de entera fue la mirada (y por que
/// si fue parcial) y el arbol. `version` sube con cada mutacion del simulador:
/// es lo que permite decir "esta foto es la de antes".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arbol {
    pub pantalla: Pantalla,
    pub plataforma: String,
    pub cuenta_visible: Option<String>,
    pub mirada: Mirada,
    pub motivo_sin_mirada: Option<String>,
    pub version: u64,
    pub raiz: Nodo,
}

impl Arbol {
    /// Arbol de una pantalla sin nada dentro, todavia completa.
    pub fn nuevo(pantalla: Pantalla) -> Self {
        Self {
            pantalla,
            plataforma: "instagram".to_string(),
            cuenta_visible: None,
            mirada: Mirada::Completa,
            motivo_sin_mirada: None,
            version: 0,
            raiz: Nodo::nuevo("raiz", Tipo::Desconocido),
        }
    }

    pub fn con_cuenta(mut self, cuenta: impl Into<String>) -> Self {
        self.cuenta_visible = Some(cuenta.into());
        self
    }

    pub fn con_hijo(mut self, nodo: Nodo) -> Self {
        self.raiz.hijos.push(nodo);
        self
    }

    /// Marca la foto como parcial y dice por que.
    pub fn parcial(mut self, motivo: impl Into<String>) -> Self {
        self.mirada = Mirada::Parcial;
        self.motivo_sin_mirada = Some(motivo.into());
        self
    }
}

/// Una mutacion del arbol: "la pantalla cambio".
///
/// Cada variante existe porque el bloque 5 la necesita para probar algo real:
/// un dialogo que aparece (`Anadir`), un boton que desaparece (`Quitar`), un
/// campo que se rellena (`CambiarTexto`), la lista que se desplaza (`Mover`),
/// un boton que se habilita al validar (`Habilitar`) y el servicio que se cae
/// (`Cegar`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cambio {
    Anadir { padre: String, nodo: Nodo },
    Quitar { id: String },
    CambiarTexto { id: String, texto: Option<String> },
    Mover { id: String, caja: Caja },
    Habilitar { id: String, tocable: bool },
    Ocultar { id: String, visible: bool },
    CambiarPantalla(Pantalla),
    CambiarCuenta(Option<String>),
    DeclararParcial { motivo: String },
    DeclararCompleta,
    /// El servicio deja de poder mirar. NO toca el arbol.
    Cegar(SinMirada),
    /// El servicio vuelve.
    DevolverLaVista,
}

/// Por que una mutacion no se pudo aplicar. Un cambio que no se aplica y no lo
/// dice convierte un test en una mentira.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CambioFallido {
    pub motivo: &'static str,
    pub id: String,
}

impl CambioFallido {
    pub fn nuevo(motivo: &'static str, id: impl Into<String>) -> Self {
        Self { motivo, id: id.into() }
    }
}

impl fmt::Display for CambioFallido {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "no se pudo mutar el arbol ({}): {}", self.motivo, self.id)
    }
}

impl std::error::Error for CambioFallido {}

/// El arbol falso: se construye, se mira y se muta. Sin Android.
///
/// Implementa `FuenteDeArbol`, que es el puerto que consume A1: para el
/// observador, el simulador y el puente de accesibilidad son intercambiables.
#[derive(Debug, Clone)]
pub struct Simulador {
    arbol: Arbol,
    cegado: Option<SinMirada>,
}

impl Simulador {
    pub fn nueva(pantalla: Pantalla) -> Self {
        Self { arbol: Arbol::nuevo(pantalla), cegado: None }
    }

    /// Atajo: un simulador de `inicio` con una cuenta ya puesta.
    pub fn con_cuenta(cuenta: impl Into<String>) -> Self {
        Self { arbol: Arbol::nuevo(Pantalla::Inicio).con_cuenta(cuenta), cegado: None }
    }

    pub fn con_hijo(mut self, nodo: Nodo) -> Self {
        self.arbol.raiz.hijos.push(nodo);
        self
    }

    pub fn con_nodo(self, nodo: Nodo) -> Self {
        self.con_hijo(nodo)
    }

    pub fn arbol(&self) -> &Arbol {
        &self.arbol
    }

    /// Una copia de la foto actual (lo que devolveria el aparato al mirar).
    pub fn foto(&self) -> Arbol {
        self.arbol.clone()
    }

    pub fn version(&self) -> u64 {
        self.arbol.version
    }

    pub fn esta_cegado(&self) -> bool {
        self.cegado.is_some()
    }

    /// MUTAR: simula que la pantalla cambio.
    ///
    /// Aplica el cambio y sube la version del arbol. Los cambios que no tocan
    /// el arbol (`Cegar`, `DevolverLaVista`) no suben la version: la foto sigue
    /// siendo la misma, lo que cambia es si se puede mirar.
    pub fn mutar(&mut self, cambio: Cambio) -> Result<(), CambioFallido> {
        match cambio {
            Cambio::Anadir { padre, nodo } => {
                if self.arbol.raiz.buscar(&nodo.id).is_some() {
                    return Err(CambioFallido::nuevo("id_duplicado", nodo.id));
                }
                let destino = self
                    .arbol
                    .raiz
                    .buscar_mut(&padre)
                    .ok_or_else(|| CambioFallido::nuevo("padre_no_encontrado", padre.clone()))?;
                destino.hijos.push(nodo);
            }
            Cambio::Quitar { id } => {
                if !self.arbol.raiz.quitar(&id) {
                    return Err(CambioFallido::nuevo("nodo_no_encontrado", id));
                }
            }
            Cambio::CambiarTexto { id, texto } => {
                let nodo = self
                    .arbol
                    .raiz
                    .buscar_mut(&id)
                    .ok_or_else(|| CambioFallido::nuevo("nodo_no_encontrado", id.clone()))?;
                nodo.texto = texto;
            }
            Cambio::Mover { id, caja } => {
                let nodo = self
                    .arbol
                    .raiz
                    .buscar_mut(&id)
                    .ok_or_else(|| CambioFallido::nuevo("nodo_no_encontrado", id.clone()))?;
                nodo.caja = caja;
            }
            Cambio::Habilitar { id, tocable } => {
                let nodo = self
                    .arbol
                    .raiz
                    .buscar_mut(&id)
                    .ok_or_else(|| CambioFallido::nuevo("nodo_no_encontrado", id.clone()))?;
                nodo.tocable = tocable;
            }
            Cambio::Ocultar { id, visible } => {
                let nodo = self
                    .arbol
                    .raiz
                    .buscar_mut(&id)
                    .ok_or_else(|| CambioFallido::nuevo("nodo_no_encontrado", id.clone()))?;
                nodo.visible_al_usuario = visible;
            }
            Cambio::CambiarPantalla(pantalla) => {
                self.arbol.pantalla = pantalla;
            }
            Cambio::CambiarCuenta(cuenta) => {
                self.arbol.cuenta_visible = cuenta;
            }
            Cambio::DeclararParcial { motivo } => {
                self.arbol.mirada = Mirada::Parcial;
                self.arbol.motivo_sin_mirada = Some(motivo);
            }
            Cambio::DeclararCompleta => {
                self.arbol.mirada = Mirada::Completa;
                self.arbol.motivo_sin_mirada = None;
            }
            Cambio::Cegar(motivo) => {
                self.cegado = Some(motivo);
                return Ok(());
            }
            Cambio::DevolverLaVista => {
                self.cegado = None;
                return Ok(());
            }
        }
        self.arbol.version += 1;
        Ok(())
    }
}

/// Para A1, el simulador es una fuente mas: devuelve la foto actual o el motivo
/// por el que no se puede mirar (ver `Cambio::Cegar`).
impl FuenteDeArbol for Simulador {
    fn leer(&self) -> Result<Arbol, SinMirada> {
        match self.cegado {
            Some(motivo) => Err(motivo),
            None => Ok(self.arbol.clone()),
        }
    }
}
