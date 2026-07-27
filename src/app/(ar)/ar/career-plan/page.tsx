import { redirect } from "next/navigation";

// The career-plan feature currently lives on the shared (English UI) route; Arabic
// visitors who hit /ar/career-plan directly are sent there instead of a 404.
export default function ArRedirect() {
  redirect("/career-plan?lang=ar");
}
