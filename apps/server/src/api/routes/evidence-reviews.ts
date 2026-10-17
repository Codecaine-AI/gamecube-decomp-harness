type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

/** The statuses `GET /api/evidence-reviews?status=` accepts (`all` = every status). */
export type EvidenceReviewStatusFilter = "open" | "approving" | "approved" | "rejected" | "all";

/**
 * Evidence-review requests (worker-compiler-loop plan 3.1):
 *
 * - `GET /api/evidence-reviews?gameId=&status=open|approving|approved|rejected|all` (default `open`)
 *   -> `{ gameId, reviews }`.
 * - `POST /api/evidence-reviews/decision` `{ gameId, id, revision, decision: "approved"|"rejected", note, decidedBy? }`
 *   (`revision`: the request revision the operator saw; a request changed since then is refused with 409)
 *   -> `{ review, approval, requeue }`. An approval writes the site-bound approval the
 *   steering gate reads and puts the target back on the board; nothing is accepted by it.
 *
 * Errors carry `{ error }` with the status `decide` throws (`status` on the error: 400, 404 or 409).
 */
export interface EvidenceReviewsApiRouteDeps {
  json: JsonResponder;
  listReviews: (params: { url: URL; gameId: string; status: EvidenceReviewStatusFilter }) => unknown;
  decideReview: (body: { gameId: string; id: string; revision: number; decision: "approved" | "rejected"; note: string; decidedBy: string | null; raw: JsonObject }) => Promise<unknown>;
}

function errorStatus(error: unknown): number {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
  return status === 400 || status === 404 || status === 409 ? status : 500;
}

function isStatusFilter(value: string): value is EvidenceReviewStatusFilter {
  return value === "open" || value === "approving" || value === "approved" || value === "rejected" || value === "all";
}

export async function handleEvidenceReviewsApiRoute(req: Request, url: URL, deps: EvidenceReviewsApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/evidence-reviews" && req.method === "GET") {
    const gameId = url.searchParams.get("gameId")?.trim() ?? "";
    if (!gameId) return deps.json({ error: "gameId is required" }, { status: 400 });
    const status = url.searchParams.get("status")?.trim() || "open";
    if (!isStatusFilter(status)) return deps.json({ error: `unknown status: ${status}` }, { status: 400 });
    try {
      return deps.json({ gameId, reviews: deps.listReviews({ url, gameId, status }) });
    } catch (error) {
      return deps.json({ error: error instanceof Error ? error.message : String(error) }, { status: errorStatus(error) });
    }
  }
  if (url.pathname === "/api/evidence-reviews/decision" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as JsonObject;
    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : "";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!gameId || !id) return deps.json({ error: "gameId and id are required" }, { status: 400 });
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return deps.json({ error: "decision must be approved or rejected" }, { status: 400 });
    }
    if (!Number.isInteger(body.revision)) return deps.json({ error: "revision (the request revision you decided on) is required" }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) return deps.json({ error: "a decision needs a note" }, { status: 400 });
    const decidedBy = typeof body.decidedBy === "string" && body.decidedBy.trim() ? body.decidedBy.trim() : null;
    try {
      return deps.json(await deps.decideReview({ gameId, id, revision: body.revision as number, decision: body.decision, note, decidedBy, raw: body }));
    } catch (error) {
      return deps.json({ error: error instanceof Error ? error.message : String(error) }, { status: errorStatus(error) });
    }
  }
  return null;
}
