import { CleanerProfile, VerificationLevel } from '../types';

/**
 * Detail Matching Algorithm
 * Ranks cleaners based on a weighted score.
 */
export function rankCleaners(
  cleaners: CleanerProfile[],
  customerLocation: { lat: number; lng: number },
  weights = {
    distance: 0.35,
    rating: 0.25,
    completion: 0.20,
    response: 0.10,
    verification: 0.10,
  }
) {
  return cleaners.map((cleaner) => {
    // 1. Proximity Score (Normalized 0-1, closer is better)
    const distance = calculateDistance(
      customerLocation.lat,
      customerLocation.lng,
      cleaner.location.lat,
      cleaner.location.lng
    );
    const proximityScore = Math.max(0, 1 - distance / cleaner.radius);

    // 2. Rating Score (Normalized 0-1)
    const ratingScore = cleaner.ratingAverage / 5;

    // 3. Completion Score (Logarithmic growth for experience)
    const completionScore = Math.min(1, Math.log10(cleaner.jobsCompleted + 1) / 2.5); // 300+ jobs = 1.0

    // 4. Response Speed Score (Faster is better, normalized 0-1)
    const responseScore = Math.max(0, 1 - cleaner.responseTimeAverage / 60); // 0-60 mins range

    // 5. Verification Score
    const verificationScore = cleaner.verificationLevel / 4;

    const finalScore =
      proximityScore * weights.distance +
      ratingScore * weights.rating +
      completionScore * weights.completion +
      responseScore * weights.response +
      verificationScore * weights.verification;

    return {
      ...cleaner,
      distance,
      finalScore,
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
