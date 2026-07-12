// Shared game constants — used by both the browser client and the Node server.
export const TILE = 40;
export const COLS = 32;
export const ROWS = 22;
export const MW = COLS * TILE;
export const MH = ROWS * TILE;

export const MAX_LIVES = 3;
export const MAX_PLAYERS = 4;

export const PCOLORS = ['#FF3333', '#33FF66', '#3399FF', '#FFD700'];
export const PNAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

export const WEAPONS = [
  { name: 'PISTOL',    damage: 35, rpm: 210, ammo: 12, reserve: 72,  cost: 0,   bs: 540, bsz: 3   },
  { name: 'AK-47',     damage: 65, rpm: 480, ammo: 30, reserve: 150, cost: 500, bs: 650, bsz: 3.5 },
  { name: 'MINI UZI',  damage: 24, rpm: 950, ammo: 32, reserve: 192, cost: 500, bs: 560, bsz: 2.5 },
];

// Weapon wall mount tile positions
export const WWALL = [{ wi: 1, tx: 2, ty: 10 }, { wi: 2, tx: 29, ty: 10 }];

// Player spawn tile positions (index-matched to player slot 0-3)
export const PSTARTS = [{ tx: 4, ty: 10 }, { tx: 27, ty: 10 }, { tx: 15, ty: 4 }, { tx: 15, ty: 17 }];
