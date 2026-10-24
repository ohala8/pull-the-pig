import * as THREE from 'three';
import { Client } from 'colyseus.js';

// Where the game server lives. In development it's port 2567 on this computer.
// In a production build the server also serves this page, so it's the same address the page came from.
// VITE_SERVER_URL overrides both (for example if the game page is hosted somewhere else).
const WS = location.protocol === 'https:' ? 'wss' : 'ws';
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.PROD ? `${WS}://${location.host}` : `${WS}://${location.hostname || 'localhost'}:2567`);

const SEND_EVERY = 1 / 30; // 30 position updates a second
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// ctx: { scene, makePig, makeTag, makeHookVis, player, SKINS, PANTS, toast, HOOK_SPEED, HOOK_RANGE }
export function createNet(ctx) {
  const remotes = new Map();   // session id -> remote pig (a "proxy" the local game can hook and shove)
  const hooks = new Map();     // hook id -> another player's hook, drawn flying or attached
  const handlers = {};
  let room = null, sendT = 0, hookSeq = 0;

  function makeProxy(id, s) {
    const m = ctx.makePig(ctx.SKINS[s.skin % ctx.SKINS.length], ctx.PANTS[s.skin % ctx.PANTS.length]);
    m.g.add(ctx.makeTag(s.name));
    m.g.position.set(s.x, s.y, s.z); m.g.rotation.y = s.yaw;
    ctx.scene.add(m.g);
    return {
      id, m, name: s.name, isRemote: true, isPlayer: false,
      target: new V3(s.x, s.y, s.z), yaw: s.yaw, anim: s.anim, walk: 0,
      vel: new V3(), pullingMe: false, pullDeadline: 0, gone: false,
      get pos() { return m.g.position; },
      get state() {
        if (this.gone || this.anim === 3) return 'dead';
        if (this.pullingMe && performance.now() < this.pullDeadline) return 'hooked';
        return 'alive';
      },
      hand() { return m.g.localToWorld(new V3(-1.05, 1.35, 0.72)); }
    };
  }
  function addRemote(id, s) {
    remotes.set(id, makeProxy(id, s));
    ctx.toast(s.name + ' joined');
  }
  function removeRemote(id, quiet) {
    const r = remotes.get(id); if (!r) return;
    r.gone = true; ctx.scene.remove(r.m.g); remotes.delete(id);
    for (const [hid, h] of hooks) if (h.from === id) dropHook(hid);
    if (!quiet) ctx.toast(r.name + ' left');
  }
  function dropHook(id) {
    const h = hooks.get(id); if (!h) return;
    h.vis.chain.visible = h.vis.head.visible = false;
    ctx.scene.remove(h.vis.chain); ctx.scene.remove(h.vis.head);
    hooks.delete(id);
  }
  function animCode(p) {
    if (p.state === 'dead') return 3;
    if (p.state === 'hooked' || p.stunT > 0) return 1;
    if (p.meleeT > 0) return 2;
    return 0;
  }
  function onEvent(m) {
    if (!m || typeof m !== 'object') return;
    const from = remotes.get(m.from);
    if ((m.t === 'hook_fire' || m.t === 'grap_fire') && from) {
      const grap = m.t === 'grap_fire';
      hooks.set(m.id, {
        kind: grap ? 'grap' : 'hook', id: m.id, from: m.from, phase: 'out', pos: new V3(...m.o), prev: new V3(...m.o),
        dir: new V3(...m.d).normalize(), dist: 0, tgt: null, age: 0, vis: grap ? ctx.makeGrappleVis() : ctx.makeHookVis()
      });
    } else if (m.t === 'hook_upd' || m.t === 'grap_upd') {
      const h = hooks.get(m.id); if (!h) return;
      if (m.s === 'attach') { if (m.tgt) { h.phase = 'attached'; h.tgt = m.tgt; } else h.phase = 'anchored'; }
      else if (m.s === 'anchor' && Array.isArray(m.a)) { h.phase = 'anchored'; h.pos.set(...m.a); }
      else h.phase = 'back';
    }
    const fn = handlers[m.t]; if (fn) fn(m, from);
  }

  return {
    get room() { return room; },
    get myId() { return room ? room.sessionId : null; },
    count: () => (room ? remotes.size + 1 : 0),
    proxies: () => [...remotes.values()],
    pickup: () => (room && room.state.pickup) || null,
    incoming: () => [...hooks.values()],
    nameOf(id) { if (!room) return '?'; if (id === room.sessionId) return 'You'; const p = room.state.players.get(id); return p ? p.name : 'Someone'; },
    on(t, fn) { handlers[t] = fn; },
    send(t, data) { if (room) room.send('ev', Object.assign({ t }, data)); },
    newHookId() { return `${room ? room.sessionId : 'x'}:${++hookSeq}`; },
    scoreList(me) {
      const out = [];
      if (!room) return out;
      room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { me.kills = p.kills; out.push(me); }
        else out.push({ name: p.name, kills: p.kills, isPlayer: false });
      });
      return out.sort((a, b) => b.kills - a.kills || (a === me ? -1 : 1));
    },
    async connect(name) {
      const client = new Client(SERVER_URL);
      room = await client.joinOrCreate('pig', { name });
      room.state.players.onAdd((s, id) => {
        if (id === room.sessionId) return;
        addRemote(id, s);
        s.onChange(() => {
          const r = remotes.get(id); if (!r) return;
          r.target.set(s.x, s.y, s.z); r.yaw = s.yaw; r.anim = s.anim;
        });
      });
      room.state.players.onRemove((s, id) => removeRemote(id));
      room.onMessage('ev', onEvent);
      room.onLeave(() => {
        for (const id of [...remotes.keys()]) removeRemote(id, true);
        room = null;
        ctx.toast('Disconnected from server');
      });
      return room;
    },
    leave() {
      if (room) room.leave();
      for (const id of [...remotes.keys()]) removeRemote(id, true);
      for (const id of [...hooks.keys()]) dropHook(id);
      room = null;
    },
    update(dt) {
      if (!room) return;
      sendT -= dt;
      if (sendT <= 0) {
        sendT = SEND_EVERY;
        const p = ctx.player;
        room.send('move', { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, anim: animCode(p) });
      }
      const k = 1 - Math.exp(-dt * 20);
      for (const r of remotes.values()) {
        const g = r.m.g, before = g.position.clone();
        // teleports (respawns) snap instead of sliding across the map
        if (g.position.distanceTo(r.target) > 6) g.position.copy(r.target); else g.position.lerp(r.target, k);
        let dy = r.yaw - g.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        g.rotation.y += dy * k;
        r.vel.copy(g.position).sub(before).divideScalar(Math.max(dt, 1e-3));
        const sp = Math.hypot(r.vel.x, r.vel.z);
        if (sp > 0.5) r.walk += dt * sp * 1.6;
        const sw = Math.sin(r.walk) * Math.min(1, sp / 6) * 0.7;
        r.m.legs[0].rotation.x = sw; r.m.legs[1].rotation.x = -sw;
        g.visible = r.anim !== 3;
        g.rotation.x = r.anim === 1 ? 0.4 : g.rotation.x * 0.8;
        r.m.hook.rotation.y = r.anim === 2 ? -1.1 : 0;
        r.m.hook.visible = true;
      }
      // other players' hooks
      for (const h of [...hooks.values()]) {
        const owner = remotes.get(h.from);
        h.age += dt;
        if (!owner || h.age > 4) { dropHook(h.id); continue; }
        owner.m.hook.visible = false;
        const hand = owner.hand();
        h.prev.copy(h.pos);
        if (h.phase === 'out') {
          const step = ctx.HOOK_SPEED * dt; h.pos.addScaledVector(h.dir, step); h.dist += step;
          if (h.dist > ctx.HOOK_RANGE + 2) h.phase = 'back';
        } else if (h.phase === 'attached') {
          const t = h.tgt === room.sessionId ? ctx.player.pos : remotes.get(h.tgt)?.pos;
          if (t) h.pos.set(t.x, t.y + 1.5, t.z); else h.phase = 'back';
        }
        if (h.phase === 'back') {
          const d = hand.clone().sub(h.pos), L = d.length(), s = 75 * dt;
          if (L <= s) { dropHook(h.id); continue; }
          h.pos.addScaledVector(d.divideScalar(L), s);
        }
        const d = h.pos.clone().sub(hand), L = d.length(), v = h.vis;
        v.chain.visible = v.head.visible = true;
        v.chain.position.copy(hand); v.chain.scale.set(1, Math.max(0.01, L), 1);
        if (L > 0.001) v.chain.quaternion.setFromUnitVectors(UP, d.clone().divideScalar(L));
        v.head.position.copy(h.pos);
        v.head.lookAt(h.pos.clone().add(h.phase === 'out' ? h.dir : h.phase === 'back' ? d.clone().negate() : d));
      }
    }
  };
}
