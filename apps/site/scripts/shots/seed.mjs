// Seeds a fresh bookeeper-server with the synthetic "Famiglia Rossi" demo library.
// Usage: node seed.mjs <server-url> <setup-code> <out-credentials.json>
// All people, friends and notes are invented. Books are pre-1955 classics with their real authors.
// No ISBNs and no covers: the app draws its own placeholder spines/covers and never looks anything up.
import { writeFileSync } from 'node:fs';

const [, , BASE = 'http://127.0.0.1:7842', CODE, OUT = 'demo-credentials.json'] = process.argv;
const EMAIL = 'giulia@esempio.it';
const PASSWORD = 'demo-password-2026';

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const ago = (days) => now - Math.round(days * DAY);

// --- people -------------------------------------------------------------------------------
const setup = await api('POST', '/api/v1/setup', {
  setup_code: CODE,
  library_name: 'Famiglia Rossi',
  display_name: 'Giulia',
  email: EMAIL,
  password: PASSWORD,
  device_kind: 'desktop',
  device_name: 'Computer di casa',
});
const T = setup.session.access_token;
const people = { Giulia: { id: setup.user.id, token: T } };

for (const [name, role, device] of [
  ['Marco', 'admin', 'Telefono di Marco'],
  ['Sofia', 'member', 'Tablet di Sofia'],
  ['Leo', 'member', 'Telefono di Leo'],
]) {
  const inv = await api('POST', '/api/v1/invites', { role, expires_in_days: 7 }, T);
  const r = await api('POST', '/api/v1/pairing/redeem', {
    code: inv.code,
    device_kind: 'mobile',
    device_name: device,
    display_name: name,
  });
  people[name] = { id: r.user.id, token: r.session.access_token };
}

// --- rooms and furniture ------------------------------------------------------------------
const rooms = {};
for (const name of ['Soggiorno', 'Studio', 'Camera dei ragazzi', 'Ingresso']) {
  rooms[name] = (await api('POST', '/api/v1/rooms', { name }, T)).id;
}
const UNITS = [
  { key: 'grande', name: 'Libreria grande', room: 'Soggiorno', color: 'sage', rows: 5, slots_per_row: 16 },
  { key: 'vetrina', name: 'Vetrina dei classici', room: 'Soggiorno', color: 'plum', rows: 3, slots_per_row: 12 },
  { key: 'studio', name: 'Scaffale dello studio', room: 'Studio', color: 'night', rows: 4, slots_per_row: 14 },
  { key: 'ragazzi', name: 'Mensole dei ragazzi', room: 'Camera dei ragazzi', color: 'amber', rows: 3, slots_per_row: 12 },
  { key: 'ingresso', name: 'Mobiletto', room: 'Ingresso', color: 'terracotta', rows: 2, slots_per_row: 10 },
];
const units = {};
for (const u of UNITS) {
  units[u.key] = await api(
    'POST',
    '/api/v1/shelves',
    { name: u.name, room_id: rooms[u.room], color: u.color, rows: u.rows, slots_per_row: u.slots_per_row },
    T,
  );
}

