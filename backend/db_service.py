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


def mark_attendance(person_id: str, lecture_id: int) -> tuple[bool, str]:
    """Mark attendance if not already marked for this lecture. Returns (newly_marked, message)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM attendance WHERE person_id = ? AND lecture_id = ?",
            (person_id, lecture_id)
        )
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False, "Attendance already marked for this lecture."
        cursor.execute(
            "INSERT INTO attendance (person_id, lecture_id) VALUES (?, ?)",
            (person_id, lecture_id)
        )
        conn.commit()
        conn.close()
        return True, "Attendance marked successfully!"
    except Exception as e:
        print(f"[db_service] mark_attendance error: {e}")
        return False, f"Database error: {str(e)}"

# ── Add to db_service.py ──────────────────────────────────────────────

def ensure_tables_exist():
    """Create the expanded scale-up schema."""
    professors_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='professors' AND xtype='U')
    CREATE TABLE professors (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        password_hash VARCHAR(500) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    )"""
    classes_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='classes' AND xtype='U')
    CREATE TABLE classes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        professor_id INT NOT NULL FOREIGN KEY REFERENCES professors(id),
        course_name VARCHAR(200) NOT NULL,
        schedule_info VARCHAR(200),
        created_at DATETIME DEFAULT GETDATE()
    )"""
    lectures_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='lectures' AND xtype='U')
    CREATE TABLE lectures (
        id INT IDENTITY(1,1) PRIMARY KEY,
        class_id INT NOT NULL FOREIGN KEY REFERENCES classes(id),
        date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        created_at DATETIME DEFAULT GETDATE()
    )"""
    students_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='students' AND xtype='U')
    CREATE TABLE students (
        id INT IDENTITY(1,1) PRIMARY KEY,
        person_id VARCHAR(100) NOT NULL UNIQUE,
        student_id VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        course VARCHAR(200),
        registered_at DATETIME DEFAULT GETDATE()
    )"""
    attendance_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='attendance' AND xtype='U')
    CREATE TABLE attendance (
        id INT IDENTITY(1,1) PRIMARY KEY,
        person_id VARCHAR(100) NOT NULL,
        lecture_id INT NOT NULL FOREIGN KEY REFERENCES lectures(id),
        timestamp DATETIME DEFAULT GETDATE()
    )"""
    embeddings_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='face_embeddings' AND xtype='U')
    CREATE TABLE face_embeddings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        person_id VARCHAR(100) NOT NULL,
        embedding NVARCHAR(MAX) NOT NULL,   -- 128-d JSON array
        created_at DATETIME DEFAULT GETDATE()
    )"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(professors_sql)
        cursor.execute(classes_sql)
        cursor.execute(lectures_sql)
        cursor.execute(students_sql)
        cursor.execute(attendance_sql)
        cursor.execute(embeddings_sql)
        conn.commit()
        conn.close()
        print("[db_service] Scaled-up tables are ready.")
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

# ── Authentication & Professor Queries ────────────────────────────────

def get_professor_by_email(email: str) -> dict | None:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, password_hash FROM professors WHERE email = ?", (email,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {"id": row[0], "name": row[1], "email": row[2], "password_hash": row[3]}
        return None
    except Exception as e:
        print(f"[db_service] get_professor_by_email error: {e}")
        return None

def create_professor(name: str, email: str, password_hash: str) -> tuple[bool, str]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM professors WHERE email = ?", (email,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False, "Professor with this email already exists."
        
        cursor.execute(
            "INSERT INTO professors (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash)
        )
        conn.commit()
        conn.close()
        return True, "Registered successfully."
    except Exception as e:
        print(f"[db_service] create_professor error: {e}")
        return False, f"Database error: {str(e)}"

# ── Classes & Lectures Queries ──────────────────────────────────────

def create_class(professor_id: int, course_name: str, schedule_info: str):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO classes (professor_id, course_name, schedule_info) VALUES (?, ?, ?)",
            (professor_id, course_name, schedule_info)
        )
        conn.commit()
        conn.close()
        return True, "Class created"
    except Exception as e:
        return False, str(e)

def get_classes_by_professor(professor_id: int):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, course_name, schedule_info FROM classes WHERE professor_id = ?", (professor_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "course_name": r[1], "schedule_info": r[2]} for r in rows]
    except Exception:
        return []

def start_lecture(class_id: int, date_str: str, time_str: str):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO lectures (class_id, date, start_time) OUTPUT INSERTED.id VALUES (?, ?, ?)",
            (class_id, date_str, time_str)
        )
        lecture_id = cursor.fetchone()[0]
        conn.commit()
        conn.close()
        return lecture_id
    except Exception as e:
        print(f"Error starting lecture: {e}")
        return None

def end_lecture(lecture_id: int, end_time_str: str):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE lectures SET end_time = ? WHERE id = ?", (end_time_str, lecture_id))
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False

