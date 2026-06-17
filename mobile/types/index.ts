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
  BIDDING = 'BIDDING',
  ACCEPTED = 'ACCEPTED',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export type UserRole = 'CUSTOMER' | 'CLEANER' | 'ADMIN';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  balance: number;
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
}

export interface Job {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhoto?: string;
  cleanerId?: string;
  cleanerName?: string;
  cleanerPhoto?: string;
  cleanerRating?: number;
  serviceType: string;
  description: string;
  location: { lat: number; lng: number; address: string };
  scheduledTime: any;
  status: JobStatus | string;
  customerBid?: number;
  price?: number;
  photos: string[];
  createdAt?: any;
  estimatedDuration?: number;
  cleanerLocation?: { lat: number; lng: number };
  paidAt?: any;
  paymentMethod?: string;
  rating?: number;
  ratedAt?: any;
}

export interface Bid {
  id: string;
  jobId: string;
  cleanerId: string;
  cleanerName?: string;
  cleanerPhoto?: string;
  cleanerRating?: number;
  cleanerJobsCompleted?: number;
  bidPrice: number;
  estimatedArrival: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  message?: string;
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
