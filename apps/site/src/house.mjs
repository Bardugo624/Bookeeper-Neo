// The example house drawn on the homepage. Made-up data, labelled as such on the page.
// It mirrors the demo library behind the screenshots (apps/site/scripts/shots/seed.mjs):
// same rooms, same bookcases, same shelf for every book, so drawing and app agree.
// Coordinates are in the plan's viewBox (0 0 1000 790); 1 unit = 1 cm at 1:100.

export const ENTRY = [610, 752];

export const rooms = [
  { id: 'living', x: 40, y: 40, w: 480, h: 360, label: [300, 384], it: 'Soggiorno', en: 'Living room' },
  { id: 'study', x: 520, y: 40, w: 440, h: 260, label: [700, 284], it: 'Studio', en: 'Study' },
  { id: 'hall', x: 520, y: 300, w: 180, h: 420, label: [560, 560], it: 'Ingresso', en: 'Hall', vertical: true },
  { id: 'kitchen', x: 700, y: 300, w: 260, h: 420, label: [830, 700], it: 'Cucina', en: 'Kitchen' },
  { id: 'kids', x: 40, y: 400, w: 480, h: 320, label: [300, 704], it: 'Camera dei ragazzi', en: 'Children’s room' },
];

// Door gaps: wall segment [x1,y1,x2,y2] left open, plus the swing arc of the leaf.
export const doors = [
  { gap: [520, 322, 520, 372], hinge: [520, 322], leaf: [470, 322], sweep: 0 },
  { gap: [548, 300, 598, 300], hinge: [548, 300], leaf: [548, 250], sweep: 1 },
  { gap: [520, 600, 520, 650], hinge: [520, 650], leaf: [470, 650], sweep: 1 },
  { gap: [700, 520, 700, 570], hinge: [700, 520], leaf: [750, 520], sweep: 1 },
  { gap: [196, 400, 246, 400], hinge: [246, 400], leaf: [246, 450], sweep: 1 },
  { gap: [585, 720, 635, 720], hinge: [585, 720], leaf: [585, 670], sweep: 0 },
];

// Bookcases of the demo library. `front`: where a person stands to read the spines.
// `route`: the walk from the door, at right angles. `tag`: centre of the answer label,
// clear of walls and furniture. Drawn neutral on the plan: only the found one takes colour.
export const furniture = [
  {
    id: 'grande', room: 'living', x: 80, y: 54, w: 300, h: 26, color: '#7c8f6a', shelves: 5,
    it: 'Libreria grande', en: 'Large bookcase',
    front: [230, 104], tag: [300, 214], mark: [406, 67],
    route: [[610, 700], [610, 347], [470, 347], [470, 130], [230, 130], [230, 104]],
  },
  {
    id: 'vetrina', room: 'living', x: 54, y: 140, w: 26, h: 180, color: '#6b3a5f', shelves: 3,
    it: 'Vetrina dei classici', en: 'Classics cabinet',
    front: [104, 230], tag: [250, 190], mark: [67, 112],
    route: [[610, 700], [610, 347], [470, 347], [470, 270], [130, 270], [130, 230], [104, 230]],
  },
  {
    id: 'studio', room: 'study', x: 920, y: 66, w: 26, h: 210, color: '#3a4a6b', shelves: 4,
    it: 'Scaffale dello studio', en: 'Study shelves',
    front: [896, 171], tag: [700, 100], mark: [884, 100],
    route: [[610, 700], [610, 330], [573, 330], [573, 250], [860, 250], [860, 171], [896, 171]],
  },
  {
    id: 'ragazzi', room: 'kids', x: 54, y: 500, w: 26, h: 160, color: '#c9954a', shelves: 3,
    it: 'Mensole dei ragazzi', en: 'Children’s shelves',
    front: [104, 580], tag: [300, 520], mark: [67, 474],
    route: [[610, 700], [610, 625], [500, 625], [500, 668], [130, 668], [130, 580], [104, 580]],
  },
  {
    id: 'ingresso', room: 'hall', x: 674, y: 380, w: 26, h: 90, color: '#b8704f', shelves: 2,
    it: 'Mobiletto', en: 'Hall cabinet',
    front: [650, 425], tag: [830, 440], mark: [650, 380],
    route: [[610, 700], [610, 425], [650, 425]],
  },
];

// Other furniture, drawn thin: it makes the plan a home, not a diagram.
export const fittings = [
  { kind: 'rect', x: 150, y: 296, w: 230, h: 64, r: 10 }, // sofa
  { kind: 'rect', x: 210, y: 170, w: 110, h: 50, r: 4 }, // coffee table
  { kind: 'rect', x: 600, y: 120, w: 180, h: 70, r: 2 }, // desk
  { kind: 'circle', cx: 690, cy: 214, r: 20 }, // desk chair
  { kind: 'rect', x: 170, y: 440, w: 100, h: 190, r: 6 }, // bunk bed
  { kind: 'rect', x: 330, y: 440, w: 110, h: 190, r: 6 }, // bed
  { kind: 'rect', x: 720, y: 318, w: 222, h: 50, r: 2 }, // kitchen counter
  { kind: 'circle', cx: 830, cy: 590, r: 56 }, // round table
];

export const windows = [
  [120, 40, 240, 40], [620, 40, 760, 40], [960, 120, 960, 240], [40, 470, 40, 560], [380, 720, 470, 720], [960, 500, 960, 640],
];

export const books = [
  { id: 'promessi', furniture: 'grande', shelf: 3, slot: 1, color: '#7a2e2a',
    it: { title: 'I promessi sposi', author: 'Alessandro Manzoni' }, en: { title: 'The Betrothed', author: 'Alessandro Manzoni' } },
  { id: 'delitto', furniture: 'vetrina', shelf: 2, slot: 1, color: '#2b2b2b',
    it: { title: 'Delitto e castigo', author: 'Fëdor Dostoevskij' }, en: { title: 'Crime and Punishment', author: 'Fyodor Dostoevsky' } },
  { id: 'giro', furniture: 'studio', shelf: 3, slot: 2, color: '#2b5a6b',
    it: { title: 'Il giro del mondo in 80 giorni', author: 'Jules Verne' }, en: { title: 'Around the World in Eighty Days', author: 'Jules Verne' } },
  { id: 'pinocchio', furniture: 'ragazzi', shelf: 2, slot: 1, color: '#c4503a',
    it: { title: 'Le avventure di Pinocchio', author: 'Carlo Collodi' }, en: { title: 'The Adventures of Pinocchio', author: 'Carlo Collodi' } },
  { id: 'rosso', furniture: 'ingresso', shelf: 2, slot: 1, color: '#9a2b2b',
    it: { title: 'Uno studio in rosso', author: 'Arthur Conan Doyle' }, en: { title: 'A Study in Scarlet', author: 'Arthur Conan Doyle' } },
  { id: 'mattia', furniture: 'grande', shelf: 3, slot: 2, color: '#2f4a3a',
    it: { title: 'Il fu Mattia Pascal', author: 'Luigi Pirandello' }, en: { title: 'The Late Mattia Pascal', author: 'Luigi Pirandello' } },
];

export const ORDINALS = {
  it: ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto'],
  en: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'],
};
