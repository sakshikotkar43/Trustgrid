"""Optional AI field extraction with Gemini. Does nothing unless GEMINI_API_KEY is set.
Safety rule: an AI value is kept only if it appears word-for-word in the OCR text, so nothing is invented."""
import json
from llm import ask

def fill_with_ai(text, fields):
    missing = [k for k, v in fields.items() if not v]
    if not missing or not text.strip():
        return fields
    reply = ask("Extract these fields from the document text as a JSON object with exactly these keys: " + ", ".join(missing) +
                ". Copy values exactly as written; use an empty string if absent. Return only JSON.\n\n" + text[:6000])
    if not reply:
        return fields
    try:
        data = json.loads(reply[reply.index("{"):reply.rindex("}") + 1])
        for k in missing:
            v = str(data.get(k, "")).strip()
            if v and v in text:
                fields[k] = v
    except Exception as e:
        print("AI extraction skipped:", e)
    return fields
