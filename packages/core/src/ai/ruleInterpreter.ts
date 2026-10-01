import { findAmountMatches, equalSplit } from '../money';
import type { Interpretation, ProposedTransaction } from './schema';
import type { InterpretInput, Interpreter } from './index';

/**
 * Deterministic, on-device interpreter. It is the offline fallback and the stand-in until the server model exists.
 * It handles common English, Bangla and mixed phrasings and, by design, returns NULLs rather than guesses:
 * a missing amount, account or category is left empty so the app asks the user. It is not an LLM and will miss
 * unusual phrasings; those fall through to "not understood" and manual entry.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(lunch|dinner|breakfast|snacks?|restaurant|meal|biryani|kacchi|pizza|burger)\b|দুপুরের খাবার|রাতের খাবার|সকালের নাস্তা|নাস্তা|খাবার/i, 'Dining'],
  [/\b(groceries|grocery|bazar|bajar|vegetables|supermarket)\b|বাজার|সদাই/i, 'Groceries'],
  [/\b(coffee|tea)\b|কফি/i, 'Coffee'],
  [/\b(uber|pathao|rickshaw|cng|taxi|cab|obhai)\b|রিকশা|উবার|পাঠাও|সিএনজি/i, 'Ride share'],
  [/\b(bus|train|metro)\b|বাস|ট্রেন/i, 'Public transport'],
  [/\b(petrol|diesel|fuel|octane)\b|পেট্রোল|ডিজেল/i, 'Fuel'],
  [/\b(electricity|power bill|desco|dpdc)\b|বিদ্যুৎ/i, 'Electricity'],
  [/\b(internet|wifi|broadband)\b|ইন্টারনেট/i, 'Internet'],
  [/\b(rent)\b|বাসা ভাড়া|বাড়ি ভাড়া/i, 'Rent'],
  [/\b(medicine|medicines|pharmacy)\b|ঔষধ|ওষুধ/i, 'Medicine'],
  [/\b(doctor|hospital|clinic)\b|ডাক্তার/i, 'Doctor'],
  [/\b(netflix|spotify|subscription|streaming)\b/i, 'Streaming'],
  [/\b(movie|movies|cinema)\b/i, 'Movies'],
  [/\b(shirt|clothes|clothing|shoes|dress|saree|panjabi)\b|জামা|কাপড়/i, 'Clothing'],
  [/\b(recharge|mobile bill|phone bill|data pack)\b|রিচার্জ/i, 'Mobile'],
  [/\b(book|books)\b|বই/i, 'Books'],
];
const MERCHANTS: Array<[string, string | null]> = [
  ['Uber', 'Ride share'], ['Pathao', 'Ride share'], ['Obhai', 'Ride share'], ['Agora', 'Groceries'], ['Shwapno', 'Groceries'], ['Chaldal', 'Groceries'],
  ['Meena Bazar', 'Groceries'], ['Foodpanda', 'Delivery'], ['Pizza Hut', 'Dining'], ['Kacchi Bhai', 'Dining'], ['Daraz', 'Shopping'], ['Aarong', 'Clothing'],
  ['Netflix', 'Streaming'], ['Spotify', 'Streaming'], ['Grameenphone', 'Mobile'], ['Robi', 'Mobile'], ['Banglalink', 'Mobile'], ['DESCO', 'Electricity'],
];
const STOP_NAMES = new Set(['I', 'My', 'The', 'A', 'An', 'Cash', 'Bank', 'Today', 'Yesterday', 'Spent', 'Paid', 'Bought', 'Moved', 'Got', 'It', 'This', 'That']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Latin terms match on word boundaries; Bangla terms (no \b support) match as substrings. */
function mentions(text: string, term: string): number {
  if (!term.trim()) return -1;
  if (/^[\x00-\x7f]+$/.test(term)) return text.search(new RegExp(`\\b${escapeRe(term)}\\b`, 'i'));
  return text.indexOf(term);
}

interface Ctx { input: InterpretInput; today: string }