def get_lecture_report(lecture_id: int):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Get target course
        cursor.execute("SELECT c.course_name FROM lectures l JOIN classes c ON l.class_id = c.id WHERE l.id = ?", (lecture_id,))
        row = cursor.fetchone()
        if not row: return []
        course_name = row[0]
        
        # Get all students in that course
        cursor.execute("SELECT person_id, student_id, name FROM students WHERE course = ?", (course_name,))
        enrolled = cursor.fetchall()
        
        # Get all attendance marked for this lecture
        cursor.execute("SELECT person_id, timestamp FROM attendance WHERE lecture_id = ?", (lecture_id,))
        attended_rows = cursor.fetchall()
        attended_map = {r[0]: r[1] for r in attended_rows}
        
        conn.close()
        report = []
        for s in enrolled:
            pid = s[0]
            report.append({
                "person_id": pid,
                "student_id": s[1],
                "name": s[2],
                "present": pid in attended_map,
                "timestamp": str(attended_map[pid]) if pid in attended_map else None
            })
        return report
    except Exception as e:
        print(f"Report error: {e}")
        return []

def toggle_attendance(person_id: str, lecture_id: int, present: bool):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        if present:
            cursor.execute("SELECT COUNT(*) FROM attendance WHERE person_id = ? AND lecture_id = ?", (person_id, lecture_id))
            if cursor.fetchone()[0] == 0:
                cursor.execute("INSERT INTO attendance (person_id, lecture_id) VALUES (?, ?)", (person_id, lecture_id))
        else:
            cursor.execute("DELETE FROM attendance WHERE person_id = ? AND lecture_id = ?", (person_id, lecture_id))
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False

def get_course_stats(course_name: str):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get all students in the course
        cursor.execute("SELECT person_id, student_id, name FROM students WHERE course = ?", (course_name,))
        students = cursor.fetchall()
        
        # Get count of total lectures for this course
        cursor.execute("SELECT COUNT(*) FROM lectures l JOIN classes c ON l.class_id = c.id WHERE c.course_name = ?", (course_name,))
        total_lectures = cursor.fetchone()[0]
        
        if total_lectures == 0:
            return [{"name": s[2], "student_id": s[1], "percentage": 0, "present": 0, "total": 0} for s in students]
            
        stats = []
        for s in students:
            pid = s[0]
            # Get count of attended lectures for this student in this course
            cursor.execute("""
                SELECT COUNT(DISTINCT a.lecture_id) 
                FROM attendance a 
                JOIN lectures l ON a.lecture_id = l.id
                JOIN classes c ON l.class_id = c.id
                WHERE a.person_id = ? AND c.course_name = ?
            """, (pid, course_name))
            attended = cursor.fetchone()[0]
            percentage = round((attended / total_lectures) * 100, 1)
            stats.append({
                "name": s[2],
                "student_id": s[1],
                "percentage": percentage,
                "present": attended,
                "total": total_lectures
            })
            
        conn.close()
        return stats
    except Exception as e:
        print(f"Stats error: {e}")
        return []

def get_lectures_by_class(class_id: int):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, date, start_time, end_time FROM lectures WHERE class_id = ? ORDER BY created_at DESC", (class_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "date": str(r[1]), "start_time": str(r[2]), "end_time": str(r[3])} for r in rows]
    except Exception as e:
        print(f"Error fetching lectures: {e}")
        return []

def get_attendance_stats(professor_id: int):
    """Returns attendance counts per day for the last 14 days for the specific professor's classes."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        query = """
            SELECT l.date, COUNT(a.person_id) as present_count
            FROM lectures l
            JOIN classes c ON l.class_id = c.id
            LEFT JOIN attendance a ON l.id = a.lecture_id
            WHERE c.professor_id = ? AND l.date >= DATEADD(day, -14, GETDATE())
            GROUP BY l.date
            ORDER BY l.date ASC
        """
        cursor.execute(query, (professor_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{"date": str(r[0]), "count": r[1]} for r in rows]
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return []

def get_dashboard_summary(professor_id: int):
    """Returns professor-specific high-level stats for the dashboard cards."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # 1. Total unique students in classes taught by this professor
        cursor.execute("""
            SELECT COUNT(DISTINCT s.person_id) 
            FROM students s
            JOIN classes c ON s.course = c.course_name
            WHERE c.professor_id = ?
        """, (professor_id,))
        total_students = cursor.fetchone()[0]
        
        # 2. Total classes for this professor
        cursor.execute("SELECT COUNT(*) FROM classes WHERE professor_id = ?", (professor_id,))
        total_classes = cursor.fetchone()[0]
        
        # 3. Lectures happening today for this professor
        cursor.execute("""
            SELECT COUNT(*) 
            FROM lectures l 
            JOIN classes c ON l.class_id = c.id
            WHERE c.professor_id = ? AND l.date = CAST(GETDATE() AS DATE)
        """, (professor_id,))
        lectures_today = cursor.fetchone()[0]
        
        # 4. Attendance count for today's lectures of this professor
        cursor.execute("""
            SELECT COUNT(*) 
            FROM attendance a 
            JOIN lectures l ON a.lecture_id = l.id 
            JOIN classes c ON l.class_id = c.id
            WHERE c.professor_id = ? AND l.date = CAST(GETDATE() AS DATE)
        """, (professor_id,))
        present_today = cursor.fetchone()[0]
        
        conn.close()
        return {
            "total_students": total_students,
            "total_classes": total_classes,
            "lectures_today": lectures_today,
            "present_today": present_today
        }
    except Exception as e:
        print(f"Error summary: {e}")
        return {
            "total_students": 0, "total_classes": 0, "lectures_today": 0, "present_today": 0
        }