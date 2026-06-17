import { CleanerProfile } from '../types';

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
  return cleaners
    .map((cleaner) => {
      const distance = calculateDistance(
        customerLocation.lat,
        customerLocation.lng,
        cleaner.location.lat,
        cleaner.location.lng
      );
      const proximityScore = Math.max(0, 1 - distance / cleaner.radius);
      const ratingScore = cleaner.ratingAverage / 5;
      const completionScore = Math.min(1, Math.log10(cleaner.jobsCompleted + 1) / 2.5);
      const responseScore = Math.max(0, 1 - cleaner.responseTimeAverage / 60);
      const verificationScore = cleaner.verificationLevel / 4;

      const finalScore =
        proximityScore * weights.distance +
        ratingScore * weights.rating +
        completionScore * weights.completion +
        responseScore * weights.response +
        verificationScore * weights.verification;

      return { ...cleaner, distance, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
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