function amountOf(clause: string, ctx: Ctx): { text: string | null; hasAny: boolean } {
  const all = findAmountMatches(clause, ctx.input.currency).filter((m) => {
    const after = clause.slice(m.end, m.end + 14).toLowerCase();
    const before = clause.slice(Math.max(0, m.start - 12), m.start).toLowerCase();
    if (/^\s*(st|nd|rd|th)\b/.test(after)) return false;                                         // 15th
    if (new RegExp(`^\\s*${MONTH_RE}\\b`, 'i').test(after) || new RegExp(`${MONTH_RE}\\s*$`, 'i').test(before)) return false; // 12 March / March 12
    if (/^\s*(days?|din)\s+ago|^\s*(people|persons|friends|items|%)/.test(after)) return false;
    if (/\d:$/.test(before) || /^:\d/.test(after)) return false;                                  // 10:30
    return true;
  });
  if (all.length === 0) return { text: null, hasAny: false };
  if (all.length === 1) return { text: all[0]!.text, hasAny: true };
  const marked = all.filter((m) => /(?:৳|tk\.?|bdt|taka)\s*$/i.test(clause.slice(Math.max(0, m.start - 6), m.start)) || /^\s*(?:tk\b|taka\b|bdt\b|টাকা|৳)/i.test(clause.slice(m.end, m.end + 8)));
  return { text: marked.length === 1 ? marked[0]!.text : null, hasAny: true }; // several numbers and no clear winner: ask, don't guess
}

function dateOf(lower: string, ctx: Ctx): ProposedTransaction['date'] {
  if (/\bday before yesterday\b/.test(lower)) return { kind: 'days_ago', n: 2 };
  if (/\byesterday\b|\blast night\b|গতকাল/.test(lower)) return { kind: 'yesterday' };
  const ago = /\b(\d{1,3})\s+days?\s+ago\b/.exec(lower);
  if (ago) return { kind: 'days_ago', n: Number(ago[1]) };
  if (/\btoday\b|\btonight\b|\bthis morning\b|আজ/.test(lower)) return { kind: 'today' };
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`, 'i').exec(lower) ?? null;
  const md = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(lower) ?? null;
  const parts = dm ? { d: Number(dm[1]), mon: dm[2]! } : md ? { d: Number(md[2]), mon: md[1]! } : null;
  if (parts) {
    const mi = MONTHS.findIndex((x) => x.startsWith(parts.mon.toLowerCase().slice(0, 3)));
    if (mi >= 0) {
      const year = Number(ctx.today.slice(0, 4));
      const cand = `${year}-${String(mi + 1).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
      const y = cand > ctx.today ? year - 1 : year; // a month/day still in the future means last year
      return { kind: 'absolute', date: `${y}-${String(mi + 1).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}` };
    }
  }
  return { kind: 'unspecified' };
}

function categoryOf(clause: string, merchantCat: string | null, input: InterpretInput): { name: string | null; conf: number } {
  const has = (n: string) => input.categoryNames.find((c) => c.toLowerCase() === n.toLowerCase()) ?? null;
  for (const [re, name] of CATEGORY_KEYWORDS) if (re.test(clause) && has(name)) return { name: has(name), conf: 0.9 };
  if (merchantCat && has(merchantCat)) return { name: has(merchantCat), conf: 0.88 };
  return { name: null, conf: 0 };
}

