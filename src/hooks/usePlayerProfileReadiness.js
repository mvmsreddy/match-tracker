import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// Shared profile completeness gates for tournament entry / participation.
export function usePlayerProfileReadiness(user = null) {
  const { user: authUser } = useAuth();
  const effective = user || authUser;

  return useMemo(() => {
    const missing = [
      !effective?.aitaReg && 'AITA Reg',
      !effective?.dateOfBirth && 'Date of Birth',
      !effective?.stateAbbr && 'State',
    ].filter(Boolean);
    return {
      isReady: missing.length === 0,
      missing,
      message: missing.length > 0
        ? `Complete your profile to enter tournaments — missing: ${missing.join(', ')}.`
        : null,
    };
  }, [effective?.aitaReg, effective?.dateOfBirth, effective?.stateAbbr]);
}
