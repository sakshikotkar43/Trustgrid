"""Generates sample_data/demo.json from fixed fictional data. Run: python seed.py"""
import json, os
from validation import run_checks
TODAY = "2026-10-22"

def doc(name, **fields):
    return {"filename": name, "file": False, "synthetic": True, "fields": fields}

def build(aid, inst, prog, submitted, docs, review):
    return {"id": aid, "institution": inst, "program": prog, "submitted": submitted, "review": review,
            "notes": "", "documents": docs, "findings": run_checks(docs, TODAY)}

a_docs = {
 "application": doc("sunrise_application_form.pdf", institution_name="Sunrise Institute of Technology", registration_number="REG-MH-2019-04521", address="Plot 14, Knowledge Park, Pune, Maharashtra", program="B.Tech Computer Science", representative="Dr. Anita Deshmukh"),
 "registration": doc("sunrise_registration.pdf", institution_name="Sunrise Institute of Technology", registration_number="REG-MH-2019-04521", issue_date="2019-04-12"),
 "building": doc("sunrise_building_completion.pdf", institution_name="Sunrise Institute of Technology", issue_date="2024-01-15"),
 "fire": doc("sunrise_fire_safety.pdf", institution_name="Sunrise Institute of Technology", issue_date="2026-03-01", valid_until="2027-02-28")}
b_docs = {
 "application": doc("lakeview_application_form.pdf", institution_name="Lakeview College of Engineering", registration_number="REG-MH-2018-07733", address="12 Lake Road, Nashik, Maharashtra", program="B.Tech Mechanical Engineering", representative=""),
 "registration": doc("lakeview_registration.pdf", institution_name="Lakeview College of Engineering", registration_number="REG-MH-2018-07737", issue_date="2018-08-20"),
 "building": doc("lakeview_building_completion.pdf", institution_name="Lakeview College of Engineering", issue_date="2023-05-02"),
 "fire": doc("lakeview_fire_safety.pdf", institution_name="Lakeview College of Engineering", issue_date="2025-06-10", valid_until="2026-06-09")}
apps = [build("TG-2026-0001", "Sunrise Institute of Technology", "B.Tech Computer Science", "2026-10-02", a_docs, "Pending review"),
        build("TG-2026-0002", "Lakeview College of Engineering", "B.Tech Mechanical Engineering", "2026-10-09", b_docs, "Pending review")]
path = os.path.join(os.path.dirname(__file__), "..", "sample_data", "demo.json")
json.dump({"apps": apps}, open(path, "w"), indent=1, ensure_ascii=False)
json.dump({"apps": apps}, open(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "demo.json"), "w"), indent=1, ensure_ascii=False)
print("wrote", path)
