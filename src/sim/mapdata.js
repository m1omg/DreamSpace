// Hand-authored map, traced from satellite imagery of the resort.
//
// Axes: +z points out to sea (north in reality), x runs along the beach.
// Facing the sea, +x is on the left, so +x is west and -x is east.
// Units are metres, y = 0 is sea level. `d` always means the distance seaward
// of the shoreline (z - shoreZ(x)).
//
// Real features kept: the straight ~500 m beach with three rows of umbrellas,
// the mangrove stand at its west end, the shallow seagrass flat off the sand,
// three deeper lagoons inside the reef platform (a small western one, the big
// central one with a deep blue core, and the eastern "Lagoon reef"), the outer
// reef edge bulging ~400 m offshore, and the resort itself: serrated two-storey
// terracotta blocks running inland, free-form pools between them, the round
// thatched restaurant and the hexagonal pavilion by the beach.
// Dream changes: the reef flat is a mangrove swamp with saltwater crocodiles.

export const BEACH_HALF = 250;

// Outer reef edge: distance from the shore at a given x.
export const REEF_EDGE = [
  [-560, 22], [-470, 30], [-325, 100], [-175, 240], [-60, 380], [0, 417], [60, 400],
  [130, 325], [200, 240], [280, 165], [350, 112], [430, 48], [560, 28],
];

// Deeper lagoons carved into the platform.
export const LAGOONS = [
  { id: 'B', x: 55, d: 198, rx: 100, rd: 66, depth: 3.8 },    // big central lagoon
  { id: 'B', x: 26, d: 258, rx: 50, rd: 84, depth: 10.5 },    // its deep blue core
  { id: 'B', x: 14, d: 332, rx: 40, rd: 36, depth: 6.5 },
  { id: 'C', x: -190, d: 90, rx: 58, rd: 60, depth: 4.4 },    // eastern "Lagoon reef"
  { id: 'A', x: 288, d: 64, rx: 50, rd: 40, depth: 4.8 },     // small western lagoon
];

// The real mangrove stand at the west end of the beach.
export const GROVE = { x0: 96, x1: 212, d1: 30 };

// Pools: free-form outlines r(theta) = 1 + a*cos(2t + pa) + b*cos(3t + pb),
// scaled by rx / rz. `depth` is the water depth.
export const POOLS = [
  { id: 'west', x: 57, z: -68, rx: 11, rz: 12, depth: 1.6, a: 0.16, pa: 0.6, b: 0.1, pb: 1.9, islands: [] },
  { id: 'pond', x: -7, z: -62, rx: 10.5, rz: 17, depth: 1.5, a: 0.12, pa: 2.2, b: 0.13, pb: 0.3, tint: 'green',
    islands: [{ x: -8, z: -56, r: 3.2 }, { x: -5, z: -71, r: 2.4 }] },
  { id: 'east', x: -80, z: -92, rx: 9.5, rz: 9, depth: 1.6, a: 0.18, pa: 4.0, b: 0.08, pb: 0.8, islands: [] },
  { id: 'rear', x: 26, z: -188, rx: 21, rz: 12.5, depth: 1.6, a: 0.14, pa: 0.2, b: 0.09, pb: 2.6, islands: [{ x: 31, z: -188, r: 3.0 }] },
  { id: 'kids', x: 58, z: -183, rx: 5.5, rz: 4.2, depth: 0.5, a: 0.1, pa: 1.0, b: 0, pb: 0, islands: [] },
];

// Room blocks: a serrated row of units from (x0, z0) to (x1, z1).
// kind 'rooms' = two-storey terracotta with arched loggias, 'bungalow' =
// single-storey stone-clad row with domes.
export const BLOCKS = [
  { kind: 'rooms', x0: 86, z0: -44, x1: 70, z1: -116 },
  { kind: 'rooms', x0: 38, z0: -36, x1: 27, z1: -82 },
  { kind: 'rooms', x0: 21, z0: -40, x1: 15, z1: -82 },
  { kind: 'rooms', x0: -31, z0: -30, x1: -43, z1: -84 },
  { kind: 'rooms', x0: -49, z0: -37, x1: -63, z1: -94 },
  { kind: 'rooms', x0: -100, z0: -35, x1: -110, z1: -82 },
  // second tier further inland, around the rear pool
  { kind: 'rooms', x0: 92, z0: -150, x1: 86, z1: -226 },
  { kind: 'rooms', x0: -12, z0: -158, x1: -22, z1: -226 },
  { kind: 'rooms', x0: 62, z0: -214, x1: 0, z1: -216 },
  { kind: 'rooms', x0: -68, z0: -128, x1: -82, z1: -196 },
  { kind: 'rooms', x0: -122, z0: -104, x1: -134, z1: -170 },
  { kind: 'rooms', x0: 122, z0: -100, x1: 116, z1: -170 },
  // bungalow rows near the beach
  { kind: 'bungalow', x0: 44, z0: -31, x1: 18, z1: -30 },
  { kind: 'bungalow', x0: -52, z0: -31, x1: -80, z1: -32 },
  { kind: 'bungalow', x0: -118, z0: -34, x1: -146, z1: -36 },
];

