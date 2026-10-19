/** Manual FNET confirmations, NOT official Intra stock or Mendel approval states. */
export type MendelIntraState = {
  uploaded: boolean | null;
  downloaded: boolean | null;
  eventId: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  sourceHash: string;
  needsReview: boolean;
};
export type MendelIntraHistoryEntry = {
  id: string; uploaded: boolean | null; downloaded: boolean | null;
  before: { uploaded: boolean | null; downloaded: boolean | null };
  version: number; recordedAt: string; actor: string;
};
export const intraConfirmationLabel = (value: boolean | null) => value === true ? 'Sí' : value === false ? 'No' : 'Sin confirmar';
