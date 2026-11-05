/** Indian money helpers for Builder Data. */

/** 15000000 → "1.5 Cr", 4500000 → "45 L", 85000 → "85K". */
export function shortINR(n: number | null | undefined) {
  if (n == null || !isFinite(n) || n <= 0) return "";
  const trim = (x: number) => String(Number(x.toFixed(2)));
  if (n >= 1e7) return `${trim(n / 1e7)} Cr`;
  if (n >= 1e5) return `${trim(n / 1e5)} L`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(n);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const three = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");

/** 15250000 → "One Crore Fifty Two Lakh Fifty Thousand Rupees". */
export function inrWords(n: number | null | undefined) {
  if (n == null || !isFinite(n) || n <= 0) return "";
  let x = Math.round(n);
  const parts: string[] = [];
  const crore = Math.floor(x / 1e7); x %= 1e7;
  const lakh = Math.floor(x / 1e5); x %= 1e5;
  const thousand = Math.floor(x / 1e3); x %= 1e3;
  if (crore) parts.push(`${crore >= 1000 ? inrWords(crore).replace(/ Rupees$/, "") : three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (x) parts.push(three(x));
  return `${parts.join(" ")} Rupees`;
}

/** Plain number from a typed amount ("1,25,00,000" → 12500000). */
export const toAmount = (s: string) => {
  const v = Number(s.replace(/[^\d.]/g, ""));
  return isFinite(v) && v > 0 ? v : null;
};
