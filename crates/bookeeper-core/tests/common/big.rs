//! A library of 10,000 books for the performance tests, written straight into
//! the database in one transaction. Same data on every run (fixed seed).

use bookeeper_core::auth::Role;
use bookeeper_core::AppState;

use super::{add_user, seed, Seeded};

pub const BOOKS: usize = 10_000;
pub const TAGS: usize = 30;
pub const SHELVES: usize = 8;
pub const LOANS: usize = 400;
pub const LOANS_RETURNED: usize = 300;
pub const LOANS_OVERDUE: usize = 20;
pub const WISHLIST: usize = 300;

/// What the helper created, for the requests of the tests.
pub struct BigLibrary {
    pub seeded: Seeded,
    /// The two other people with reading states.
    pub people: Vec<String>,
    pub room_ids: Vec<String>,
    pub shelf_ids: Vec<String>,
    pub tag_ids: Vec<String>,
}

impl BigLibrary {
    pub fn state(&self) -> &AppState {
        &self.seeded.state
    }
    pub fn token(&self) -> &str {
        &self.seeded.session.access_token
    }
}

/// Small deterministic generator (SplitMix64); no dependency, same numbers always.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

const WORDS: [&str; 40] = [
    "Il", "La", "Notte", "Rosa", "Nome", "Mare", "Vento", "Storia", "Viaggio", "Città", "Isola",
    "Ombra", "Luna", "Sole", "Foresta", "Fiume", "Montagna", "Segreto", "Silenzio", "Lettera",
    "Giardino", "Casa", "Strada", "Tempo", "Memoria", "Sogno", "Guerra", "Pace", "Libro",
    "Maestro", "Principe", "Colore", "Stagione", "Porto", "Torre", "Ponte", "Cielo", "Fuoco",
    "Neve", "Alba",
];
const FIRST: [&str; 20] = [
    "Anna", "Luca", "Marta", "Paolo", "Giulia", "Marco", "Elena", "Carlo", "Sara", "Piero",
    "Chiara", "Andrea", "Laura", "Franco", "Irene", "Dario", "Nora", "Hugo", "Iris", "Jon",
];
const LAST: [&str; 40] = [
    "Rossi", "Bianchi", "Verdi", "Neri", "Conti", "Ferrari", "Romano", "Greco", "Bruno", "Gallo",
    "Costa", "Fontana", "Moretti", "Barbieri", "Lombardi", "Serra", "Leone", "Marino", "Valli",
    "Orsini", "Smith", "Brown", "Miller", "Dupont", "Martin", "García", "Silva", "Novak",
    "Kowalski", "Weber", "Tanaka", "Sato", "Ito", "Kim", "Nguyen", "Haas", "Berg", "Lund", "Vogel",
    "Roth",
];
const GENRES: [&str; 14] = [
    "Romanzo",
    "Giallo",
    "Saggio",
    "Storia",
    "Fantasy",
    "Fantascienza",
    "Poesia",
    "Biografia",
    "Viaggi",
    "Cucina",
    "Arte",
    "Filosofia",
    "Ragazzi",
    "Fumetti",
];
const LANGS: [&str; 6] = ["it", "it", "it", "en", "fr", "de"];
const FORMATS: [&str; 4] = ["hardcover", "paperback", "paperback", "ebook"];
const STATUS: [&str; 4] = ["to_read", "reading", "read", "abandoned"];

fn id(kind: u128, n: usize) -> String {
    uuid::Uuid::from_u128((kind << 64) | n as u128).to_string()
}

