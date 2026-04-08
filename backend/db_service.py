import os
import pyodbc
from datetime import date
from dotenv import load_dotenv

load_dotenv()

SQL_CONNECTION_STRING = os.environ.get("SQL_CONNECTION_STRING")


def get_connection():
    conn_str = SQL_CONNECTION_STRING
    if not conn_str:
        raise ValueError("SQL_CONNECTION_STRING is missing.")
    if "DRIVER=" not in conn_str.upper():
        drivers = pyodbc.drivers()
        preferred = next((d for d in drivers if 'SQL Server' in d), None)
        if preferred:
            conn_str = f"DRIVER={{{preferred}}};" + conn_str
        else:
            raise Exception("No SQL Server ODBC driver found on the system. Please install one.")
    return pyodbc.connect(conn_str)



def register_student(person_id: str, student_id: str, name: str, course: str) -> tuple[bool, str]:
    """Store student registration info in the DB."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Check if already registered
        cursor.execute("SELECT COUNT(*) FROM students WHERE student_id = ?", (student_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False, f"Student ID '{student_id}' is already registered."
        cursor.execute(
            "INSERT INTO students (person_id, student_id, name, course) VALUES (?, ?, ?, ?)",
            (person_id, student_id, name, course)
        )
        conn.commit()
        conn.close()
        return True, f"Student '{name}' registered successfully."
    except Exception as e:
        print(f"[db_service] register_student error: {e}")
        return False, f"Database error: {str(e)}"


def get_all_students() -> list[dict]:
    """Return all registered students."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT person_id, student_id, name, course, registered_at FROM students ORDER BY registered_at DESC"
        )
        rows = cursor.fetchall()
        conn.close()
        return [
            {
                "person_id": r[0],
                "student_id": r[1],
                "name": r[2],
                "course": r[3],
                "registered_at": str(r[4]) if r[4] else None,
            }
            for r in rows
        ]
    except Exception as e:
        print(f"[db_service] get_all_students error: {e}")
        return []


def get_student_by_person_id(person_id: str) -> dict | None:
    """Lookup a student's name/ID by their Azure person_id."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT person_id, student_id, name, course FROM students WHERE person_id = ?",
            (person_id,)
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return {"person_id": row[0], "student_id": row[1], "name": row[2], "course": row[3]}
    except Exception as e:
        print(f"[db_service] get_student_by_person_id error: {e}")
    return None


def mark_attendance(person_id: str) -> tuple[bool, str]:
    """Mark attendance if not already marked today. Returns (newly_marked, message)."""
    today = date.today().isoformat()
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM attendance WHERE person_id = ? AND marked_date = ?",
            (person_id, today)
        )
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False, "Attendance already marked for today."
        cursor.execute(
            "INSERT INTO attendance (person_id, marked_date) VALUES (?, ?)",
            (person_id, today)
        )
        conn.commit()
        conn.close()
        return True, "Attendance marked successfully!"
    except Exception as e:
        print(f"[db_service] mark_attendance error: {e}")
        return False, f"Database error: {str(e)}"

# ── Add to db_service.py ──────────────────────────────────────────────

def ensure_tables_exist():
    """Create attendance, students, and face_embeddings tables."""
    attendance_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='attendance' AND xtype='U')
    CREATE TABLE attendance (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        person_id   VARCHAR(100) NOT NULL,
        marked_date DATE         NOT NULL,
        timestamp   DATETIME     DEFAULT GETDATE()
    )"""
    students_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='students' AND xtype='U')
    CREATE TABLE students (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        person_id    VARCHAR(100) NOT NULL UNIQUE,
        student_id   VARCHAR(50)  NOT NULL,
        name         VARCHAR(200) NOT NULL,
        course       VARCHAR(200),
        registered_at DATETIME    DEFAULT GETDATE()
    )"""
    embeddings_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='face_embeddings' AND xtype='U')
    CREATE TABLE face_embeddings (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        person_id   VARCHAR(100) NOT NULL,
        embedding   NVARCHAR(MAX) NOT NULL,   -- 128-d JSON array
        created_at  DATETIME DEFAULT GETDATE()
    )"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(attendance_sql)
        cursor.execute(students_sql)
        cursor.execute(embeddings_sql)
        conn.commit()
        conn.close()
        print("[db_service] Tables are ready.")
    except Exception as e:
        print(f"[db_service] ensure_tables_exist error: {e}")


def save_embedding(person_id: str, embedding: list[float]) -> bool:
    """Persist one 128-d face embedding for a person."""
    import json
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO face_embeddings (person_id, embedding) VALUES (?, ?)",
            (person_id, json.dumps(embedding))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[db_service] save_embedding error: {e}")
        return False


def get_all_embeddings() -> list[tuple[str, str]]:
    """Return all (person_id, embedding_json) rows."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT person_id, embedding FROM face_embeddings")
        rows = cursor.fetchall()
        conn.close()
        return [(r[0], r[1]) for r in rows]
    except Exception as e:
        print(f"[db_service] get_all_embeddings error: {e}")
        return []