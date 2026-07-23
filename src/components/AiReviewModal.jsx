import { useState, useEffect } from 'react';
import { getAiReview } from '../api/aiReviewApi';
import { buildReviewPayload } from '../lib/aiReviewPrep';

export default function AiReviewModal({ scope, points, header, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getAiReview(buildReviewPayload(points, scope, header))
      .then((r) => { if (!cancelled) setReview(r); })
      .catch((e) => { if (!cancelled) setError(e.message || 'AI review failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal t-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">AI Coach Review</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="status-msg">Analyzing points…</div>}
        {error && <div className="status-msg" style={{ color: '#E37B6B' }}>{error}</div>}

        {review && (
          <div className="ai-review-body">
            <p>{review.summary}</p>

            <div className="t-section-label">Your patterns</div>
            <ul>
              {review.selfWeaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>

            <div className="t-section-label">Opponent patterns</div>
            <ul>
              {review.oppWeaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>

            <div className="t-section-label">Suggestions</div>
            <ul>
              {review.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
