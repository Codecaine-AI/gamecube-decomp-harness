import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assign, candidateFile, closeWorker, digest, getSession, getWorker, locked, now, sessionFile, workerFile, writeJson, type Candidate, type Evidence } from "../scripts/ledger.js";
import { acceptCandidate, git, initSession, recoverIntegration } from "../scripts/git.js";
import { cleanupSandboxes } from "../scripts/sandbox.js";
import { importWorker, packetForWorker } from "../scripts/knowledge.js";
import { openKnowledgeStore } from "../../apps/server/src/core/knowledge-v2/storage/store.js";
import { insertEntitiesIfMissing, insertTargets } from "../../apps/server/src/core/knowledge-v2/records/index.js";
import { FakeSandboxProvider } from "../../apps/server/src/core/job-queue/sandbox.js";
import { main, finish, watch } from "../scripts/cli.js";

const fixtures: string[] = [];
afterEach(async () => { for (const root of fixtures.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(workerCount = 4) {
  const root = await mkdtemp(resolve(tmpdir(), "mega-test-")); fixtures.push(root);
  const repo = resolve(root, "repo"), dir = resolve(root, "session");
  await mkdir(resolve(repo, "src"), { recursive: true });
  await writeFile(resolve(repo, "src/unit.c"), "int Func(void) { return 1; }\n");
  await writeFile(resolve(repo, "objdiff.json"), JSON.stringify({ units: [{ name: "unit", metadata: { source_path: "src/unit.c" } }] }));
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "test@example.invalid"); await git(repo, "config", "user.name", "Test");
  await git(repo, "add", "."); await git(repo, "commit", "-m", "baseline");
  const session = await initSession({ dir, repo, gameId: "melee", target: { unit: "unit", symbol: "Func", source_path: "src/unit.c" }, workerCount, minutes: 60 });
  return { root, repo, dir, session };
}
const good = (before = 90, after = 95): Evidence => ({ before, after, passed: true, exact: after === 100, reasons: [], artifacts: "/test/evidence" });
async function candidate(f: Awaited<ReturnType<typeof fixture>>, id = "candidate-one", evidence = good()) {
  const patch = "diff --git a/src/unit.c b/src/unit.c\n--- a/src/unit.c\n+++ b/src/unit.c\n@@ -1 +1 @@\n-int Func(void) { return 1; }\n+int Func(void) { return 2; }\n";
  const patchPath = resolve(f.dir, `${id}.patch`); await writeFile(patchPath, patch);
  const c: Candidate = { id, workerId: "w1", baseRev: f.session.baseRev, createdAt: now(), hypothesis: "expression rewrite", patchPath, patchHash: digest(patch), evidence };
  await writeJson(candidateFile(f.dir, id), c);
  return c;
}

describe("isolated search and acceptance", () => {
  test("initialization accepts explicit source when objdiff.json is generated rather than tracked", async () => {
    const f = await fixture();
    await git(f.repo, "rm", "objdiff.json"); await git(f.repo, "commit", "-m", "generated config");
    const dir = resolve(f.root, "explicit-source");
    const result = await main(["init", "--repo", f.repo, "--session", dir, "--unit", "unit", "--symbol", "Func",
      "--source", "src/unit.c", "--minutes", "1", "--no-watch"]) as { session: { target: { source_path: string } } };
    expect(result.session.target.source_path).toBe("src/unit.c");
  });
  test("four siblings share a baseline; capacity and worker IDs are enforced", async () => {
    const f = await fixture();
    for (const id of ["w1", "w2", "w3", "w4"]) expect((await assign(f.dir, id, "hypothesis")).baseRev).toBe(f.session.baseRev);
    await expect(assign(f.dir, "w5", "another")).rejects.toThrow("limit");
    await closeWorker(f.dir, "w1", "finished", "no sandbox was started");
    await assign(f.dir, "w5", "another");
    await expect(assign(f.dir, "w1", "reuse")).rejects.toThrow("never reused");
    await expect(assign(f.dir, "../escape", "bad")).rejects.toThrow();
  });
  test("sixteen workers share a baseline and the seventeenth requires a free slot", async () => {
    const f = await fixture(16);
    expect(f.session.workers).toBe(16);
    for (let i = 1; i <= 16; i++) expect((await assign(f.dir, `w${i}`, `hypothesis ${i}`)).baseRev).toBe(f.session.baseRev);
    await expect(assign(f.dir, "w17", "overflow")).rejects.toThrow("limit");
    await closeWorker(f.dir, "w1", "finished", "no sandbox was started");
    expect((await assign(f.dir, "w17", "replacement")).baseRev).toBe(f.session.baseRev);
  });
  test("initialization rejects worker counts outside the integer range 1–16", async () => {
    const f = await fixture(1);
    expect(f.session.workers).toBe(1);
    for (const workerCount of [0, -1, 17, 1.5, NaN, Infinity]) {
      await expect(initSession({ dir: resolve(f.root, "invalid"), repo: f.repo, gameId: "melee",
        target: f.session.target, workerCount, minutes: 60 })).rejects.toThrow("workers must be 1–16");
    }
  });
  test("deadline blocks new work without deleting records", async () => {
    const f = await fixture();
    await writeJson(sessionFile(f.dir), { ...f.session, deadline: "2000-01-01T00:00:00Z" });
    await expect(assign(f.dir, "w1", "late")).rejects.toThrow("deadline");
    expect(await git(f.repo, "rev-parse", "HEAD")).toBe(f.session.baseRev);
  });
  test("accept commits once on the target branch and leaves the original checkout intact", async () => {
    const f = await fixture(), c = await candidate(f);
    let validations = 0;
    const validate = async () => { validations++; return good(); };
    const accepted = await acceptCandidate(f.dir, c.id, validate);
    expect(accepted.score).toBe(95);
    expect(await readFile(resolve(f.session.worktree, "src/unit.c"), "utf8")).toContain("return 2");
    expect(await readFile(resolve(f.repo, "src/unit.c"), "utf8")).toContain("return 1");
    expect(await git(f.repo, "rev-parse", "HEAD")).toBe(f.session.baseRev);
    expect((await acceptCandidate(f.dir, c.id, validate)).headRev).toBe(accepted.headRev);
    expect(validations).toBe(1);
  });
  test("rejects failed gates, neutral scores, and stale evidence without advancing the branch", async () => {
    const f = await fixture(), c = await candidate(f);
    await expect(acceptCandidate(f.dir, c.id, async () => ({ ...good(90, 100), passed: false }))).rejects.toThrow("not a passing improvement");
    await expect(acceptCandidate(f.dir, c.id, async () => good(95, 95))).rejects.toThrow("not a passing improvement");
    await writeJson(sessionFile(f.dir), { ...f.session, score: 97 });
    await expect(acceptCandidate(f.dir, c.id, async () => good())).rejects.toThrow("baseline disagrees");
    expect(await git(f.session.worktree, "rev-parse", "HEAD")).toBe(f.session.baseRev);
    expect(await git(f.session.worktree, "status", "--porcelain")).toBe("");
  });
  test("rejects changed candidate artifacts and out-of-scope edits", async () => {
    const f = await fixture(), c = await candidate(f);
    await writeFile(c.patchPath, (await readFile(c.patchPath, "utf8")) + "\n");
    await expect(acceptCandidate(f.dir, c.id, async () => good())).rejects.toThrow("patch changed");
    const patch = "diff --git a/extra.c b/extra.c\nnew file mode 100644\n--- /dev/null\n+++ b/extra.c\n@@ -0,0 +1 @@\n+int extra;\n";
    await writeFile(c.patchPath, patch);
    await writeJson(candidateFile(f.dir, c.id), { ...c, patchHash: digest(patch) });
    await expect(acceptCandidate(f.dir, c.id, async () => good())).rejects.toThrow("only the target source");
  });
  test("exact acceptance stops search; stale sibling patches cannot overwrite progress", async () => {
    const f = await fixture(), c = await candidate(f);
    const accepted = await acceptCandidate(f.dir, c.id, async () => good(90, 100));
    expect(accepted.status).toBe("exact");
    await expect(assign(f.dir, "w2", "late")).rejects.toThrow("exact");
    const sibling = await candidate(f, "candidate-two");
    await expect(acceptCandidate(f.dir, sibling.id, async () => good())).rejects.toThrow("already matched");
  });
  test("recover finishes a journal after branch advancement without duplicating a commit", async () => {
    const f = await fixture(), c = await candidate(f);
    const accepted = await acceptCandidate(f.dir, c.id, async () => good());
    await writeJson(sessionFile(f.dir), { ...f.session, pending: { candidateId: c.id, oldRev: f.session.baseRev, newRev: accepted.headRev, score: 95, exact: false } });
    const recovered = await recoverIntegration(f.dir);
    expect(recovered.headRev).toBe(accepted.headRev); expect(recovered.pending).toBeUndefined();
    expect(await git(f.session.worktree, "rev-list", "--count", "HEAD")).toBe("2");
  });
  test("session locks exclude concurrent acceptance", async () => {
    const f = await fixture();
    await locked(f.dir, "session", async () => { await expect(assign(f.dir, "w1", "hypothesis")).rejects.toThrow("Busy"); });
    await assign(f.dir, "w1", "hypothesis");
  });
  test("rendered worker prompt carries the real target and model without unhydrated tokens", async () => {
    const f = await fixture(); await assign(f.dir, "w1", "register pressure");
    const prompt = String(await main(["prompt", "--session", f.dir, "--worker", "w1"]));
    expect(prompt).toContain("gpt-5.6-sol"); expect(prompt).toContain("register pressure"); expect(prompt).not.toContain("{{CONTEXT_JSON}}");
  });
});

describe("sandbox ownership and knowledge", () => {
  test("watchdog handles an expired session and removes an orphaned sandbox without a coordinator", async () => {
    const f = await fixture(), provider = new FakeSandboxProvider();
    await assign(f.dir, "w1", "hypothesis");
    const own = await provider.create({ snapshot: "test", resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1,
      labels: { mega_session: f.session.id, mega_game: "melee", workflow: "mega-target" } });
    await writeJson(sessionFile(f.dir), { ...f.session, deadline: "2000-01-01T00:00:00Z" });
    await watch(f.dir, { provider, finish: dir => finish(dir, {
      cleanup: d => cleanupSandboxes(d, undefined, provider), knowledge: async () => ({ completed: true }),
    }) });
    expect(await provider.get(own.sandboxId)).toBeNull();
    expect((await getSession(f.dir)).status).toBe("stopped");
    expect((await getWorker(f.dir, "w1")).status).toBe("closed");
  });
  test("finish closes workers and deletes sandboxes before a failing knowledge import", async () => {
    const f = await fixture(); await assign(f.dir, "w1", "hypothesis");
    const operations: string[] = [];
    const result = await finish(f.dir, {
      cleanup: async () => {
        expect((await getSession(f.dir)).status).toBe("stopped");
        expect((await getWorker(f.dir, "w1")).status).toBe("closed");
        operations.push("cleanup"); return { deleted: ["sandbox-1"], failed: [] };
      },
      knowledge: async () => { operations.push("knowledge"); throw new Error("model unavailable"); },
    }) as { knowledge: Array<{ error: string }> };
    expect(operations).toEqual(["cleanup", "knowledge"]);
    expect(result.knowledge[0].error).toContain("model unavailable");
    expect(await readFile(resolve(f.dir, "finish.json"), "utf8")).toContain("model unavailable");
  });
  test("cleanup reports a provider failure and succeeds when retried", async () => {
    const f = await fixture(), provider = new FakeSandboxProvider();
    const own = await provider.create({ snapshot: "test", resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1,
      labels: { mega_session: f.session.id, mega_game: "melee", workflow: "mega-target" } });
    const remove = provider.delete.bind(provider); let fail = true;
    provider.delete = async (id, reason) => { if (fail) throw new Error("provider busy"); return remove(id, reason); };
    expect((await cleanupSandboxes(f.dir, undefined, provider)).failed).toEqual([{ id: own.sandboxId, error: "Error: provider busy" }]);
    fail = false;
    expect((await cleanupSandboxes(f.dir, undefined, provider)).deleted).toEqual([own.sandboxId]);
  });
  test("label cleanup deletes only this session, including sandboxes missing from its worker ledger", async () => {
    const f = await fixture(), provider = new FakeSandboxProvider();
    const params = { snapshot: "test", resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 };
    const own = await provider.create({ ...params, labels: { mega_session: f.session.id, mega_game: "melee", workflow: "mega-target", mega_worker: "unrecorded" } });
    const other = await provider.create({ ...params, labels: { mega_session: "other", mega_game: "melee", workflow: "mega-target" } });
    expect((await cleanupSandboxes(f.dir, undefined, provider)).deleted).toEqual([own.sandboxId]);
    expect(await provider.get(other.sandboxId)).not.toBeNull();
    expect((await cleanupSandboxes(f.dir, undefined, provider)).deleted).toEqual([]);
  });
  test("failed-gate 100 is not imported as a match; repeat import creates one run and one task", async () => {
    const f = await fixture(); await assign(f.dir, "w1", "hypothesis");
    const w = await getWorker(f.dir, "w1"); w.baselineScore = 90; await writeJson(workerFile(f.dir, "w1"), w);
    await candidate(f, "candidate-one", { ...good(90, 100), passed: false, reasons: ["section regression"] });
    await closeWorker(f.dir, "w1", "finished", "100% failed the section gate");
    const store = openKnowledgeStore({ knowledgeRoot: resolve(f.root, "knowledge") });
    try {
      insertEntitiesIfMissing(store, [{ id: "entity:unit", kind: "translation_unit", locator: "src/unit.c" }]);
      insertTargets(store, [{ id: "target:unit:Func", kind: "function", unit: "unit", unitEntityId: "entity:unit", symbol: "Func", stableKey: "unit:Func", address: "0x80000000", identityStatus: "current", reportRevision: "test" }]);
      let calls = 0;
      const summarize = async (p: Awaited<ReturnType<typeof packetForWorker>>) => {
        calls++; return { run: { summary: "Compiler scored 100 but validation failed." }, submissions: p.submissions.map(s => ({ submission_id: s.id, approach: "rewrite", outcome_reasoning: "Section regression rejected this candidate." })), notable_observations: [] };
      };
      const result = await importWorker(f.dir, "w1", { store, summarize });
      expect((await importWorker(f.dir, "w1", { store, summarize })).existing).toBe(true); expect(calls).toBe(1);
      const row = store.db.query("SELECT * FROM worker_run WHERE id = ?").get(result.runId) as Record<string, unknown>;
      expect(row.final_outcome).toBe("no_change"); expect(row.integration).toBeNull(); expect(row.worker_state_id).toBeNull();
      expect(JSON.parse(String(row.baseline)).canonical_integration).toBe(false);
      expect((store.db.query("SELECT COUNT(*) AS n FROM index_task").get() as { n: number }).n).toBe(1);
      expect((store.db.query("SELECT COUNT(*) AS n FROM submission").get() as { n: number }).n).toBe(1);
    } finally { store.close(); }
  });
});
