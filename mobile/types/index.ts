export enum AccountType {
  CUSTOMER = 'CUSTOMER',
  CLEANER = 'CLEANER',
  ADMIN = 'ADMIN',
}

export enum VerificationLevel {
  LEVEL_1_BASIC = 1,
  LEVEL_2_IDENTITY = 2,
  LEVEL_3_TRUSTED = 3,
  LEVEL_4_ELITE = 4,
}

export enum JobStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE = 'EN_ROUTE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Only these server-validated transitions are legal. CANCELLED is terminal. */
export const BOOKING_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  [JobStatus.PENDING]: [JobStatus.CONFIRMED, JobStatus.CANCELLED],
  [JobStatus.CONFIRMED]: [JobStatus.ASSIGNED, JobStatus.CANCELLED],
  [JobStatus.ASSIGNED]: [JobStatus.EN_ROUTE, JobStatus.CANCELLED],
  [JobStatus.EN_ROUTE]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [],
};


export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export type UserRole = 'CUSTOMER' | 'CLEANER' | 'ADMIN';

/** The two service verticals Detail operates — matches the customer journey's "Select Service" step. */
export type ServiceCategory = 'HOUSE' | 'CAR';

export type PricingStrategy = 'INSTANT_BOOK' | 'RECEIVE_BIDS';

export type HouseCondition = 'LIGHT' | 'MODERATE' | 'HEAVY';
export type CarCondition = 'CLEAN' | 'AVERAGE' | 'VERY_DIRTY';

/** Step-by-step checklist captured while booking a house cleaning. */
export interface HouseChecklist {
  category: 'HOUSE';
  packageId?: string;
  selections?: Record<string, string[]>;
  choices?: Record<string, string>;
  propertySizeSqm?: number;
  storiesCount?: number; // Number of stories/floors in property (e.g. 1, 2, 3)
  roomsCount?: number; // Number of rooms to be cleaned
  bathroomsCount?: number; // Number of bathrooms to be cleaned
  areas: string[]; // Living Room, Bedrooms, Kitchen, Bathrooms, Hallways, Stairs, Dining Room, Other
  cleaningTypes: string[]; // Standard, Deep, Move In/Out, Post Renovation
  condition?: HouseCondition;
  addOns: string[]; // Laundry, Dishes, Inside Fridge, Window Cleaning, Ironing, Carpet Cleaning, Organizing, Other
}

/** Step-by-step checklist captured while booking a car cleaning. */
export interface CarChecklist {
  category: 'CAR';
  packageId?: string;
  selections?: Record<string, string[]>;
  choices?: Record<string, string>;
  vehicleType?: string; // Sedan, SUV, Truck, Van, Other
  registrationNumber?: string; // e.g. ABC-1234 — shown to the cleaner so they wash the correct car
  cleaningTypes: string[]; // Exterior, Interior, Full Service, Other
  condition?: CarCondition;
  exteriorServices: string[]; // Wash, Wax/Polish, Tire Shine, Rim Cleaning, Scratch Removal, Headlight Cleaning, Bug Removal, Other
  interiorServices: string[]; // Vacuum, Dashboard Cleaning, Seat Cleaning, Door Panel Cleaning, Carpet Shampoo, Air Freshener, Window Cleaning, Other
  deepServices: string[]; // Steam Cleaning, Upholstery Shampoo, Engine Bay Cleaning, Odor Removal, Pet Hair Removal, Other
}

