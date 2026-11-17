// Hand-authored map of the dream version of the resort.
//
// Axes: +x runs along the coast, +z points out to sea. The shoreline sits near
// z = 0, the resort lies at negative z. Units are metres, y = 0 is sea level.
//
// Real-world anchors used for the layout: a ~500 m sandy beach, a large shallow
// lagoon right off the sand sheltered by an outer reef, no jetty, three pools
// plus a kids' pool, two beach bars, low two-storey room blocks. The dream
// changes: past the lagoon the sea gets shallow again, with mangroves and
// saltwater crocodiles.

export const BEACH_HALF = 250;

// Pools: ellipses. `depth` is water depth, deck height is derived from terrain.
export const POOLS = [
  { id: 'main', x: 0, z: -112, rx: 34, rz: 20, depth: 1.6, island: { x: 0, z: -112, r: 5.5 } },
  { id: 'north', x: -150, z: -98, rx: 20, rz: 12, depth: 1.6 },
  { id: 'south', x: 150, z: -98, rx: 20, rz: 12, depth: 1.6 },
  { id: 'kids', x: 52, z: -150, rx: 7.5, rz: 5.5, depth: 0.5 },
];

// Buildings: oriented boxes. w = size along local x, d = along local z.
export const BUILDINGS = [
  { kind: 'main', x: 0, z: -228, w: 72, d: 24, h: 9.5, rot: 0 },
  { kind: 'restaurant', x: -58, z: -160, w: 30, d: 18, h: 5.6, rot: 0 },
  { kind: 'rooms', x: -185, z: -68, w: 46, d: 11, h: 6.8, rot: 0 },
  { kind: 'rooms', x: -185, z: -128, w: 46, d: 11, h: 6.8, rot: 0 },
  { kind: 'rooms', x: -226, z: -98, w: 11, d: 44, h: 6.8, rot: 0 },
  { kind: 'rooms', x: 185, z: -68, w: 46, d: 11, h: 6.8, rot: 0 },
  { kind: 'rooms', x: 185, z: -128, w: 46, d: 11, h: 6.8, rot: 0 },
  { kind: 'rooms', x: 226, z: -98, w: 11, d: 44, h: 6.8, rot: 0 },
  { kind: 'rooms', x: -98, z: -188, w: 46, d: 11, h: 6.8, rot: 0.12 },
  { kind: 'rooms', x: 98, z: -188, w: 46, d: 11, h: 6.8, rot: -0.12 },
  { kind: 'rooms', x: -165, z: -196, w: 46, d: 11, h: 6.8, rot: 0.05 },
  { kind: 'rooms', x: 165, z: -196, w: 46, d: 11, h: 6.8, rot: -0.05 },
  { kind: 'rooms', x: -72, z: -240, w: 11, d: 40, h: 6.8, rot: 0 },
  { kind: 'rooms', x: 72, z: -240, w: 11, d: 40, h: 6.8, rot: 0 },
  { kind: 'dive', x: -262, z: -46, w: 15, d: 10, h: 4.2, rot: 0.1 },
];

// Round thatched huts (beach bars, pool bar) and the lifeguard tower.
export const HUTS = [
  { kind: 'bar', x: -92, z: -24, r: 4.2 },
  { kind: 'bar', x: 96, z: -25, r: 4.2 },
  { kind: 'bar', x: 47, z: -112, r: 3.4 },
  { kind: 'tower', x: 14, z: -11, r: 1.4 },
];

// Mud islets in the mangrove flat. `d` is distance seaward of the shoreline.
export const ISLETS = [
  { x: -205, d: 148, r: 9, h: 0.75 }, { x: -128, d: 190, r: 7, h: 0.7 },
  { x: -62, d: 138, r: 8, h: 0.72 }, { x: -8, d: 205, r: 10, h: 0.8 },
  { x: 42, d: 146, r: 7, h: 0.7 }, { x: 118, d: 222, r: 9, h: 0.78 },
  { x: 136, d: 134, r: 7, h: 0.7 }, { x: 224, d: 176, r: 8, h: 0.72 },
  { x: -262, d: 222, r: 8, h: 0.7 }, { x: -90, d: 216, r: 6, h: 0.66 },
  { x: 80, d: 128, r: 6, h: 0.66 }, { x: 196, d: 214, r: 7, h: 0.7 },
  { x: -318, d: 96, r: 9, h: 0.75 }, { x: 312, d: 112, r: 9, h: 0.75 },
  { x: -168, d: 126, r: 6, h: 0.66 }, { x: 262, d: 140, r: 6, h: 0.68 },
];

// Tidal channels cutting across the flat from the lagoon to the open sea.
export const CROSS_CHANNELS = [-150, 15, 165];

// Deeper sandy pockets in the lagoon.
export const POCKETS = [
  { x: -120, d: 62, r: 22, h: -1.1 }, { x: 35, d: 70, r: 26, h: -1.3 },
  { x: 150, d: 58, r: 20, h: -1.0 },
];

// Coral bommies (rock + coral gardens) in the lagoon.
export const BOMMIES = [
  { x: -170, d: 52 }, { x: -122, d: 78 }, { x: -84, d: 44 }, { x: -40, d: 72 },
  { x: 4, d: 48 }, { x: 38, d: 84 }, { x: 78, d: 56 }, { x: 122, d: 76 },
  { x: 164, d: 46 }, { x: 204, d: 70 }, { x: -208, d: 80 }, { x: 60, d: 30 },
];

// Crocodile home spots.
export const CROC_HOMES = [
  { x: -186, d: 166 }, { x: -118, d: 160 }, { x: -44, d: 156 }, { x: 12, d: 186 },
  { x: 62, d: 162 }, { x: 98, d: 176 }, { x: 172, d: 160 }, { x: 238, d: 152 },
  { x: -262, d: 202 }, { x: 82, d: 214 }, { x: -318, d: 98 }, { x: 312, d: 114 },
  { x: -34, d: 224 },
];

// Dream pearls. `y` is optional: 'floor' = just above the bottom.
export const PEARLS = [
  { x: 22, d: 34, kind: 'floor' },      // lagoon, easy
  { x: 38, d: 78, kind: 'floor' },      // lagoon pocket, needs a dive
  { x: -118, d: 70, kind: 'floor' },    // lagoon, by a bommie
  { x: -62, d: 140, kind: 'islet' },    // islet at the edge of the flat
  { x: 42, d: 148, kind: 'islet' },
  { x: 136, d: 135, kind: 'islet' },
  { x: -205, d: 150, kind: 'islet' },
  { x: -8, d: 205, kind: 'islet' },     // across the long channel
  { x: 118, d: 222, kind: 'islet' },
  { x: -128, d: 190, kind: 'islet' },
  { x: 224, d: 176, kind: 'islet' },
  { x: 60, d: 250, kind: 'reef' },      // on the outer reef wall, underwater
];

export const SPAWN = { x: 6, z: -6, yaw: Math.PI };
