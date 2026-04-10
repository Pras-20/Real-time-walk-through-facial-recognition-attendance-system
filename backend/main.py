import os
import time
from datetime import datetime
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from face_service import (
    detect_face, detect_face_presence, identify_embedding,
    create_person, add_face_to_person,
    train_person_group, get_training_status,
    ensure_person_group,
)
from db_service import (
    ensure_tables_exist, mark_attendance,
    register_student, get_all_students, get_student_by_person_id,
    create_professor, get_professor_by_email,
    create_class, get_classes_by_professor,
    start_lecture, end_lecture, get_lecture_report, toggle_attendance,
    get_course_stats, get_lectures_by_class,
    get_attendance_stats, get_dashboard_summary
)
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from blob_service import upload_image


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Ensuring DB tables and Face API person group exist…")
    ensure_tables_exist()
    ensure_person_group()
    yield
    print("[shutdown] Shutting down.")


app = FastAPI(title="SmartAttend API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Authentication & Security ─────────────────────────────────────────

security = HTTPBearer()

def get_current_professor(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

@app.post("/api/auth/register")
def register_professor_api(req: RegisterRequest):
    pwd_hash = get_password_hash(req.password)
    ok, msg = create_professor(req.name, req.email, pwd_hash)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@app.post("/api/auth/login")
def login_professor_api(req: LoginRequest):
    prof = get_professor_by_email(req.email)
    if not prof or not verify_password(req.password, prof["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": prof["email"], "id": prof["id"], "name": prof["name"]})
    return {"access_token": token, "token_type": "bearer", "professor": {"id": prof["id"], "name": prof["name"], "email": prof["email"]}}

@app.get("/api/auth/me")
def get_me(prof: dict = Depends(get_current_professor)):
    return prof


# ── Classes & Schedules ───────────────────────────────────────────────

class ClassCreate(BaseModel):
    course_name: str
    schedule_info: str

@app.post("/api/classes")
def add_class(req: ClassCreate, prof: dict = Depends(get_current_professor)):
    ok, msg = create_class(prof["id"], req.course_name, req.schedule_info)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@app.get("/api/classes")
def list_classes(prof: dict = Depends(get_current_professor)):
    return get_classes_by_professor(prof["id"])

@app.get("/api/classes/{class_id}/lectures")
def list_lectures(class_id: int, prof: dict = Depends(get_current_professor)):
    return get_lectures_by_class(class_id)

# ── Lectures & Live Sessions ──────────────────────────────────────────

class LectureStart(BaseModel):
    class_id: int
    date: str
    time: str

@app.post("/api/lectures/start")
def api_start_lecture(req: LectureStart, prof: dict = Depends(get_current_professor)):
    lec_id = start_lecture(req.class_id, req.date, req.time)
    if not lec_id:
        raise HTTPException(status_code=400, detail="Failed to start lecture")
    return {"lecture_id": lec_id}

@app.post("/api/lectures/{lecture_id}/end")
def api_end_lecture(lecture_id: int, prof: dict = Depends(get_current_professor)):
    ts = datetime.now().strftime("%H:%M:%S")
    end_lecture(lecture_id, ts)
    return {"message": "Lecture ended"}

# ── Manual Attendance & Reports ───────────────────────────────────────

class ManualOverride(BaseModel):
    person_id: str
    lecture_id: int
    present: bool

@app.post("/api/attendance/manual")
def api_manual_attendance(req: ManualOverride, prof: dict = Depends(get_current_professor)):
    ok = toggle_attendance(req.person_id, req.lecture_id, req.present)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to toggle attendance")
    return {"status": "success"}

@app.get("/api/reports/lectures/{lecture_id}")
def api_lecture_report(lecture_id: int, prof: dict = Depends(get_current_professor)):
    report = get_lecture_report(lecture_id)
    return {"report": report}

@app.get("/api/reports/courses/{course_name}")
def api_course_report(course_name: str, prof: dict = Depends(get_current_professor)):
    stats = get_course_stats(course_name)
    return {"stats": stats}


# ── Health ────────────────────────────────────────────────────────────

@app.get("/api/dashboard/stats")
async def api_dashboard_stats(prof: dict = Depends(get_current_professor)):
    return get_attendance_stats(prof["id"])

@app.get("/api/dashboard/summary")
async def api_dashboard_summary(prof: dict = Depends(get_current_professor)):
    return get_dashboard_summary(prof["id"])

@app.get("/")
def health():
    return {"status": "ok", "message": "SmartAttend API is running."}


# ── Presence Detection (fast poll) ────────────────────────────────────

@app.post("/api/detect-presence")
async def detect_presence(frame: UploadFile = File(...)):
    """
    Quick single-frame check: is a face present?
    Used by the frontend to decide when to start the countdown.
    """
    image_bytes = await frame.read()
    present = detect_face_presence(image_bytes)
    return {"face_detected": present}


# ── Attendance Recognition (multi-frame) ──────────────────────────────

@app.post("/api/recognize")
async def recognize(
    frames: List[UploadFile] = File(...),
    lecture_id: int = Form(...)
):
    """
    Multi-frame liveness + identification + attendance marking.
    """
    matches: list[str] = []
    last_frame_bytes: bytes | None = None

    for file in frames:
        image_bytes = await file.read()
        last_frame_bytes = image_bytes

        embedding = detect_face(image_bytes)
        if not embedding:
            continue

        person_id = identify_embedding(embedding)
        if person_id:
            matches.append(person_id)

    if not matches or len(matches) < 2:
        raise HTTPException(
            status_code=400,
            detail="Face not detected consistently. Please look directly at the camera."
        )

    most_common = max(set(matches), key=matches.count)
    if matches.count(most_common) < 2:
        raise HTTPException(
            status_code=400,
            detail="Inconsistent identity across frames. Possible spoofing."
        )

    person = most_common

    # Lookup student info from DB (show name instead of raw UUID)
    student_info = get_student_by_person_id(person)
    display_name = student_info["name"] if student_info else person
    student_id_str = student_info["student_id"] if student_info else "Unknown"

    # Mark attendance
    newly_marked, message = mark_attendance(person, lecture_id)

    # Upload frame to Blob for audit (only fresh marks)
    if newly_marked and last_frame_bytes:
        ts = str(int(time.time()))
        upload_image(last_frame_bytes, f"{person}-{ts}.jpg")

    return {
        "status": "success",
        "message": message,
        "personId": person,
        "name": display_name,
        "studentId": student_id_str,
        "newly_marked": newly_marked,
    }


# ── Student Registration ───────────────────────────────────────────────

@app.post("/api/register")
async def register(
    student_id: str = Form(...),
    name: str = Form(...),
    course: str = Form(""),
    photos: List[UploadFile] = File(...),
):
    """
    Register a new student:
    1. Create person in Azure Face API
    2. Add all uploaded photos as faces
    3. Trigger person group training
    4. Store student record in Azure SQL
    """
    if len(photos) < 3:
        raise HTTPException(status_code=400, detail="Please provide at least 3 photos.")

    # 1. Create person
    person_id = create_person(f"{name} ({student_id})")
    if not person_id:
        raise HTTPException(status_code=500, detail="Failed to create person in Azure Face API.")

    # 2. Add photos as faces
    added = 0
    for photo in photos:
        img_bytes = await photo.read()
        success = add_face_to_person(person_id, img_bytes)
        if success:
            added += 1
            # Also archive photos in Blob
            ts = str(int(time.time()))
            upload_image(img_bytes, f"registrations/{student_id}-{ts}.jpg")

    if added == 0:
        raise HTTPException(status_code=400, detail="No valid face photos could be added. Ensure clear frontal photos.")

    # 3. Trigger training
    train_person_group()

    # 4. Save to DB
    db_ok, db_msg = register_student(person_id, student_id, name, course)
    if not db_ok:
        raise HTTPException(status_code=409, detail=db_msg)

    return {
        "status": "success",
        "message": f"Registered '{name}' with {added} photos. Training triggered.",
        "personId": person_id,
        "photosAdded": added,
    }


@app.get("/api/training-status")
def training_status():
    return get_training_status()


@app.get("/api/students")
def list_students():
    return get_all_students()
