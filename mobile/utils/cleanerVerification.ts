import { UserProfile } from '../types';

/** Registration needs $1 for verification and $1 in prepaid commission credit. */
export function needsCleanerVerificationTopUp(profile: UserProfile | null | undefined): boolean {
  if (!profile) return true;
  if (profile.cleanerVerificationFeePaidAt || profile.verificationStatus === 'VERIFIED') return false;
  return Number(profile.commissionBalance ?? 0) < 2.00;
}
