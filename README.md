# Voltswarm

An industrial robot 3D bullet heaven where disposable machines overload into a living swarm. Built with Three.js + TypeScript + Vite, packaged with Electron.

Note: the current desktop icon is a technical placeholder for packaging only. It is not the final Steam/app icon.

## Gameplay

- WASD / arrow keys to move on a flat arena; fixed isometric follow camera. Large props block movement.
- Start each run by drafting 1 of 3 random weapons (out of 11: Bolt Cannon, Volt Pulse, Orbital Blades, Arc Welder, Hydraulic Press, Tire Fire, Oil Sprayer, Acid Flask, Turbine Fan, Junk Ricochet, Dismantler). Builds hold at most 2 weapons; the second unlocks through level-up cards.
- Weapons fire automatically — positioning is the whole game. Crits, damage numbers, and an RPG stat sheet (damage, attack speed, crit, range, pickup range, projectiles, area, armor, regen...) shaped by upgrade cards with Common/Rare/Epic rarity. Luck improves the odds.
- Enemies drop XP shards where they die — walk into pickup range to collect them.
- Volt crates spawn around the map (light beam): instant rewards plus Megabonk-style global stats (+Luck, +Area, or a Cursed core: harder waves, more XP).
- Six enemy types with distinct silhouettes: Voltling, Sparkrunner (2:00), Roller — charges in straight lines (3:00), Rustbrute (4:00), Gunner — shoots from range (5:00), Drone — flies over the swarm (6:00). Elites (magenta, huge) drop crates.
- A red totem spawns somewhere far away. Touch it to summon a random boss (Crusher King or Tesla Titan). Kill it for an instant "Map Cleared" win — or ignore it and survive the 10-minute timer.
- One unified difficulty scalar drives wave size, spawn rate, enemy HP and elite chance.

All enemies render through one `THREE.InstancedMesh` per type — verified stable with 430+ enemies on screen.

## Commands

```
npm install
npm run dev            # dev server at http://localhost:5173
npm run build          # typecheck + production build to dist/
npm run electron:start # run as a desktop app
npm run package        # portable Windows build to release/
```

## Publishing to itch.io

`npm run build`, zip the contents of `dist/`, and upload as an HTML5 game (viewport 1280x720, fullscreen enabled). The build uses relative asset paths, so it works from itch's iframe as-is.

## Tuning

Every gameplay number (enemy stats, wave ramp, weapon values, XP curve, run length) lives in `src/config.ts`.
