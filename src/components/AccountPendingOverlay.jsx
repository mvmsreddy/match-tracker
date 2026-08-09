import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/primitives/button';

export default function AccountPendingOverlay() {
  const { user, logout } = useAuth();
  const isRejected = user?.accountStatus === 'rejected';

  return (
    <div className="role-overlay">
      <div className="role-overlay-card max-w-md">
        <div className="role-overlay-logo">Tennis Tracker</div>
        <h1 className="role-overlay-title">
          {isRejected ? 'Account not approved' : 'Awaiting approval'}
        </h1>
        <p className="role-overlay-sub">
          {isRejected ? (
            <>
              Your {user?.role} account was not approved.
              {user?.rejectionReason ? ` Reason: ${user.rejectionReason}` : ' Contact the platform admin if you believe this is a mistake.'}
            </>
          ) : (
            <>
              Your {user?.role} account is pending review by the platform admin.
              {user?.role === 'player' && user?.aitaReg
                ? ` We will cross-check AITA registration ${user.aitaReg} before activating your account.`
                : ' You will receive access once approved.'}
            </>
          )}
        </p>
        <Button variant="outline" className="mt-4 w-full" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
