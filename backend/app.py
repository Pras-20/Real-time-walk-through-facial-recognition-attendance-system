from flask import Flask, request, jsonify
from face_service import detect_face, identify_face
from db_service import mark_attendance

app = Flask(__name__)

@app.route("/recognize", methods=["POST"])
def recognize():
    files = request.files.getlist("frames")

    matches = []

    for file in files:
        image_bytes = file.read()

        face_id = detect_face(image_bytes)
        if not face_id:
            continue

        person_id = identify_face(face_id)
        if person_id:
            matches.append(person_id)

    # 🔥 Multi-frame validation (liveness layer)
    if len(matches) >= 2 and matches.count(matches[0]) >= 2:
        person = matches[0]
        mark_attendance(person)

        return jsonify({
            "status": "success",
            "personId": person
        })

    return jsonify({
        "status": "failed",
        "message": "Liveness check failed / face not consistent"
    })


if __name__ == "__main__":
    app.run(debug=True)