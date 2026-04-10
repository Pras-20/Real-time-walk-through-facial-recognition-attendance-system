"""
Centralized config — reads from .env via load_dotenv().
All service modules import directly from os.environ after calling load_dotenv().
This file is kept for any shared configuration constants.
"""
import os
from dotenv import load_dotenv

load_dotenv()

FACE_KEY = os.environ.get("FACE_KEY")
FACE_ENDPOINT = os.environ.get("FACE_ENDPOINT", "").rstrip("/")
ACCOUNT_REGION = os.environ.get("ACCOUNT_REGION", "centralindia")
PERSON_GROUP_ID = os.environ.get("PERSON_GROUP_ID", "").strip("'\"")

BLOB_CONN_STRING = os.environ.get("BLOB_CONN_STRING")
BLOB_CONTAINER = os.environ.get("BLOB_CONTAINER", "attendance-audits")

SQL_CONNECTION_STRING = os.environ.get("SQL_CONNECTION_STRING")
