//! Un lector/escritor de JSON minimo, para el canal y para el CLI.
//!
//! # Por que existe
//!
//! El crate tiene tres dependencias y ninguna es `serde`: se decidio que la
//! superficie nueva del bloque 16 fueran **solo** WebSocket y TLS (ver la nota
//! del `Cargo.toml`). Pero una orden del bus es JSON, y validarla "a ojo" con
//! `contains("\"accion\"")` es la clase de atajo que convierte un payload raro
//! en una orden ejecutada: dos claves iguales, un `simulacion` que es el texto
//! `"false"`, un objeto dentro de una lista... Nada de eso se detecta con
//! buscar subcadenas.
//!
//! Asi que hay un parser de verdad, pequeño y estricto, con una sola regla: **lo
//! que no entiende no lo adivina**. Si el texto no es JSON, devuelve el byte y
//! el motivo; si es JSON, devuelve un arbol de valores y cada campo se pide por
//! su nombre y su tipo.
//!
//! # Lo que NO es
//!
//!   - No es un parser de produccion para documentos grandes: no hay `Streaming`,
//!     ni prestamo de cadenas (`&str`), ni numeros enteros de 128 bits. Los
//!     payloads del bus son ordenes y resultados: objetos planos y pequeños.
//!   - No acepta lo que el estandar no acepta: comentarios, comas finales,
//!     claves sin comillas, `NaN`, cadenas con saltos de linea crudos.
//!
//! # La escritura
//!
//! `Valor::a_texto()` produce JSON valido y **estable** (el orden de las claves
//! es el del vector, no el de un `HashMap`): un resultado que cambia de orden en
//! cada emision es un resultado que no se puede comparar en un test.

use std::fmt;

/// Profundidad maxima de anidamiento. Un payload del bus es un objeto de dos
/// niveles; mas de esto es un ataque o un error, y en los dos casos se rechaza
/// con nombre en vez de reventar la pila.
pub const PROFUNDIDAD_MAXIMA: usize = 32;

/// Un valor JSON.
#[derive(Debug, Clone, PartialEq)]
pub enum Valor {
    Nulo,
    Bool(bool),
    Numero(f64),
    Texto(String),
    Lista(Vec<Valor>),
    /// Objeto con las claves **en el orden en que llegaron**. Si un payload
    /// repite una clave, el parser lo rechaza: quedarse con la ultima es
    /// exactamente como se cuela un `simulacion:false` detras de un `true`.
    Objeto(Vec<(String, Valor)>),
}