// --- books --------------------------------------------------------------------------------
// [title, author(s), year, pages, genre, colour, unit, row]
const B = [
  ['I promessi sposi', 'Alessandro Manzoni', 1840, 720, 'Romanzo', '#7a2e2a', 'grande', 2],
  ['Il fu Mattia Pascal', 'Luigi Pirandello', 1904, 280, 'Romanzo', '#2f4a3a', 'grande', 2],
  ['Uno, nessuno e centomila', 'Luigi Pirandello', 1926, 240, 'Romanzo', '#c49a3a', 'grande', 2],
  ['I Malavoglia', 'Giovanni Verga', 1881, 320, 'Romanzo', '#5b3a29', 'grande', 2],
  ['Mastro-don Gesualdo', 'Giovanni Verga', 1889, 400, 'Romanzo', '#3c4f6b', 'grande', 2],
  ['La coscienza di Zeno', 'Italo Svevo', 1923, 480, 'Romanzo', '#8a6d3b', 'grande', 2],
  ['Senilità', 'Italo Svevo', 1898, 260, 'Romanzo', '#46535e', 'grande', 2],
  ['Il piacere', "Gabriele D'Annunzio", 1889, 360, 'Romanzo', '#6b2f4a', 'grande', 2],
  ['Piccolo mondo antico', 'Antonio Fogazzaro', 1895, 450, 'Romanzo', '#4d6b4a', 'grande', 2],
  ['Canne al vento', 'Grazia Deledda', 1913, 230, 'Romanzo', '#9c5a33', 'grande', 2],
  ['Divina Commedia', 'Dante Alighieri', 1321, 900, 'Poesia', '#2b2b4a', 'grande', 0],
  ['Decameron', 'Giovanni Boccaccio', 1353, 880, 'Novelle', '#7b4b2a', 'grande', 0],
  ['Canzoniere', 'Francesco Petrarca', 1374, 520, 'Poesia', '#5a3a5e', 'grande', 0],
  ['Orlando furioso', 'Ludovico Ariosto', 1532, 840, 'Poesia', '#8b3a2e', 'grande', 0],
  ['Gerusalemme liberata', 'Torquato Tasso', 1581, 620, 'Poesia', '#3a5a6b', 'grande', 0],
  ['Il Principe', 'Niccolò Machiavelli', 1532, 160, 'Saggio', '#262626', 'grande', 0],
  ['Canti', 'Giacomo Leopardi', 1835, 300, 'Poesia', '#6b5a3a', 'grande', 1],
  ['Operette morali', 'Giacomo Leopardi', 1827, 280, 'Saggio', '#4a3a2b', 'grande', 1],
  ['Le ultime lettere di Jacopo Ortis', 'Ugo Foscolo', 1802, 210, 'Romanzo', '#5e2f2f', 'grande', 1],
  ['Myricae', 'Giovanni Pascoli', 1891, 190, 'Poesia', '#7a8a5a', 'grande', 1],
  ['Il deserto dei Tartari', 'Dino Buzzati', 1940, 240, 'Romanzo', '#a37a3a', 'grande', 1],
  ['Il cappello del prete', 'Emilio De Marchi', 1888, 230, 'Giallo', '#4a5a6b', 'grande', 1],
  ['Novelle per un anno', 'Luigi Pirandello', 1922, 600, 'Novelle', '#8a4a3a', 'grande', 1],
  ["Le confessioni d'un italiano", 'Ippolito Nievo', 1867, 900, 'Romanzo', '#3a4a3a', 'grande', 1],
  ['Fosca', 'Iginio Ugo Tarchetti', 1869, 200, 'Romanzo', '#6b3a4a', 'grande', 1],
  ['Il ventre di Napoli', 'Matilde Serao', 1884, 150, 'Saggio', '#b58a4a', 'grande', 1],
  ['Vita dei campi', 'Giovanni Verga', 1880, 180, 'Novelle', '#7a8a6b', 'grande', 1],
  ['Il marchese di Roccaverdina', 'Luigi Capuana', 1901, 330, 'Romanzo', '#8a3b2b', 'grande', 3],
  ['Orgoglio e pregiudizio', 'Jane Austen', 1813, 420, 'Romanzo', '#c78b8b', 'grande', 3],
  ['Ragione e sentimento', 'Jane Austen', 1811, 400, 'Romanzo', '#8bb0b5', 'grande', 3],
  ['Emma', 'Jane Austen', 1815, 480, 'Romanzo', '#b59a6b', 'grande', 3],
  ['Jane Eyre', 'Charlotte Brontë', 1847, 540, 'Romanzo', '#4a3a4a', 'grande', 3],
  ['Cime tempestose', 'Emily Brontë', 1847, 400, 'Romanzo', '#3a4a4f', 'grande', 3],
  ['Grandi speranze', 'Charles Dickens', 1861, 560, 'Romanzo', '#6b4a2a', 'grande', 3],
  ['Madame Bovary', 'Gustave Flaubert', 1857, 380, 'Romanzo', '#7a5a7a', 'grande', 3],
  ['Il conte di Montecristo', 'Alexandre Dumas', 1846, 1200, 'Avventura', '#2b3a5a', 'grande', 4],
  ['I miserabili', 'Victor Hugo', 1862, 1400, 'Romanzo', '#5a2b2b', 'grande', 4],
  ['Guerra e pace', 'Lev Tolstoj', 1869, 1300, 'Romanzo', '#3a4a2b', 'grande', 4],
  ['Anna Karenina', 'Lev Tolstoj', 1877, 900, 'Romanzo', '#8a2b3a', 'grande', 4],
  ['Il rosso e il nero', 'Stendhal', 1830, 500, 'Romanzo', '#9a3a2b', 'grande', 4],
  ['Delitto e castigo', 'Fëdor Dostoevskij', 1866, 640, 'Romanzo', '#2b2b2b', 'vetrina', 1],
  ['I fratelli Karamazov', 'Fëdor Dostoevskij', 1880, 1000, 'Romanzo', '#4a2b2b', 'vetrina', 1],
  ["L'idiota", 'Fëdor Dostoevskij', 1869, 720, 'Romanzo', '#6b6b4a', 'vetrina', 1],
  ['Le anime morte', 'Nikolaj Gogol', 1842, 420, 'Romanzo', '#5a6b7a', 'vetrina', 1],
  ['Padri e figli', 'Ivan Turgenev', 1862, 260, 'Romanzo', '#7a6b4a', 'vetrina', 1],
  ['Moby Dick', 'Herman Melville', 1851, 720, 'Avventura', '#1f3a4f', 'vetrina', 0],
  ['Il ritratto di Dorian Gray', 'Oscar Wilde', 1890, 260, 'Romanzo', '#3a2b4a', 'vetrina', 0],
  ['Il processo', 'Franz Kafka', 1925, 280, 'Romanzo', '#4f4f4f', 'vetrina', 0],
  ['La metamorfosi', 'Franz Kafka', 1915, 110, 'Racconti', '#7a7a5a', 'vetrina', 0],
  ['Il grande Gatsby', 'F. Scott Fitzgerald', 1925, 210, 'Romanzo', '#c4a35a', 'vetrina', 2],
  ['Gita al faro', 'Virginia Woolf', 1927, 240, 'Romanzo', '#6b8a9c', 'vetrina', 2],
  ['La signora Dalloway', 'Virginia Woolf', 1925, 220, 'Romanzo', '#b5707a', 'vetrina', 2],
  ["L'origine delle specie", 'Charles Darwin', 1859, 560, 'Scienza', '#4a5a3a', 'studio', 1],
  ['Dialogo sopra i due massimi sistemi', 'Galileo Galilei', 1632, 480, 'Scienza', '#6b4a3a', 'studio', 1],
  ['Saggi', 'Michel de Montaigne', 1580, 900, 'Saggio', '#5a4a3a', 'studio', 1],
  ['La Repubblica', 'Platone', -375, 420, 'Filosofia', '#3a3a4a', 'studio', 1],
  ['Meditazioni', 'Marco Aurelio', 180, 180, 'Filosofia', '#7a6b5a', 'studio', 1],
  ['Lo cunto de li cunti', 'Giambattista Basile', 1634, 520, 'Fiabe', '#8a5a3a', 'studio', 2],
  ['Il giro del mondo in 80 giorni', 'Jules Verne', 1872, 250, 'Avventura', '#2b5a6b', 'studio', 2],
  ['Ventimila leghe sotto i mari', 'Jules Verne', 1870, 450, 'Avventura', '#1f4a5a', 'studio', 2],
  ['La guerra dei mondi', 'H. G. Wells', 1898, 230, 'Fantascienza', '#6b2b2b', 'studio', 2],
  ['Le avventure di Pinocchio', 'Carlo Collodi', 1883, 220, 'Ragazzi', '#c4503a', 'ragazzi', 1],
  ['Cuore', 'Edmondo De Amicis', 1886, 330, 'Ragazzi', '#a33a3a', 'ragazzi', 1],
  ['Il giornalino di Gian Burrasca', 'Vamba', 1912, 260, 'Ragazzi', '#d4943a', 'ragazzi', 1],
  ['Le tigri di Mompracem', 'Emilio Salgari', 1900, 300, 'Avventura', '#3a6b3a', 'ragazzi', 1],
  ['Il Corsaro Nero', 'Emilio Salgari', 1898, 340, 'Avventura', '#262626', 'ragazzi', 1],
  ["L'isola del tesoro", 'Robert Louis Stevenson', 1883, 260, 'Avventura', '#5a7a3a', 'ragazzi', 0],
  ['Alice nel paese delle meraviglie', 'Lewis Carroll', 1865, 180, 'Ragazzi', '#5a8ab5', 'ragazzi', 0],
  ['Il libro della giungla', 'Rudyard Kipling', 1894, 240, 'Ragazzi', '#4a6b2b', 'ragazzi', 0],
  ['Piccole donne', 'Louisa May Alcott', 1868, 480, 'Ragazzi', '#b56b7a', 'ragazzi', 0],
  ['Le avventure di Tom Sawyer', 'Mark Twain', 1876, 280, 'Ragazzi', '#8a6b3a', 'ragazzi', 2],
  ['Il mago di Oz', 'L. Frank Baum', 1900, 200, 'Ragazzi', '#3a8a5a', 'ragazzi', 2],
  ['Peter Pan', 'J. M. Barrie', 1911, 210, 'Ragazzi', '#6b9a4a', 'ragazzi', 2],
  ['Il piccolo principe', 'Antoine de Saint-Exupéry', 1943, 110, 'Ragazzi', '#3a5a9a', 'ragazzi', 2],
  ['Il richiamo della foresta', 'Jack London', 1903, 170, 'Avventura', '#7a5a2b', 'ingresso', 0],
  ['Zanna Bianca', 'Jack London', 1906, 280, 'Avventura', '#9a9a8a', 'ingresso', 0],
  ['Uno studio in rosso', 'Arthur Conan Doyle', 1887, 190, 'Giallo', '#9a2b2b', 'ingresso', 1],
  ['Il mastino dei Baskerville', 'Arthur Conan Doyle', 1902, 250, 'Giallo', '#3a3a2b', 'ingresso', 1],
  ['Assassinio sull\'Orient Express', 'Agatha Christie', 1934, 260, 'Giallo', '#2b4a6b', 'ingresso', 1],
  ['Dracula', 'Bram Stoker', 1897, 480, 'Romanzo', '#5a1f1f', null, 0],
];

