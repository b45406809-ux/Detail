import { CleanerProfile, Bid, Job } from '../types';

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

/**
 * Ranks bids on a job so the customer sees the strongest cleaners first when
 * vetting offers (offers.tsx) — highest rating wins, ties broken by more
 * completed jobs, then by lower price.
 */
export function rankBidsByRating(bids: Bid[]): Bid[] {
  return [...bids].sort((a, b) => {
    const ratingDiff = (b.cleanerRating ?? 0) - (a.cleanerRating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    const jobsDiff = (b.cleanerJobsCompleted ?? 0) - (a.cleanerJobsCompleted ?? 0);
    if (jobsDiff !== 0) return jobsDiff;
    return a.bidPrice - b.bidPrice;
  });
}

/**
 * Uber-style "match nearby first": sorts open jobs by distance from the
 * cleaner's current location, nearest first — used on the cleaner's Home
 * feed so the jobs most worth their time (short trip to reach) surface at
 * the top, the same way a rideshare app surfaces nearby requests before far
 * ones. Jobs with no resolvable lat/lng sort to the end rather than being
 * dropped, so a bad/missing location on a job doesn't hide it entirely.
 */
export function rankJobsByProximity(jobs: Job[], cleanerLocation: { lat: number; lng: number }): Job[] {
  return [...jobs].sort((a, b) => {
    const distA = a.location?.lat && a.location?.lng ? haversineDistanceKm(cleanerLocation, a.location) : Infinity;
    const distB = b.location?.lat && b.location?.lng ? haversineDistanceKm(cleanerLocation, b.location) : Infinity;
    return distA - distB;
  });
}

/** Haversine distance in kilometres between two lat/lng points. */
export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return calculateDistance(a.lat, a.lng, b.lat, b.lng);
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
