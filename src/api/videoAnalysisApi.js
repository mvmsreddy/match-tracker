const BASE_URL = import.meta.env.VITE_VIDEO_SERVICE_URL || 'http://localhost:8000';

export async function uploadVideoForAnalysis(matchId, file) {
  const form = new FormData();
  form.append('match_id', matchId);
  form.append('video', file);
  const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

export async function getAnalysisJob(jobId) {
  const res = await fetch(`${BASE_URL}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Job lookup failed (${res.status})`);
  return res.json();
}

export function getAnalysisVideoUrl(jobId) {
  return `${BASE_URL}/jobs/${jobId}/video`;
}
