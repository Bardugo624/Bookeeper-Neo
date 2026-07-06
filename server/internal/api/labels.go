package api

import (
	"bytes"
	"database/sql"
	"fmt"
	"image/png"
	"net/http"
	"strings"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/datamatrix"
	"github.com/go-pdf/fpdf"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// Etichette stampabili (segnatura scaffale) — PDF A4 con DataMatrix.
//
// Codifica del DataMatrix, 12 cifre fisse concordate:
//
//	0000  numero progressivo del libro
//	xx    posizione (slot) sulla mensola, 1-based; 00 = non posizionato
//	yy    mensola (riga), 1-based; 00 = non posizionato
//	zzzz  label_code dello scaffale; 0000 = non posizionato
//
// Layout: griglia 4×11 da 48×25 mm (44 etichette/foglio, fogli adesivi
// standard). Sotto il codice, dettagli leggibili: N. progressivo, titolo,
// scaffale/mensola/posizione.

type labelsReq struct {
	BookIDs []string `json:"book_ids"`
}

type labelRow struct {
	Progressive int
	Title       string
	Authors     string
	ShelfName   string
	ShelfCode   int // label_code (zzzz)
	Row         int // mensola 1-based (yy)
	Slot        int // posizione 1-based (xx)
}

// labelCode compone la stringa a 12 cifre del DataMatrix.
func labelCode(l labelRow) string {
	return fmt.Sprintf("%04d%02d%02d%04d", l.Progressive%10000, l.Slot%100, l.Row%100, l.ShelfCode%10000)
}

// LabelsPDF gestisce POST /api/v1/labels/pdf {book_ids}. Ritorna il PDF.
// Solo i libri del tenant CON numero progressivo producono un'etichetta
// (senza progressivo il codice non identifica niente); gli altri id sono
// ignorati e conteggiati nell'header X-Labels-Skipped.
func (h *BookHandlers) LabelsPDF(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req labelsReq
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.BookIDs) == 0 || len(req.BookIDs) > 2000 {
		writeErr(w, http.StatusBadRequest, "book_ids: 1..2000 required")
		return
	}

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(req.BookIDs)), ",")
	args := make([]any, 0, len(req.BookIDs)+1)
	args = append(args, id.TenantID)
	for _, x := range req.BookIDs {
		args = append(args, x)
	}
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT b.progressive_number, b.title, b.authors_json,
		       s.name, s.label_code, sb.row_index, sb.slot_index
		  FROM books b
		  LEFT JOIN shelf_books sb ON sb.book_id = b.id
		  LEFT JOIN shelves s ON s.id = sb.shelf_id
		 WHERE b.tenant_id = ? AND b.id IN (`+placeholders+`)
		 ORDER BY b.progressive_number
	`, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	labels := []labelRow{}
	skipped := 0
	for rows.Next() {
		var prog, shelfCode, rowIdx, slotIdx sql.NullInt64
		var title, authorsJSON string
		var shelfName sql.NullString
		if err := rows.Scan(&prog, &title, &authorsJSON, &shelfName, &shelfCode, &rowIdx, &slotIdx); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		if !prog.Valid {
			skipped++
			continue
		}
		l := labelRow{
			Progressive: int(prog.Int64),
			Title:       title,
			ShelfName:   shelfName.String,
		}
		if shelfCode.Valid {
			l.ShelfCode = int(shelfCode.Int64)
			l.Row = int(rowIdx.Int64) + 1
			l.Slot = int(slotIdx.Int64) + 1
		}
		labels = append(labels, l)
	}
	if len(labels) == 0 {
		writeErr(w, http.StatusBadRequest, "no labels: none of the books has a progressive number")
		return
	}

	pdfBytes, err := renderLabelsPDF(labels)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "pdf render failed")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="bookeeper-etichette.pdf"`)
	w.Header().Set("X-Labels-Skipped", fmt.Sprint(skipped))
	_, _ = w.Write(pdfBytes)
}

