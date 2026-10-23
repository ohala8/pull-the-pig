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

class PigState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
defineTypes(PigState, { players: { map: Player } });

module.exports = { Player, PigState };
