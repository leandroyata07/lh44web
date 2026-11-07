/**
 * LH44 - LOW TO HIGH SPEED
 * Gerenciador de partículas de alto desempenho (faíscas, fumaça, poeira, vácuo)
 */

class ParticlePool {
  constructor(maxSize = 140) {
    this.pool = [];
    for (let i = 0; i < maxSize; i++) {
      this.pool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#FFF' });
    }
  }

  spawn(x, y, z, vx, vy, life, color) {
    for (let p of this.pool) {
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.life = life;
        p.maxLife = life;
        p.color = color;
        return p;
      }
    }
    return null;
  }

  update(dt) {
    for (let p of this.pool) {
      if (p.active) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }
    }
  }

  clear() {
    for (let p of this.pool) p.active = false;
  }
}

