export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type LocationPermission = 'unknown' | 'granted' | 'denied';

export type LocationStatus = 'idle' | 'loading' | 'ready' | 'error' | 'denied';

export type UserLocationState = {
  permission: LocationPermission;
  status: LocationStatus;
  coords?: Coordinates;
  canAskAgain?: boolean;
  errorMessage?: string;
  updatedAt?: number;
};

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'SERVICES_DISABLED'
  | 'POSITION_UNAVAILABLE'
  | 'UNKNOWN';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}
