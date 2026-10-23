const { Room } = require('colyseus');
const { Player, PigState } = require('./schema');

const MAX_R = 18;          // a little past the courtyard edge (17 m)
const MIN_Y = -30;
const MAX_Y = 30;
const HOOK_REACH = 28;     // hook range 21 m plus room for lag
const SHOVE_REACH = 6;     // shove range 2.7 m plus room for lag
const CREDIT_MS = 9000;    // a kill counts if the killer hooked or shoved you this recently
const WIN_KILLS = 15;
const ROUND_BREAK_MS = 7000;

const finite = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const vec3 = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100);
const str = (s) => typeof s === 'string' && s.length > 0 && s.length < 64;

// How combat works right now: each browser is in charge of its own pig. The thrower's browser decides
// whether a hook or shove hit (so it feels instant for the attacker), the victim's browser applies the pull
// or knockback (and can answer "deflected"), and this room relays the messages, sanity-checks distances
// and keeps the score.
class PigRoom extends Room {
  onCreate() {
    this.maxClients = 12;
    this.setState(new PigState());
    this.setPatchRate(33); // send updates about 30 times a second
    this.lastHit = new Map(); // victim id -> { by, t }
    this.roundOver = false;

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

    this.onMessage('ev', (client, m) => {
      if (!m || typeof m !== 'object' || !str(m.t)) return;
      const from = client.sessionId;
      switch (m.t) {
        case 'hook_fire':
          if (str(m.id) && vec3(m.o) && vec3(m.d)) this.relay(client, { t: m.t, id: m.id, o: m.o, d: m.d });
          break;
        case 'hook_upd':
          if (str(m.id) && (m.s === 'attach' || m.s === 'back')) this.relay(client, { t: m.t, id: m.id, s: m.s, tgt: str(m.tgt) ? m.tgt : undefined });
          break;
        case 'hook_hit':
          if (str(m.id) && str(m.to) && this.near(from, m.to, HOOK_REACH)) {
            this.lastHit.set(m.to, { by: from, t: Date.now() });
            this.relay(client, { t: m.t, id: m.id }, m.to);
          }
          break;
        case 'hook_result':
          if (str(m.id) && str(m.to) && ['ok', 'reject', 'deflect'].includes(m.r)) {
            if (m.r !== 'ok') { const lh = this.lastHit.get(from); if (lh && lh.by === m.to) this.lastHit.delete(from); }
            this.relay(client, { t: m.t, id: m.id, r: m.r }, m.to);
          }
          break;
        case 'pull_end':
          if (str(m.id) && str(m.to)) this.relay(client, { t: m.t, id: m.id }, m.to);
          break;
        case 'shove':
          if (str(m.to) && Array.isArray(m.d) && m.d.length === 2 && m.d.every(Number.isFinite) && this.near(from, m.to, SHOVE_REACH)) {
            const L = Math.hypot(m.d[0], m.d[1]) || 1;
            this.lastHit.set(m.to, { by: from, t: Date.now() });
            this.relay(client, { t: m.t, d: [m.d[0] / L, m.d[1] / L] }, m.to);
          }
          break;
        case 'fx':
          if (['breath', 'deflect', 'swipe'].includes(m.k) && vec3(m.p)) this.relay(client, { t: m.t, k: m.k, p: m.p });
          break;
        case 'died':
          this.onDied(from, str(m.by) ? m.by : null);
          break;
      }
    });
  }

  relay(client, msg, toId) {
    msg.from = client.sessionId;
    if (toId) { const c = this.clients.find((c) => c.sessionId === toId); if (c) c.send('ev', msg); }
    else this.broadcast('ev', msg, { except: client });
  }

  near(a, b, max) {
    const pa = this.state.players.get(a), pb = this.state.players.get(b);
    if (!pa || !pb || a === b || pa.anim === 3 || pb.anim === 3) return false;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) <= max;
  }

  onDied(victimId, claimedBy) {
    const lh = this.lastHit.get(victimId);
    this.lastHit.delete(victimId);
    let killerId = null;
    if (claimedBy && lh && lh.by === claimedBy && Date.now() - lh.t < CREDIT_MS && this.state.players.has(claimedBy)) killerId = claimedBy;
    const killer = killerId ? this.state.players.get(killerId) : null;
    if (killer && !this.roundOver) killer.kills++;
    this.broadcast('ev', { t: 'kill', killer: killerId, victim: victimId });
    if (killer && !this.roundOver && killer.kills >= WIN_KILLS) {
      this.roundOver = true;
      this.broadcast('ev', { t: 'win', who: killerId, name: killer.name });
      this.clock.setTimeout(() => {
        this.state.players.forEach((p) => { p.kills = 0; });
        this.roundOver = false;
        this.broadcast('ev', { t: 'round' });
      }, ROUND_BREAK_MS);
    }
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
    this.lastHit.delete(client.sessionId);
    if (p) console.log(`[room ${this.roomId}] ${p.name} left (${this.state.players.size}/12)`);
  }
}

module.exports = { PigRoom };