export type JobChecklist = HouseChecklist | CarChecklist;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  accountType?: 'INDIVIDUAL' | 'ORGANIZATION';
  organizationId?: string;
  balance: number;
  earningsBalance?: number;
  commissionBalance?: number;
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  hasAgreedToTerms?: boolean;
  commissionOwed?: number;
  isSuspended?: boolean;
  isBanned?: boolean;
  jobsCompleted?: number;
  hasCompletedProfile?: boolean;
  hasSetupPermissions?: boolean;
  phone?: string;
  location?: { lat: number; lng: number };
  verificationLevel?: VerificationLevel;
  ratingAverage?: number;
  ratingCount?: number;
  responseTimeAverage?: number;
  expoPushToken?: string;
  // Cleaner registration (register-cleaner.tsx) — required, alongside
  // hasAgreedToTerms, before profile.tsx's role switch will flip role to
  // CLEANER. All owner-writable (not in firestore.rules' users update denylist).
  cleanerOnboardingComplete?: boolean;
  cleanerAgreementAccepted?: boolean;
  serviceCategories?: ServiceCategory[];
  serviceRadiusKm?: number;
  experienceYears?: number;
  address?: string;
  serviceArea?: string;
  proofOfResidenceUrl?: string;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export interface Job {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhoto?: string;
  customerPhone?: string;
  cleanerId?: string;
  cleanerName?: string;
  cleanerPhoto?: string;
  cleanerPhone?: string;
  cleanerRating?: number;
  category?: ServiceCategory;
  serviceType: string;
  checklist?: JobChecklist;
  description: string;
  location: { lat: number; lng: number; address: string };
  scheduledTime: any;
  timePreference?: 'ASAP' | 'TODAY' | 'TOMORROW' | 'CUSTOM';
  status: JobStatus | string;
  pricingStrategy?: PricingStrategy;
  /** The single customer-set asking amount cleaners bid against (replaces the
   * old budgetMin/budgetMax/customerBid trio now that Instant Book is gone). */
  budget?: number;
  price?: number;
  photos: string[];
  /** Photos uploaded upon job completion (proof of work). */
  completionPhotos?: string[];
  bookingMode?: 'SCHEDULED'|'INSTANT';
  suppliesRequired?: boolean;
  suppliesFee?: number;
  arrivalAt?: any;
  serviceStartedAt?: any;
  completionSubmittedAt?: any;
  customerResponseAt?: any;
  matchExpiresAt?: any;
  instantMatchingExpired?: boolean;
  rescheduleProposal?: {
    id: string;
    proposedBy: string;
    recipientId: string;
    proposedAt: string;
    expiresAt: string;
    previousDateTime?: string | null;
    proposedDateTime: string;
    status: 'PENDING'|'ACCEPTED'|'DECLINED';
  };
  createdAt?: any;
  /** When the job stops accepting new bids — 30 min from creation, extended
   * by another 30 min each time the customer raises the budget. */
  biddingExpiresAt?: any;
  /** The concrete date/time the job is scheduled for, derived from
   * timePreference (or picked directly for CUSTOM) — what sendJobReminders
   * queries against once a bid is accepted. */
  scheduledDateTime?: any;
  reminderSent?: boolean;
  estimatedDuration?: number;
  cleanerLocation?: { lat: number; lng: number };
  paidAt?: any;
  paymentMethod?: string;
  paymentStatus?: 'INITIATING' | 'PENDING' | 'CAPTURED' | 'AUTHORIZED' | 'ESCROWED' | 'DELIVERED' | 'PAID' | 'DISPUTED' | 'REFUNDED' | 'FAILED' | string;
  earnings?: { gross: number; commission: number; net: number; finalized: boolean };
  rating?: number;
  ratedAt?: any;
  isFavoriteRebook?: boolean;
}

/** A single counter-offer exchanged while negotiating a bid. */
export interface OfferHistoryEntry {
  by: 'CUSTOMER' | 'CLEANER';
  price: number;
  message?: string;
  createdAt?: any;
}

export interface Bid {
  id: string;
  jobId: string;
  cleanerId: string;
  cleanerName?: string;
  cleanerPhoto?: string;
  cleanerRating?: number;
  cleanerReviewCount?: number;
  cleanerJobsCompleted?: number;
  cleanerEliteVerified?: boolean;
  bidPrice: number;
  estimatedArrival: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  message?: string;
  history?: OfferHistoryEntry[];
  createdAt?: any;
}

export interface CleanerProfile {
  cleanerId: string;
  serviceCategories: string[];
  radius: number;
  location: { lat: number; lng: number };
  experienceYears: number;
  verificationLevel: VerificationLevel;
  ratingAverage: number;
  jobsCompleted: number;
  responseTimeAverage: number;
  availabilityStatus: AvailabilityStatus;
  lastActive: any;
}

export interface ChatMessage {
  id: string;
  jobId: string;
  senderId: string;
  senderName?: string;
  text: string;
  imageUrl?: string;
  createdAt: any;
  read?: boolean;
}

export interface Commission {
  id: string;
  jobId: string;
  cleanerId: string;
  amount: number;
  dueDate: any;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  createdAt: any;
}

/** A customer's saved/favorited cleaner for quick rebooking. */
export interface Favorite {
  id: string;
  customerId: string;
  cleanerId: string;
  cleanerName?: string;
  cleanerPhoto?: string;
  createdAt?: any;
}

export type NotificationType =
  | 'NEW_BID'
  | 'BID_ACCEPTED'
  | 'BOOKING_CREATED'
  | 'INSTANT_BOOKING_OFFER'
  | 'INSTANT_BOOKING_ACCEPTED'
  | 'INSTANT_MATCH_EXPIRED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'CLEANER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'RESCHEDULE_REQUEST'
  | 'RESCHEDULE_DECLINED'
  | 'PAYMENT_ESCROWED'
  | 'PAYMENT_DELIVERED'
  | 'PAYMENT_DISPUTED'
  | 'COMPLETION_DISPUTED'
  | 'COMPLETION_CONFIRMED'
  | 'CANCELLATION_REVIEW'
  | 'SUPPORT_CASE'
  | 'EMERGENCY'
  | 'JOB_UPDATE'
  | 'MESSAGE'
  | 'PAYMENT'
  | 'RATING'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string;
  data?: { type?: NotificationType; supportCaseId?: string; [key:string]: unknown };
  read: boolean;
  createdAt?: any;
}
