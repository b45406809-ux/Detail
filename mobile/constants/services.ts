// Service catalogs for the booking wizard — mirrors the "Book House Cleaning"
// and "Book Car Cleaning" step-by-step checklists from the product spec.
import type { HouseCondition, CarCondition } from '../types';

export const HOUSE_AREAS = [
  'Living Room',
  'Bedrooms',
  'Kitchen',
  'Dining Room',
  'Bathrooms',
  'Hallways',
  'Stairs',
  'Other',
] as const;

export const HOUSE_CLEANING_TYPES = [
  { id: 'STANDARD', label: 'Standard Cleaning', desc: 'Regular upkeep of common areas' },
  { id: 'DEEP', label: 'Deep Cleaning', desc: 'Thorough top-to-bottom clean' },
  { id: 'MOVE', label: 'Move In / Move Out Cleaning', desc: 'Full clean before or after a move' },
  { id: 'POST_RENOVATION', label: 'Post Renovation Cleaning', desc: 'Dust and debris removal after work' },
] as const;

export const HOUSE_CONDITIONS: { id: HouseCondition; label: string }[] = [
  { id: 'LIGHT', label: 'Light' },
  { id: 'MODERATE', label: 'Moderate' },
  { id: 'HEAVY', label: 'Heavy' },
];

export const HOUSE_ADD_ONS = [
  'Laundry',
  'Ironing',
  'Dishes',
  'Carpet Cleaning',
  'Inside Fridge',
  'Organizing',
  'Window Cleaning',
  'Other',
] as const;

export const CAR_VEHICLE_TYPES = ['Sedan', 'SUV', 'Truck', 'Van', 'Other'] as const;

export const CAR_CLEANING_TYPES = [
  { id: 'EXTERIOR', label: 'Exterior', desc: 'Wash, wax, and detail the outside' },
  { id: 'INTERIOR', label: 'Interior', desc: 'Vacuum, wipe down, and freshen the cabin' },
  { id: 'FULL_SERVICE', label: 'Full Service', desc: 'Complete inside and out detail' },
  { id: 'OTHER', label: 'Other', desc: 'Tell us what you need' },
] as const;

export const CAR_CONDITIONS: { id: CarCondition; label: string }[] = [
  { id: 'CLEAN', label: 'Clean' },
  { id: 'AVERAGE', label: 'Average' },
  { id: 'VERY_DIRTY', label: 'Very Dirty' },
];

export const CAR_EXTERIOR_SERVICES = [
  'Wash',
  'Wax / Polish',
  'Tire Shine',
  'Rim Cleaning',
  'Scratch Removal',
  'Headlight Cleaning',
  'Bug Removal',
  'Other',
] as const;

export const CAR_INTERIOR_SERVICES = [
  'Vacuum',
  'Dashboard Cleaning',
  'Seat Cleaning',
  'Door Panel Cleaning',
  'Carpet Shampoo',
  'Air Freshener',
  'Window Cleaning',
  'Other',
] as const;

export const CAR_DEEP_SERVICES = [
  'Steam Cleaning',
  'Upholstery Shampoo',
  'Engine Bay Cleaning',
  'Odor Removal',
  'Pet Hair Removal',
  'Other',
] as const;

export const TIME_OPTIONS = [
  { id: 'ASAP', label: 'ASAP', sub: 'Within the hour' },
  { id: 'TODAY', label: 'Today', sub: 'Later today' },
  { id: 'TOMORROW', label: 'Tomorrow', sub: 'Schedule for tomorrow' },
  { id: 'CUSTOM', label: 'Pick Date', sub: 'Choose a specific date' },
] as const;

export const PRICING_STRATEGIES = [
  {
    id: 'INSTANT_BOOK' as const,
    label: 'Instant Book',
    desc: 'Match with a highly-rated pro at a fixed local rate.',
  },
  {
    id: 'RECEIVE_BIDS' as const,
    label: 'Receive Bids',
    desc: 'Let professionals compete for your job. Review profiles and prices.',
  },
];
