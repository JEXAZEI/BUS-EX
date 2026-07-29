export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-brand-700">BUS-EX</h1>
        <p className="mt-1 text-sm text-gray-500">The classroom stock exchange</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
