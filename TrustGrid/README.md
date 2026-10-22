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
- Not implemented: AI API use, issuer lookup, digital-signature verification.

## Sample documents and tests
- `sample_documents/case_a_clean/` and `case_b_issues/` hold four synthetic PDFs each. Upload them in New Application to test real extraction and verification (regenerate with `python sample_documents/make_samples.py`).
- Run tests: `cd backend && python -m pytest -q` (the upload test needs `httpx` and the installed requirements).
- Optional AI: set `AI_API_KEY` in `backend/.env`. AI only fills fields the rules could not read, and a value is kept only if it appears word-for-word in the OCR text.
- Extra endpoints: `GET /api/applications/{id}/documents`, `POST /api/applications/{id}/documents/{type}` (upload or replace one document).
