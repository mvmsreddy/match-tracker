export async function getAiReview(payload) {
  const res = await fetch('/api/ai-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `AI review failed (${res.status})`);
  }
  return res.json();
}
