import "server-only";

// Minimal GitHub REST client for the auto-fix pipeline. Needs GITHUB_TOKEN (fine-grained,
// this repository only, "Issues: read & write") and GITHUB_REPO ("owner/name").
// Circle only opens issues and reads their outcome; the fix itself is made and tested by
// .github/workflows/autofix.yml.

const API = "https://api.github.com";

export const githubConfigured = () => Boolean(process.env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO ?? ""));

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/repos/${process.env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const createIssue = (title: string, body: string, labels: string[]) =>
  gh<{ number: number; html_url: string }>("/issues", { method: "POST", body: JSON.stringify({ title, body, labels }) });

export const getIssue = (n: number) =>
  gh<{ state: "open" | "closed"; state_reason: string | null; labels: { name: string }[] }>(`/issues/${n}`);

export const issueComments = (n: number) => gh<{ body: string }[]>(`/issues/${n}/comments?per_page=100`);
