"""Writes synthetic demo PDFs (text layer, 'Label: value' lines) from sample_data/demo.json. Run: python make_samples.py"""
import json, os
HERE = os.path.dirname(__file__)
LABEL = {"institution_name": "Institution Name", "registration_number": "Registration Number", "address": "Address",
         "program": "Proposed Program", "representative": "Authorized Representative", "issue_date": "Issue Date", "valid_until": "Valid Until"}
TITLE = {"application": "Institution Application Form", "registration": "Institution Registration Certificate",
         "building": "Building Completion Certificate", "fire": "Fire Safety Certificate"}

def make_pdf(path, lines):
    esc = lambda t: t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = "BT /F1 12 Tf 50 780 Td 20 TL\n" + "".join("(%s) '\n" % esc(l) for l in lines) + "ET"
    objs = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>",
            "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 5 0 R/Resources<</Font<</F1 4 0 R>>>>>>",
            "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>", "<</Length %d>>\nstream\n%s\nendstream" % (len(stream), stream)]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out.encode())); out += "%d 0 obj\n%s\nendobj\n" % (i, o)
    x = len(out.encode())
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, x)
    open(path, "wb").write(out.encode("latin-1"))

for app, folder in zip(json.load(open(os.path.join(HERE, "..", "sample_data", "demo.json")))["apps"], ["case_a_clean", "case_b_issues"]):
    os.makedirs(os.path.join(HERE, folder), exist_ok=True)
    for dtype, d in app["documents"].items():
        lines = [TITLE[dtype], "Synthetic Demo Document - Not an Official Certificate", ""] + [f"{LABEL[k]}: {v}" for k, v in d["fields"].items()]
        make_pdf(os.path.join(HERE, folder, dtype + ".pdf"), lines)
print("sample PDFs written")