const DESCRIPTIONS = {
  'Il fu Mattia Pascal':
    'Creduto morto, un bibliotecario di provincia prova a ricominciare con un altro nome. Il romanzo di Pirandello sull\'identità e sulle sue trappole.',
  'Delitto e castigo': 'Raskol\'nikov, uno studente povero di San Pietroburgo, e le conseguenze di un delitto che credeva giustificato.',
};
const books = {};
let i = B.length + 1;
// Created in reverse, so the catalogue (newest first) opens on the Italian classics.
for (const [title, author, year, pages, genre, color] of [...B].reverse()) {
  i -= 1;
  const owner = i % 7 === 0 ? people.Marco.id : i % 11 === 0 ? people.Sofia.id : people.Giulia.id;
  const book = await api(
    'POST',
    '/api/v1/books',
    {
      title,
      authors: [author],
      published_year: year > 0 ? year : null,
      page_count: pages,
      genre,
      language: 'it',
      format: i % 5 === 0 ? 'hardcover' : 'paperback',
      cover_color: color,
      acquired_at: ago(30 + ((i * 37) % 1500)),
      owner_user_id: genre === 'Ragazzi' ? (i % 2 ? people.Leo.id : people.Sofia.id) : owner,
      description: DESCRIPTIONS[title] ?? null,
    },
    T,
  );
  books[title] = book;
}
for (const [title, , , pages, , , unit, row] of B) {
  const book = books[title];
  if (unit) {
    const width = pages > 800 ? 3 : pages > 350 ? 2 : 1;
    await api('PUT', `/api/v1/books/${book.id}/placement`, { shelf_id: units[unit].id, row_index: row, spine_width: width }, T);
  }
}

