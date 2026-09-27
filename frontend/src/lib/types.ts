export type Tier = "Low" | "Medium" | "High";
export type TxStatus = "Approved" | "PendingReview" | "Blocked" | "Rejected";
export type TxType = "Transfer" | "BillPayment" | "Collection" | "CardPayment" | "AtmWithdrawal";

export interface Account {
  accountId: number;
  maskedAccountNumber: string;
  accountNumber: string;
  type: string;
  balance: number;
}

export interface CustomerProfile {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  segment: string;
  kyc: "Verified" | "Pending" | "Mismatch";
  nameOnId: string;
  travelNoticeCountry: string | null;
  travelNoticeUntil: string | null;
  createdAt: string;
  status: string;
  accounts: Account[];
}

export interface AuthResponse {
  token: string;
  profile: CustomerProfile;
}

export interface AdminAuth {
  token: string;
  fullName: string;
  role: "Analyst" | "Admin";
  username: string;
}

export interface TxListItem {
  transactionId: number;
  reference: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  counterpartyDisplay: string;
  narration: string;
  channel: string;
  country: string | null;
  city: string | null;
  createdAt: string;
}

// What a customer may see of a payment: the outcome only (no risk score, rules or ML output).
export interface TxResult {
  transactionId: number;
  reference: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  counterpartyDisplay: string;
  newBalance: number;
  createdAt: string;
  message: string;
}

export interface CustomerTx {
  transactionId: number;
  reference: string;
  type: TxType;
  status: TxStatus;
  statusMessage: string;
  amount: number;
  narration: string;
  channel: string;
  counterpartyDisplay: string;
  merchantCategory: string | null;
  shippingAddress: string | null;
  country: string;
  city: string;
  createdAt: string;
  reviewedAt: string | null;
  timeline: { title: string; detail: string; at: string }[];
}

export interface RuleCheck {
  code: string;
  category: string;
  name: string;
  description: string;
  outcome: "Pass" | "Fail" | "NotApplicable";
  points: number;
  pointsAwarded: number;
  hardBlock: boolean;
  observed: string;
  threshold: string;
  detail: string;
}

export interface MlLayer {
  sampleId: string;
  profile: string;
  logisticRegressionProbability: number;
  decisionTreeProbability: number;
  combinedMlProbability: number;
  datasetReferenceAmount: number;
  ran: boolean;
}

export interface Hybrid {
  ruleScore: number;
  ruleWeight: number;
  mlWeight: number;
  mlProbability: number;
  riskScore: number;
  riskTier: Tier;
  decision: string;
  ruleOnlyTier: string;
  mlOnlyTier: string;
  hardBlock: boolean;
  lowMax: number;
  mediumMax: number;
}

export interface TimelineEvent {
  kind: "audit" | "note";
  actor: string;
  title: string;
  detail: string;
  at: string;
}

export interface TxDetail {
  transactionId: number;
  reference: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  narration: string;
  channel: string;
  counterpartyDisplay: string;
  merchantCategory: string | null;
  shippingAddress: string | null;
  ip: string;
  country: string;
  city: string;
  locationSource: string;
  deviceFingerprint: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerSegment: string;
  accountLast4: string;
  checks: RuleCheck[];
  ml: MlLayer;
  hybrid: Hybrid;
  timeline: TimelineEvent[];
}

export interface Biller { id: number; category: string; name: string }
export interface Merchant { id: number; name: string; category: string; highFraud: boolean }
export interface Beneficiary { id: number; name: string; bankName: string; masked: string; addedAt: string }
export interface SimLocationOption { key: string; label: string; country: string; city: string }

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

export interface Simulation {
  location: string;
  deviceMode: "current" | "new" | "shared";
  localTime: string;
  loginBehaviour: "normal" | "failed-burst";
  mlProfile: "typical" | "anomalous" | "subtle";
}
