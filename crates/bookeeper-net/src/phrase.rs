//! Human-readable verification phrase for a certificate fingerprint.
//!
//! Two people compare the phrase out loud to confirm that the pinned
//! certificate is the one the server really presents (design §6.4).

/// The word list is part of the protocol: NEVER reorder, insert or edit any
/// entry. Doing so changes the phrase of every existing fingerprint.
const WORDS: [&str; 256] = [
    "acqua", "albero", "amico", "anello", "aquila", "arancia", "argento", "aria", "armadio",
    "autunno", "balcone", "barca", "bosco", "bottone", "braccio", "brezza", "cammino", "campana",
    "candela", "cane", "carota", "casa", "castello", "cavallo", "cielo", "cigno", "cinema",
    "citta", "collina", "coltello", "corda", "corona", "cortile", "cucina", "delfino", "dado",
    "dolce", "domani", "dorato", "erba", "estate", "falco", "farfalla", "felice", "ferro", "festa",
    "fiore", "fiume", "foglia", "fontana", "forno", "fragola", "freddo", "frutto", "fumo",
    "gabbiano", "gatto", "gelato", "gioco", "giardino", "giallo", "gomma", "grano", "grotta",
    "guanto", "inverno", "isola", "lago", "lampada", "lana", "legno", "lepre", "letto", "libro",
    "limone", "luna", "luce", "madre", "mantello", "mare", "matita", "mela", "miele", "monte",
    "mulino", "muro", "nave", "nebbia", "neve", "nido", "noce", "nuvola", "oasi", "occhio", "onda",
    "orario", "orso", "ortica", "ospite", "pane", "panna", "parco", "pasta", "penna", "pera",
    "pesce", "pettine", "pianta", "piazza", "pietra", "pigna", "pino", "pioggia", "ponte", "porta",
    "prato", "pulce", "quadro", "quercia", "radice", "rana", "regalo", "remo", "riso", "rosa",
    "rosso", "ruota", "sabbia", "sale", "salice", "sasso", "scala", "scarpa", "sedia", "sentiero",
    "serra", "sera", "sole", "sorgente", "spiaggia", "stella", "strada", "tavolo", "tazza", "tela",
    "tempo", "terra", "tetto", "tigre", "torre", "tramonto", "treno", "tulipano", "uccello",
    "uovo", "uvetta", "valle", "vaso", "vela", "vento", "verde", "vetro", "viola", "volo", "zaino",
    "zebra", "zucca", "zolla", "abete", "agnello", "alba", "ambra", "ananas", "anatra", "angolo",
    "apice", "arco", "asino", "avena", "azzurro", "bagno", "banana", "banco", "baule", "bianco",
    "biscotto", "bruno", "bolla", "borsa", "botte", "briciola", "buio", "burro", "cactus", "caffe",
    "calzino", "camino", "canoa", "capra", "carta", "cascata", "cesto", "chiave", "ciliegia",
    "cipolla", "coniglio", "cuscino", "dente", "divano", "duna", "elmo", "faro", "fieno",
    "finestra", "formica", "fungo", "gamba", "geranio", "ghiaccio", "girasole", "granchio",
    "grillo", "lanterna", "lavagna", "lettera", "lume", "maglia", "mandorla", "melone", "mirtillo",
    "mattone", "moneta", "mosaico", "nastro", "noccioli", "orchidea", "ombrello", "palma",
    "pavone", "pennello", "pesca", "pizza", "pomodoro", "pozzo", "prugna", "rete", "ribes",
    "rondine", "scoglio", "sciarpa", "seme", "tenda", "tartufo", "topazio", "vigna", "zattera",
];

/// Six words indexed by the first six bytes of the fingerprint, separated by a space.
pub fn verification_phrase(fingerprint: &[u8; 32]) -> String {
    fingerprint[..6]
        .iter()
        .map(|b| WORDS[usize::from(*b)])
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn list_has_256_distinct_well_formed_words() {
        assert_eq!(WORDS.len(), 256);
        let set: HashSet<_> = WORDS.iter().collect();
        assert_eq!(set.len(), 256, "words must be all different");
        for w in WORDS {
            assert!((4..=8).contains(&w.len()), "bad length: {w}");
            assert!(w.bytes().all(|b| b.is_ascii_lowercase()), "bad chars: {w}");
        }
    }

    #[test]
    fn phrase_has_six_words() {
        let phrase = verification_phrase(&[7; 32]);
        assert_eq!(phrase.split(' ').count(), 6);
    }

    #[test]
    fn same_fingerprint_same_phrase() {
        let fp = [42u8; 32];
        assert_eq!(verification_phrase(&fp), verification_phrase(&fp));
    }

    #[test]
    fn each_of_the_first_six_bytes_matters() {
        let base = [0u8; 32];
        for i in 0..6 {
            let mut other = base;
            other[i] = 1;
            assert_ne!(
                verification_phrase(&base),
                verification_phrase(&other),
                "byte {i}"
            );
        }
        let mut tail = base;
        tail[6] = 1;
        assert_eq!(verification_phrase(&base), verification_phrase(&tail));
    }

    #[test]
    fn fixed_example() {
        let mut fp = [0u8; 32];
        fp[..6].copy_from_slice(&[0, 1, 2, 3, 4, 5]);
        assert_eq!(
            verification_phrase(&fp),
            "acqua albero amico anello aquila arancia"
        );
    }
}