fn isbn13(n: usize) -> String {
    let body = format!("978{:09}", 100_000_000 + n * 7);
    let sum: u32 = body
        .bytes()
        .enumerate()
        .map(|(i, b)| u32::from(b - b'0') * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    format!("{body}{}", (10 - sum % 10) % 10)
}

/// Creates the library (see the contract of phase 7A). Run it from a test
/// with a Tokio runtime; it takes well under a second in release.
pub async fn big_library() -> BigLibrary {
    let seeded = seed(Role::Owner, Some("ada@example.com"), None).await;
    let (bea, _) = add_user(&seeded.state, &seeded.library_id, Role::Member, "Bea").await;
    let (cino, _) = add_user(&seeded.state, &seeded.library_id, Role::Member, "Cino").await;
    let people = vec![bea, cino];
    let all_people = vec![seeded.user_id.clone(), people[0].clone(), people[1].clone()];
    let lib = seeded.library_id.clone();
    let (room_ids, shelf_ids, tag_ids) = (
        (0..2).map(|i| id(1, i)).collect::<Vec<_>>(),
        (0..SHELVES).map(|i| id(2, i)).collect::<Vec<_>>(),
        (0..TAGS).map(|i| id(3, i)).collect::<Vec<_>>(),
    );
    let (r, s, t) = (room_ids.clone(), shelf_ids.clone(), tag_ids.clone());
    seeded
        .state
        .db
        .run(move |conn| {
            let mut rng = Rng(0xB00C_EEEE);
            let tx = conn.transaction()?;
            let base = 1_700_000_000_i64;
            for (i, rid) in r.iter().enumerate() {
                tx.execute(
                    "INSERT INTO rooms (id, library_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![rid, lib, format!("Stanza {}", i + 1), base],
                )?;
            }
            for (i, sid) in s.iter().enumerate() {
                tx.execute(
                    "INSERT INTO shelves (id, library_id, room_id, name, rows, slots_per_row,
                                          label_code, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, 12, 60, ?5, ?6, ?6)",
                    rusqlite::params![
                        sid,
                        lib,
                        r[i % 2],
                        format!("Mobile {}", i + 1),
                        i as i64 + 1,
                        base
                    ],
                )?;
            }
            for (i, tid) in t.iter().enumerate() {
                tx.execute(
                    "INSERT INTO tags (id, library_id, name, color) VALUES (?1, ?2, ?3, 'sage')",
                    rusqlite::params![tid, lib, format!("tag-{i:02}")],
                )?;
            }

            let authors: Vec<String> = (0..800)
                .map(|i| format!("{} {}", FIRST[i % 20], LAST[(i / 20 + i) % 40]))
                .collect();
            let mut book_ids = Vec::with_capacity(BOOKS);
            let mut rowids = Vec::with_capacity(BOOKS);
            {
                let mut ins = tx.prepare(
                    "INSERT INTO books (id, library_id, isbn_13, title, subtitle, authors_json,
                        publisher, published_year, language, page_count, description, genre,
                        format, progressive_number, owner_user_id, acquired_at, price_cents,
                        notes, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                             ?16, ?17, ?18, ?19, ?19)",
                )?;
                let mut fts = tx.prepare(
                    "INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                )?;
                for n in 0..BOOKS {
                    let bid = id(4, n);
                    let title = format!(
                        "{} {} {}",
                        rng.pick(&WORDS),
                        rng.pick(&WORDS),
                        rng.pick(&WORDS)
                    );
                    let subtitle = (n % 3 == 0).then(|| format!("{} {}", rng.pick(&WORDS), n));
                    let a1 = &authors[rng.below(authors.len())];
                    let mut list = vec![a1.clone()];
                    if n % 4 == 0 {
                        list.push(authors[rng.below(authors.len())].clone());
                    }
                    let authors_json = serde_json::to_string(&list).expect("json");
                    let isbn = (n % 5 < 3).then(|| isbn13(n));
                    let genre = rng.pick(&GENRES);
                    // A few spellings of the same genre, as in a real library.
                    let genre = match rng.below(10) {
                        0 => genre.to_lowercase(),
                        1 => genre.to_uppercase(),
                        _ => genre.to_string(),
                    };
                    let year = 1900 + rng.below(127) as i64;
                    let description = format!(
                        "{} {} {} {} {}",
                        rng.pick(&WORDS),
                        rng.pick(&WORDS),
                        rng.pick(&WORDS),
                        rng.pick(&WORDS),
                        rng.pick(&WORDS)
                    );
                    let notes = (n % 10 == 0).then(|| format!("nota {}", rng.pick(&WORDS)));
                    let owner = (rng.below(10) < 8).then(|| all_people[rng.below(3)].clone());
                    let created = base + (n as i64) * 600;
                    let acquired = (n % 2 == 0).then(|| base - rng.below(5_000_000) as i64);
                    ins.execute(rusqlite::params![
                        bid,
                        lib,
                        isbn,
                        title,
                        subtitle,
                        authors_json,
                        format!("Editore {}", rng.below(60)),
                        year,
                        rng.pick(&LANGS),
                        100 + rng.below(700) as i64,
                        description,
                        genre,
                        rng.pick(&FORMATS),
                        (n % 4 != 3).then_some(n as i64 + 1),
                        owner,
                        acquired,
                        (n % 3 != 0).then(|| 500 + rng.below(3000) as i64),
                        notes,
                        created
                    ])?;
                    let rowid = tx.last_insert_rowid();
                    fts.execute(rusqlite::params![
                        rowid,
                        title,
                        subtitle,
                        list.join(" "),
                        description,
                        notes,
                        isbn.clone().unwrap_or_default()
                    ])?;
                    book_ids.push(bid);
                    rowids.push(rowid);
                }
            }

            // Tags: 30 tags, about two per book.
            {
                let mut ins = tx.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?1, ?2)")?;
                for bid in &book_ids {
                    for _ in 0..(rng.below(5)) {
                        ins.execute(rusqlite::params![bid, t[rng.below(TAGS)]])?;
                    }
                }
            }

            // Placement: the 8 shelves (12 x 60 slots each) are filled in order,
            // which fits at most 5,760 books: about 58% of the library.
            {
                let mut ins = tx.prepare(
                    "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                )?;
                let mut slot = 0;
                for bid in &book_ids {
                    if rng.below(100) >= 70 || slot >= SHELVES * 720 {
                        continue;
                    }
                    let (shelf, within) = (slot / 720, slot % 720);
                    ins.execute(rusqlite::params![
                        bid,
                        s[shelf],
                        (within / 60) as i64,
                        (within % 60) as i64,
                        base
                    ])?;
                    slot += 1;
                }
            }

            // Reading states: each person on 30% of the books.
            {
                let mut ins = tx.prepare(
                    "INSERT INTO reading (id, library_id, user_id, book_id, status, started_at,
                                         finished_at, rating, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?6)",
                )?;
                let mut n = 0;
                for uid in &all_people {
                    for bid in &book_ids {
                        if rng.below(100) >= 30 {
                            continue;
                        }
                        let status = rng.pick(&STATUS);
                        let started = base + rng.below(60_000_000) as i64;
                        let finished = (status == "read").then_some(started + 86_400 * 10);
                        let rating = (status == "read").then(|| 1 + rng.below(5) as i64);
                        ins.execute(rusqlite::params![
                            id(5, n),
                            lib,
                            uid,
                            bid,
                            status,
                            started,
                            finished,
                            rating
                        ])?;
                        n += 1;
                    }
                }
            }

            // Loans: 300 returned, 100 open (20 of them overdue).
            {
                let mut ins = tx.prepare(
                    "INSERT INTO loans (id, library_id, book_id, borrower_name, lent_at, due_at,
                                        returned_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                )?;
                let now = chrono::Utc::now().timestamp();
                for n in 0..LOANS {
                    let lent = now - 86_400 * (30 + rng.below(300) as i64);
                    let (due, returned) = if n < LOANS_RETURNED {
                        (Some(lent + 86_400 * 30), Some(lent + 86_400 * (1 + rng.below(40) as i64)))
                    } else if n < LOANS_RETURNED + LOANS_OVERDUE {
                        (Some(now - 86_400 * (1 + rng.below(20) as i64)), None)
                    } else {
                        (Some(now + 86_400 * (1 + rng.below(60) as i64)), None)
                    };
                    // Returned loans may share books; open ones are on distinct books.
                    let book = if returned.is_some() { n * 3 } else { n * 3 + 1 };
                    ins.execute(rusqlite::params![
                        id(6, n),
                        lib,
                        book_ids[book],
                        format!("Amico {}", n % 40),
                        lent,
                        due,
                        returned
                    ])?;
                }
            }

            // Wishlist: spread over the three people.
            {
                let mut ins = tx.prepare(
                    "INSERT INTO wishlist (id, library_id, user_id, isbn, title, authors, priority,
                                           created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                )?;
                for n in 0..WISHLIST {
                    ins.execute(rusqlite::params![
                        id(7, n),
                        lib,
                        all_people[n % 3],
                        isbn13(BOOKS + n),
                        format!("{} {}", rng.pick(&WORDS), rng.pick(&WORDS)),
                        authors[rng.below(authors.len())],
                        (n % 3) as i64,
                        base + n as i64
                    ])?;
                }
            }

            // Audit log: one entry per book, as if created through the API.
            {
                let mut ins = tx.prepare(
                    "INSERT INTO audit_log (library_id, user_id, action, entity_type, entity_id, at)
                     VALUES (?1, ?2, ?3, 'book', ?4, ?5)",
                )?;
                for (n, bid) in book_ids.iter().enumerate() {
                    let action = if n % 7 == 0 { "book.update" } else { "book.create" };
                    ins.execute(rusqlite::params![
                        lib,
                        all_people[n % 3],
                        action,
                        bid,
                        base + n as i64 * 600
                    ])?;
                }
            }
            let _ = rowids;
            tx.commit()?;
            Ok(())
        })
        .await
        .expect("big library");
    BigLibrary {
        seeded,
        people,
        room_ids,
        shelf_ids,
        tag_ids,
    }
}
