// Client-side video thumbnail + duration capture (Phase 4, item 11) —
// ported from ACE Tracker's lib/video.js. Grabs a JPEG frame from the video
// file itself before upload (at 5% of duration, or 0.5s for very short
// clips) so the UI has something to show immediately instead of waiting on
// a server-side render.
export function captureVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    function cleanup() {
      URL.revokeObjectURL(url);
      video.remove();
    }

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      video.currentTime = Math.min(Math.max(duration * 0.05, 0.5), Math.max(duration - 0.1, 0));
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) { reject(new Error('Could not capture thumbnail')); return; }
          resolve({ thumbnailBlob: blob, durationSec: Math.round(video.duration || 0) });
        }, 'image/jpeg', 0.8);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => { cleanup(); reject(new Error('Could not read video file')); };
  });
}
