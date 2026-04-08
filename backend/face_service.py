# face_service.py  –  local embedding-based recognition (no Azure Face API limits)
import os
import json
import io
import numpy as np
import face_recognition
from db_service import (
    get_all_embeddings,
    save_embedding,
    get_student_by_person_id,
)

SIMILARITY_THRESHOLD = float(os.environ.get("FACE_THRESHOLD", "0.5"))  # lower = stricter


# ── Detection ────────────────────────────────────────────────────────

def detect_face_presence(image_bytes: bytes) -> bool:
    """Quick check: is any face present in this frame?"""
    try:
        img = _load_image(image_bytes)
        locs = face_recognition.face_locations(img, model="hog")
        return len(locs) > 0
    except Exception as e:
        print(f"[face_service] detect_face_presence error: {e}")
        return False


def get_face_embedding(image_bytes: bytes) -> list[float] | None:
    """Return 128-d face embedding for the first face found, or None."""
    try:
        img = _load_image(image_bytes)
        locs = face_recognition.face_locations(img, model="hog")
        if not locs:
            return None
        encs = face_recognition.face_encodings(img, known_face_locations=locs)
        return encs[0].tolist() if encs else None
    except Exception as e:
        print(f"[face_service] get_face_embedding error: {e}")
        return None


# ── Identification ────────────────────────────────────────────────────

def identify_embedding(embedding: list[float]) -> str | None:
    """
    Compare a 128-d embedding against all stored embeddings.
    Returns person_id of the closest match, or None if below threshold.
    """
    rows = get_all_embeddings()   # list of (person_id, embedding_json)
    if not rows:
        return None

    query = np.array(embedding)
    best_person_id = None
    best_distance = float("inf")

    for person_id, emb_json in rows:
        stored = np.array(json.loads(emb_json))
        dist = np.linalg.norm(query - stored)
        if dist < best_distance:
            best_distance = dist
            best_person_id = person_id

    print(f"[face_service] Best match: {best_person_id}  distance={best_distance:.4f}")
    return best_person_id if best_distance <= SIMILARITY_THRESHOLD else None


# ── Registration helpers ──────────────────────────────────────────────

def register_face_embeddings(person_id: str, photos: list[bytes]) -> int:
    """
    Extract and persist one embedding per photo.
    Returns number of embeddings saved.
    """
    saved = 0
    for img_bytes in photos:
        emb = get_face_embedding(img_bytes)
        if emb:
            save_embedding(person_id, emb)
            saved += 1
    return saved


# ── Internal helpers ──────────────────────────────────────────────────

def _load_image(image_bytes: bytes):
    """Load raw bytes into a face_recognition-compatible RGB array."""
    from PIL import Image
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(pil_img)


# ── Stubs kept for backward compatibility (no-ops) ────────────────────

def ensure_person_group():
    print("[face_service] Local embeddings mode — no Azure person group needed.")

def detect_face(image_bytes: bytes):
    return get_face_embedding(image_bytes)   # reuse

def create_person(display_name: str) -> str:
    import uuid
    return str(uuid.uuid4())   # generate local person_id

def add_face_to_person(person_id: str, image_bytes: bytes) -> bool:
    emb = get_face_embedding(image_bytes)
    if emb:
        save_embedding(person_id, emb)
        return True
    return False

def train_person_group() -> bool:
    return True   # no training needed for cosine/L2 matching

def get_training_status() -> dict:
    rows = get_all_embeddings()
    return {"status": "ready", "stored_embeddings": len(rows)}