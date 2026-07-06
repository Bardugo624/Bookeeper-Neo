package api

import "testing"

const goodreadsSample = `Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Exclusive Shelf,My Review,Private Notes
1,Il nome della rosa,Umberto Eco,,"=""8845292866""","=""9788845292866""",5,Bompiani,Paperback,512,1980,1980,read,,
2,Senza ISBN,Autore Ignoto,,"=""""","=""""",0,,,0,,,to-read,,
`

const calibreSample = `authors,formats,id,isbn,languages,pubdate,publisher,title,uuid
Umberto Eco & Jean-Noel Schifano,epub,1,9788845292866,ita,1980-10-01T00:00:00+00:00,Bompiani,Il nome della rosa,abc
`

const libraryThingSample = "'BOOK ID'\t'TITLE'\t'PRIMARY AUTHOR'\t'SECONDARY AUTHOR'\t'PUBLICATION'\t'DATE'\t'ISBN'\n" +
	"1\tIl nome della rosa\tUmberto Eco\t\tBompiani\t1980\t[9788845292866]\n"

func TestDetectImportFormat(t *testing.T) {
	cases := map[string]string{
		goodreadsSample:    "goodreads",
		calibreSample:      "calibre",
		libraryThingSample: "librarything",
	}
	for src, want := range cases {
		if got := detectImportFormat(src); got != want {
			t.Errorf("detect = %q, want %q", got, want)
		}
	}
}

func TestParsers(t *testing.T) {
	for _, tc := range []struct{ format, src string }{
		{"goodreads", goodreadsSample},
		{"calibre", calibreSample},
		{"librarything", libraryThingSample},
	} {
		books, errs, err := parseImport(tc.format, tc.src)
		if err != nil {
			t.Fatalf("%s: %v", tc.format, err)
		}
		if len(errs) != 0 {
			t.Errorf("%s: unexpected row errors %v", tc.format, errs)
		}
		if len(books) == 0 {
			t.Fatalf("%s: no books parsed", tc.format)
		}
		b := books[0]
		if b.Title != "Il nome della rosa" {
			t.Errorf("%s: title = %q", tc.format, b.Title)
		}
		if b.ISBN13 != "9788845292866" {
			t.Errorf("%s: isbn13 = %q", tc.format, b.ISBN13)
		}
		if len(b.Authors) == 0 || b.Authors[0] != "Umberto Eco" {
			t.Errorf("%s: authors = %v", tc.format, b.Authors)
		}
	}
}

func TestGoodreadsDetails(t *testing.T) {
	books, _, _ := parseImport("goodreads", goodreadsSample)
	if len(books) != 2 {
		t.Fatalf("want 2 books, got %d", len(books))
	}
	b := books[0]
	if b.ISBN10 != "8845292866" || b.Year != 1980 || b.Pages != 512 || b.Format != "paperback" {
		t.Errorf("unexpected fields: %+v", b)
	}
	if books[1].ISBN13 != "" || books[1].ISBN10 != "" {
		t.Errorf("empty ISBN should stay empty: %+v", books[1])
	}
}

func TestNormISBN(t *testing.T) {
	cases := map[string]string{
		`="9788845292866"`: "9788845292866",
		"978-88-452-9286-6": "9788845292866",
		"884529286x":        "884529286X",
		`=""`:               "",
		"12345":             "",
	}
	for in, want := range cases {
		if got := normISBN(in); got != want {
			t.Errorf("normISBN(%q) = %q, want %q", in, got, want)
		}
	}
}
