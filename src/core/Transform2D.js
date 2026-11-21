/**
 * Transform2D - Matriz de transformação afim 2D
 * Sistema de coordenadas:
 * - Origem da cena no centro
 * - Eixo X positivo para a direita
 * - Eixo Y positivo para baixo
 * - Rotação em graus
 * - Escala 1 = 100%
 */

export class Transform2D {
  constructor() {
    this.reset();
  }

  /**
   * Reseta a transformação para identidade
   */
  reset() {
    // Matriz 3x3 em row-major: [a, b, c, d, e, f]
    // [ a  c  e ]
    // [ b  d  f ]
    // [ 0  0  1 ]
    this.m = [1, 0, 0, 1, 0, 0];
    return this;
  }

  /**
   * Define a matriz diretamente
   */
  setMatrix(a, b, c, d, e, f) {
    this.m = [a, b, c, d, e, f];
    return this;
  }

  /**
   * Copia outra transformação
   */
  copy(other) {
    this.m = [...other.m];
    return this;
  }

  /**
   * Clona a transformação
   */
  clone() {
    const t = new Transform2D();
    t.m = [...this.m];
    return t;
  }

  /**
   * Translação
   */
  translate(tx, ty) {
    this.m[4] += this.m[0] * tx + this.m[2] * ty;
    this.m[5] += this.m[1] * tx + this.m[3] * ty;
    return this;
  }

  /**
   * Rotação em graus
   */
  rotate(degrees) {
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const a = this.m[0];
    const b = this.m[1];
    const c = this.m[2];
    const d = this.m[3];

    this.m[0] = a * cos + c * sin;
    this.m[1] = b * cos + d * sin;
    this.m[2] = c * cos - a * sin;
    this.m[3] = d * cos - b * sin;

    return this;
  }

  /**
   * Escala
   */
  scale(sx, sy = sx) {
    this.m[0] *= sx;
    this.m[1] *= sx;
    this.m[2] *= sy;
    this.m[3] *= sy;
    return this;
  }

  /**
   * Multiplica por outra matriz (this = this * other)
   */
  multiply(other) {
    const a = this.m[0];
    const b = this.m[1];
    const c = this.m[2];
    const d = this.m[3];
    const e = this.m[4];
    const f = this.m[5];

    const oa = other.m[0];
    const ob = other.m[1];
    const oc = other.m[2];
    const od = other.m[3];
    const oe = other.m[4];
    const of = other.m[5];

    this.m[0] = a * oa + c * ob;
    this.m[1] = b * oa + d * ob;
    this.m[2] = a * oc + c * od;
    this.m[3] = b * oc + d * od;
    this.m[4] = a * oe + c * of + e;
    this.m[5] = b * oe + d * of + f;

    return this;
  }

  /**
   * Inverte a matriz
   */
  invert() {
    const a = this.m[0];
    const b = this.m[1];
    const c = this.m[2];
    const d = this.m[3];
    const e = this.m[4];
    const f = this.m[5];

    const det = a * d - b * c;

    if (Math.abs(det) < 1e-10) {
      // Matriz singular, não invertível
      this.reset();
      return this;
    }

    const invDet = 1 / det;

    this.m[0] = d * invDet;
    this.m[1] = -b * invDet;
    this.m[2] = -c * invDet;
    this.m[3] = a * invDet;
    this.m[4] = (c * f - d * e) * invDet;
    this.m[5] = (b * e - a * f) * invDet;

    return this;
  }

  /**
   * Obtém a matriz invertida sem modificar esta
   */
  getInverse() {
    const inv = this.clone();
    inv.invert();
    return inv;
  }

  /**
   * Aplica transformação a um ponto (x, y)
   */
  transformPoint(x, y, out = {}) {
    out.x = this.m[0] * x + this.m[2] * y + this.m[4];
    out.y = this.m[1] * x + this.m[3] * y + this.m[5];
    return out;
  }

  /**
   * Aplica transformação inversa a um ponto
   */
  inverseTransformPoint(x, y, out = {}) {
    const inv = this.getInverse();
    return inv.transformPoint(x, y, out);
  }

  /**
   * Decomposição da matriz em posição, rotação e escala
   * Retorna { x, y, rotation, scaleX, scaleY }
   */
  decompose() {
    const a = this.m[0];
    const b = this.m[1];
    const c = this.m[2];
    const d = this.m[3];
    const e = this.m[4];
    const f = this.m[5];

    // Posição
    const x = e;
    const y = f;

    // Escala
    const scaleX = Math.sqrt(a * a + b * b);
    const scaleY = Math.sqrt(c * c + d * d);

    // Rotação (em radianos, depois converte para graus)
    // Considerando que a matriz pode ter escala negativa (flip)
    const rotationRad = Math.atan2(b, a);
    const rotation = rotationRad * 180 / Math.PI;

    // Detecta flip na escala
    const det = a * d - b * c;
    if (det < 0) {
      // Se determinante negativo, há flip
      // Ajusta a rotação e escala para manter consistência
    }

    return {
      x,
      y,
      rotation,
      scaleX: scaleX * (a < 0 ? -1 : 1),
      scaleY: scaleY * (d < 0 ? -1 : 1)
    };
  }

  /**
   * Recompõe a matriz a partir de posição, rotação e escala
   */
  compose(x, y, rotation, scaleX = 1, scaleY = 1) {
    this.reset();
    this.translate(x, y);
    this.rotate(rotation);
    this.scale(scaleX, scaleY);
    return this;
  }

  /**
   * Igualdade aproximada
   */
  equals(other, epsilon = 1e-6) {
    for (let i = 0; i < 6; i++) {
      if (Math.abs(this.m[i] - other.m[i]) > epsilon) {
        return false;
      }
    }
    return true;
  }

  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      matrix: [...this.m]
    };
  }

  /**
   * Desserialização de JSON
   */
  static fromJSON(data) {
    const t = new Transform2D();
    if (data && data.matrix) {
      t.m = [...data.matrix];
    }
    return t;
  }

  /**
   * Representação string para debug
   */
  toString() {
    const d = this.decompose();
    return `Transform2D(x:${d.x.toFixed(2)}, y:${d.y.toFixed(2)}, rot:${d.rotation.toFixed(1)}°, sx:${d.scaleX.toFixed(2)}, sy:${d.scaleY.toFixed(2)})`;
  }
}

/**
 * Cria uma transformação a partir de componentes
 */
export function createTransform(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) {
  return new Transform2D().compose(x, y, rotation, scaleX, scaleY);
}