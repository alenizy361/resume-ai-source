import Link from "next/link";
import AuroraBlobs from "../components/orb/AuroraBlobs";
import OrbSceneSetter from "../components/orb/OrbSceneSetter";

/**
 * The Arabic 404.
 *
 * `app/not-found.tsx` was the only one, so an Arabic visitor who mistyped a URL — or followed a
 * link to a page that has since moved — landed on an English page telling them they were lost in
 * space. In a product whose whole thesis is that the Arabic side is not a translation afterthought,
 * the error pages are exactly where that claim gets tested, because they are what a person sees on
 * the worst visit they will have.
 *
 * Next resolves `not-found` per segment, so this one serves everything under `/ar`.
 */
export default function ArabicNotFound() {
  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
      style={{ background: "var(--cosmos-bg)", color: "var(--cosmos-text)" }}
    >
      <AuroraBlobs />
      <OrbSceneSetter visible mood="lost" top="24vh" size={72} />
      <div
        className="relative mt-16 w-full max-w-md rounded-3xl p-10 text-center"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
      >
        <div className="mb-2 font-mono text-sm tracking-[0.3em]" style={{ color: "var(--cosmos-muted)" }}>٤٠٤</div>
        <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--cosmos-muted)" }}>
          الرابط الذي فتحته لا يوجد أو تغيّر مكانه. مسوّدتك محفوظة على جهازك ولم يضِع منها شيء.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/ar/builder" className="btn-accent px-6 py-3">أكمل سيرتك</Link>
          <Link
            href="/ar"
            className="rounded-xl px-6 py-3 font-semibold"
            style={{ border: "1px solid rgba(255,255,255,0.18)", color: "var(--cosmos-text)" }}
          >
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
