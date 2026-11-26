-- Indexes for the list, filter and statistics routes on libraries of ~10,000 books.
-- Default list order and the title sort, so a page does not sort the whole library.
CREATE INDEX idx_books_created ON books(library_id, created_at DESC, id DESC);
CREATE INDEX idx_books_title ON books(library_id, title COLLATE NOCASE, id);
-- Filters by year, owner, format and language.
CREATE INDEX idx_books_year ON books(library_id, published_year);
CREATE INDEX idx_books_owner ON books(library_id, owner_user_id);
-- Tag facet and tag filter by tag.
CREATE INDEX idx_book_tags_tag ON book_tags(tag_id, book_id);
-- Reading state filter and statistics of one person.
CREATE INDEX idx_reading_user_status ON reading(user_id, status);
CREATE INDEX idx_reading_book ON reading(book_id);
-- Loans: open and returned lists, overdue.
CREATE INDEX idx_loans_library_returned ON loans(library_id, returned_at, due_at);
CREATE INDEX idx_loans_book ON loans(book_id);
-- Books of a room, through its shelves.
CREATE INDEX idx_shelves_room ON shelves(room_id);