// Single buildings: oriented boxes (w along local x, d along local z).
export const BUILDINGS = [
  { kind: 'main', x: -14, z: -122, w: 58, d: 24, h: 9.5, rot: 0 },
  { kind: 'dive', x: 101, z: -33, w: 13, d: 9, h: 4.0, rot: 0.08 },
  { kind: 'white', x: 214, z: -52, w: 17, d: 13, h: 6.4, rot: 0.07 },
  { kind: 'white', x: 195, z: -53, w: 17, d: 13, h: 6.4, rot: 0.07 },
  { kind: 'white', x: 176, z: -54, w: 17, d: 13, h: 6.4, rot: 0.07 },
  { kind: 'white', x: 157, z: -55, w: 17, d: 13, h: 6.4, rot: 0.07 },
  { kind: 'villa', x: -150, z: -62, w: 11, d: 9, h: 3.8, rot: 0.3 },
  { kind: 'villa', x: -172, z: -52, w: 11, d: 9, h: 3.8, rot: -0.2 },
  { kind: 'villa', x: -196, z: -60, w: 11, d: 9, h: 3.8, rot: 0.5 },
  { kind: 'villa', x: -218, z: -50, w: 11, d: 9, h: 3.8, rot: 0.1 },
  { kind: 'villa', x: -166, z: -84, w: 11, d: 9, h: 3.8, rot: 0.9 },
  { kind: 'villa', x: -192, z: -92, w: 11, d: 9, h: 3.8, rot: -0.4 },
  { kind: 'villa', x: -220, z: -84, w: 11, d: 9, h: 3.8, rot: 0.2 },
  { kind: 'villa', x: -176, z: -120, w: 11, d: 9, h: 3.8, rot: 0.6 },
  { kind: 'villa', x: -208, z: -122, w: 11, d: 9, h: 3.8, rot: -0.1 },
];

// Round / polygonal thatched structures and the lifeguard tower.
export const HUTS = [
  { kind: 'restaurant', x: 92, z: -24, r: 7.2 },   // big round thatched restaurant
  { kind: 'pavilion', x: -9, z: -26, r: 5.4 },     // hexagonal pavilion
  { kind: 'bar', x: -119, z: -20, r: 3.8 },        // Kite Bar
  { kind: 'bar', x: 126, z: -9, r: 3.4 },          // Mangrove Cafe
  { kind: 'bar', x: 40, z: -196, r: 3.2 },         // pool bar
  { kind: 'tower', x: 14, z: -4, r: 1.4 },
];

export const VOLLEYBALL = { x: 57, z: -31, w: 18, d: 9 };

// Tidal channels cutting across the flat from the lagoon to the open sea.
export const CROSS_CHANNELS = [-150, 15, 165];

// Slightly deeper sandy pockets in the near-shore lagoon.
export const POCKETS = [
  { x: -120, d: 62, r: 22, h: -0.8 }, { x: 35, d: 70, r: 26, h: -0.9 },
  { x: 150, d: 66, r: 20, h: -0.7 },
];

// Coral bommies (rock + coral gardens): near-shore lagoon and the deep lagoons.
export const BOMMIES = [
  { x: -122, d: 78 }, { x: -84, d: 44 }, { x: -40, d: 72 }, { x: 4, d: 48 }, { x: 38, d: 84 },
  { x: 78, d: 56 }, { x: 60, d: 30 }, { x: 150, d: 76 }, { x: 222, d: 58 },
  { x: -190, d: 70 }, { x: -168, d: 104 }, { x: -212, d: 112 },      // lagoon C
  { x: 300, d: 56 }, { x: 272, d: 76 },                              // lagoon A
  { x: 100, d: 190 }, { x: 10, d: 205 }, { x: 60, d: 230 }, { x: -2, d: 270 }, { x: 52, d: 290 }, { x: 18, d: 335 }, // lagoon B
];

// Authored pearls (more are placed on islets in layout.js).
export const PEARLS = [
  { x: 22, d: 34, kind: 'floor' },      // right off the beach
  { x: 38, d: 78, kind: 'floor' },      // near-shore lagoon, by a bommie
  { x: -118, d: 66, kind: 'floor' },
  { x: -190, d: 92, kind: 'floor' },    // bottom of the eastern lagoon
  { x: 290, d: 64, kind: 'floor' },     // western lagoon
  { x: 96, d: 196, kind: 'floor' },     // big lagoon, shallow part
  { x: 26, d: 262, kind: 'floor' },     // the deep blue core
  { x: 0, d: 432, kind: 'reef' },       // outer reef wall
];

// Extra crocodile homes besides the ones near islets.
export const CROC_EXTRA = [
  { x: 150, d: 16 },     // in the real mangrove stand by the beach
  { x: -62, d: 206 },    // rim of the big lagoon
  { x: 156, d: 244 },
  { x: -188, d: 158 },   // seaward rim of the eastern lagoon
  { x: -118, d: 160 },   // lurking in the long channel
];

export const SPAWN = { x: 6, z: -9, yaw: Math.PI };
