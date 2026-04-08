import pyodbc, os
from dotenv import load_dotenv
load_dotenv('../.env')

drivers = pyodbc.drivers()
preferred = next((d for d in drivers if 'SQL Server' in d), None)
if not preferred:
    print('No SQL Server ODBC drivers installed!')
    exit(1)

base_conn = os.environ.get('SQL_CONNECTION_STRING')
# Add DRIVER to connection string if missing
if 'DRIVER=' not in base_conn:
    conn_str = f'DRIVER={{{preferred}}};{base_conn}'
else:
    conn_str = base_conn

print(f'Attempting connection with Driver: {preferred} ...')

try:
    conn = pyodbc.connect(conn_str, timeout=5)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sys.tables")
    tables = [row[0] for row in cursor.fetchall()]
    
    print('Tables found in Azure SQL:')
    for t in tables:
        print(' -', t)
    if not tables:
        print(' No tables found (schema is empty).')
except Exception as e:
    print('Connection failed:', e)
