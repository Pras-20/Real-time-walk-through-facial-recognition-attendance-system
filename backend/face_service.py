
import os 
import json,requests

region=os.environ['ACCOUNT_REGION']
key=os.environ['AZURE_FACE_APIKEY']
endpoint=os.environ['AZURE_FACE_ENDPOINT']
persongroup_id=os.eviron['PERSON_GROUP_ID']


headers = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "application/octet-stream"
}

def detect_face(image_bytes):
    url = f"{endpoint}/face/v1.0/detect?returnFaceId=true"
    response = requests.post(url, headers=headers, data=image_bytes)
    faces = response.json()
    return faces[0]["faceId"] if faces else None


def identify_face(face_id):
    url = f"{endpoint}/face/v1.0/identify"
    body = {
        "personGroupId": persongroup_id,
        "faceIds": [face_id],
        "maxNumOfCandidatesReturned": 1,
        "confidenceThreshold": 0.6
    }

    response = requests.post(url, headers={
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json"
    }, json=body)

    result = response.json()

    if result and result[0]["candidates"]:
        return result[0]["candidates"][0]["personId"]

    return None

    
