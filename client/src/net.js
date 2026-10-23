import * as THREE from 'three';
import { Client } from 'colyseus.js';

// Where the game server lives. Set VITE_SERVER_URL when you deploy (for example wss://pull-the-pig.fly.dev).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:2567`;

const SEND_EVERY = 0.05; // 20 position updates a second

// ctx: { scene, makePig, makeTag, player, SKINS, PANTS, toast }
export function createNet(ctx) {
  const remotes = new Map();
  let room = null, sendT = 0;

  function addRemote(id, s) {
    const m = ctx.makePig(ctx.SKINS[s.skin % ctx.SKINS.length], ctx.PANTS[s.skin % ctx.PANTS.length]);
    m.g.add(ctx.makeTag(s.name));
    m.g.position.set(s.x, s.y, s.z); m.g.rotation.y = s.yaw;
    ctx.scene.add(m.g);
    remotes.set(id, { m, name: s.name, target: new THREE.Vector3(s.x, s.y, s.z), yaw: s.yaw, anim: s.anim, walk: 0 });
    ctx.toast(s.name + ' joined');
  }
  function removeRemote(id) {
    const r = remotes.get(id); if (!r) return;
    ctx.scene.remove(r.m.g); remotes.delete(id);
    ctx.toast(r.name + ' left');
  }

  function animCode(p) {
    if (p.state === 'dead') return 3;
    if (p.state === 'hooked' || p.stunT > 0) return 1;
    if (p.meleeT > 0) return 2;
    return 0;
  }

  return {
    get room() { return room; },
    count: () => (room ? remotes.size + 1 : 0),
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
      room.onLeave(() => {
        for (const id of [...remotes.keys()]) removeRemote(id);
        room = null;
        ctx.toast('Disconnected from server');
      });
      return room;
    },
    leave() {
      if (room) room.leave();
      for (const id of [...remotes.keys()]) { const r = remotes.get(id); ctx.scene.remove(r.m.g); remotes.delete(id); }
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
      const k = 1 - Math.exp(-dt * 14);
      for (const r of remotes.values()) {
        const g = r.m.g, before = g.position.clone();
        // teleports (respawns) snap instead of sliding across the map
        if (g.position.distanceTo(r.target) > 6) g.position.copy(r.target); else g.position.lerp(r.target, k);
        let dy = r.yaw - g.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        g.rotation.y += dy * k;
        const sp = Math.hypot(g.position.x - before.x, g.position.z - before.z) / Math.max(dt, 1e-3);
        if (sp > 0.5) r.walk += dt * sp * 1.6;
        const sw = Math.sin(r.walk) * Math.min(1, sp / 6) * 0.7;
        r.m.legs[0].rotation.x = sw; r.m.legs[1].rotation.x = -sw;
        g.visible = r.anim !== 3;
        g.rotation.x = r.anim === 1 ? 0.4 : g.rotation.x * 0.8;
        r.m.hook.rotation.y = r.anim === 2 ? -1.1 : 0;
      }
    }
  };
}
