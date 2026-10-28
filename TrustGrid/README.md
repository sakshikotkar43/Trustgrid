# TrustGrid: AI-assisted application verification prototype (SIH26261)
Fictional product. Not an official AICTE product. It assists human reviewers; it never decides authenticity or approval.

## 1. Frontend setup
    cd frontend && npm install
## 2. Backend setup (Python 3.10+)
    cd backend && python -m venv venv && source venv/bin/activate   (Windows: venv\Scripts\activate)
    pip install -r requirements.txt
OCR for image/scanned uploads also needs the Tesseract program installed on your computer (and Poppler for scanned PDFs). Text-based PDFs work without them.
## 3. Environment variables
Copy `.env.example` to `backend/.env`. Set `MONGO_URI` if your MongoDB is not at localhost:27017.
## 4. Run (two terminals)
    cd backend && uvicorn main:app --reload      # http://localhost:8000
    cd frontend && npm run dev                   # http://localhost:5173
## 5. MongoDB
Install MongoDB Community and start it (`mongod`). The backend pings it on startup. If it is unreachable, an in-memory store is used and data resets on restart.
## 6. Test the demo cases
Open Overview and select "Case A" (clean: all configured checks pass) or "Case B" (registration number mismatch, expired fire certificate, missing authorized representative). Select Run verification, then View report.
To regenerate sample data: `cd backend && python seed.py`.
## 7. Demo mode vs external services
- Works without the backend: browsing, search/filters, the two sample cases, review actions (local only), reports, printing.
- Needs the backend: creating applications, uploads, OCR, real verification runs, saved reviews.
- Needs Tesseract/Poppler: OCR of images and scanned PDFs. Upload parsing expects "Label: value" lines (e.g. "Registration Number: ...").
- Not implemented: issuer lookup, digital-signature verification.

## Sample documents and tests
- `sample_documents/case_a_clean/` and `case_b_issues/` hold four synthetic PDFs each. Upload them in New Application to test real extraction and verification (regenerate with `python sample_documents/make_samples.py`).
- Run tests: `cd backend && python -m pytest -q` (the upload test needs `httpx` and the installed requirements).
- Optional AI: set `GEMINI_API_KEY` in `backend/.env`. AI only fills fields the rules could not read, and a value is kept only if it appears word-for-word in the OCR text.
- Extra endpoints: `GET /api/applications/{id}/documents`, `POST /api/applications/{id}/documents/{type}` (upload or replace one document).

## Roles (applicant vs officer)
On first open you choose **Applicant** or **Verification officer**. Applicants can only submit applications and see their own status and document list (their IDs are remembered in the browser). Officers get the dashboard, findings, review actions and reports. Verification runs automatically on submission. This is a demo role switch with no sign-in: real use needs authentication and server-side permission checks.

## Login accounts
Applicants and officers have separate logins (Applicant tab / Officer tab). Permissions are enforced by the backend: applicants only see their own applications (without findings), and only officers can verify, review and read reports.
- Demo officer: `officer@trustgrid.demo` / `Officer@123` (override with `OFFICER_EMAIL` / `OFFICER_PASSWORD`)
- Demo applicant: `applicant@trustgrid.demo` / `Applicant@123`, or create an account with Create account
- Set `AUTH_SECRET` to a long random string in production. Officer accounts cannot be self-registered.

## AI Assistant (applicant)
When an officer sends an "Action required" request, a side tab with the assistant logo opens a panel. **The assistant only advises; it never generates, edits or enhances any document**, so everything submitted is the applicant's own form or the issuer's original (an AI-made document would not be official).
- It reads the officer's note and explains what to fix and how (for the application form it points out empty fields and values that differ from the registration certificate; for certificates it explains that only the issuer can renew or correct them; for unclear files it explains how to re-scan).
- The applicant can ask follow-up questions in a chat (what a note means, where to get a certificate, file rules, how to resubmit). With `GEMINI_API_KEY` set, Gemini answers using only that applicant's own application data. It never receives officer findings or internal notes, refuses to write or fill in documents, and never says whether something is approved or genuine.
- Without an API key it shows rule-based guidance only. Chat is limited to 12 messages per minute per user.
- Endpoints: `GET /api/applications/{id}/assistant/{doc}` (guidance), `POST /api/applications/{id}/assistant/chat` (`{message, history}`).

## Gemini (optional)
Set `GEMINI_API_KEY` (from Google AI Studio) on the backend to enable the AI steps; optionally `GEMINI_MODEL`. Without a key the app uses rule-based logic only. Use only synthetic documents with the free tier.

## Post-quantum report seal
Officers can **Seal report**: the report (findings, notes, review status and a SHA-256 fingerprint of each uploaded document) is signed with ML-DSA (NIST FIPS 204), a signature scheme designed to resist quantum computers, and a TrustGrid stamp plus signature details appear at the end of the report. Opening the report re-checks the seal and flags any change made afterwards. **Download seal file** saves the signature so it can be checked anywhere: `python backend/verify_seal.py 1234_seal.json`.
- The seal proves the report is unchanged since signing. It does not prove any document is genuine and is not an official AICTE seal.
- Keys: by default a key is created once and stored in MongoDB. Better: run `python backend/generate_keys.py` once and add `PQ_PUBLIC_KEY` and `PQ_SECRET_KEY` to Render. Publish the key fingerprint so others can pin it.
- The pure-Python `dilithium-py` library suits a prototype. For production use a vetted library (liboqs) and keep the key in an HSM.
