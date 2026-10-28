"""Tiny Gemini client (REST, standard library only). Enabled only when GEMINI_API_KEY is set.
Optional: GEMINI_MODEL to choose a model. Returns None on any problem so callers fall back to rule-based logic."""
import os, json, urllib.request, urllib.error

def ask(prompt, max_tokens=1024):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    models = [m for m in [os.getenv("GEMINI_MODEL"), "gemini-3.5-flash", "gemini-2.5-flash"] if m]
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 0, "maxOutputTokens": max_tokens}}).encode()
    for model in models:  # try the next model only if this one is unknown or retired
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
                                         {"x-goog-api-key": key, "content-type": "application/json"})
            data = json.load(urllib.request.urlopen(req, timeout=25))
            return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip()
        except urllib.error.HTTPError as e:
            print(f"Gemini {model} failed: HTTP {e.code}")
            if e.code in (400, 401, 403, 429): return None  # bad key, blocked or over quota: stop
        except Exception as e:
            print(f"Gemini {model} failed:", e); return None
    return None

def chat(system, history, message, max_tokens=2048):
    """Multi-turn Gemini call. history = [{"role": "user"|"model", "text": str}]. Returns None on any problem."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    contents = [{"role": h["role"], "parts": [{"text": h["text"]}]} for h in history] + [{"role": "user", "parts": [{"text": message}]}]
    body = json.dumps({"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
                       "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens}}).encode()
    for model in [m for m in [os.getenv("GEMINI_MODEL"), "gemini-3.5-flash", "gemini-2.5-flash"] if m]:
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
                                         {"x-goog-api-key": key, "content-type": "application/json"})
            data = json.load(urllib.request.urlopen(req, timeout=30))
            return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip() or None
        except urllib.error.HTTPError as e:
            print(f"Gemini {model} failed: HTTP {e.code}")
            if e.code in (400, 401, 403, 429): return None
        except Exception as e:
            print(f"Gemini {model} failed:", e); return None
    return None
