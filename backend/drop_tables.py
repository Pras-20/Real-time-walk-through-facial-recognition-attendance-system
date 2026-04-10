import os
import pyodbc
from dotenv import load_dotenv

load_dotenv('../.env')

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

def main():
    drop_sql = """
    IF OBJECT_ID('face_embeddings', 'U') IS NOT NULL DROP TABLE face_embeddings;
    IF OBJECT_ID('attendance', 'U') IS NOT NULL DROP TABLE attendance;
    IF OBJECT_ID('lectures', 'U') IS NOT NULL DROP TABLE lectures;
    IF OBJECT_ID('classes', 'U') IS NOT NULL DROP TABLE classes;
    IF OBJECT_ID('professors', 'U') IS NOT NULL DROP TABLE professors;
    IF OBJECT_ID('students', 'U') IS NOT NULL DROP TABLE students;
    """
    conn = get_connection()
    cur = conn.cursor()
    print("Dropping tables...")
    cur.execute(drop_sql)
    conn.commit()
    conn.close()
    print("Tables dropped successfully.")

if __name__ == "__main__":
    main()
