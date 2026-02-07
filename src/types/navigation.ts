import { LatLng } from '@/src/types/location';

export type NavigationDestination = LatLng & {
  label: string;
};

export type NavigationStatus = 'idle' | 'loading' | 'error';

export type NavigationState = {
  status: NavigationStatus;
  errorMessage?: string;
  lastOpenedAt?: number;
};

export type NavigationErrorCode =
  | 'MISSING_DESTINATION'
  | 'INVALID_DESTINATION'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export class NavigationError extends Error {
  readonly code: NavigationErrorCode;

  constructor(code: NavigationErrorCode, message: string) {
    super(message);
    this.name = 'NavigationError';
    this.code = code;
  }
}
