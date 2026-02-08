import { useCallback, useEffect, useState } from 'react';

import { getOnboardingAccepted, setOnboardingAccepted } from '@/src/services/onboarding';
import { AppError } from '@/src/types/errors';

export type OnboardingStatus = 'loading' | 'ready' | 'error';

export type UseOnboardingState = {
  status: OnboardingStatus;
  hasAccepted: boolean;
  error: AppError | null;
  accept: () => Promise<void>;
};

export const useOnboarding = (): UseOnboardingState => {
  const [status, setStatus] = useState<OnboardingStatus>('loading');
  const [hasAccepted, setHasAccepted] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const accepted = await getOnboardingAccepted();
      setHasAccepted(accepted);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('onboarding_load_error', 'Unable to load onboarding', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load().catch(() => {
      setStatus('error');
      setError(new AppError('onboarding_load_error', 'Unable to load onboarding'));
    });
  }, [load]);

  const accept = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      await setOnboardingAccepted();
      setHasAccepted(true);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('onboarding_accept_error', 'Unable to save onboarding', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, []);

  return {
    status,
    hasAccepted,
    error,
    accept,
  };
};
