import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 pb-5">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Visitor System
          </Link>
          <Link className="text-sm font-medium text-stone-600 hover:text-stone-950" href="/back-office">
            Staff sign in
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Visitor check-in
          </p>
          <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Welcome. Let&apos;s get you checked in.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
            Register your arrival, let your host know you&apos;re here, and collect your visitor badge at reception.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link className="rounded-lg bg-emerald-800 px-6 py-3 font-medium text-white hover:bg-emerald-900" href="/check-in">
              Check in
            </Link>
            <Link className="rounded-lg border border-stone-300 bg-white px-6 py-3 font-medium hover:bg-stone-100" href="/check-out">
              Check out
            </Link>
          </div>
        </section>

        <footer className="border-t border-stone-200 pt-5 text-sm text-stone-500">
          Please ask reception if you need assistance.
        </footer>
      </div>
    </main>
  );
}