impl Valor {
    pub fn objeto(pares: Vec<(&str, Valor)>) -> Valor {
        Valor::Objeto(pares.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    }

    pub fn texto(v: impl Into<String>) -> Valor {
        Valor::Texto(v.into())
    }

    /// El valor de una clave, si esto es un objeto y la clave esta.
    pub fn obtener(&self, clave: &str) -> Option<&Valor> {
        match self {
            Valor::Objeto(pares) => pares.iter().find(|(k, _)| k == clave).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn como_texto(&self) -> Option<&str> {
        match self {
            Valor::Texto(t) => Some(t.as_str()),
            _ => None,
        }
    }

    pub fn como_bool(&self) -> Option<bool> {
        match self {
            Valor::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn como_numero(&self) -> Option<f64> {
        match self {
            Valor::Numero(n) => Some(*n),
            _ => None,
        }
    }

    pub fn es_nulo(&self) -> bool {
        matches!(self, Valor::Nulo)
    }

    /// El nombre del tipo, para los mensajes de fallo. Se dice lo que llego, no
    /// lo que se esperaba: el que se equivoco fue el payload.
    pub fn tipo(&self) -> &'static str {
        match self {
            Valor::Nulo => "nulo",
            Valor::Bool(_) => "booleano",
            Valor::Numero(_) => "numero",
            Valor::Texto(_) => "texto",
            Valor::Lista(_) => "lista",
            Valor::Objeto(_) => "objeto",
        }
    }

    /// JSON valido. El orden de las claves es el que tiene el valor.
    pub fn a_texto(&self) -> String {
        let mut salida = String::new();
        self.escribir(&mut salida);
        salida
    }

    fn escribir(&self, salida: &mut String) {
        match self {
            Valor::Nulo => salida.push_str("null"),
            Valor::Bool(true) => salida.push_str("true"),
            Valor::Bool(false) => salida.push_str("false"),
            Valor::Numero(n) => {
                // Un entero se escribe sin `.0`, que es lo que espera cualquiera
                // que lea el payload con un ojo puesto en el numero.
                if n.is_finite() && n.fract() == 0.0 && n.abs() < 9.007_199_254_740_992e15 {
                    salida.push_str(&format!("{}", *n as i64));
                } else if n.is_finite() {
                    salida.push_str(&format!("{n}"));
                } else {
                    // No se puede representar en JSON: se escribe `null` en vez
                    // de inventar un token que el otro lado no sabra leer.
                    salida.push_str("null");
                }
            }
            Valor::Texto(t) => escribir_cadena(t, salida),
            Valor::Lista(items) => {
                salida.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        salida.push(',');
                    }
                    item.escribir(salida);
                }
                salida.push(']');
            }
            Valor::Objeto(pares) => {
                salida.push('{');
                for (i, (k, v)) in pares.iter().enumerate() {
                    if i > 0 {
                        salida.push(',');
                    }
                    escribir_cadena(k, salida);
                    salida.push(':');
                    v.escribir(salida);
                }
                salida.push('}');
            }
        }
    }
}

fn escribir_cadena(t: &str, salida: &mut String) {
    salida.push('"');
    for ch in t.chars() {
        match ch {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            '\u{08}' => salida.push_str("\\b"),
            '\u{0c}' => salida.push_str("\\f"),
            c if (c as u32) < 0x20 => salida.push_str(&format!("\\u{:04x}", c as u32)),
            c => salida.push(c),
        }
    }
    salida.push('"');
}

// ---------------------------------------------------------------------------
// El fallo del parser (con posicion: sin ella, depurar es adivinar)
// ---------------------------------------------------------------------------

/// Por que un texto no es JSON. Siempre con el byte donde se rompio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FalloDeJson {
    pub motivo: String,
    pub posicion: usize,
}

impl FalloDeJson {
    fn nuevo(motivo: impl Into<String>, posicion: usize) -> Self {
        Self { motivo: motivo.into(), posicion }
    }
}

impl fmt::Display for FalloDeJson {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "json invalido en el byte {}: {}", self.posicion, self.motivo)
    }
}

/// Parsea un texto JSON completo (sin basura detras).
pub fn leer(texto: &str) -> Result<Valor, FalloDeJson> {
    let bytes: Vec<char> = texto.chars().collect();
    let mut p = Parser { c: &bytes, i: 0 };

    p.saltar_blancos();
    let valor = p.valor(0)?;
    p.saltar_blancos();
    if p.i != p.c.len() {
        return Err(FalloDeJson::nuevo("sobra texto despues del valor", p.i));
    }
    Ok(valor)
}

struct Parser<'a> {
    c: &'a [char],
    i: usize,
}

impl<'a> Parser<'a> {
    fn mirar(&self) -> Option<char> {
        self.c.get(self.i).copied()
    }

