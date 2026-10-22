"""TrustGrid API. Uses MongoDB if reachable, otherwise an in-memory store (data resets on restart)."""
import os, json, glob, shutil
from datetime import date
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
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
mem, col = {}, None
try:
    from pymongo import MongoClient
    c = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=1500)
    c.admin.command("ping")
    col = c[os.getenv("MONGO_DB", "trustgrid")]["applications"]
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
def list_apps(): return all_apps()

@app.get("/api/applications/{aid}")
def one(aid: str): return get(aid)

@app.post("/api/applications")
async def create(institution: str = Form(...), address: str = Form(...), program: str = Form(...), representative: str = Form(...),
                 application: UploadFile = File(None), registration: UploadFile = File(None),
                 building: UploadFile = File(None), fire: UploadFile = File(None)):
    aid = f"TG-2026-{len(all_apps()) + 1:04d}"
    docs = {}
    for dtype, up in dict(application=application, registration=registration, building=building, fire=fire).items():
        if up: docs[dtype] = store_doc(aid, dtype, up)
    a = {"id": aid, "institution": institution, "program": program, "submitted": str(date.today()),
         "review": "Pending review", "notes": "", "documents": docs, "findings": []}
    save(a); return a

@app.post("/api/applications/{aid}/verify")
def verify(aid: str):
    a = get(aid); a["findings"] = run_checks(a["documents"], TODAY); a["review"] = "Pending review"; save(a); return a

@app.get("/api/applications/{aid}/report")
def report(aid: str):
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
def update_finding(aid: str, fid: str, body: FindingUpdate):
    a = get(aid)
    for f in a["findings"]:
        if f["id"] == fid: f["resolution"] = body.resolution
    a["review"] = "In review"; save(a); return a

@app.patch("/api/applications/{aid}")
def update_app(aid: str, body: AppUpdate):
    a = get(aid)
    if body.review: a["review"] = body.review
    if body.notes is not None: a["notes"] = body.notes
    save(a); return a

@app.patch("/api/applications/{aid}/fields")
def update_field(aid: str, body: FieldUpdate):
    a = get(aid)
    if body.doc not in a["documents"]: raise HTTPException(400, "Unknown document")
    a["documents"][body.doc]["fields"][body.field] = body.value; save(a); return a

@app.get("/api/applications/{aid}/documents/{dtype}/file")
def doc_file(aid: str, dtype: str):  # private files are served only through this endpoint
    if dtype not in DOCS: raise HTTPException(404)
    hits = glob.glob(os.path.join(UPLOADS, os.path.basename(aid), dtype + ".*"))
    if not hits: raise HTTPException(404, "No uploaded file")
    return FileResponse(hits[0])

@app.get("/api/applications/{aid}/documents")
def list_docs(aid: str):
    return [{"type": k, "filename": d["filename"], "file": d.get("file", False)} for k, d in get(aid)["documents"].items()]

@app.post("/api/applications/{aid}/documents/{dtype}")
def upload_doc(aid: str, dtype: str, file: UploadFile = File(...)):
    a = get(aid); a["documents"][dtype] = store_doc(aid, dtype, file); a["findings"] = []; save(a); return a
