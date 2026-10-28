"""Tiny text-only PDF writer (no extra libraries). Output has a real text layer so it can be read back."""
import textwrap

def make_pdf(lines):
    lines = [w for l in lines for w in (textwrap.wrap(l, 90) or [""])]
    esc = lambda t: t.encode("ascii", "replace").decode().replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = "BT /F1 12 Tf 50 780 Td 20 TL\n" + "".join("(%s) '\n" % esc(l) for l in lines) + "ET"
    objs = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>",
            "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 5 0 R/Resources<</Font<</F1 4 0 R>>>>>>",
            "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>", "<</Length %d>>\nstream\n%s\nendstream" % (len(stream), stream)]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += "%d 0 obj\n%s\nendobj\n" % (i, o)
    x = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, x)
    return out.encode("latin-1")
