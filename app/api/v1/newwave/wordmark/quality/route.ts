import { type IssueId, ISSUE_LABEL, qualityQueue } from "@/lib/newwave/wordmark/quality";

/** Granskningskön för Craft: ?issue=logo-white filtrerar, offset/limit bläddrar. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const issue = q.get("issue") ?? "";
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const limit = Math.min(60, Math.max(1, Number(q.get("limit")) || 20));
  return Response.json({ ...(await qualityQueue({ issue: issue in ISSUE_LABEL ? (issue as IssueId) : undefined, offset, limit })), labels: ISSUE_LABEL });
}
