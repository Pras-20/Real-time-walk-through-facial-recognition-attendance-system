from azure.storage.blob import BlobServiceClient
import os 

blob_conn=os.environ('BLOB_CONN_STRING')
blob_container=os.environ('BLOB_CONTAINER')

blob_service = BlobServiceClient.from_connection_string(blob_conn)

def upload_image(file_bytes, filename):
    blob_client = blob_service.get_blob_client(container=blob_container, blob=filename)
    blob_client.upload_blob(file_bytes, overwrite=True)