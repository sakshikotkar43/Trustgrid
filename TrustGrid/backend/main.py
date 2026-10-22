"""TrustGrid API. Uses MongoDB if reachable, otherwise an in-memory store (data resets on restart)."""
import os, json, glob, shutil, hmac, hashlib, base64, time, secrets
from datetime import date
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Query, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from validation import run_checks, DOCS
from ocr import extract_text, parse_fields
from ai import fill_with_ai

try:
    from dotenv import load_dotenv; load_dotenv()
except ImportError:
    pass
TODAY = os.getenv("REFERENCE_DATE", "2026-10-22")
UPLOADS = os.path.join(os.path.dirname(__file__), "uploads")
app = FastAPI(title="TrustGrid API")
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",")],
                   allow_methods=["*"], allow_headers=["*"])
mem, col, ucol, umem = {}, None, None, {}
try:
    from pymongo import MongoClient
    c = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=1500)
    c.admin.command("ping")
    db = c[os.getenv("MONGO_DB", "trustgrid")]; col = db["applications"]; ucol = db["users"]
except Exception:
    print("MongoDB unavailable - using in-memory store")

def all_apps():
    return [{k: v for k, v in d.items() if k != "_id"} for d in col.find()] if col is not None else list(mem.values())
def get(aid):
    a = next((x for x in all_apps() if x["id"] == aid), None)
    if not a: raise HTTPException(404, "Application not found")
    return a
def save(a):
    if col is not None: col.replace_one({"_id": a["id"]}, {**a, "_id": a["id"]}, upsert=True)
    else: mem[a["id"]] = a

if not all_apps():  # seed the two demo cases
    for a in json.load(open(os.path.join(os.path.dirname(__file__), "..", "sample_data", "demo.json")))["apps"]: save(a)

# ---------- Authentication (stdlib only: PBKDF2 password hashes + HMAC-signed tokens) ----------
SECRET = os.getenv("AUTH_SECRET", "dev-secret-change-me").encode()
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(8)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100_000).hex()
def check_pw(pw, stored): return hmac.compare_digest(hash_pw(pw, stored.split("$")[0]), stored)
def get_user(email):
    email = email.strip().lower()
    if ucol is not None:
        d = ucol.find_one({"_id": email}); return {**d, "email": email} if d else None
    return umem.get(email)
def save_user(u):
    if ucol is not None: ucol.replace_one({"_id": u["email"]}, {**u, "_id": u["email"]}, upsert=True)
    else: umem[u["email"]] = u
def sign(body): return hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
def make_token(u):
    body = base64.urlsafe_b64encode(json.dumps({"e": u["email"], "r": u["role"], "n": u["name"], "x": int(time.time()) + 8 * 3600}).encode()).decode()
    return body + "." + sign(body)
