# Pull The Pig

Twelve hogs, one hole. A first-person brawler for the browser, based on the Overwatch Workshop mode "12 Hogs 1 Hole" on Ilios Well. Hook pigs from across the pit, flick them over the edge, shove them off the rim, and deflect hooks thrown at you.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump |
| Shift | Chain hook. Turn quickly right after it lands to drag the pig sideways (hook flick). |
| E | Breathing mask: launches you upward, so you can escape the pit |
| V / Mouse 4 | Shove. Time it into an incoming hook to deflect it. |
| B | In Practice, switch the bot between Dummy and Combat |
| Tab | Scoreboard |
| Esc | Pause |

## Modes

- **Match:** you against 11 bots, first to 10, 15 or 25 eliminations.
- **Practice:** one bot. Dummy stands still at the rim; Combat plays for real.
- **Online:** join a room with up to 11 other people.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

This starts two things:

- the game server on `ws://localhost:2567`
- the game itself at http://localhost:5173

Open http://localhost:5173 in two browser windows, pick **Online** on the menu in both, enter a name and press Play. Each window shows the other pig. Other computers on your network can join at `http://<your-computer's-IP>:5173`.

## How online works right now (version 0.1)

- Everyone joins one shared room called `pig`, with a maximum of 12 players.
- Each player's browser runs their own pig and sends its position to the server 20 times a second. The server relays it to everyone else, and other pigs are smoothed between updates.
- Not yet networked: hooks, shoves, deflects and kills between players. In Online mode you can see and walk around each other, and that's all. Bots are turned off online.

## Project layout

```
client/   the game (Vite + three.js)
  index.html     menus, HUD and styles
  src/main.js    game rules, map, pigs, controls, rendering
  src/net.js     online connection and remote pigs
server/   the game server (Node + Colyseus)
  src/index.js   starts the server
  src/PigRoom.js the room: join, leave, position updates
  src/schema.js  what gets synced for each player
```

## Deploying

- **Server:** deploy `server/` to any Node host with WebSocket support (Fly.io, Railway, Render or a small VPS). It listens on `PORT`, which defaults to 2567.
- **Game:** build with `VITE_SERVER_URL=wss://your-server-address npm run build`, then host `client/dist/` on any static host (Netlify, GitHub Pages or itch.io).

## Roadmap

1. **Server-run gameplay:** move the game rules to the server so it decides hooks, shoves, deflects and kills.
2. **Lag handling:** client-side prediction for your own pig, interpolation for other pigs, and rewinding to check hooks against what the thrower saw.
3. **Rooms:** room codes, bots that fill empty slots, and a match flow (first to N, then a rematch).
4. **Deploy:** host it and playtest with friends.
