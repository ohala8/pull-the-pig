const { Room } = require('colyseus');
const { Player, PigState } = require('./schema');

const MAX_R = 18;      // a little past the courtyard edge (17 m)
const MIN_Y = -30;
const MAX_Y = 30;

const finite = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

class PigRoom extends Room {
  onCreate() {
    this.maxClients = 12;
    this.setState(new PigState());
    this.setPatchRate(33); // send updates about 30 times a second

    this.onMessage('move', (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !m || typeof m !== 'object') return;
      let x = finite(m.x, -MAX_R, MAX_R, p.x), z = finite(m.z, -MAX_R, MAX_R, p.z);
      const r = Math.hypot(x, z);
      if (r > MAX_R) { x *= MAX_R / r; z *= MAX_R / r; }
      p.x = x; p.z = z;
      p.y = finite(m.y, MIN_Y, MAX_Y, p.y);
      p.yaw = finite(m.yaw, -1e6, 1e6, p.yaw);
      p.anim = finite(m.anim, 0, 3, 0) | 0;
    });
  }

  onJoin(client, options) {
    const p = new Player();
    const raw = options && typeof options.name === 'string' ? options.name : '';
    p.name = raw.replace(/[^\w .'-]/g, '').trim().slice(0, 16) || 'Pig';
    const used = new Set([...this.state.players.values()].map((q) => q.skin));
    for (let s = 0; s < 11; s++) if (!used.has(s)) { p.skin = s; break; }
    this.state.players.set(client.sessionId, p);
    console.log(`[room ${this.roomId}] ${p.name} joined (${this.state.players.size}/12)`);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (p) console.log(`[room ${this.roomId}] ${p.name} left (${this.state.players.size}/12)`);
  }
}

module.exports = { PigRoom };
