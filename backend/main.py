import os
import time
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
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
)
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


# ── Health ────────────────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "message": "SmartAttend API is running."}


# ── Presence Detection (fast poll) ────────────────────────────────────

@app.post("/detect-presence")
async def detect_presence(frame: UploadFile = File(...)):
    """
    Quick single-frame check: is a face present?
    Used by the frontend to decide when to start the countdown.
    """
    image_bytes = await frame.read()
    present = detect_face_presence(image_bytes)
    return {"face_detected": present}


# ── Attendance Recognition (multi-frame) ──────────────────────────────

@app.post("/recognize")
async def recognize(frames: List[UploadFile] = File(...)):
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
    newly_marked, message = mark_attendance(person)

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

@app.post("/register")
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


@app.get("/training-status")
def training_status():
    return get_training_status()


@app.get("/students")
def list_students():
    return get_all_students()
