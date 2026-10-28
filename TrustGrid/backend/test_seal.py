"""Tests the sealing logic with a stand-in signature scheme (the real ML-DSA library is only needed at runtime)."""
import os, sys, hmac, hashlib, copy
sys.path.insert(0, os.path.dirname(__file__))
import pq
from seal import build_payload
class Fake:  # NOT real crypto: lets us test the surrounding logic offline
    def keygen(self): k = os.urandom(32); return k, k
    def sign(self, sk, m): return hmac.new(sk, m, hashlib.sha256).digest()
    def verify(self, pk, m, s): return hmac.compare_digest(self.sign(pk, m), s)
APP = {"id": "TG-1", "institution": "Lakeview", "review": "In review", "notes": "", "documents": {"fire": {"filename": "f.pdf"}},
       "findings": [{"id": "c5", "status": "Failed", "title": "Fire", "detail": "expired", "evidence": "x", "resolution": "open"}]}
def payload(a, t="2026-10-28T10:00:00+00:00"): return build_payload(a, "2026-10-22", t, lambda k: "ab" * 32)
def test_payload_is_deterministic(): assert payload(APP) == payload(copy.deepcopy(APP))
def test_any_change_changes_the_payload():
    b = copy.deepcopy(APP); b["findings"][0]["resolution"] = "dismissed"; assert payload(b) != payload(APP)
    c = copy.deepcopy(APP); c["notes"] = "ok"; assert payload(c) != payload(APP)
def test_sign_and_verify_detects_tampering():
    pq.SCHEME, pq._keys = Fake(), None
    s = pq.sign(payload(APP))
    assert pq.verify(payload(APP), s["public_key"], s["signature"])
    b = copy.deepcopy(APP); b["findings"][0]["status"] = "Passed"
    assert not pq.verify(payload(b), s["public_key"], s["signature"])
