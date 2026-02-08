import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppError } from '@/src/types/errors';

const ONBOARDING_KEY = 'safety_onboarding_v1';

export const getOnboardingAccepted = async (): Promise<boolean> => {
  try {
    const storedValue = await AsyncStorage.getItem(ONBOARDING_KEY);
    return storedValue === 'true';
  } catch (error) {
    throw new AppError('onboarding_read_error', 'Unable to read onboarding state', error);
  }
};

export const setOnboardingAccepted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch (error) {
    throw new AppError('onboarding_write_error', 'Unable to save onboarding state', error);
  }
};
