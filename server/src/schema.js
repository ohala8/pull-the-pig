const { Schema, MapSchema, defineTypes } = require('@colyseus/schema');

// One pig in the room. For now each client reports its own position (client-authoritative);
// the server will take over movement, hooks and kills in a later step.
class Player extends Schema {
  constructor() {
    super();
    this.name = 'Pig';
    this.skin = 0;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.anim = 0; // 0 normal, 1 hooked/stunned, 2 shoving, 3 dead
    this.kills = 0;
  }
}
defineTypes(Player, {
  name: 'string',
  skin: 'uint8',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  yaw: 'float32',
  anim: 'uint8',
  kills: 'uint16'
});

// The grapple hook power-up lying on the plaza (one at a time).
class Pickup extends Schema {
  constructor() {
    super();
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}
defineTypes(Pickup, { active: 'boolean', x: 'float32', y: 'float32', z: 'float32' });

class PigState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.pickup = new Pickup();
  }
}
defineTypes(PigState, { players: { map: Player }, pickup: Pickup });

module.exports = { Player, Pickup, PigState };
