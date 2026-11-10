export type DiditVerificationState = 'VERIFIED' | 'REJECTED' | 'PENDING';

const normalizeStatus = (value: unknown) => typeof value === 'string'
  ? value.trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
  : '';

const APPROVED = new Set(['approved', 'verified']);
const REJECTED = new Set(['declined', 'rejected', 'failed', 'expired', 'abandoned', 'cancelled', 'canceled']);
const PENDING = new Set(['pending', 'not started', 'in progress', 'in review', 'not finished', 'resubmitted', 'processing', 'review', 'reviewing']);

export function diditVerificationState(value: unknown): DiditVerificationState | null {
  const status = normalizeStatus(value);
  if (APPROVED.has(status)) return 'VERIFIED';
  if (REJECTED.has(status)) return 'REJECTED';
  if (PENDING.has(status)) return 'PENDING';
  return null;
}

export function isDiditVerificationPending(value: unknown): boolean {
  return diditVerificationState(value) === 'PENDING';
}
