import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import assistant
from assistant import classify, analyze, reply
APP = {"id": "T1", "institution": "Lakeview", "documents": {"application": {"filename": "a.pdf", "fields": {"institution_name": "Lakeview", "registration_number": "REG-1", "address": "x", "program": "y", "representative": ""}},
                     "registration": {"filename": "r.pdf", "fields": {"institution_name": "Lakeview", "registration_number": "REG-2"}}}}
REQS = [{"doc": "application", "doc_title": "Institution Application Form", "message": "number does not match"}]
def test_classify(): assert classify("fire certificate expired, renew it") == "expired" and classify("the scan is blurry") == "file_quality" and classify("upload it again") == "other"
def test_application_plan_flags_issues():
    labels = {i["label"]: i for i in analyze(APP, "application", "number does not match")["issues"]}
    assert "empty" in labels["Authorized Representative"]["problem"] and "REG-2" in labels["Registration Number"]["problem"] and "Institution Name" not in labels
def test_assistant_never_generates_documents():
    p = analyze(APP, "application", "fix it")
    assert "can_generate" not in p and "fields" not in p and not hasattr(assistant, "build_pdf")
    f = analyze(APP, "fire", "certificate expired"); assert "only the issuer" in f["summary"] and f["issues"] == []
def test_offline_reply_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    text, ai = reply(APP, REQS, [analyze(APP, "application", "x")], "what should I do?", [])
    assert ai is False and "can't create or edit documents" in text and "not switched on" in text
def test_context_has_no_officer_findings():
    c = assistant.context({**APP, "findings": [{"detail": "SECRETFINDING"}], "notes": "SECRETNOTE"}, REQS)
    assert "SECRETFINDING" not in c and "SECRETNOTE" not in c and "number does not match" in c
def test_ai_reply_used_and_history_starts_with_user(monkeypatch):
    seen = {}
    def fake(system, hist, msg): seen.update(system=system, hist=hist); return "Ask the issuer."
    monkeypatch.setattr(assistant, "llm_chat", fake)
    text, ai = reply(APP, REQS, [], "hi", [{"role": "model", "text": "welcome"}, {"role": "user", "text": "q"}])
    assert ai and text == "Ask the issuer." and seen["hist"][0]["role"] == "user" and "Never write, fill in" in seen["system"]
