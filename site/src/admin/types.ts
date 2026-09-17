export type AdminRoute = 'overview' | 'bookings' | 'customers' | 'cleaners' | 'payments' | 'products' | 'analytics' | 'support' | 'waitlist' | 'settings';

export interface AdminClaims { admin: boolean; permissions: string[]; elevated: boolean }
export interface Metric { label: string; value: number; format?: 'money' | 'number'; error?: string }
export interface RevenuePoint { label: string; amount: number }
export interface AttentionItem { id: string; bookingId?: string; caseId?: string; rule: string; ageMinutes: number }
export interface OverviewData {
  asOf: string; timezone: string; currency: string;
  metrics: Metric[]; revenue: RevenuePoint[]; attention: AttentionItem[];
}