// --- reading status per person ------------------------------------------------------------
const titles = Object.keys(books);
const read = async (who, title, status, extra = {}) => {
  await api('PUT', `/api/v1/books/${books[title].id}/reading`, { status, ...extra }, people[who].token);
};
// Finished books spread over the last 12 months, so the stats have shape.
const plan = {
  Giulia: { read: 18, reading: 2, to_read: 5, abandoned: 1, offset: 0 },
  Marco: { read: 11, reading: 1, to_read: 4, abandoned: 2, offset: 20 },
  Sofia: { read: 9, reading: 2, to_read: 3, abandoned: 0, offset: 40 },
  Leo: { read: 6, reading: 1, to_read: 3, abandoned: 1, offset: 54 },
};
for (const [who, p] of Object.entries(plan)) {
  let k = p.offset;
  const next = () => titles[k++ % titles.length];
  for (let n = 0; n < p.read; n++) {
    const finished = ago(5 + ((n * 23 + p.offset * 3) % 360));
    await read(who, next(), 'read', {
      started_at: finished - (10 + (n % 4) * 9) * DAY,
      finished_at: finished,
      rating: 3 + ((n + p.offset) % 3),
    });
  }
  for (let n = 0; n < p.reading; n++) {
    const t = next();
    await read(who, t, 'reading', { started_at: ago(6 + n * 9), current_page: Math.floor(books[t].page_count * (0.3 + n * 0.25)) });
  }
  for (let n = 0; n < p.to_read; n++) await read(who, next(), 'to_read');
  for (let n = 0; n < p.abandoned; n++) await read(who, next(), 'abandoned', { started_at: ago(200 + n * 30) });
}
// The book shown in the detail shot: everyone has a different status.
await read('Giulia', 'Il fu Mattia Pascal', 'read', { started_at: ago(60), finished_at: ago(41), rating: 5 });
await read('Marco', 'Il fu Mattia Pascal', 'reading', { started_at: ago(8), current_page: 142 });
await read('Sofia', 'Il fu Mattia Pascal', 'to_read');

