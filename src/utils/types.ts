export type JoinWaitlistBody = {
  email: string;
  referralCode?: string;
};

export interface WaitlistUser {
  referralCode: string;
  position: number;
  nextPosition: number;
}