function merchantOf(clause: string, input: InterpretInput): { name: string | null; category: string | null } {
  const known = MERCHANTS.find(([n]) => new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(clause));
  if (known) return { name: known[0], category: known[1] };
  const blocked = new Set([...STOP_NAMES, ...input.accounts.flatMap((a) => [a.name, ...a.aliases]), ...input.personNames].map((s) => s.toLowerCase()));
  const ok = (n: string) => !blocked.has(n.toLowerCase()) && !new RegExp(`^${MONTH_RE}$`, 'i').test(n);
  const at = /\b(?:at|from|to|in)\s+([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*)*)/.exec(clause);
  if (at && ok(at[1]!)) return { name: at[1]!, category: null };
  const lead = /^\s*([A-Z][\w'&-]+)\s+(?:was|cost|costs|charged)\b/.exec(clause);
  if (lead && ok(lead[1]!)) return { name: lead[1]!, category: null };
  return { name: null, category: null };
}

function accountsIn(lower: string, input: InterpretInput): Array<{ name: string; at: number }> {
  const hits: Array<{ name: string; at: number }> = [];
  for (const a of input.accounts) {
    const at = [a.name, ...a.aliases].map((t) => mentions(lower, t.toLowerCase())).filter((i) => i >= 0);
    if (at.length) hits.push({ name: a.name, at: Math.min(...at) });
  }
  return hits.sort((x, y) => x.at - y.at);
}
const peopleIn = (text: string, input: InterpretInput) => input.personNames.filter((p) => mentions(text, p) >= 0);

const NONE = { shares: null, counterpartyName: null, direction: null, goalName: null, toAccountName: null, paidByName: null, notes: null, currency: null } as const;

function base(over: Partial<ProposedTransaction> & Pick<ProposedTransaction, 'type' | 'amountText'>, conf: Partial<ProposedTransaction['confidence']> = {}): ProposedTransaction {
  return {
    categoryName: null, merchantName: null, accountName: null, date: { kind: 'unspecified' }, ...NONE, ...over,
    confidence: { type: 0.9, amount: over.amountText ? 0.98 : 0, category: 0, account: 0.95, date: 0.95, ...conf },
  };
}

/** "Rahim paid 1500 for dinner, my share was 750"  and  "Split dinner 1200 with Rahim". */
function tryShared(text: string, ctx: Ctx): ProposedTransaction | null {
  const { input } = ctx;
  const lower = text.toLowerCase();
  const date = dateOf(lower, ctx);
  const cat = categoryOf(text, null, input);
  const merchant = merchantOf(text, input);
  const people = peopleIn(text, input);
  const matches = findAmountMatches(text, input.currency);

  const share = /(my share|my part|i owe|share (?:was|is)|my portion)/i.exec(text);
  const payer = people.find((p) => new RegExp(`\\b${escapeRe(p)}\\b\\s+(?:paid|covered|bought)`, 'i').test(text));
  if (payer && share && matches.length >= 2) {
    const shareAmt = matches.find((m) => m.start > share.index) ?? null;
    const total = matches.find((m) => m !== shareAmt) ?? null;
    if (shareAmt && total) {
      return base({ type: 'expense', amountText: total.text, categoryName: cat.name, merchantName: merchant.name, date, paidByName: payer,
        shares: [{ personName: 'me', amountText: shareAmt.text }, { personName: payer, amountText: null }] }, { type: 0.95, category: cat.conf });
    }
  }
  const split = /\bsplit\b.*\bwith\b/i.test(text);
  if (split && people.length >= 1 && matches.length === 1) {
    const parties = ['me', ...people];
    const parts = equalSplit(matches[0]!.minor, parties);
    const dec = (n: number) => String(n / 100);
    return base({ type: 'expense', amountText: matches[0]!.text, categoryName: cat.name, merchantName: merchant.name, date,
      accountName: accountsIn(lower, input)[0]?.name ?? null,
      shares: parts.map((p, i) => ({ personName: p.personId, amountText: i === parts.length - 1 ? null : dec(p.amountMinor) })) }, { type: 0.92, category: cat.conf });
  }
  return null;
}

function oneClause(clause: string, ctx: Ctx): ProposedTransaction | null {
  const { input } = ctx;
  const lower = clause.toLowerCase();
  const amt = amountOf(clause, ctx);
  const date = dateOf(lower, ctx);
  const merchant = merchantOf(clause, input);
  const cat = categoryOf(clause, merchant.category, input);
  const accts = accountsIn(lower, input);
  const people = peopleIn(clause, input);
  const hasVerb = /\b(spent|paid|pay|bought|buy|purchased|cost|was|were|gave)\b|খরচ|কিনলাম|দিলাম|করেছি|করলাম/i.test(clause);

  // repayment of a loan or shared bill
  const backToMe = /\b(?:paid|gave|sent|returned)\s+(?:me\s+)?back\b|\brepaid me\b|\bpaid me\b/i.test(clause);
  const iRepaid = /\brepaid\b|\bpaid\s+\w+\s+back\b|\breturned\b.*\bto\b/i.test(clause);
  if ((backToMe || iRepaid) && people.length) {
    return base({ type: 'repayment', amountText: amt.text, counterpartyName: people[0]!, direction: backToMe ? 'received' : 'paid', accountName: accts.length === 1 ? accts[0]!.name : null, date }, { type: 0.9 });
  }
  if (/\blent\b|\bborrowed\b|ধার দিলাম|ধার নিলাম/i.test(clause) && people.length) {
    const lent = /\blent\b|ধার দিলাম/i.test(clause);
    return base({ type: 'debt', amountText: amt.text, counterpartyName: people[0]!, direction: lent ? 'lent' : 'borrowed', accountName: accts.length === 1 ? accts[0]!.name : null, date }, { type: 0.95 });
  }
  if (/\brefund(?:ed)?\b|ফেরত পেলাম/i.test(clause)) {
    return base({ type: 'refund', amountText: amt.text, categoryName: cat.name, merchantName: merchant.name, accountName: accts.length === 1 ? accts[0]!.name : null, date }, { type: 0.95, category: cat.conf });
  }
  // transfers, withdrawals, savings
  const withdraw = /\bwithdr[ae]w\b|\bwithdrew\b/i.test(clause);
  if (/\b(moved|transferred?|transfer)\b/i.test(clause) || withdraw || (/\b(saved|savings?)\b/i.test(clause) && /\b(into|to|in)\b/i.test(clause) && accts.length)) {
    const from = new RegExp(`\\bfrom\\s+(.+?)(?:\\s+to\\b|$|[.,])`, 'i').exec(clause);
    const to = /\b(?:to|into)\s+(.+?)(?:\s+from\b|$|[.,])/i.exec(clause);
    const pick = (frag: string | undefined) => (frag ? accountsIn(frag.toLowerCase(), input)[0]?.name ?? null : null);
    let src = pick(from?.[1]), dst = pick(to?.[1]);
    if (withdraw && !dst) dst = input.accounts.find((a) => [a.name, ...a.aliases].some((t) => t.toLowerCase() === 'cash'))?.name ?? null;
    if (!src && !dst && accts.length === 2) { src = accts[0]!.name; dst = accts[1]!.name; }
    const type = /\b(saved|savings?)\b/i.test(clause) && !/\b(moved|transferred?)\b/i.test(clause) ? 'savings_contribution' : 'transfer';
    return base({ type, amountText: amt.text, accountName: src, toAccountName: dst, date }, { type: 0.93 });
  }
  const income = /\b(salary|earned|income|bonus|got paid|received|credited|deposited|freelance)\b|বেতন|পেয়েছি|পেলাম/i.test(clause);
  if (income) {
    const salary = /\bsalary\b|বেতন/i.test(clause);
    const c = salary ? input.categoryNames.find((n) => n.toLowerCase() === 'salary') ?? null : null;
    return base({ type: 'income', amountText: amt.text, categoryName: c, accountName: accts.length === 1 ? accts[0]!.name : null, date, merchantName: merchant.name },
      { type: people.length ? 0.75 : 0.95, category: c ? 0.95 : 0 });
  }
  // expense
  if (!amt.hasAny && !hasVerb && !cat.name && !merchant.name) return null; // nothing here looks like a transaction
  const strongVerb = /\b(spent|paid|bought|purchased)\b|খরচ|কিনলাম/i.test(clause);
  return base({ type: 'expense', amountText: amt.text, categoryName: cat.name, merchantName: merchant.name, accountName: accts.length === 1 ? accts[0]!.name : null, date },
    { type: strongVerb ? 0.96 : hasVerb ? 0.9 : 0.8, category: cat.conf });
}

function splitClauses(text: string, ctx: Ctx): string[] {
  const parts = text.split(/\s*(?:,(?=\s)|[;।]|\band\b|\bthen\b|\balso\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  const withAmount = parts.filter((p) => amountOf(p, ctx).hasAny);
  return withAmount.length >= 2 ? withAmount : [text];
}

export function interpretWithRules(input: InterpretInput): Interpretation {
  const text = input.text.normalize('NFKC').trim();
  const ctx: Ctx = { input, today: input.today };
  if (!text) return { status: 'not_a_transaction', transactions: [] };
  const shared = tryShared(text, ctx);
  const txs = shared ? [shared] : splitClauses(text, ctx).map((c) => oneClause(c, ctx)).filter((t): t is ProposedTransaction => t !== null);
  return txs.length ? { status: 'ok', transactions: txs.slice(0, 10) } : { status: 'not_a_transaction', transactions: [] };
}

export class RuleBasedInterpreter implements Interpreter {
  async interpret(input: InterpretInput): Promise<Interpretation> { return interpretWithRules(input); }
}

