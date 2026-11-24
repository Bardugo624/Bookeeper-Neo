export { ApiError, createFetchTransport } from './transport';
export type { Transport, TransportResponse, RawRequest, RawResponse, FetchTransportOptions } from './transport';
export { createClient } from './client';
export type {
  Health,
  AuthOut,
  Session,
  DeviceOut,
  LibraryOut,
  UserOut,
  SetupStatus,
  SetupRequest,
  LoginRequest,
  LibrariesRequest,
  LibrariesOut,
  PasswordRequest,
  RedeemRequest,
  RefreshOut,
  MeOut,
  PairingCode,
  DeviceList,
} from './client';
export type { BookOut, CreateBook, PatchBook, BookList, BatchDeleted, NextProgressive, Placement, ListBooksParams } from './resources/books';
export type { ShelfOut, ShelfBook, ShelfList, ShelfBookList, NewShelf, ShelfPatch, PlaceIn, BatchAssignOut } from './resources/shelves';
export type { LoanOut, LoanList, CreateLoan, PatchLoan, ReturnLoan, ListLoansParams } from './resources/loans';
export type { WishOut, WishList, CreateWish, PatchWish } from './resources/wishlist';
export type { Stats } from './resources/stats';
export type { Metadata } from './resources/lookup';
export type { CoverColor, CoverFetched } from './resources/covers';
export type { ImportReport, ImportRequest, ImportFormat } from './resources/transfer';
export type { ConfirmOut, RestoreReport, BackupList, BackupItem, BackupConfig } from './resources/backup';
