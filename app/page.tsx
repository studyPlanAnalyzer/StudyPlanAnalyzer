import Link from "next/link";

const features = [
  {
    title: "Performance analysis",
    description:
      "Upload each report card and instantly see which subjects and topics need the most attention, with trends across terms.",
    icon: "📊",
  },
  {
    title: "Spaced-repetition planning",
    description:
      "A day-by-day schedule built on proven spaced-repetition science, weighted toward weak topics without overloading any single day.",
    icon: "🧠",
  },
  {
    title: "Automatic adaptation",
    description:
      "Skip a session or add new marks and the plan quietly reshuffles itself, so it stays realistic all the way to exam day.",
    icon: "🔄",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-indigo-700">StudyPlan Analyzer</span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Turn your child&apos;s exam results into a clear study plan
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Upload marks, see weak topics, get a day-by-day plan that adapts automatically.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              Get started
            </Link>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
            >
              Watch demo
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-400">Rs 150/month · Cancel anytime</p>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} StudyPlan Analyzer</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-slate-800">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-slate-800">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
