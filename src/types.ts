/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum AccountType {
  CUSTOMER = 'CUSTOMER',
  CLEANER = 'CLEANER',
  ADMIN = 'ADMIN',
}

export enum VerificationLevel {
  LEVEL_1_BASIC = 1, // Phone verified
  LEVEL_2_IDENTITY = 2, // ID + Selfie
  LEVEL_3_TRUSTED = 3, // High rating + job count
  LEVEL_4_ELITE = 4, // 200+ jobs + excellent rating
}

export enum JobStatus {
  PENDING = 'PENDING',
  BIDDING = 'BIDDING',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  accountType: AccountType;
  verificationStatus: boolean;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  createdAt: Date;
}

export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export interface CleanerProfile {
  cleanerId: string;
  serviceCategories: string[];
  radius: number; // in km
  location: { lat: number; lng: number };
  experienceYears: number;
  verificationLevel: VerificationLevel;
  ratingAverage: number;
  jobsCompleted: number;
  responseTimeAverage: number; // in minutes
  availabilityStatus: AvailabilityStatus;
  lastActive: Date;
}

export interface Job {
  id: string;
  customerId: string;
  cleanerId?: string;
  serviceType: string;
  description: string;
  location: { lat: number; lng: number; address: string };
  scheduledTime: Date;
  status: JobStatus;
  price?: number;
  photos: string[];
}

export interface Bid {
  id: string;
  jobId: string;
  cleanerId: string;
  bidPrice: number;
  estimatedArrival: number; // in minutes
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export interface Commission {
  id: string;
  jobId: string;
  cleanerId: string;
  amount: number;
  dueDate: Date;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
}

export interface DeviceFingerprint {
  deviceId: string;
  userId: string;
  deviceType: string;
  fingerprintHash: string;
  lastLogin: Date;
}