def current(authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    raw = (authorization or "").replace("Bearer ", "") or token or ""
    try:
        body, sig = raw.split(".")
        if not hmac.compare_digest(sig, sign(body)): raise ValueError
        d = json.loads(base64.urlsafe_b64decode(body))
        if d["x"] < time.time(): raise ValueError
        return {"email": d["e"], "role": d["r"], "name": d["n"]}
    except Exception:
        raise HTTPException(401, "Please sign in again")
def officer_only(user=Depends(current)):
    if user["role"] != "officer": raise HTTPException(403, "Officer access only")
    return user
def applicant_only(user=Depends(current)):
    if user["role"] != "applicant": raise HTTPException(403, "Applicant access only")
    return user
def can_see(a, user): return user["role"] == "officer" or a.get("owner") == user["email"]
def view_for(a, user):  # applicants never receive findings or officer notes
    return a if user["role"] == "officer" else {**a, "findings": [], "notes": ""}
def ensure_user(email, name, pw, role):
    if not get_user(email): save_user({"email": email.lower(), "name": name, "role": role, "pw": hash_pw(pw)})
ensure_user(os.getenv("OFFICER_EMAIL", "officer@trustgrid.demo"), "Verification Officer", os.getenv("OFFICER_PASSWORD", "Officer@123"), "officer")
ensure_user("applicant@trustgrid.demo", "Demo Applicant", "Applicant@123", "applicant")

class Credentials(BaseModel):
    email: str
    password: str
    name: str = ""
def session(u): return {"token": make_token(u), "user": {"name": u["name"], "email": u["email"], "role": u["role"]}}

@app.post("/api/auth/login")
def login(b: Credentials):
    u = get_user(b.email)
    if not u or not check_pw(b.password, u["pw"]): raise HTTPException(401, "Incorrect email or password")
    return session(u)

@app.post("/api/auth/register")  # applicants only: officer accounts cannot be self-registered
def register(b: Credentials):
    if "@" not in b.email or len(b.password) < 8 or not b.name.strip(): raise HTTPException(400, "Enter a name, a valid email and a password of at least 8 characters")
    if get_user(b.email): raise HTTPException(400, "An account with this email already exists")
    u = {"email": b.email.strip().lower(), "name": b.name.strip(), "role": "applicant", "pw": hash_pw(b.password)}
    save_user(u); return session(u)

def store_doc(aid, dtype, up):
    """Save one uploaded file privately, run OCR, parse fields (AI fills gaps only if configured)."""
    ext = os.path.splitext(up.filename or "")[1].lower()
    if dtype not in DOCS or ext not in (".pdf", ".jpg", ".jpeg", ".png"):
        raise HTTPException(400, f"{up.filename}: unsupported document or file type")
    if (getattr(up, "size", 0) or 0) > 10 * 1024 * 1024:
        raise HTTPException(400, f"{up.filename}: file is larger than 10 MB")
    os.makedirs(os.path.join(UPLOADS, aid), exist_ok=True)
    for old in glob.glob(os.path.join(UPLOADS, aid, dtype + ".*")): os.remove(old)
    path = os.path.join(UPLOADS, aid, dtype + ext)
    with open(path, "wb") as f: shutil.copyfileobj(up.file, f)
    text = extract_text(path)
    return {"filename": up.filename, "file": True, "fields": fill_with_ai(text, parse_fields(text))}

@app.get("/api/applications")
def list_apps(user=Depends(current)): return [view_for(a, user) for a in all_apps() if can_see(a, user)]

@app.get("/api/applications/{aid}")
def one(aid: str, user=Depends(current)):
    a = get(aid)
    if not can_see(a, user): raise HTTPException(404, "Application not found")
    return view_for(a, user)

@app.post("/api/applications")
async def create(institution: str = Form(...), address: str = Form(...), program: str = Form(...), representative: str = Form(...),
                 application: UploadFile = File(None), registration: UploadFile = File(None),
                 building: UploadFile = File(None), fire: UploadFile = File(None), user: dict = Depends(applicant_only)):
    aid = f"TG-2026-{len(all_apps()) + 1:04d}"
    docs = {}
    for dtype, up in dict(application=application, registration=registration, building=building, fire=fire).items():
        if up: docs[dtype] = store_doc(aid, dtype, up)
    a = {"id": aid, "institution": institution, "program": program, "submitted": str(date.today()),
         "review": "Pending review", "notes": "", "owner": user["email"], "documents": docs, "findings": run_checks(docs, TODAY)}
    save(a); return view_for(a, user)

@app.post("/api/applications/{aid}/verify")
def verify(aid: str, user=Depends(officer_only)):
    a = get(aid); a["findings"] = run_checks(a["documents"], TODAY); a["review"] = "Pending review"; save(a); return a

@app.get("/api/applications/{aid}/report")
def report(aid: str, user=Depends(officer_only)):
    a = get(aid); f = a["findings"]
    return {"application": a, "total": len(f), "passed": sum(x["status"] == "Passed" for x in f),
            "warnings": sum(x["status"] == "Warning" for x in f), "failed": sum(x["status"] == "Failed" for x in f),
            "disclaimer": "Prototype verification based on configured demo rules. This report does not constitute official AICTE approval or proof of document authenticity."}

class FindingUpdate(BaseModel): resolution: str
class AppUpdate(BaseModel):
    review: Optional[str] = None
    notes: Optional[str] = None
class FieldUpdate(BaseModel): doc: str; field: str; value: str

@app.patch("/api/applications/{aid}/findings/{fid}")
def update_finding(aid: str, fid: str, body: FindingUpdate, user=Depends(officer_only)):
    a = get(aid)
    for f in a["findings"]:
        if f["id"] == fid: f["resolution"] = body.resolution
    a["review"] = "In review"; save(a); return a

@app.patch("/api/applications/{aid}")
def update_app(aid: str, body: AppUpdate, user=Depends(officer_only)):
    a = get(aid)
    if body.review: a["review"] = body.review
    if body.notes is not None: a["notes"] = body.notes
    save(a); return a

@app.patch("/api/applications/{aid}/fields")
def update_field(aid: str, body: FieldUpdate, user=Depends(officer_only)):
    a = get(aid)
    if body.doc not in a["documents"]: raise HTTPException(400, "Unknown document")
    a["documents"][body.doc]["fields"][body.field] = body.value; save(a); return a

@app.get("/api/applications/{aid}/documents/{dtype}/file")
def doc_file(aid: str, dtype: str, user=Depends(current)):  # private files are served only through this endpoint
    if dtype not in DOCS or not can_see(get(aid), user): raise HTTPException(404)
    hits = glob.glob(os.path.join(UPLOADS, os.path.basename(aid), dtype + ".*"))
    if not hits: raise HTTPException(404, "No uploaded file")
    return FileResponse(hits[0])

@app.get("/api/applications/{aid}/documents")
def list_docs(aid: str, user=Depends(current)):
    if not can_see(get(aid), user): raise HTTPException(404)
    return [{"type": k, "filename": d["filename"], "file": d.get("file", False)} for k, d in get(aid)["documents"].items()]

@app.post("/api/applications/{aid}/documents/{dtype}")
def upload_doc(aid: str, dtype: str, file: UploadFile = File(...), user=Depends(applicant_only)):
    a = get(aid)
    if a.get("owner") != user["email"]: raise HTTPException(404, "Application not found")
    a["documents"][dtype] = store_doc(aid, dtype, file); a["findings"] = run_checks(a["documents"], TODAY); save(a); return view_for(a, user)
