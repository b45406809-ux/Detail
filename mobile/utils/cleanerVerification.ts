import { UserProfile } from '../types';

/** Customer accounts need $0.50 in the general wallet before starting KYC. */
export function needsCleanerVerificationTopUp(profile: UserProfile | null | undefined): boolean {
  if (!profile) return true;
  if (profile.cleanerVerificationFeePaidAt || profile.verificationStatus === 'VERIFIED') return false;
  return Number(profile.balance ?? 0) < 0.5;
}
