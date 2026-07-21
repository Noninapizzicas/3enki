//! Geometría de TRAZOS — determinista, sin modelo. trazos → formas.
//!
//! El motor da GEOMETRÍA cruda (la mitad REFLEJO del perceptor): qué forma tiene
//! cada trazo (línea/círculo/rectángulo/triángulo/polígono/trazo_libre), su caja
//! y su nº de vértices. La INTENCIÓN (una flecha, un boceto, un tachón) la infiere
//! el LLM. Aquí no se adivina nada: solo se mide.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize)]
pub struct Punto {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize)]
pub struct Bbox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Serialize)]
pub struct Elemento {
    pub tipo: String, // linea · circulo · rectangulo · triangulo · poligono · trazo_libre · punto
    pub bbox: Bbox,
    pub cerrado: bool,
    pub n_puntos: usize,
    pub n_vertices: usize, // vértices tras simplificar (RDP)
}

/// Interpreta una lista de trazos (cada trazo = lista de puntos) → elementos.
/// Los trazos con menos de 2 puntos se clasifican como "punto".
pub fn interpretar(trazos: &[Vec<Punto>]) -> Vec<Elemento> {
    trazos.iter().map(|t| clasificar(t)).collect()
}

fn clasificar(pts: &[Punto]) -> Elemento {
    let bbox = bbox(pts);
    let n_puntos = pts.len();

    if n_puntos < 2 {
        return Elemento {
            tipo: "punto".into(),
            bbox,
            cerrado: false,
            n_puntos,
            n_vertices: n_puntos,
        };
    }

    let diag = (bbox.w * bbox.w + bbox.h * bbox.h).sqrt().max(1e-9);

    // Cerrado: el extremo vuelve cerca del inicio (respecto al tamaño del trazo).
    let directo = dist(&pts[0], &pts[n_puntos - 1]);
    let cerrado = directo < 0.2 * diag && n_puntos >= 4;

    // Simplifica el trazo (Ramer–Douglas–Peucker) → vértices reales.
    let eps = 0.03 * diag;
    let simpl = rdp(pts, eps);
    // Para un polígono cerrado el último vértice repite el primero: no lo contamos.
    let n_vertices = if cerrado && simpl.len() >= 2 {
        simpl.len() - 1
    } else {
        simpl.len()
    };

    let largo = longitud(pts);

    let tipo = if !cerrado {
        // Abierto: recto (≈ una sola dirección) → línea; si no, trazo libre.
        let rectitud = if largo > 0.0 { directo / largo } else { 0.0 };
        if rectitud > 0.9 && n_vertices <= 3 {
            "linea"
        } else {
            "trazo_libre"
        }
    } else {
        // Cerrado: círculo por circularidad; si no, por nº de lados.
        let area = area_shoelace(pts).abs();
        let circularidad = if largo > 0.0 {
            4.0 * std::f64::consts::PI * area / (largo * largo)
        } else {
            0.0
        };
        if circularidad > 0.85 {
            "circulo"
        } else {
            match n_vertices {
                3 => "triangulo",
                4 => "rectangulo",
                _ => "poligono",
            }
        }
    };

    Elemento {
        tipo: tipo.into(),
        bbox,
        cerrado,
        n_puntos,
        n_vertices,
    }
}

fn bbox(pts: &[Punto]) -> Bbox {
    if pts.is_empty() {
        return Bbox { x: 0.0, y: 0.0, w: 0.0, h: 0.0 };
    }
    let (mut minx, mut miny) = (f64::INFINITY, f64::INFINITY);
    let (mut maxx, mut maxy) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
    for p in pts {
        minx = minx.min(p.x);
        miny = miny.min(p.y);
        maxx = maxx.max(p.x);
        maxy = maxy.max(p.y);
    }
    Bbox {
        x: r(minx),
        y: r(miny),
        w: r(maxx - minx),
        h: r(maxy - miny),
    }
}

fn dist(a: &Punto, b: &Punto) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

fn longitud(pts: &[Punto]) -> f64 {
    pts.windows(2).map(|w| dist(&w[0], &w[1])).sum()
}

/// Área del polígono por la fórmula del cordón (shoelace). Firmada.
fn area_shoelace(pts: &[Punto]) -> f64 {
    let n = pts.len();
    if n < 3 {
        return 0.0;
    }
    let mut s = 0.0;
    for i in 0..n {
        let a = &pts[i];
        let b = &pts[(i + 1) % n];
        s += a.x * b.y - b.x * a.y;
    }
    s / 2.0
}

/// Distancia perpendicular de p a la recta a–b.
fn perp(p: &Punto, a: &Punto, b: &Punto) -> f64 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let den = (dx * dx + dy * dy).sqrt();
    if den < 1e-12 {
        return dist(p, a);
    }
    ((dy * p.x - dx * p.y + b.x * a.y - b.y * a.x).abs()) / den
}

/// Ramer–Douglas–Peucker: simplifica el polilínea conservando vértices cuya
/// desviación supera eps. Devuelve los vértices conservados.
fn rdp(pts: &[Punto], eps: f64) -> Vec<Punto> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let (a, b) = (&pts[0], &pts[pts.len() - 1]);
    let mut idx = 0;
    let mut dmax = 0.0;
    for (i, p) in pts.iter().enumerate().take(pts.len() - 1).skip(1) {
        let d = perp(p, a, b);
        if d > dmax {
            dmax = d;
            idx = i;
        }
    }
    if dmax > eps {
        let mut izq = rdp(&pts[..=idx], eps);
        let der = rdp(&pts[idx..], eps);
        izq.pop(); // evita duplicar el punto de unión
        izq.extend(der);
        izq
    } else {
        vec![*a, *b]
    }
}

fn r(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
