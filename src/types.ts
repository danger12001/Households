// All money is stored as integer cents to avoid floating point drift.
// Dates without a time are stored as 'YYYY-MM-DD' strings; date-times as
// local 'YYYY-MM-DDTHH:mm' strings (a household lives in one timezone).

export type Role = 'landlord' | 'tenant'

export interface Member {
  id: string
  name: string
  /** Lowercased sign-in email. Members without an email can't sign in but can still owe/pay. */
  email?: string
  role: Role
  room?: string
  phone?: string
  /** Relative share for weighted utility splits (e.g. 2 for a couple sharing a room). */
  weight: number
  /** Whether this member takes part in utility splits (landlords usually don't). */
  sharesUtilities: boolean
  moveIn?: string
  moveOut?: string
}

/** Every amount in the app is entered and stored in rand. */
export const BASE_CURRENCY = 'ZAR'

export interface Household {
  id: string
  name: string
  /** Always BASE_CURRENCY; kept on the doc so a future change is a data migration, not a guess. */
  currency: string
  /** The landlord's home currency, shown alongside rand for landlords (e.g. EUR for the Netherlands). */
  landlordCurrency: string
  /** 1 rand = exchangeRate landlordCurrency. */
  exchangeRate?: number
  rateUpdatedAt?: number
  /** 'auto' rates refresh daily from the ECB feed; 'manual' ones stay until a landlord changes them. */
  rateSource?: 'auto' | 'manual'
  createdAt: number
  members: Record<string, Member>
  /** Denormalised from members for security rules and the "my households" query. */
  memberEmails: string[]
  landlordEmails: string[]
}

export const EXPENSE_CATEGORIES = [
  'dogs',
  'electronics',
  'pool',
  'utilities',
  'groceries',
  'household',
  'maintenance',
  'garden',
  'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type SplitMethod = 'equal' | 'shares' | 'exact'

export interface Expense {
  id: string
  description: string
  category: ExpenseCategory
  amountCents: number
  date: string
  paidBy: string
  splitMethod: SplitMethod
  /** For 'equal': 1 per participant. For 'shares': weights. For 'exact': cents. */
  splitInput: Record<string, number>
  /** Resolved cents owed per member; always sums to amountCents. */
  allocations: Record<string, number>
  receiptIds: string[]
  notes?: string
  status: 'open' | 'disputed'
  disputeNote?: string
  disputedBy?: string
  /** Set when the expense was generated from a utility bill. */
  billId?: string
  createdBy: string
  createdAt: number
  updatedAt?: number
}

export interface Receipt {
  id: string
  dataUrl: string
  width: number
  height: number
  bytes: number
  createdBy: string
  createdAt: number
}

export interface Settlement {
  id: string
  from: string
  to: string
  amountCents: number
  date: string
  note?: string
  createdBy: string
  createdAt: number
}

export interface Contractor {
  id: string
  name: string
  trade: string
  company?: string
  phone?: string
  email?: string
  notes?: string
  createdAt: number
}

export const EVENT_KINDS = [
  'plumbing',
  'electrical',
  'pool',
  'garden',
  'vet',
  'pest control',
  'cleaning',
  'inspection',
  'general',
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export type Recurrence = 'none' | 'weekly' | 'fortnightly' | 'monthly'

export interface HouseEvent {
  id: string
  title: string
  kind: EventKind
  contractorId?: string
  /** 'YYYY-MM-DDTHH:mm' local time. */
  start: string
  durationMinutes: number
  recurrence: Recurrence
  /** Last date (inclusive, 'YYYY-MM-DD') a recurring event repeats. */
  recurUntil?: string
  status: 'scheduled' | 'done' | 'cancelled'
  notes?: string
  createdBy: string
  createdAt: number
}

export const UTILITIES = [
  'electricity',
  'water',
  'rates',
  'refuse',
  'sewerage',
  'internet',
  'gas',
  'other',
] as const
export type Utility = (typeof UTILITIES)[number]

/**
 * equal     - split evenly between participating members
 * weights   - by each member's weight
 * occupancy - by weight x days resident during the billing period
 * usage     - by each member's sub-meter consumption entered on the bill
 */
export type BillSplitMethod = 'equal' | 'weights' | 'occupancy' | 'usage'

export interface Bill {
  id: string
  utility: Utility
  periodStart: string
  periodEnd: string
  amountCents: number
  paidBy: string
  splitMethod: BillSplitMethod
  participants: string[]
  /** Sub-meter consumption per member, for 'usage'. */
  usage: Record<string, number>
  /** Optional whole-house consumption from the bill (kWh, kL...). */
  consumption?: number
  unit?: string
  receiptIds: string[]
  expenseId?: string
  notes?: string
  createdBy: string
  createdAt: number
}

/**
 * A separate running tally kept outside household balances, e.g. a car being
 * paid off where household purchases count towards the total. Optionally
 * mirrored to a Google Sheet.
 */
export interface Ledger {
  id: string
  name: string
  description?: string
  targetCents?: number
  /** The tenant this ledger belongs to; only they (and landlords) can see it. */
  tenantId?: string
  /** Denormalised from the member for security rules / queries. */
  tenantEmail?: string
  sheet?: {
    spreadsheetId: string
    url: string
    tab: string
    lastPushedAt?: number
    lastPulledAt?: number
  }
  createdBy: string
  createdAt: number
}

export interface LedgerEntry {
  id: string
  ledgerId: string
  /** Copied from the ledger so rules/queries can scope tenant access. */
  tenantEmail?: string
  date: string
  description: string
  category?: string
  /** Positive adds to the ledger total, negative subtracts. */
  amountCents: number
  /** Who the entry is about (paid/contributed), if anyone. */
  memberId?: string
  receiptIds: string[]
  notes?: string
  /** Tenants submit 'pending' requests; only 'approved' entries count or sync. */
  status: 'approved' | 'pending' | 'rejected'
  rejectReason?: string
  expenseId?: string
  createdBy: string
  createdAt: number
  reviewedBy?: string
  reviewedAt?: number
}

export interface MeterReading {
  id: string
  meter: string
  unit: string
  reading: number
  /** 'YYYY-MM-DDTHH:mm' local time. */
  takenAt: string
  receiptIds: string[]
  /** 'manual' or the name of an automated source (e.g. a Pi collector). */
  source: string
  createdBy: string
  createdAt: number
}
