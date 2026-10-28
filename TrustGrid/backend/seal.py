"""Builds the exact text that gets signed. Canonical JSON (sorted keys, no spaces) so the same data always gives the same bytes."""
import json

def build_payload(a, today, signed_at, hash_of):
    f = a["findings"]; count = lambda s: sum(x["status"] == s for x in f)
    return json.dumps({
        "application": a["id"], "institution": a["institution"], "review_status": a["review"], "reference_date": today, "signed_at": signed_at,
        "documents": {k: {"filename": d["filename"], "sha256": hash_of(k)} for k, d in a["documents"].items()},
        "findings": [{k: x.get(k, "") for k in ("id", "status", "title", "detail", "evidence", "resolution")} for x in f],
        "totals": {"checks": len(f), "passed": count("Passed"), "warnings": count("Warning"), "failed": count("Failed"), "needs_review": count("Needs Review")},
        "reviewer_notes": a.get("notes", "")}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
