/** Isolated target branches and serialized, validated candidate acceptance. No live harness claims. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { candidates, candidateFile, digest, event, getSession, locked, now, readJson, safeId, sessionFile, writeJson, type Candidate, type Evidence, type Session, type Target } from "./ledger.js";

export async function command(cwd: string, argv: string[], env?: Record<string, string>): Promise<string> {
  const proc = Bun.spawn(argv, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${argv[0]} ${argv[1] ?? ""} failed (${code}): ${stderr || stdout}`);
  return stdout.trimEnd();
}
export const git = (cwd: string, ...args: string[]) => command(cwd, ["git", ...args]);
export async function initSession(params: {
  dir: string; repo: string; gameId: string; target: Target; ref?: string;
  workerCount: number; minutes: number; sandboxProfile?: string;
}): Promise<Session> {
  if (!Number.isInteger(params.workerCount) || params.workerCount < 1 || params.workerCount > 16) throw new Error("workers must be 1–16");
  if (!Number.isFinite(params.minutes) || params.minutes <= 0) throw new Error("minutes must be positive");
  if (!/^src\/[A-Za-z0-9_./-]+\.c$/.test(params.target.source_path) || params.target.source_path.split("/").includes("..")) throw new Error("Expected a repo-relative src/... .c target");
  if (!params.target.unit.trim() || !params.target.symbol.trim()) throw new Error("unit and symbol are required");
  const baseRev = await git(params.repo, "rev-parse", "--verify", "--end-of-options", `${params.ref ?? "HEAD"}^{commit}`);
  await git(params.repo, "cat-file", "-e", `${baseRev}:${params.target.source_path}`);
  await mkdir(params.dir, { recursive: false });
  const id = safeId(`mega-${randomUUID()}`);
  const branch = `mega/${params.target.symbol.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60)}-${id.slice(-8)}`;
  const worktree = resolve(params.dir, "integration");
  await git(params.repo, "worktree", "add", "-b", branch, worktree, baseRev);
  const session: Session = {
    version: 1, id, gameId: params.gameId, repo: resolve(params.repo), worktree, branch,
    target: params.target, baseRev, headRev: baseRev, score: null, workers: params.workerCount,
    model: "gpt-5.6-sol", reasoning: "xhigh", createdAt: now(),
    deadline: new Date(Date.now() + params.minutes * 60_000).toISOString(), status: "running",
    sandboxProfile: params.sandboxProfile,
  };
  await mkdir(resolve(params.dir, "workers"));
  await mkdir(resolve(params.dir, "candidates"));
  await writeJson(sessionFile(params.dir), session);
  await event(params.dir, "coordinator", "created", session);
  return session;
}
export function assertImprovement(e: Evidence): void {
  if (!e.passed || !Number.isFinite(e.before) || e.after === null || !Number.isFinite(e.after)
    || e.after <= e.before || e.after > 100 || e.before < 0 || (e.exact && e.after !== 100))
    throw new Error(`Candidate is not a passing improvement: ${e.reasons.join("; ")}`);
}
async function cleanHead(s: Session): Promise<string> {
  if (await git(s.worktree, "symbolic-ref", "--short", "HEAD") !== s.branch) throw new Error("Integration worktree branch changed");
  if (await git(s.worktree, "status", "--porcelain", "--untracked-files=all")) throw new Error("Integration worktree is dirty; preserve and inspect its edits before continuing");
  return git(s.worktree, "rev-parse", "HEAD");
}
async function finishPending(dir: string, s: Session): Promise<Session> {
  if (!s.pending) return s;
  const p = s.pending;
  const head = await cleanHead(s);
  if (head === p.oldRev) await git(s.worktree, "merge", "--ff-only", p.newRev);
  else if (head !== p.newRev) throw new Error("Integration journal disagrees with branch; inspect before accepting more work");
  const c = await readJson<Candidate>(candidateFile(dir, p.candidateId));
  c.acceptedRev = p.newRev;
  await writeJson(candidateFile(dir, c.id), c);
  s.headRev = p.newRev; s.score = p.score;
  if (p.exact) s.status = "exact";
  delete s.pending;
  await writeJson(sessionFile(dir), s);
  await event(dir, "coordinator", "accepted", { candidate: c.id, headRev: s.headRev, score: s.score, exact: p.exact });
  return s;
}
export async function recoverIntegration(dir: string): Promise<Session> {
  return locked(dir, "session", () => getSession(dir).then(s => finishPending(dir, s)));
}
/** Validation runs on current branch ancestry. A private index builds the commit without staging user files. */
export async function acceptCandidate(dir: string, id: string, validate: (s: Session, c: Candidate) => Promise<Evidence>): Promise<Session> {
  return locked(dir, "session", async () => {
    const s = await finishPending(dir, await getSession(dir));
    const c = await readJson<Candidate>(candidateFile(dir, id));
    if (c.acceptedRev) return s;
    if (s.status === "exact") throw new Error("Target already matched");
    const head = await cleanHead(s);
    if (head !== s.headRev) throw new Error("Target branch changed outside the coordinator");
    const patch = await readFile(c.patchPath, "utf8");
    if (digest(patch) !== c.patchHash) throw new Error("Candidate patch changed after submission");
    const index = resolve(dir, `index-${randomUUID()}`);
    const env = { GIT_INDEX_FILE: index };
    try {
      await command(s.worktree, ["git", "read-tree", head], env);
      await command(s.worktree, ["git", "apply", "--cached", "--check", c.patchPath], env);
      await command(s.worktree, ["git", "apply", "--cached", c.patchPath], env);
      const paths = (await command(s.worktree, ["git", "diff", "--cached", "--name-only", "-z"], env)).split("\0").filter(Boolean);
      if (paths.length !== 1 || paths[0] !== s.target.source_path) throw new Error("Candidate must change only the target source file");
      const e = await validate(s, c); assertImprovement(e);
      if (digest(await readFile(c.patchPath, "utf8")) !== c.patchHash) throw new Error("Candidate patch changed during validation");
      if (s.score !== null && Math.abs(e.before - s.score) > 0.000001) throw new Error("Fresh baseline disagrees with accepted branch score");
      if (await cleanHead(s) !== head) throw new Error("Branch moved during validation");
      c.acceptanceEvidence = e;
      await writeJson(candidateFile(dir, id), c);
      const tree = await command(s.worktree, ["git", "write-tree"], env);
      const newRev = await git(s.worktree, "commit-tree", tree, "-p", head, "-m", `mega: ${s.target.symbol} to ${e.after}%\n\nMega-Candidate: ${c.id}`);
      s.pending = { candidateId: id, oldRev: head, newRev, score: e.after!, exact: e.exact };
      await writeJson(sessionFile(dir), s);
      return finishPending(dir, s);
    } finally { await rm(index, { force: true }); }
  });
}
export async function inspectPr(repo: string, input: string): Promise<Record<string, unknown>> {
  if (!/^(?:[1-9][0-9]*|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9][0-9]*\/?\s*)$/.test(input)) throw new Error("PR must be a GitHub PR URL or number");
  const pr = JSON.parse(await command(repo, ["gh", "pr", "view", input.trim(), "--json", "number,url,title,body,headRefOid,files,state"])) as Record<string, unknown>;
  return pr;
}
export async function fetchPr(repo: string, input: string): Promise<{ ref: string; pr: Record<string, unknown> }> {
  const pr = await inspectPr(repo, input);
  if (pr.state !== "OPEN") throw new Error("Expected an open PR");
  const url = new URL(String(pr.url));
  const [owner, name] = url.pathname.split("/").filter(Boolean);
  const ref = `refs/mega-target/pr-${Number(pr.number)}-${randomUUID()}`;
  await git(repo, "fetch", "--no-tags", `https://github.com/${owner}/${name}.git`, `refs/pull/${Number(pr.number)}/head:${ref}`);
  const sha = await git(repo, "rev-parse", ref);
  if (sha !== pr.headRefOid) throw new Error("PR head moved while fetching; inspect it again");
  return { ref, pr };
}
