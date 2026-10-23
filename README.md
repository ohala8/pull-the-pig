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

## How online works right now (version 0.2)

- Everyone joins one shared room called `pig`, with a maximum of 12 players. The first to 15 eliminations wins the round, and scores reset 7 seconds later.
- **Movement:** each browser runs its own pig and sends its position 30 times a second, so your own movement has no delay. Other pigs are smoothed between updates.
- **Hooks and shoves:** the thrower's browser decides whether they hit. If it hit on your screen, it hit. The victim's browser then applies the pull, including the flick (it follows the thrower's facing), or the knockback.
- **Deflects:** the defender's browser decides. If you swing in time on your screen, it counts, with a little extra time allowed for lag.
- **Kills:** the server credits a kill only if the killer really hooked or shoved the victim in the last 9 seconds. It also checks that hooks and shoves came from a believable distance.
- **Not yet:** bots in online rooms, room codes, and stopping a modified browser from cheating on its own movement.

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

## Deploying (Render)

The repo includes `render.yaml`, so Render can set everything up from it. One web service builds the game and runs the server, and the server also serves the game page, so players just open its address.

1. Sign in at https://render.com with GitHub.
2. Choose **New**, then **Blueprint**, pick `ohala8/pull-the-pig`, and click **Apply**.
3. When the deploy finishes, open the `https://pull-the-pig-xxxx.onrender.com` address Render shows and choose **Online**.

Every push to `main` redeploys automatically. The free plan sleeps after about 15 minutes with nobody connected, and the first visit after that takes about a minute to wake it up.

To run the production version locally: `npm run build`, then `npm start`, then open http://localhost:2567.

## Roadmap

Done: online play on Render, online combat (hooks, flicks, shoves, deflects, kills, first-to-15 rounds), and settings for mouse sensitivity, volume and field of view, plus a How to play screen.

Next:
1. **Rooms:** "Create room" and "Join with code", plus an end-of-round scoreboard screen.
2. **Bots online:** server-run bots that fill empty slots and step aside as real players join.
3. **Fairer netcode:** move more of the rules onto the server, with lag compensation for hooks.
4. **Extras:** custom domain, an always-on server plan, and new mechanics (gas burst escape, kill streaks).
