import * as THREE from 'three';

// Floating damage numbers: a fixed pool of DOM elements projected from world
// space each frame. Caps concurrency so heavy swarm fights stay readable.

const POOL_SIZE = 48;
const LIFETIME_S = 0.65;
const RESOURCE_LIFETIME_S = 1.05;

interface FloatingNumber {
  active: boolean;
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  age: number;
  offsetX: number;
  lifetime: number;
  kind: 'xp' | 'gold' | null;
}

const tmpVec = new THREE.Vector3();

export class DamageNumbers {
  private readonly pool: FloatingNumber[] = [];
  private next = 0;
  /** Live accumulator per resource: consecutive pickups grow ONE number
   *  beside the player instead of spawning confetti (Megabonk pattern). */
  private readonly gains: Record<'xp' | 'gold', { total: number; n: FloatingNumber | null }> = {
    xp: { total: 0, n: null },
    gold: { total: 0, n: null },
  };

  constructor(root: HTMLElement) {
    const layer = document.createElement('div');
    layer.id = 'damage-layer';
    root.appendChild(layer);
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'damage-number';
      el.style.display = 'none';
      layer.appendChild(el);
      this.pool.push({
        active: false,
        el,
        x: 0,
        y: 0,
        z: 0,
        age: 0,
        offsetX: 0,
        lifetime: LIFETIME_S,
        kind: null,
      });
    }
  }

  /** Shows a number (or short text like "MISS") at a world position. */
  show(x: number, z: number, amount: number | string, crit: boolean): void {
    // Round-robin: with the pool saturated we recycle the oldest — losing a
    // stale number under heavy fire is invisible in practice.
    const n = this.pool[this.next % POOL_SIZE];
    this.next++;
    if (!n) return;
    n.active = true;
    n.x = x;
    n.y = 1.6;
    n.z = z;
    n.age = 0;
    n.offsetX = 0;
    n.lifetime = LIFETIME_S;
    n.kind = null;
    n.el.textContent = typeof amount === 'string' ? amount : String(Math.round(amount));
    n.el.className = crit ? 'damage-number crit' : 'damage-number';
    n.el.style.display = 'block';
  }

  /** Shows collected resources beside the player (up-right, near but not
   *  attached). While a resource number is alive, further pickups ADD to it
   *  and refresh its life instead of spawning a new one. */
  showGain(x: number, z: number, amount: number, kind: 'xp' | 'gold'): void {
    const g = this.gains[kind];
    // Accumulate onto the live number (unless the pool recycled it for damage).
    if (g.n && g.n.active && g.n.kind === kind) {
      g.total += amount;
      g.n.x = x;
      g.n.z = z;
      g.n.age = 0;
      g.n.y = kind === 'xp' ? 1.7 : 1.15;
      g.n.el.textContent = `+${Math.round(g.total)} ${kind === 'xp' ? 'XP' : 'GOLD'}`;
      return;
    }
    const n = this.pool[this.next % POOL_SIZE];
    this.next++;
    if (!n) return;
    g.total = amount;
    g.n = n;
    n.active = true;
    n.x = x;
    n.y = kind === 'xp' ? 1.7 : 1.15;
    n.z = z;
    n.age = 0;
    n.offsetX = 68;
    n.lifetime = RESOURCE_LIFETIME_S;
    n.kind = kind;
    n.el.textContent = `+${Math.round(amount)} ${kind === 'xp' ? 'XP' : 'GOLD'}`;
    n.el.className = `resource-gain ${kind}`;
    n.el.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera, playerX?: number, playerZ?: number): void {
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      if (n.age >= n.lifetime) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      if (n.kind && playerX !== undefined && playerZ !== undefined) {
        // Resource accumulators ride WITH the player at a fixed up-right spot,
        // always visible next to them; only damage numbers pop-rise in place.
        n.x = playerX;
        n.z = playerZ;
      } else if (!n.kind) {
        n.y += dt * 2.2;
      }
      tmpVec.set(n.x, n.y, n.z).project(camera);
      const sx = (tmpVec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-tmpVec.y * 0.5 + 0.5) * window.innerHeight;
      n.el.style.transform = `translate(${(sx + n.offsetX).toFixed(0)}px, ${sy.toFixed(0)}px)`;
      n.el.style.opacity = String(1 - Math.pow(n.age / n.lifetime, 2));
    }
  }

  reset(): void {
    for (const n of this.pool) {
      n.active = false;
      n.el.style.display = 'none';
    }
  }
}
