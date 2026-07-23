import { useEffect, useRef, useState } from 'react';
import TopNav from '../components/TopNav';
import { uploadVideoForAnalysis, getAnalysisJob, getAnalysisVideoUrl } from '../api/videoAnalysisApi';

const POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = 'videoAnalysisTest.jobId';

export default function VideoAnalysisTestPage() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    // Recovers an in-progress or finished job after a page refresh/reopen -
    // the analysis itself runs server-side in a background thread, so it
    // keeps going regardless of whether this tab is open or polling.
    localStorage.setItem(STORAGE_KEY, jobId);

    async function poll() {
      try {
        const data = await getAnalysisJob(jobId);
        setJob(data);
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        setError(err.message);
        clearInterval(pollRef.current);
      }
    }
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    setJob(null);
    try {
      const { job_id } = await uploadVideoForAnalysis(`test-${Date.now()}`, file);
      setJobId(job_id);
      setJob({ status: 'processing' });
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function startOver() {
    localStorage.removeItem(STORAGE_KEY);
    setJobId(null);
    setJob(null);
    setFile(null);
    setError('');
  }

  return (
    <div className="root">
      <TopNav />
      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Video Analysis (Beta)</h1>
            <div className="subtitle">Upload a clip to test player/ball tracking - experimental, not part of match tracking yet</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Upload a clip</div>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={uploading || job?.status === 'processing'}
        />
        <div style={{ marginTop: 12 }}>
          <button
            className="action-btn"
            onClick={handleUpload}
            disabled={!file || uploading || job?.status === 'processing'}
          >
            {uploading ? 'Uploading...' : 'Analyze'}
          </button>
        </div>
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {job && (
        <div className="panel">
          <div className="panel-title">Status: {job.status}</div>

          {job.status === 'processing' && (
            <div>Processing on the server - this can take several minutes for a real clip. Feel free to leave this open; it checks every 5s.</div>
          )}

          {job.status === 'failed' && (
            <div className="login-error">{job.error}</div>
          )}

          {job.status === 'done' && job.result && (
            <div>
              <div style={{ marginBottom: 12 }}>
                {job.result.frame_count} frames @ {job.result.fps.toFixed(1)}fps, {job.result.events.length} hit(s) detected
              </div>
              {job.result.warnings.length > 0 && (
                <ul style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                  {job.result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <video
                controls
                playsInline
                style={{ width: '100%', maxWidth: 480, borderRadius: 4, marginTop: 12 }}
                src={getAnalysisVideoUrl(jobId)}
              />
            </div>
          )}

          {(job.status === 'done' || job.status === 'failed') && (
            <button className="action-btn" style={{ marginTop: 12 }} onClick={startOver}>
              Analyze another clip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
