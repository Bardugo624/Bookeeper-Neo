package api

import (
	"strings"
	"testing"
)

func TestLabelCode(t *testing.T) {
	cases := []struct {
		l    labelRow
		want string
	}{
		{labelRow{Progressive: 42, ShelfCode: 3, Row: 2, Slot: 7}, "004207020003"},
		{labelRow{Progressive: 1, ShelfCode: 0, Row: 0, Slot: 0}, "000100000000"},
		{labelRow{Progressive: 9999, ShelfCode: 9999, Row: 99, Slot: 99}, "999999999999"},
		// Overflow: wrap con modulo, la stringa resta 12 cifre.
		{labelRow{Progressive: 12345, ShelfCode: 10001, Row: 100, Slot: 100}, "234500000001"},
	}
	for _, c := range cases {
		got := labelCode(c.l)
		if got != c.want {
			t.Errorf("labelCode(%+v) = %q, want %q", c.l, got, c.want)
		}
		if len(got) != 12 {
			t.Errorf("labelCode(%+v) len = %d, want 12", c.l, len(got))
		}
	}
}

func TestRenderLabelsPDF(t *testing.T) {
	labels := []labelRow{
		{Progressive: 1, Title: "Il nome della rosa", ShelfName: "Studio", ShelfCode: 1, Row: 2, Slot: 3},
		{Progressive: 2, Title: "Libro senza scaffale", ShelfCode: 0},
		// Titolo lungo + carattere non-latin1 (deve essere ripulito).
		{Progressive: 3, Title: strings.Repeat("あ", 80), ShelfCode: 2, Row: 1, Slot: 1},
	}
	pdf, err := renderLabelsPDF(labels)
	if err != nil {
		t.Fatal(err)
	}
	if len(pdf) < 1000 {
		t.Fatalf("pdf suspiciously small: %d bytes", len(pdf))
	}
	if string(pdf[:4]) != "%PDF" {
		t.Fatalf("not a PDF: %q", pdf[:8])
	}
}

func TestRenderDataMatrix(t *testing.T) {
	img, err := renderDataMatrixPNG("000100000000")
	if err != nil {
		t.Fatal(err)
	}
	if len(img) < 50 {
		t.Fatalf("png too small: %d", len(img))
	}
	// PNG magic.
	if string(img[1:4]) != "PNG" {
		t.Fatalf("not a PNG: %v", img[:8])
	}
}
