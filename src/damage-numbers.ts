import * as THREE from 'three';

// Floating damage numbers: a fixed pool of DOM elements projected from world
// space each frame. Caps concurrency so heavy swarm fights stay readable.

const POOL_SIZE = 48;
const LIFETIME_S = 0.65;

interface FloatingNumber {
  active: boolean;
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  age: number;
}

const tmpVec = new THREE.Vector3();

export class DamageNumbers {
  private readonly pool: FloatingNumber[] = [];
  private next = 0;

  constructor(root: HTMLElement) {
    const layer = document.createElement('div');
    layer.id = 'damage-layer';
    root.appendChild(layer);
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'damage-number';
      el.style.display = 'none';
      layer.appendChild(el);
      this.pool.push({ active: false, el, x: 0, y: 0, z: 0, age: 0 });
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
    n.el.textContent = typeof amount === 'string' ? amount : String(Math.round(amount));
    n.el.className = crit ? 'damage-number crit' : 'damage-number';
    n.el.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      if (n.age >= LIFETIME_S) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      n.y += dt * 2.2;
      tmpVec.set(n.x, n.y, n.z).project(camera);
      const sx = (tmpVec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-tmpVec.y * 0.5 + 0.5) * window.innerHeight;
      n.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
      n.el.style.opacity = String(1 - Math.pow(n.age / LIFETIME_S, 2));
    }
  }

  reset(): void {
    for (const n of this.pool) {
      n.active = false;
      n.el.style.display = 'none';
    }
  }
}
