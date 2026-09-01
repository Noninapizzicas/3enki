/**
 * PielJSON — contrato del objeto visual que el blueprint genera.
 *
 * El blueprint habla con el dueño (chat), llena strategy + marca-cliente + audience,
 * y a partir de esos datos genera este objeto. El skin-engine lo recibe y lo inyecta
 * en las variables CSS de L1/L2/L4/L7.
 *
 * Cada campo mapea directamente a variables CSS. No hay interpretación intermedia:
 * lo que el blueprint pone aquí, la UI lo refleja tal cual.
 */

export interface PielColor {
  /** Hue en oklch (0-360). El hue determina la familia cromática. */
  hue: number;
  /** Chroma base (0-0.4). Cuánto color — 0 = gris, 0.15 = saturado. */
  chroma: number;
}

export interface PielTipografia {
  /** Familia display (títulos, hero). Nombre CSS: 'Playfair Display', serif */
  display: string;
  /** Familia body (texto corrido). Nombre CSS: 'Inter', sans-serif */
  body: string;
  /** Familia mono (código, datos). Nombre CSS: 'JetBrains Mono', monospace */
  mono?: string;
  /** Peso de los títulos: 600 = ligero, 700 = normal, 900 = pesado/bold */
  pesoTitulos?: number;
  /** Ratio de escala modular: 1.125 = minor second, 1.25 = major third, 1.333 = perfect fourth */
  escala?: number;
}

export interface PielRadii {
  /** Factor de redondeo: 0 = angular, 1 = generoso, 2 = pill */
  factor: number;
}

export interface PielMotion {
  /** Factor de expresividad: 0 = sin motion, 0.5 = sutil, 1 = expresivo */
  expresividad: number;
}

export interface PielSombras {
  /** Factor de difuminado: 0 = bordes duros, 1 = sombras suaves difuminadas */
  difuminado: number;
}

export interface PielEspaciado {
  /** Factor de densidad: 0.6 = compacto, 1.0 = normal, 1.5 = generoso/lujo */
  factor: number;
}

export interface PielSuperficie {
  /** Intensidad del gradiente hero: 0 = plano, 1 = gradiente completo */
  gradiente: number;
  /** Efecto glass en elevaciones: 0 = sólido, 1 = frosted glass */
  glass: number;
}

export interface PielCara {
  color: {
    primary: PielColor;
    accent: PielColor;
    neutral: PielColor;
  };
  tipografia: PielTipografia;
  radii: PielRadii;
  motion: PielMotion;
  sombras: PielSombras;
  espaciado: PielEspaciado;
  superficie: PielSuperficie;
}

/**
 * PielJSON completo de un proyecto.
 * Dos caras: marketing (cliente final) y trabajo (staff/operación).
 */
export interface PielJSON {
  esquema: 'piel-v1';
  project_id: string;
  marketing: PielCara;
  trabajo: PielCara;
}
