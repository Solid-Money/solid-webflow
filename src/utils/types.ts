declare global {
  function twq(event: string, eventId: string, params?: { email_address?: string | null }): void;
}

export type JoinWaitlistBody = {
  email: string;
  referralCode?: string;
};

export interface WaitlistUser {
  referralCode: string;
  position: number;
  nextPosition: number;
}

export interface APYs {
  allTime: number;
  sevenDay: number;
  fifteenDay: number;
  thirtyDay: number;
}
