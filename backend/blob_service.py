import os
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv

load_dotenv()

BLOB_CONN_STRING = os.environ.get("BLOB_CONN_STRING")
BLOB_CONTAINER = os.environ.get("BLOB_CONTAINER", "attendance-audits")

_blob_service_client = None


def _get_blob_service():
    global _blob_service_client
    if _blob_service_client is None:
        _blob_service_client = BlobServiceClient.from_connection_string(BLOB_CONN_STRING)
    return _blob_service_client


def upload_image(file_bytes: bytes, filename: str) -> bool:
    """
    Uploads a JPEG frame to Azure Blob Storage under the attendance-audits container.
    Returns True on success, False on failure.
    """
    try:
        client = _get_blob_service()
        # Auto-create container if it doesn't exist
        container_client = client.get_container_client(BLOB_CONTAINER)
        try:
            container_client.get_container_properties()
        except Exception:
            container_client.create_container()

        blob_path = f"attendance-audits/{filename}"
        blob_client = client.get_blob_client(container=BLOB_CONTAINER, blob=blob_path)
        blob_client.upload_blob(file_bytes, overwrite=True)
        print(f"[blob_service] Uploaded {blob_path} to Azure Blob Storage.")
        return True
    except Exception as e:
        print(f"[blob_service] upload_image error: {e}")
        return False