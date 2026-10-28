"""OCR + simple 'Label: value' field parsing. Returns empty strings when nothing is found (never guesses)."""
import re

def extract_text(path):
    try:
        if path.lower().endswith(".pdf"):
            from pypdf import PdfReader  # text-layer PDFs first
            text = "\n".join(p.extract_text() or "" for p in PdfReader(path).pages)
            if text.strip():
                return text
            from pdf2image import convert_from_path
            import pytesseract
            return "\n".join(pytesseract.image_to_string(i) for i in convert_from_path(path))
        from PIL import Image
        import pytesseract
        return pytesseract.image_to_string(Image.open(path))
    except Exception as e:
        print("OCR unavailable:", e)
        return ""

PATTERNS = {"institution_name": r"institution(?: name)?", "registration_number": r"registration (?:no|number)",
            "address": r"address", "program": r"(?:program|course)", "representative": r"(?:authori[sz]ed )?representative",
            "issue_date": r"issue date", "valid_until": r"valid until"}

def parse_fields(text):
    out = {}
    for key, pat in PATTERNS.items():
        m = re.search(pat + r"[ \t]*[:\-][ \t]*(.+)", text, re.I)
        out[key] = m.group(1).strip() if m else ""
    return out
