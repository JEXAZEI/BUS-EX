import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-10 dark:from-gray-900 dark:to-gray-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-brand-700 dark:text-brand-500">BUS-EX</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The classroom stock exchange</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
