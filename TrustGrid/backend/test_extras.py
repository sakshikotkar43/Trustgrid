import os, sys, pytest
sys.path.insert(0, os.path.dirname(__file__))
pytest.importorskip("httpx")
from fastapi.testclient import TestClient
import main, assistant

ROOT = os.path.join(os.path.dirname(__file__), "..", "sample_documents", "case_b_issues")
c = TestClient(main.app)
def hdr(e, p): return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]}
def fresh_applicant():  # own account per test so tests don't see each other's applications
    import secrets
    r = c.post("/api/auth/register", json={"email": f"t{secrets.token_hex(3)}@x.org", "password": "Password1!", "name": "T"}).json()
    return {"Authorization": "Bearer " + r["token"]}
def pdf(n="x.pdf"): return (n, open(os.path.join(ROOT, "fire.pdf"), "rb"), "application/pdf")

def make_app(H, **extra):
    files = [("application", pdf()), *extra.get("files", [])]
    r = c.post("/api/applications", data=dict(institution="Lakeview", address="x", program="y", representative="z", **extra.get("data", {})), files=files, headers=H)
    assert r.status_code == 200, r.text; return r.json()["id"]

def test_applicant_adds_extra_documents_at_submission_and_later():
    A = fresh_applicant()
    aid = make_app(A, files=[("extra_files", pdf("land.pdf"))], data={"extra_titles": "Land ownership proof"})
    docs = c.get(f"/api/applications/{aid}", headers=A).json()["documents"]
    extras = {k: v for k, v in docs.items() if k.startswith("extra_")}
    assert len(extras) == 1 and list(extras.values())[0]["title"] == "Land ownership proof"
    r = c.post(f"/api/applications/{aid}/extra-documents", data={"title": "Audit report"}, files={"file": pdf("a.pdf")}, headers=A)
    assert r.status_code == 200 and sum(k.startswith("extra_") for k in r.json()["documents"]) == 2
    assert c.post(f"/api/applications/{aid}/extra-documents", data={"title": " "}, files={"file": pdf()}, headers=A).status_code == 400
    key = next(iter(extras)); assert c.get(f"/api/applications/{aid}/documents/{key}/file", headers=A).status_code == 200
    # extra documents never break the core checks
    O = hdr("officer@trustgrid.demo", "Officer@123")
    assert c.post(f"/api/applications/{aid}/verify", headers=O).status_code == 200

def test_officer_requests_extra_document_and_applicant_fulfils_it():
    A, O = fresh_applicant(), hdr("officer@trustgrid.demo", "Officer@123")
    aid = make_app(A)
    assert c.post(f"/api/applications/{aid}/requests", json={"title": "Trade licence"}, headers=A).status_code == 403
    assert c.post(f"/api/applications/{aid}/requests", json={"title": " "}, headers=O).status_code == 400
    r = c.post(f"/api/applications/{aid}/requests", json={"title": "Trade licence", "message": "Please add it"}, headers=O).json()
    req = r["requests"][0]; assert r["review"] == "Action required" and req["doc_title"] == "Trade licence" and req["doc"].startswith("extra_")
    assert c.post(f"/api/applications/{aid}/documents/extra_deadbeef", files={"file": pdf()}, headers=A).status_code == 400  # no such request
    up = c.post(f"/api/applications/{aid}/documents/{req['doc']}", files={"file": pdf("t.pdf")}, headers=A).json()
    assert up["documents"][req["doc"]]["title"] == "Trade licence" and up["requests"][0]["uploaded"]
    assert c.get(f"/api/applications/{aid}/assistant/{req['doc']}", headers=A).json()["title"] == "Trade licence"
    assert c.post(f"/api/applications/{aid}/resubmit", headers=A).status_code == 200

def test_ai_draft_message_uses_ai_when_available_and_template_otherwise(monkeypatch):
    A, O = fresh_applicant(), hdr("officer@trustgrid.demo", "Officer@123")
    aid = make_app(A); c.post(f"/api/applications/{aid}/verify", headers=O)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = c.post(f"/api/applications/{aid}/draft-message", json={"fid": "c1"}, headers=O).json()
    assert r["ai"] is False and "Missing" in r["text"] and "Resubmit" in r["text"]
    monkeypatch.setattr(assistant, "ask", lambda p, n=1024: "**Please** fix it.\n")
    r = c.post(f"/api/applications/{aid}/draft-message", json={"fid": "c4"}, headers=O).json(); assert r == {"text": "Please fix it.", "ai": True}
    r = c.post(f"/api/applications/{aid}/draft-message", json={"title": "Trade licence"}, headers=O).json(); assert r["ai"] is True
    assert c.post(f"/api/applications/{aid}/draft-message", json={"fid": "zz"}, headers=O).status_code == 404
    assert c.post(f"/api/applications/{aid}/draft-message", json={"fid": "c1"}, headers=A).status_code == 403
