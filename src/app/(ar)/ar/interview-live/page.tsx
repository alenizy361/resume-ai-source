import { redirect } from "next/navigation";

// The AI video mock-interview lives on the shared (single-address) route, the same way
// /interview and /linkedin do — see interview-live/layout.tsx for why it has no separate
// Arabic-addressed body. Arabic visitors who hit /ar/interview-live directly are sent
// there with the language hint instead of a 404.
export default function ArRedirect() {
  redirect("/interview-live?lang=ar");
}
