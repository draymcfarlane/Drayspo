import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

type Day = { date: string; count: number; level: number };
type Repo = { name: string; html_url: string; description: string | null; language: string | null; pushed_at: string; fork: boolean };

export function GitHubActivity({ username }: { username: string }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<Day | null>(null);

  useEffect(() => {
    fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setDays(d.contributions); setTotal(d.total?.lastYear ?? null); })
      .catch(() => setFailed(true));
    fetch(`https://api.github.com/users/${username}/repos?sort=pushed&per_page=12`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Repo[]) => setRepos(d.filter((r) => !r.fork).slice(0, 4)))
      .catch(() => setRepos([]));
  }, [username]);

  // Group into week columns starting Sunday
  const weeks: (Day | null)[][] = [];
  if (days?.length) {
    const pad = new Date(days[0]!.date + "T00:00:00").getDay();
    const all: (Day | null)[] = [...Array(pad).fill(null), ...days];
    for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  }

  return (
    <div className="gh-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <p className="font-heading text-lg font-bold">
          {total !== null ? `${total.toLocaleString()} contributions in the last year` : failed ? "Contribution graph unavailable right now" : "Loading contributions…"}
        </p>
        <a className="link inline-flex items-center gap-1 text-sm" href={`https://github.com/${username}`} target="_blank" rel="noopener noreferrer">@{username} <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
      {weeks.length > 0 && (
        <div className="overflow-x-auto pb-2 gh-scroll">
          <div className="flex gap-[4px] w-max" role="img" aria-label={`${total} GitHub contributions in the last year`}>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[4px]">
                {w.map((d, j) => (
                  <span
                    key={j}
                    className="gh-cell"
                    data-level={d ? d.level : -1}
                    onPointerEnter={() => d && setHover(d)}
                    onPointerLeave={() => setHover(null)}
                    title={d ? `${d.count} on ${d.date}` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground h-5 mt-1" aria-live="polite">
        {hover ? `${hover.count} contribution${hover.count === 1 ? "" : "s"} on ${new Date(hover.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Hover a square to see that day."}
      </p>

      <h3 className="eyebrow mt-8 mb-4">Recently worked on</h3>
      {repos === null ? (
        <p className="text-muted-foreground">Loading repositories…</p>
      ) : repos.length === 0 ? (
        <p className="text-muted-foreground">See my latest work on <a className="link inline-flex items-center gap-1" href={`https://github.com/${username}`} target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={14} aria-hidden="true" /></a></p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {repos.map((r) => (
            <li key={r.name}>
              <a href={r.html_url} target="_blank" rel="noopener noreferrer" className="gh-repo">
                <span className="font-heading font-bold">{r.name}</span>
                {r.description && <span className="text-sm text-foreground/75 line-clamp-2">{r.description}</span>}
                <span className="text-xs text-muted-foreground mt-auto">
                  {r.language ? `${r.language} · ` : ""}updated {new Date(r.pushed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
