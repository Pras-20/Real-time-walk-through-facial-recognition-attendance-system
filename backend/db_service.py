import pyodbc
import os 
sql_connection=os.environ('SQL_CONNECTION_STRING')
conn = pyodbc.connect(sql_connection)
cursor = conn.cursor()

def mark_attendance(person_id):
    query = "INSERT INTO attendance (person_id, timestamp) VALUES (?, GETDATE())"
    cursor.execute(query, (person_id,))
    conn.commit()