import type { GpsObservation } from "../../../../packages/domain/src/inspection";
export function getLocation(): Promise<GpsObservation> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ status: "unavailable", observedAt: new Date().toISOString() });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          status: "ok",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          observedAt: new Date(position.timestamp).toISOString(),
        }),
      (error) =>
        resolve({
          status:
            error.code === 1
              ? "denied"
              : error.code === 3
                ? "timeout"
                : "unavailable",
          observedAt: new Date().toISOString(),
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  });
}
export async function photograph(video: HTMLVideoElement) {
  if (
    video.readyState < 2 ||
    Math.min(video.videoWidth, video.videoHeight) < 320
  )
    throw new Error("camera_not_ready");
  const scale = Math.min(
    1,
    2048 / Math.max(video.videoWidth, video.videoHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("camera_not_ready");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("camera_not_ready"))),
      "image/jpeg",
      0.9,
    ),
  );
}
