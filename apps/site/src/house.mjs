// The example house drawn on the homepage. Made-up data, labelled as such on the page.
// Coordinates are in the plan's viewBox (0 0 1000 760); 1 unit = 1 cm at 1:100.

export const ENTRY = [610, 752];

export const rooms = [
  { id: 'living', x: 40, y: 40, w: 480, h: 360, label: [420, 150], it: 'Soggiorno', en: 'Living room' },
  { id: 'study', x: 520, y: 40, w: 440, h: 260, label: [760, 262], it: 'Studio', en: 'Study' },
  { id: 'hall', x: 520, y: 300, w: 180, h: 420, label: [610, 470], it: 'Ingresso', en: 'Hall', vertical: true },
  { id: 'kitchen', x: 700, y: 300, w: 260, h: 420, label: [830, 660], it: 'Cucina', en: 'Kitchen' },
  { id: 'kids', x: 40, y: 400, w: 260, h: 320, label: [170, 694], it: 'Camera dei ragazzi', en: 'Children’s room' },
  { id: 'bed', x: 300, y: 400, w: 220, h: 320, label: [410, 694], it: 'Camera', en: 'Bedroom' },
];

// Door gaps: wall segment [x1,y1,x2,y2] left open, plus the swing arc of the leaf.
export const doors = [
  { gap: [520, 322, 520, 372], hinge: [520, 322], leaf: [470, 322], sweep: 0 },
  { gap: [548, 300, 598, 300], hinge: [548, 300], leaf: [548, 250], sweep: 1 },
  { gap: [520, 600, 520, 650], hinge: [520, 650], leaf: [470, 650], sweep: 1 },
  { gap: [700, 470, 700, 520], hinge: [700, 470], leaf: [750, 470], sweep: 1 },
  { gap: [196, 400, 246, 400], hinge: [246, 400], leaf: [246, 450], sweep: 1 },
  { gap: [585, 720, 635, 720], hinge: [585, 720], leaf: [585, 670], sweep: 0 },
];

// Bookcases. `front` is where a person stands to read the spines; `route` the walk from the door.
export const furniture = [
  {
    id: 'grande', room: 'living', x: 80, y: 54, w: 300, h: 26, color: '#7c8f6a', shelves: 5,
    it: 'Libreria grande', en: 'Large bookcase',
    front: [230, 104], route: [[610, 700], [610, 347], [490, 347], [300, 200], [230, 104]],
  },
  {
    id: 'vetrina', room: 'living', x: 54, y: 140, w: 26, h: 180, color: '#6b3a5f', shelves: 4,
    it: 'Vetrina', en: 'Glass cabinet',
    front: [104, 230], route: [[610, 700], [610, 347], [490, 347], [300, 300], [104, 230]],
  },
  {
    id: 'parete', room: 'study', x: 920, y: 66, w: 26, h: 210, color: '#3a4a6b', shelves: 6,
    it: 'Parete dello studio', en: 'Study wall',
    front: [896, 171], route: [[610, 700], [610, 330], [573, 290], [700, 200], [896, 171]],
  },
  {
    id: 'mensole', room: 'study', x: 620, y: 54, w: 200, h: 20, color: '#c9954a', shelves: 2,
    it: 'Mensole sopra la scrivania', en: 'Shelves above the desk',
    front: [720, 150], route: [[610, 700], [610, 330], [573, 290], [640, 210], [720, 150]],
  },
  {
    id: 'bassa', room: 'kids', x: 54, y: 500, w: 26, h: 160, color: '#b8704f', shelves: 3,
    it: 'Libreria bassa', en: 'Low bookcase',
    front: [104, 580], route: [[610, 700], [610, 347], [490, 347], [221, 370], [221, 430], [150, 520], [104, 580]],
  },
  {
    id: 'comodino', room: 'bed', x: 460, y: 418, w: 44, h: 40, color: '#4a4a4a', shelves: 2,
    it: 'Comodino', en: 'Bedside table',
    front: [482, 500], route: [[610, 700], [610, 625], [500, 625], [482, 560], [482, 500]],
  },
];

// Other furniture, drawn thin: it makes the plan a home, not a diagram.
export const fittings = [
  { kind: 'rect', x: 150, y: 290, w: 230, h: 70, r: 10 }, // sofa
  { kind: 'rect', x: 210, y: 200, w: 110, h: 50, r: 4 }, // coffee table
  { kind: 'rect', x: 600, y: 120, w: 180, h: 70, r: 2 }, // desk
  { kind: 'circle', cx: 690, cy: 222, r: 22 }, // desk chair
  { kind: 'rect', x: 330, y: 470, w: 120, h: 190, r: 6 }, // bed
  { kind: 'rect', x: 120, y: 430, w: 100, h: 190, r: 6 }, // bunk bed
  { kind: 'rect', x: 720, y: 318, w: 222, h: 56, r: 2 }, // kitchen counter
  { kind: 'circle', cx: 830, cy: 540, r: 60 }, // round table
];

export const windows = [
  [120, 40, 240, 40], [620, 40, 760, 40], [960, 120, 960, 240], [40, 480, 40, 600], [380, 720, 470, 720], [960, 500, 960, 640],
];

export const books = [
  { id: 'promessi', furniture: 'grande', shelf: 3, slot: 14, color: '#3e6252',
    it: { title: 'I promessi sposi', author: 'Alessandro Manzoni' }, en: { title: 'The Betrothed', author: 'Alessandro Manzoni' } },
  { id: 'moby', furniture: 'vetrina', shelf: 4, slot: 6, color: '#3a4a6b',
    it: { title: 'Moby Dick', author: 'Herman Melville' }, en: { title: 'Moby-Dick', author: 'Herman Melville' } },
  { id: 'mattia', furniture: 'parete', shelf: 2, slot: 9, color: '#8a4452',
    it: { title: 'Il fu Mattia Pascal', author: 'Luigi Pirandello' }, en: { title: 'The Late Mattia Pascal', author: 'Luigi Pirandello' } },
  { id: 'pinocchio', furniture: 'bassa', shelf: 1, slot: 4, color: '#9c5a3c',
    it: { title: 'Le avventure di Pinocchio', author: 'Carlo Collodi' }, en: { title: 'The Adventures of Pinocchio', author: 'Carlo Collodi' } },
  { id: 'delitto', furniture: 'mensole', shelf: 1, slot: 7, color: '#6e5a48',
    it: { title: 'Delitto e castigo', author: 'Fëdor Dostoevskij' }, en: { title: 'Crime and Punishment', author: 'Fyodor Dostoevsky' } },
  { id: 'orgoglio', furniture: 'comodino', shelf: 1, slot: 3, color: '#6b3a5f',
    it: { title: 'Orgoglio e pregiudizio', author: 'Jane Austen' }, en: { title: 'Pride and Prejudice', author: 'Jane Austen' } },
];

export const ORDINALS = {
  it: ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto'],
  en: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'],
};
