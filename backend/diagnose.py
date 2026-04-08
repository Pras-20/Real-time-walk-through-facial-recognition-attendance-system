import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv('../.env')

FACE_KEY        = os.environ.get('FACE_KEY', '')
FACE_ENDPOINT   = os.environ.get('FACE_ENDPOINT', '').rstrip('/')
PERSON_GROUP_ID = os.environ.get('PERSON_GROUP_ID', '').strip("'\"")

headers_json = {'Ocp-Apim-Subscription-Key': FACE_KEY, 'Content-Type': 'application/json'}

print("="*50)
print("ENV CHECK")
print("="*50)
print(f"FACE_KEY      : {FACE_KEY[:15]}...")
print(f"FACE_ENDPOINT : {FACE_ENDPOINT}")
print(f"PERSON_GROUP  : {PERSON_GROUP_ID}")

print()
print("="*50)
print("AZURE FACE API TESTS")
print("="*50)

# 1. List all person groups
r = requests.get(f'{FACE_ENDPOINT}/face/v1.0/persongroups', headers=headers_json, timeout=10)
print(f"[1] List groups  -> {r.status_code}: {r.text[:400]}")

# 2. Get specific group
r = requests.get(f'{FACE_ENDPOINT}/face/v1.0/persongroups/{PERSON_GROUP_ID}', headers=headers_json, timeout=10)
print(f"[2] Get group    -> {r.status_code}: {r.text[:400]}")

# 3. Try to create/update the group
r = requests.put(f'{FACE_ENDPOINT}/face/v1.0/persongroups/{PERSON_GROUP_ID}',
                 headers=headers_json,
                 json={"name": PERSON_GROUP_ID, "recognitionModel": "recognition_04"},
                 timeout=10)
print(f"[3] Create group -> {r.status_code}: {r.text[:400]}")

# 4. Try to create a test person
r = requests.post(f'{FACE_ENDPOINT}/face/v1.0/persongroups/{PERSON_GROUP_ID}/persons',
                  headers=headers_json,
                  json={"name": "TEST_PERSON_DELETEME"},
                  timeout=10)
print(f"[4] Create person-> {r.status_code}: {r.text[:400]}")
if r.status_code == 200:
    pid = r.json().get('personId')
    # Clean up test person
    requests.delete(f'{FACE_ENDPOINT}/face/v1.0/persongroups/{PERSON_GROUP_ID}/persons/{pid}',
                    headers=headers_json, timeout=10)
    print(f"    Test person cleaned up (id={pid})")

# 5. SQL check
print()
print("="*50)
print("AZURE SQL TEST")
print("="*50)

SQL_CONN = os.environ.get('SQL_CONNECTION_STRING', '')
print(f"SQL_CONN raw: {SQL_CONN[:80]}...")

try:
    import pyodbc
    drivers = pyodbc.drivers()
    print(f"Available ODBC drivers: {drivers}")
    
    # Build pyodbc connection string
    if 'DRIVER=' not in SQL_CONN:
        preferred = next((d for d in drivers if 'SQL Server' in d), None)
        if preferred:
            pyodbc_conn = f"DRIVER={{{preferred}}};{SQL_CONN}"
        else:
            print("ERROR: No SQL Server ODBC driver installed!")
            print("Install from: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server")
            sys.exit(1)
    else:
        pyodbc_conn = SQL_CONN
    
    print(f"Connecting with: {pyodbc_conn[:80]}...")
    conn = pyodbc.connect(pyodbc_conn, timeout=10)
    print("SQL CONNECTION: SUCCESS")
    conn.close()
except Exception as e:
    print(f"SQL ERROR: {e}")
