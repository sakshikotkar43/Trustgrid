"""Deterministic verification rules. Plain functions, easy to test."""
from datetime import date

DOCS = {"application": "Institution Application Form", "registration": "Registration Certificate",
        "building": "Building Completion Certificate", "fire": "Fire Safety Certificate"}
REQUIRED = ["institution_name", "registration_number", "address", "program", "representative"]
NO_VALUE = "Unable to extract — manual review required"

def norm(s):
    return " ".join(str(s).lower().replace(".", "").split())

def finding(fid, group, status, title, detail, doc="all", evidence=""):
    return dict(id=fid, group=group, status=status, title=title, detail=detail,
                doc=doc, evidence=evidence, resolution="open")

def val(docs, dtype, field):
    return (docs.get(dtype, {}).get("fields", {}).get(field) or "").strip()

def run_checks(docs, today):
    out = []
    # 1. Completeness
    missing = [n for k, n in DOCS.items() if k not in docs]
    out.append(finding("c1", "Document completeness", "Failed" if missing else "Passed",
        "Required documents", ("Missing: " + ", ".join(missing)) if missing else "All four document categories are present.",
        evidence="Present: " + ", ".join(DOCS[k] for k in DOCS if k in docs)))
    # 2. Required fields in the application form
    empty = [f for f in REQUIRED if not val(docs, "application", f)]
    out.append(finding("c2", "Required-field validation", "Failed" if empty else "Passed", "Application form fields",
        ("Mandatory field(s) empty: " + ", ".join(empty)) if empty else "All mandatory fields are filled.", "application",
        "; ".join(f"{f} = {val(docs, 'application', f) or NO_VALUE}" for f in REQUIRED)))
    # 3. Institution name across documents
    found = {k: val(docs, k, "institution_name") for k in docs if val(docs, k, "institution_name")}
    bad = len({norm(v) for v in found.values()}) > 1
    out.append(finding("c3", "Cross-document consistency", "Failed" if bad else "Passed", "Institution name match",
        "Institution names differ between documents." if bad else "Institution name matches across documents.",
        "application", "; ".join(f"{DOCS[k]}: {v}" for k, v in found.items())))
    # 4. Registration number
    a, r = val(docs, "application", "registration_number"), val(docs, "registration", "registration_number")
    if not a or not r:
        st, d = "Needs Review", "Registration number could not be extracted from one document. " + NO_VALUE + "."
    elif norm(a) != norm(r):
        st, d = "Failed", "Registration number on the application differs from the registration certificate."
    else:
        st, d = "Passed", "Registration numbers match."
    out.append(finding("c4", "Cross-document consistency", st, "Registration number match", d, "registration",
        f"Application: {a or NO_VALUE}; Certificate: {r or NO_VALUE}"))
    # 5. Date rule (demo rule: fire certificate must not be expired on the reference date)
    try:
        until = date.fromisoformat(val(docs, "fire", "valid_until"))
        if until < date.fromisoformat(today):
            st, d = "Failed", "Fire safety certificate is expired under the demo validity rule."
        else:
            st, d = "Passed", "Fire safety certificate is within its validity period."
        ev = f"Valid until {until}; reference date {today}"
    except ValueError:
        st, d, ev = "Needs Review", NO_VALUE + " (valid-until date).", "valid_until not found"
    out.append(finding("c5", "Configured date and compliance checks", st, "Fire certificate validity", d, "fire", ev))
    # 6. Authenticity: honest statement, never a verdict
    out.append(finding("c6", "Review-required authenticity indicators", "Needs Review", "Issuer and signature verification",
        "Issuer verification and digital-signature checks are not implemented in this prototype. A human reviewer must confirm authenticity.",
        evidence="No issuer lookup performed"))
    return out
