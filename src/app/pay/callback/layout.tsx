import type { Metadata } from "next";

/**
 * The payment return page, kept out of the index.
 *
 * It exists to be arrived at from a payment provider with a transaction number in the query, and
 * it is meaningless without one. Indexed, it was a duplicate of `/login` and `/account` — same
 * inherited title, same inherited description — and a search result landing here shows a person a
 * receipt for a payment they did not make.
 */
export const metadata: Metadata = {
  title: "Payment — Sira",
  description: "Confirming your payment.",
  robots: { index: false, follow: false },
};

export default function PayCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
