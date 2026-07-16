import { useMatchTracker } from '../hooks/useMatchTracker';
import TopNav from '../components/TopNav';
import Header from '../components/Header';
import Scorebar from '../components/Scorebar';
import Wizard from '../components/Wizard';
import StatsPanel from '../components/StatsPanel';
import PointLog from '../components/PointLog';
import ActionButtons from '../components/ActionButtons';

export default function TrackerPage() {
  const t = useMatchTracker();

  return (
    <div className="root">
      <TopNav />
      <Header
        header={t.header} updateHeader={t.updateHeader}
        sessionType={t.sessionType} setSessionType={t.setSessionType}
        formatPreset={t.formatPreset} setFormatPreset={t.setFormatPreset}
        formatCustom={t.formatCustom} setFormatCustom={t.setFormatCustom}
        pointTarget={t.pointTarget} setPointTarget={t.setPointTarget}
        showStatus={t.showStatus}
      />

      <Scorebar
        header={t.header} sessionType={t.sessionType} pointTarget={t.pointTarget}
        engine={t.engine} nextServer={t.nextServer}
        matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
      />

      <Wizard
        nextServer={t.nextServer} onServerChange={t.setServerChoice}
        onCommit={t.commitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
      />

      <div className="wrap">
        <div className="status-msg">{t.status}</div>
      </div>

      <StatsPanel
        points={t.points} header={t.header} sessionType={t.sessionType} analytics={t.analytics}
      />

      <PointLog points={t.points} header={t.header} />

      <ActionButtons
        header={t.header} updateHeader={t.updateHeader}
        sessionType={t.sessionType} formatPreset={t.formatPreset} formatLabel={t.formatLabel}
        pointTarget={t.pointTarget} points={t.points} engine={t.engine} analytics={t.analytics}
        matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
        showStatus={t.showStatus} resetMatch={t.resetMatch}
        matchSaved={t.matchSaved} markSaved={t.markSaved}
      />
    </div>
  );
}
