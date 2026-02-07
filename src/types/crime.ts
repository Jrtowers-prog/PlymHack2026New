import type { LatLng } from '@/src/types/google';

export type CrimePoint = {
  id?: string;
  category: string;
  location: LatLng;
  month?: string;
  outcomeStatus?: string | null;
};

export type CrimeSummary = {
  count: number;
  points: CrimePoint[];
  polygon: string;
};
