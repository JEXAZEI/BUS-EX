import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-10 dark:from-ink-900 dark:to-black">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 text-center">
        <h1 className="flex items-center justify-center gap-1.5 font-mono text-4xl font-black tracking-tight">
          <span className="text-gray-900 dark:text-white">BUS</span>
          <span className="text-brand-500">·</span>
          <span className="text-brand-600 dark:text-brand-400">EX</span>
        </h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-gray-500 dark:text-gray-400">
          The classroom stock exchange
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
