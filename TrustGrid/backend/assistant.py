"""TrustGrid Fix Assistant. Reads the officer's request, explains it, and prepares a corrected PDF only where that is honest.
Rules: it never edits certificates issued by authorities, never invents values (the applicant confirms every value),
and works without an AI key (AI, if configured, only helps classify the officer's note)."""
import io
from datetime import date
from validation import REQUIRED, DOCS, norm
from pdfgen import make_pdf
from llm import ask

LABEL = {"institution_name": "Institution Name", "registration_number": "Registration Number", "address": "Address",
         "program": "Proposed Program", "representative": "Authorized Representative"}
CATS = ["expired", "file_quality", "mismatch", "missing_field", "other"]
WORDS = {"expired": ["expir", "renew", "validity", "outdated", "valid until"],
         "file_quality": ["blur", "unreadable", "illegible", "scan", "quality", "rotate", "resolution", "dark", "clear", "size", "format"],
         "mismatch": ["mismatch", "match", "differ", "wrong", "incorrect", "typo"],
         "missing_field": ["missing", "empty", "blank", "not filled", "fill", "mandatory"]}

def classify(msg):
    m = msg.lower()
    for cat in CATS[:-1]:
        if any(w in m for w in WORDS[cat]): return cat
    return "other"

def ai_classify(msg):  # optional (Gemini); the answer must be one of CATS or it is ignored
    reply = ask("Classify this officer request about an application document with exactly one word from this list: " + ", ".join(CATS) + ".\n\n" + msg[:500])
    out = (reply or "").strip().lower().strip(".")
    return out if out in CATS else None

def analyze(a, doc, msg, image_path=None):
    cat = ai_classify(msg) or classify(msg)
    plan = {"doc": doc, "title": DOCS[doc], "category": cat, "fields": [], "can_generate": False, "mode": "", "summary": "", "steps": []}
    if doc == "application":
        mine = a["documents"].get("application", {}).get("fields", {}); cert = a["documents"].get("registration", {}).get("fields", {})
        for k in REQUIRED:
            cur = (mine.get(k) or "").strip(); ref = (cert.get(k) or "").strip() if k in ("institution_name", "registration_number") else ""
            issue = "Missing" if not cur else ("Differs from your registration certificate" if ref and norm(ref) != norm(cur) else "")
            plan["fields"].append({"key": k, "label": LABEL[k], "current": cur, "suggested": ref if issue else "", "issue": issue})
        plan.update(can_generate=True, mode="form", summary="I checked your application form against your other documents and highlighted what looks wrong. Confirm each value, then I will prepare a corrected PDF for you to review and sign.",
                    steps=["Check the highlighted fields and correct any value", "Generate the corrected PDF", "Review and sign it, then add it to this request"])
    elif cat == "expired":
        plan.update(summary="This certificate looks out of date. Certificates are issued by an authority, so I can't change them.",
                    steps=["Apply for a renewed certificate from the issuing authority", "Upload the new certificate here"])
    elif cat == "file_quality" and image_path:
        plan.update(can_generate=True, mode="enhance", summary="The officer asked for a clearer file. I can improve the contrast and sharpness of your uploaded image and convert it to PDF.",
                    steps=["Generate the enhanced PDF", "Check that it is readable", "Add it to this request"])
    else:
        plan.update(summary="I can't change a certificate issued by an authority. If the note is about a mismatch, check your application form against it. Otherwise upload a clear scan or a corrected copy from the issuer.",
                    steps=["Read the officer's note", "Get a clear or corrected copy of the original", "Upload it here"])
    return plan

def build_pdf(plan, values, image_path=None):
    if plan["mode"] == "enhance":
        from PIL import Image, ImageOps, ImageFilter
        img = ImageOps.autocontrast(Image.open(image_path).convert("RGB")).filter(ImageFilter.SHARPEN)
        buf = io.BytesIO(); img.save(buf, "PDF"); return buf.getvalue()
    vals = {k: str(values.get(k, "")).strip() for k in REQUIRED}
    if any(not v for v in vals.values()): raise ValueError("Please fill every field before generating the PDF")
    return make_pdf(["Institution Application Form", "Corrected copy prepared with the TrustGrid assistant", ""] + [f"{LABEL[k]}: {vals[k]}" for k in REQUIRED] +
                    ["", f"Details confirmed by the applicant on {date.today()}.", "The applicant must review and sign this form before submission.", "", "Signature: ______________________"])
