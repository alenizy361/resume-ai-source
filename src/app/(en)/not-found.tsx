import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* رابط, lost and drifting through space */}
      <div className="relative mt-16 w-full max-w-md rounded-3xl p-10 text-center" style={{ background: "rgba(15, 20, 35, 0.048)", border: "1px solid rgba(15, 20, 35, 0.14)", backdropFilter: "blur(10px)" }}>
        <div className="mb-2 font-mono text-sm tracking-[0.3em]" style={{ color: "var(--muted)" }}>404</div>
        <h1 className="text-2xl font-bold">Lost in space</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
          The page you&apos;re looking for drifted off — it doesn&apos;t exist or may have moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-accent px-6 py-3">Back home</Link>
          <Link href="/optimize" className="btn-ghost px-6 py-3 font-semibold" style={{ color: "var(--fg)" }}>Check my resume</Link>
        </div>
      </div>
    </main>
  );
}
