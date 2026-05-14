// Mock financial data — mirrors tools.py from the Python reference impl.
export type Session = 1 | 2;

const BASE_TXNS = [
  { date: "2025-10-01", amount: -25000, category: "rent",          merchant: "Landlord" },
  { date: "2025-10-03", amount: -1200,  category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-10-04", amount: -1800,  category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-10-07", amount: -4500,  category: "shopping",      merchant: "Myntra" },
  { date: "2025-10-08", amount: -1100,  category: "food_delivery", merchant: "Zomato" },
  { date: "2025-10-10", amount: -10000, category: "investment",    merchant: "MF SIP" },
  { date: "2025-10-11", amount: -950,   category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-10-13", amount: -3200,  category: "groceries",     merchant: "BigBasket" },
  { date: "2025-10-15", amount: -1500,  category: "entertainment", merchant: "BookMyShow" },
  { date: "2025-10-17", amount: -2200,  category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-10-20", amount: -890,   category: "food_delivery", merchant: "Zomato" },
  { date: "2025-10-22", amount: -2200,  category: "fuel",          merchant: "IOCL" },
  { date: "2025-10-24", amount: -1500,  category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-10-27", amount: -1200,  category: "food_delivery", merchant: "Zomato" },
  { date: "2025-10-28", amount: -3500,  category: "shopping",      merchant: "Amazon" },
  { date: "2025-10-30", amount: -1400,  category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-11-01", amount: 120000, category: "salary",        merchant: "Employer" },
  { date: "2025-11-02", amount: -650,   category: "food_delivery", merchant: "Swiggy" },
];

const SESSION2_EXTRA = [
  { date: "2025-11-03", amount: -1100,  category: "food_delivery", merchant: "Zomato" },
  { date: "2025-11-04", amount: -780,   category: "food_delivery", merchant: "Swiggy" },
  { date: "2025-11-05", amount: -25000, category: "rent",          merchant: "Landlord" },
  { date: "2025-11-06", amount: -1300,  category: "food_delivery", merchant: "Swiggy" },
];

export function todayFor(session: Session): string {
  return session === 1 ? "2025-11-03" : "2025-11-06";
}

export function getRecentTransactions(session: Session) {
  return session === 1 ? BASE_TXNS : [...BASE_TXNS, ...SESSION2_EXTRA];
}

export function getAccountBalance(session: Session) {
  return session === 1
    ? { checking: 128000, savings: 145000, house_fund: 95000, mutual_funds: 280000 }
    : { checking: 99820,  savings: 145000, house_fund: 95000, mutual_funds: 280000 };
}

export function getUpcomingBills(session: Session) {
  return session === 1
    ? [
        { date: "2025-11-05", amount: 25000, description: "Rent (auto-debit)" },
        { date: "2025-11-10", amount: 10000, description: "SIP - Mutual Funds" },
        { date: "2025-11-15", amount: 3500,  description: "Internet + Mobile" },
        { date: "2025-11-20", amount: 8000,  description: "Credit Card (auto-debit)" },
      ]
    : [
        { date: "2025-11-10", amount: 10000, description: "SIP - Mutual Funds" },
        { date: "2025-11-15", amount: 3500,  description: "Internet + Mobile" },
        { date: "2025-11-20", amount: 8000,  description: "Credit Card (auto-debit)" },
      ];
}

export function setReminder(date: string, content: string) {
  const id = `rem_${Math.abs(hashCode(content)) % 10000}`;
  return { status: "set" as const, reminder_id: id, date, content };
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
