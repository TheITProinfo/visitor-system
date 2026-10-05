import Link from "next/link";

type WorkflowPlaceholderProps = {
  title: string;
  description: string;
};

export function WorkflowPlaceholder({ title, description }: WorkflowPlaceholderProps) {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-medium text-emerald-800 hover:text-emerald-950" href="/">
          ← Visitor System
        </Link>
        <h1 className="mt-12 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-stone-600">{description}</p>
        <p className="mt-8 rounded-lg border border-stone-200 bg-white p-5 text-sm text-stone-600">
          This workflow is part of the implementation plan and is not available yet. Please ask reception for assistance.
        </p>
      </div>
    </main>
  );
}