// --- loans to invented friends ------------------------------------------------------------
for (const [title, borrower, lent, due, notes] of [
  ['Il conte di Montecristo', 'Elena (vicina)', 40, -10, 'Per le vacanze'],
  ['Orgoglio e pregiudizio', 'Paolo, collega di Marco', 18, 12, null],
  ['Il giro del mondo in 80 giorni', 'Tommaso, compagno di classe', 9, 21, 'Per la ricerca di geografia'],
  ['Il grande Gatsby', 'Zia Carla', 65, null, null],
  ['Uno studio in rosso', 'Chiara del club del libro', 3, 30, null],
]) {
  await api(
    'POST',
    '/api/v1/loans',
    { book_id: books[title].id, borrower_name: borrower, lent_at: ago(lent), due_at: due === null ? null : ago(-due), notes },
    T,
  );
}
// One returned loan, so the history is not empty.
const back = await api('POST', '/api/v1/loans', { book_id: books['Cuore'].id, borrower_name: 'Nonna Anna', lent_at: ago(120), due_at: ago(90) }, T);
await api('POST', `/api/v1/loans/${back.id}/return`, {}, T);

// --- wishlist -----------------------------------------------------------------------------
for (const [title, authors, priority, notes] of [
  ['Il visconte dimezzato', 'Italo Calvino', 2, 'Per il compleanno di Marco'],
  ['Il sentiero dei nidi di ragno', 'Italo Calvino', 1, null],
  ['Ventimila leghe sotto i mari (edizione illustrata)', 'Jules Verne', 1, 'Per Leo'],
  ['Fontamara', 'Ignazio Silone', 0, null],
  ['Persuasione', 'Jane Austen', 1, 'Manca alla collezione'],
]) {
  await api('POST', '/api/v1/wishlist', { title, authors, priority, notes }, T);
}

const out = {
  base: BASE,
  email: EMAIL,
  password: PASSWORD,
  library_id: setup.library.id,
  units: Object.fromEntries(Object.entries(units).map(([k, v]) => [k, v.id])),
  books: Object.fromEntries(Object.entries(books).map(([k, v]) => [k, v.id])),
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Seeded ${titles.length} books, ${UNITS.length} units, 4 people. Credentials: ${OUT}`);