    fn saltar_blancos(&mut self) {
        while let Some(ch) = self.mirar() {
            if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
                self.i += 1;
            } else {
                break;
            }
        }
    }

    fn esperar(&mut self, ch: char) -> Result<(), FalloDeJson> {
        match self.mirar() {
            Some(c) if c == ch => {
                self.i += 1;
                Ok(())
            }
            Some(c) => Err(FalloDeJson::nuevo(format!("se esperaba '{ch}' y hay '{c}'"), self.i)),
            None => Err(FalloDeJson::nuevo(format!("se esperaba '{ch}' y se acabo el texto"), self.i)),
        }
    }

    fn valor(&mut self, profundidad: usize) -> Result<Valor, FalloDeJson> {
        if profundidad > PROFUNDIDAD_MAXIMA {
            return Err(FalloDeJson::nuevo("demasiados niveles de anidamiento", self.i));
        }
        match self.mirar() {
            None => Err(FalloDeJson::nuevo("se esperaba un valor y se acabo el texto", self.i)),
            Some('{') => self.objeto(profundidad),
            Some('[') => self.lista(profundidad),
            Some('"') => Ok(Valor::Texto(self.cadena()?)),
            Some('t') => self.literal("true", Valor::Bool(true)),
            Some('f') => self.literal("false", Valor::Bool(false)),
            Some('n') => self.literal("null", Valor::Nulo),
            Some(c) if c == '-' || c.is_ascii_digit() => self.numero(),
            Some(c) => Err(FalloDeJson::nuevo(format!("'{c}' no empieza ningun valor"), self.i)),
        }
    }

    fn literal(&mut self, palabra: &str, valor: Valor) -> Result<Valor, FalloDeJson> {
        for esperado in palabra.chars() {
            if self.mirar() != Some(esperado) {
                return Err(FalloDeJson::nuevo(format!("se esperaba '{palabra}'"), self.i));
            }
            self.i += 1;
        }
        Ok(valor)
    }

    fn objeto(&mut self, profundidad: usize) -> Result<Valor, FalloDeJson> {
        self.esperar('{')?;
        let mut pares: Vec<(String, Valor)> = Vec::new();
        self.saltar_blancos();
        if self.mirar() == Some('}') {
            self.i += 1;
            return Ok(Valor::Objeto(pares));
        }
        loop {
            self.saltar_blancos();
            if self.mirar() != Some('"') {
                return Err(FalloDeJson::nuevo("la clave de un objeto va entre comillas", self.i));
            }
            let clave = self.cadena()?;
            if pares.iter().any(|(k, _)| *k == clave) {
                // Repetir una clave es la forma mas silenciosa de cambiar una
                // orden: el ultimo gana y nadie lo ve.
                return Err(FalloDeJson::nuevo(format!("la clave '{clave}' esta repetida"), self.i));
            }
            self.saltar_blancos();
            self.esperar(':')?;
            self.saltar_blancos();
            let valor = self.valor(profundidad + 1)?;
            pares.push((clave, valor));
            self.saltar_blancos();
            match self.mirar() {
                Some(',') => {
                    self.i += 1;
                }
                Some('}') => {
                    self.i += 1;
                    return Ok(Valor::Objeto(pares));
                }
                Some(c) => {
                    return Err(FalloDeJson::nuevo(
                        format!("se esperaba ',' o '}}' y hay '{c}'"),
                        self.i,
                    ))
                }
                None => return Err(FalloDeJson::nuevo("objeto sin cerrar", self.i)),
            }
        }
    }

    fn lista(&mut self, profundidad: usize) -> Result<Valor, FalloDeJson> {
        self.esperar('[')?;
        let mut items = Vec::new();
        self.saltar_blancos();
        if self.mirar() == Some(']') {
            self.i += 1;
            return Ok(Valor::Lista(items));
        }
        loop {
            self.saltar_blancos();
            items.push(self.valor(profundidad + 1)?);
            self.saltar_blancos();
            match self.mirar() {
                Some(',') => {
                    self.i += 1;
                }
                Some(']') => {
                    self.i += 1;
                    return Ok(Valor::Lista(items));
                }
                Some(c) => {
                    return Err(FalloDeJson::nuevo(
                        format!("se esperaba ',' o ']' y hay '{c}'"),
                        self.i,
                    ))
                }
                None => return Err(FalloDeJson::nuevo("lista sin cerrar", self.i)),
            }
        }
    }

    fn cadena(&mut self) -> Result<String, FalloDeJson> {
        self.esperar('"')?;
        let mut salida = String::new();
        loop {
            let ch = match self.mirar() {
                Some(c) => c,
                None => return Err(FalloDeJson::nuevo("cadena sin cerrar", self.i)),
            };
            self.i += 1;
            match ch {
                '"' => return Ok(salida),
                '\\' => {
                    let esc = match self.mirar() {
                        Some(c) => c,
                        None => return Err(FalloDeJson::nuevo("escape sin terminar", self.i)),
                    };
                    self.i += 1;
                    match esc {
                        '"' => salida.push('"'),
                        '\\' => salida.push('\\'),
                        '/' => salida.push('/'),
                        'b' => salida.push('\u{08}'),
                        'f' => salida.push('\u{0c}'),
                        'n' => salida.push('\n'),
                        'r' => salida.push('\r'),
                        't' => salida.push('\t'),
                        'u' => {
                            let mut codigo: u32 = 0;
                            for _ in 0..4 {
                                let h = match self.mirar() {
                                    Some(c) => c,
                                    None => {
                                        return Err(FalloDeJson::nuevo(
                                            "escape \\u incompleto",
                                            self.i,
                                        ))
                                    }
                                };
                                let digito = match h.to_digit(16) {
                                    Some(d) => d,
                                    None => {
                                        return Err(FalloDeJson::nuevo(
                                            format!("'{h}' no es un digito hexadecimal"),
                                            self.i,
                                        ))
                                    }
                                };
                                codigo = codigo * 16 + digito;
                                self.i += 1;
                            }
                            // Un surrogado suelto no es un caracter: se sustituye
                            // por U+FFFD en vez de romper el parseo entero.
                            salida.push(char::from_u32(codigo).unwrap_or('\u{fffd}'));
                        }
                        otro => {
                            return Err(FalloDeJson::nuevo(
                                format!("escape '\\{otro}' no existe"),
                                self.i,
                            ))
                        }
                    }
                }
                c if (c as u32) < 0x20 => {
                    // Un salto de linea crudo dentro de una cadena: el estandar
                    // lo prohibe y aqui tambien.
                    return Err(FalloDeJson::nuevo("caracter de control sin escapar", self.i));
                }
                c => salida.push(c),
            }
        }
    }

    fn numero(&mut self) -> Result<Valor, FalloDeJson> {
        let inicio = self.i;
        if self.mirar() == Some('-') {
            self.i += 1;
        }
        let mut digitos = 0;
        while let Some(c) = self.mirar() {
            if c.is_ascii_digit() {
                digitos += 1;
                self.i += 1;
            } else {
                break;
            }
        }
        if digitos == 0 {
            return Err(FalloDeJson::nuevo("numero sin digitos", self.i));
        }
        if self.mirar() == Some('.') {
            self.i += 1;
            let mut decimales = 0;
            while let Some(c) = self.mirar() {
                if c.is_ascii_digit() {
                    decimales += 1;
                    self.i += 1;
                } else {
                    break;
                }
            }
            if decimales == 0 {
                return Err(FalloDeJson::nuevo("numero con punto y sin decimales", self.i));
            }
        }
        if let Some(c) = self.mirar() {
            if c == 'e' || c == 'E' {
                self.i += 1;
                if let Some(s) = self.mirar() {
                    if s == '+' || s == '-' {
                        self.i += 1;
                    }
                }
                let mut exp = 0;
                while let Some(d) = self.mirar() {
                    if d.is_ascii_digit() {
                        exp += 1;
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                if exp == 0 {
                    return Err(FalloDeJson::nuevo("exponente sin digitos", self.i));
                }
            }
        }
        let crudo: String = self.c[inicio..self.i].iter().collect();
        match crudo.parse::<f64>() {
            Ok(n) => Ok(Valor::Numero(n)),
            Err(_) => Err(FalloDeJson::nuevo(format!("'{crudo}' no es un numero"), inicio)),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn lee_un_objeto_plano_y_respeta_el_orden() {
        let v = leer(r#"{"accion":"publicar","red":"instagram","simulacion":true}"#)
            .expect("tiene que parsear");
        assert_eq!(v.obtener("accion").and_then(Valor::como_texto), Some("publicar"));
        assert_eq!(v.obtener("simulacion").and_then(Valor::como_bool), Some(true));
        assert_eq!(
            v.a_texto(),
            r#"{"accion":"publicar","red":"instagram","simulacion":true}"#
        );
    }

    #[test]
    fn un_simulacion_que_es_texto_no_es_un_booleano() {
        let v = leer(r#"{"simulacion":"false"}"#).expect("parsea");
        assert_eq!(v.obtener("simulacion").and_then(Valor::como_bool), None);
        assert_eq!(v.obtener("simulacion").map(Valor::tipo), Some("texto"));
    }

    #[test]
    fn rechaza_la_clave_repetida_y_la_basura_detras() {
        assert!(leer(r#"{"simulacion":true,"simulacion":false}"#).is_err());
        assert!(leer(r#"{"a":1} sobra"#).is_err());
        assert!(leer(r#"{"a":1,}"#).is_err());
        assert!(leer(" ").is_err());
    }

    #[test]
    fn escribe_cadenas_escapadas_y_lee_lo_escrito() {
        let original = Valor::objeto(vec![("texto", Valor::texto("linea\n\"dos\"\ty ñ"))]);
        let texto = original.a_texto();
        assert_eq!(leer(&texto).expect("ida y vuelta").a_texto(), texto);
    }
}
