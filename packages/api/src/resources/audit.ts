import { P, S, qs, unwrap, type Transport } from './util';

export type AuditOut = S['AuditOut'];
export type AuditList = S['AuditList'];
export type AuditActions = S['AuditActions'];
export type ListAuditParams = S['AuditQuery'];

export function auditApi(t: Transport) {
  return {
    async listAudit(params?: ListAuditParams) {
      return unwrap<AuditList>(await t.request('GET', `${P}/audit${qs(params)}`));
    },
    async listAuditActions() {
      return unwrap<AuditActions>(await t.request('GET', `${P}/audit/actions`));
    },
  };
}
