import { BookOpen, CreditCard, Gift, Home, Plane, PiggyBank, Smartphone, Sparkles, type LucideIcon } from "lucide-react";

export interface Promo {
  id: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  badge: string;
  gradient: string;
  icon: LucideIcon;
}

// Adverts shown on the dashboard carousel, the Offers page and the welcome pop-up.
export const PROMOS: Promo[] = [
  {
    id: "save",
    title: "Fixed Savings up to 14% a year",
    body: "Lock away funds for 90 days or more and earn interest that beats inflation. Start from N50,000.",
    cta: "Start saving",
    href: "/bank/offers",
    badge: "Savings",
    gradient: "linear-gradient(135deg,#3b1275,#1e3a8a)",
    icon: PiggyBank,
  },
  {
    id: "travel",
    title: "Travelling? Tell us first",
    body: "Add a travel notice in the Security centre so your foreign payments are never held up by a security check.",
    cta: "Add a travel notice",
    href: "/bank/security",
    badge: "Security",
    gradient: "linear-gradient(135deg,#1e3a8a,#5b21b6)",
    icon: Plane,
  },
  {
    id: "card",
    title: "Arclight Virtual Card",
    body: "Shop online safely with a virtual card that can be frozen in one tap. Zero issuance fee this month.",
    cta: "Shop online now",
    href: "/bank/cards",
    badge: "Cards",
    gradient: "linear-gradient(135deg,#4c1d95,#312e81)",
    icon: CreditCard,
  },
  {
    id: "books",
    title: "Back-to-school book fund",
    body: "Pay school fees and buy textbooks in instalments with 0% interest for the first 3 months.",
    cta: "See how it works",
    href: "/bank/offers",
    badge: "Education",
    gradient: "linear-gradient(135deg,#312e81,#1d4ed8)",
    icon: BookOpen,
  },
  {
    id: "rewards",
    title: "2% cashback on bill payments",
    body: "Pay electricity, cable TV, data and water from the app and earn cashback on every payment.",
    cta: "Pay a bill",
    href: "/bank/bills",
    badge: "Rewards",
    gradient: "linear-gradient(135deg,#5b21b6,#1e40af)",
    icon: Gift,
  },
  {
    id: "mortgage",
    title: "Own your home sooner",
    body: "Rent-to-own and mortgage plans with up to 20 years to repay. Check your eligibility in minutes.",
    cta: "Check eligibility",
    href: "/bank/offers",
    badge: "Loans",
    gradient: "linear-gradient(135deg,#1e3a8a,#3b1275)",
    icon: Home,
  },
];

export const PROMO_ICONS = { Smartphone, Sparkles };
