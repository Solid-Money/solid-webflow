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

export type ApyAsset = 'usdc' | 'fuse' | 'eth';

/** What a friend gets under referral v4: card credit once they spend the target in the window. */
export interface ReferralInviteOffer {
  friendCreditUsd: number;
  spendTargetUsd: number;
  merchantTarget: number;
  windowDays: number;
}

/** What a friend gets under the legacy referral program (paid in `payoutToken`). */
export interface ReferralInviteLegacyOffer {
  friendRewardUsd: number;
  spendTargetUsd: number;
  merchantTarget: number;
  windowDays: number;
  payoutToken: string;
}

/**
 * `GET {accounts}/accounts/v1/referral/invite/{code}` — public, no auth. An
 * unknown code is still a 200: `{ valid: false, code }` and nothing more.
 */
export interface ReferralInvite {
  valid: boolean;
  code: string;
  referrer?: { username: string } | null;
  program?: 'v4' | 'legacy';
  offer?: ReferralInviteOffer | null;
  legacyOffer?: ReferralInviteLegacyOffer | null;
}

export interface LandingApyOverride {
  overrideEnabled: boolean;
  mode: 'simple' | 'advanced';
  apy: number;
  apys: Record<ApyAsset, APYs>;
}
