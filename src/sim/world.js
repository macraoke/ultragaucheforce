// Le monde : une grille de tuiles destructibles.
// Les dégâts sont mis en file et appliqués une seule fois par pas (`flush`),
// pour qu'une tuile ne disparaisse jamais au milieu d'un calcul de collision.

export const TILE = 16;

export class World {
  /**
   * @param {string[]} rows      carte du niveau (un caractère par case)
   * @param {object} tileDefs    `bundle.tuiles` : identifiant → fiche de tuile
   */
  constructor(rows, tileDefs) {
    this.h = rows.length;
    this.w = Math.max(0, ...rows.map((r) => r.length));
    this.defs = [null, ...Object.values(tileDefs)];
    this.tiles = new Uint8Array(this.w * this.h); // index dans `defs`, 0 = vide
    this.hp = new Uint8Array(this.w * this.h);
    this.pending = [];
    const bySymbol = new Map(this.defs.slice(1).map((d, i) => [d.symbole, i + 1]));
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const index = bySymbol.get(row[tx]);
        if (index) this.set(tx, ty, index);
      }
    });
  }

  inside(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  /** Fiche de la tuile en (tx, ty), ou null si la case est vide. */
  at(tx, ty) {
    return this.inside(tx, ty) ? this.defs[this.tiles[ty * this.w + tx]] : null;
  }

  /** Index d'une tuile d'après son identifiant (-1 si inconnue). */
  indexOf(id) {
    return this.defs.findIndex((d) => d?.id === id);
  }

  set(tx, ty, index) {
    const i = ty * this.w + tx;
    this.tiles[i] = index;
    this.hp[i] = index ? this.defs[index].pv : 0;
  }

  /** Bords gauche et droit pleins, ciel ouvert, vide sous la carte (on y tombe). */
  solid(tx, ty) {
    if (tx < 0 || tx >= this.w) return true;
    if (ty < 0 || ty >= this.h) return false;
    const def = this.defs[this.tiles[ty * this.w + tx]];
    return Boolean(def && def.solide);
  }

  /** Demande des dégâts sur une case ; `team` dit à qui l'attribuer. */
  damage(tx, ty, amount, team = 'luttes') {
    if (amount > 0 && this.inside(tx, ty) && this.tiles[ty * this.w + tx]) this.pending.push({ tx, ty, amount, team });
  }

  /** Applique les dégâts en attente. `pv: 0` = indestructible. */
  flush(onDestroyed, onHit = () => {}) {
    const batch = this.pending;
    this.pending = [];
    for (const { tx, ty, amount, team } of batch) {
      const i = ty * this.w + tx;
      const def = this.defs[this.tiles[i]];
      if (!def || def.pv === 0) continue;
      if (this.hp[i] > amount) {
        this.hp[i] -= amount;
        onHit(tx, ty, def, team);
      } else {
        this.tiles[i] = 0;
        this.hp[i] = 0;
        onDestroyed(tx, ty, def, team);
      }
    }
  }
}
