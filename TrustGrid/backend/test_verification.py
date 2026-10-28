"""Run: cd backend && python -m pytest -q"""
import json, os, sys, pytest
sys.path.insert(0, os.path.dirname(__file__))
from validation import run_checks
from ocr import parse_fields, extract_text
ROOT = os.path.join(os.path.dirname(__file__), "..")
TODAY = "2026-10-22"

def status(aid):
    a = {x["id"]: x for x in json.load(open(os.path.join(ROOT, "sample_data", "demo.json")))["apps"]}[aid]
    return {f["id"]: f["status"] for f in a["findings"]}

def test_case_a_clean(): assert [v for k, v in status("TG-2026-0001").items() if k != "c6"] == ["Passed"] * 5
def test_case_b_issues():
    s = status("TG-2026-0002"); assert s["c2"] == s["c4"] == s["c5"] == "Failed" and s["c1"] == s["c3"] == "Passed"
def test_missing_documents(): assert run_checks({}, TODAY)[0]["status"] == "Failed"
def test_unreadable_field_needs_review():
    d = {"application": {"fields": {"registration_number": "X"}}, "registration": {"fields": {}}}
    assert run_checks(d, TODAY)[3]["status"] == "Needs Review"
def test_parser_never_invents():
    f = parse_fields("Registration Number: REG-1\nOther text"); assert f["registration_number"] == "REG-1" and f["institution_name"] == ""

def test_pdf_extraction():
    pytest.importorskip("pypdf")
    f = parse_fields(extract_text(os.path.join(ROOT, "sample_documents", "case_b_issues", "application.pdf")))
    assert f["registration_number"] == "REG-MH-2018-07733" and f["representative"] == ""

def test_upload_flow_end_to_end():
    pytest.importorskip("httpx"); pytest.importorskip("pypdf")
    from fastapi.testclient import TestClient
    import main
    d = os.path.join(ROOT, "sample_documents", "case_b_issues")
    files = {k: (k + ".pdf", open(os.path.join(d, k + ".pdf"), "rb"), "application/pdf") for k in ["application", "registration", "building", "fire"]}
    c = TestClient(main.app)
    hdr = lambda e, p: {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]}
    app_h, off_h = hdr("applicant@trustgrid.demo", "Applicant@123"), hdr("officer@trustgrid.demo", "Officer@123")
    assert c.get("/api/applications").status_code == 401
    r = c.post("/api/applications", data=dict(institution="Lakeview", address="x", program="y", representative="z"), files=files, headers=app_h)
    assert r.status_code == 200 and r.json()["findings"] == []  # applicant never sees findings
    aid = r.json()["id"]
    assert c.post(f"/api/applications/{aid}/verify", headers=app_h).status_code == 403
    assert [a["id"] for a in c.get("/api/applications", headers=app_h).json()] == [aid]
    v = c.post(f"/api/applications/{aid}/verify", headers=off_h).json()
    s = {f["id"]: f["status"] for f in v["findings"]}
    assert s["c2"] == s["c4"] == s["c5"] == "Failed"
