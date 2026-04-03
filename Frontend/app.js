const video = document.getElementById("video");

navigator.mediaDevices
  .getUserMedia({ video: true })
  .then((stream) => (video.srcObject = stream));

function captureFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg");
  });
}

async function capture() {
  const formData = new FormData();

  // 🔥 capture 3 frames (multi-frame liveness)
  for (let i = 0; i < 3; i++) {
    const frame = await captureFrame();
    formData.append("frames", frame);
    await new Promise((r) => setTimeout(r, 300));
  }

  const res = await fetch("http://127.0.0.1:5000/recognize", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  alert(JSON.stringify(data));
}