// renderLabelsPDF impagina le etichette su A4, griglia 4×11 da 48×25 mm.
func renderLabelsPDF(labels []labelRow) ([]byte, error) {
	const (
		labelW, labelH = 48.0, 25.0
		cols, rowsPP   = 4, 11
		marginX        = (210.0 - cols*labelW) / 2   // 9 mm
		marginY        = (297.0 - rowsPP*labelH) / 2 // 11 mm
		dmSize         = 16.0                        // lato DataMatrix in mm
		pad            = 2.0
	)

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetTitle("Bookeeper — etichette segnatura", true)

	for i, l := range labels {
		pos := i % (cols * rowsPP)
		if pos == 0 {
			pdf.AddPage()
		}
		x := marginX + float64(pos%cols)*labelW
		y := marginY + float64(pos/cols)*labelH

		// Bordo di taglio leggero (utile su carta non fustellata).
		pdf.SetDrawColor(210, 210, 210)
		pdf.Rect(x, y, labelW, labelH, "D")

		// DataMatrix a sinistra.
		code := labelCode(l)
		img, err := renderDataMatrixPNG(code)
		if err != nil {
			return nil, err
		}
		name := "dm" + code
		pdf.RegisterImageOptionsReader(name,
			fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(img))
		pdf.ImageOptions(name, x+pad, y+(labelH-dmSize)/2, dmSize, dmSize,
			false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

		// Testo a destra del codice.
		tx := x + pad + dmSize + 2
		tw := labelW - (pad + dmSize + 2) - pad

		pdf.SetTextColor(20, 20, 20)
		pdf.SetFont("Helvetica", "B", 10)
		pdf.SetXY(tx, y+pad+0.5)
		pdf.CellFormat(tw, 4.5, fmt.Sprintf("N. %04d", l.Progressive), "", 0, "L", false, 0, "")

		pdf.SetFont("Helvetica", "", 6.5)
		pdf.SetXY(tx, y+pad+5.5)
		pdf.MultiCell(tw, 2.9, truncateLatin(l.Title, 60), "", "L", false)

		pdf.SetFont("Helvetica", "", 6)
		pdf.SetTextColor(90, 90, 90)
		var place string
		if l.ShelfCode > 0 {
			shelf := l.ShelfName
			if len([]rune(shelf)) > 22 {
				shelf = string([]rune(shelf)[:21]) + "."
			}
			place = fmt.Sprintf("%s  -  M%d P%d", shelf, l.Row, l.Slot)
		} else {
			place = "non posizionato"
		}
		pdf.SetXY(tx, y+labelH-pad-5.6)
		pdf.CellFormat(tw, 2.8, truncateLatin(place, 999), "", 0, "L", false, 0, "")
		// La stringa codificata, leggibile anche a occhio.
		pdf.SetFont("Courier", "", 5.5)
		pdf.SetXY(tx, y+labelH-pad-2.8)
		pdf.CellFormat(tw, 2.8, code, "", 0, "L", false, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// renderDataMatrixPNG genera il PNG del DataMatrix (scala 8x per nitidezza
// di stampa: fpdf lo ridimensiona a 16 mm senza interpolazione visibile).
func renderDataMatrixPNG(code string) ([]byte, error) {
	dm, err := datamatrix.Encode(code)
	if err != nil {
		return nil, err
	}
	scaled, err := barcode.Scale(dm, 160, 160)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// truncateLatin taglia a n caratteri e converte in byte Latin-1, l'encoding
// atteso dai font core PDF (Helvetica/Courier). I font core NON accettano
// UTF-8: senza questa conversione "città" diventa "cittÃ ". I caratteri
// fuori da Latin-1 (CJK, ecc.) diventano '?'.
func truncateLatin(s string, n int) string {
	rs := []rune(s)
	if len(rs) > n {
		rs = append(rs[:n-2], '.', '.')
	}
	out := make([]byte, len(rs))
	for i, r := range rs {
		if r < 32 || r > 0xFF {
			out[i] = '?'
		} else {
			out[i] = byte(r) // rune 0..0xFF → singolo byte Latin-1
		}
	}
	return string(out)
}
