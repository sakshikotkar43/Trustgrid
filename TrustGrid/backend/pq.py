"""Post-quantum digital signatures for report seals.
Uses ML-DSA (NIST FIPS 204, formerly CRYSTALS-Dilithium), a signature scheme designed to resist attacks by quantum computers.
Library: dilithium-py (pure Python, good for a prototype; for production use a vetted library such as liboqs and keep the key in an HSM)."""
import os, base64, hashlib
try:
    from dilithium_py.ml_dsa import ML_DSA_65 as SCHEME
    ALG = "ML-DSA-65 (NIST FIPS 204)"
except ImportError:
    try:
        from dilithium_py.dilithium import Dilithium3 as SCHEME
        ALG = "CRYSTALS-Dilithium3"
    except ImportError:
        SCHEME, ALG = None, ""

b64 = lambda b: base64.b64encode(b).decode()
_keys = None

def need_lib():
    if SCHEME is None: raise RuntimeError("Post-quantum library not installed (pip install dilithium-py)")

def keys(kcol=None):
    """Signing keys: from env (PQ_PUBLIC_KEY / PQ_SECRET_KEY, base64), else stored in the database, else generated once and stored."""
    global _keys
    if _keys: return _keys
    need_lib()
    pk, sk = os.getenv("PQ_PUBLIC_KEY"), os.getenv("PQ_SECRET_KEY")
    if pk and sk:
        _keys = (base64.b64decode(pk), base64.b64decode(sk)); return _keys
    if kcol is not None:
        d = kcol.find_one({"_id": "seal-key"})
        if d:
            _keys = (base64.b64decode(d["pk"]), base64.b64decode(d["sk"])); return _keys
    pk, sk = SCHEME.keygen()
    if kcol is not None: kcol.replace_one({"_id": "seal-key"}, {"_id": "seal-key", "pk": b64(pk), "sk": b64(sk)}, upsert=True)
    _keys = (pk, sk); return _keys

def sign(payload, kcol=None):
    pk, sk = keys(kcol)
    return {"algorithm": ALG, "public_key": b64(pk), "fingerprint": hashlib.sha256(pk).hexdigest(),
            "signature": b64(SCHEME.sign(sk, payload.encode())), "payload_sha256": hashlib.sha256(payload.encode()).hexdigest()}

def verify(payload, public_key_b64, signature_b64):
    need_lib()
    try: return bool(SCHEME.verify(base64.b64decode(public_key_b64), payload.encode(), base64.b64decode(signature_b64)))
    except Exception: return False
