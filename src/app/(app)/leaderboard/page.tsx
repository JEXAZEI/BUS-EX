import { getCurrentProfile } from "@/lib/session";
import { getLeaderboard } from "@/lib/services/leaderboard";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const profile = await getCurrentProfile();
  const entries = await getLeaderboard();

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Ranked by net worth
        </p>
      </div>

      <div className="card overflow-hidden !p-0">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">No students yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="w-12 px-4 py-2.5 font-semibold">Rank</th>
                <th className="px-4 py-2.5 font-semibold">Trader</th>
                <th className="px-4 py-2.5 text-right font-semibold">Net worth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {entries.map((entry, i) => {
                const rank = i + 1;
                const isMe = entry.userId === profile?.id;
                return (
                  <tr
                    key={entry.userId}
                    className={isMe ? "bg-brand-50 dark:bg-brand-900/20" : undefined}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-500 dark:text-gray-400">
                      {MEDALS[i] ?? rank}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      @{entry.username}
                      {isMe && <span className="ml-2 badge-muted">You</span>}
                    </td>
                    <td className="mono-nums px-4 py-3 text-right font-semibold">
                      ${entry.netWorth.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
