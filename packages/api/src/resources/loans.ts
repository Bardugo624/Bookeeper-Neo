import { P, S, enc, qs, unwrap, unwrapEmpty, type Transport } from './util';

export type LoanOut = S['LoanOut'];
export type LoanList = S['LoanList'];
export type CreateLoan = S['CreateLoan'];
export type PatchLoan = S['PatchLoan'];
export type ReturnLoan = S['ReturnLoan'];
export type BorrowerList = S['BorrowerList'];
export type ListLoansParams = S['ListLoansQuery'];

export function loansApi(t: Transport) {
  return {
    async listLoans(params?: ListLoansParams) {
      return unwrap<LoanList>(await t.request('GET', `${P}/loans${qs(params)}`));
    },
    async listBorrowers(q?: string) {
      return unwrap<BorrowerList>(await t.request('GET', `${P}/loans/borrowers${qs({ q })}`));
    },
    async createLoan(body: CreateLoan) {
      return unwrap<LoanOut>(await t.request('POST', `${P}/loans`, body));
    },
    async updateLoan(id: string, patch: PatchLoan) {
      return unwrap<LoanOut>(await t.request('PATCH', `${P}/loans/${enc(id)}`, patch));
    },
    async deleteLoan(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/loans/${enc(id)}`));
    },
    async returnLoan(id: string, returnedAt?: number) {
      const body: ReturnLoan = returnedAt === undefined ? {} : { returned_at: returnedAt };
      return unwrap<LoanOut>(await t.request('POST', `${P}/loans/${enc(id)}/return`, body));
    },
    async reopenLoan(id: string) {
      return unwrap<LoanOut>(await t.request('POST', `${P}/loans/${enc(id)}/reopen`));
    },
  };
}
