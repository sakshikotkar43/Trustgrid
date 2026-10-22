"""Optional AI field extraction. Runs only if AI_API_KEY is set; otherwise does nothing.
Safety rule: an AI value is kept only if it appears word-for-word in the OCR text, so nothing is invented."""
import os, json, urllib.request

def fill_with_ai(text, fields):
    key = os.getenv("AI_API_KEY")
    missing = [k for k, v in fields.items() if not v]
    if not key or not missing or not text.strip():
        return fields
    try:
        prompt = ("Extract these fields from the document text as a JSON object with exactly these keys: " + ", ".join(missing) +
                  ". Copy values exactly as written; use an empty string if absent. Return only JSON.\n\n" + text[:6000])
        body = {"model": os.getenv("AI_MODEL", "claude-sonnet-4-6"), "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", json.dumps(body).encode(),
                                     {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        reply = json.load(urllib.request.urlopen(req, timeout=20))["content"][0]["text"]
        data = json.loads(reply[reply.index("{"):reply.rindex("}") + 1])
        for k in missing:
            v = str(data.get(k, "")).strip()
            if v and v in text:
                fields[k] = v
    except Exception as e:
        print("AI extraction skipped:", e)
    return fields
