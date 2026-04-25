export type CallType = 'AUDIO' | 'VIDEO';

export type CallPhase =
  | 'idle'
  | 'outgoing-ringing'
  | 'incoming-ringing'
  | 'connecting'
  | 'active'
  | 'ended';

export type CallEndReason =
  | 'caller_hangup'
  | 'callee_hangup'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'failed';

export interface CallPeer {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface ActiveCall {
  callId: string;
  conversationId: string;
  type: CallType;
  phase: CallPhase;
  isCaller: boolean;
  peer: CallPeer;
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
  endReason?: CallEndReason;
}

export type SignalingEvent =
  | {
      type: 'call:invite';
      callId: string;
      conversationId: string;
      callType: CallType;
      caller: CallPeer;
      sdp: RTCSessionDescriptionInit;
    }
  | { type: 'call:answer'; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'call:ice'; callId: string; candidate: RTCIceCandidateInit }
  | { type: 'call:decline'; callId: string }
  | { type: 'call:cancel'; callId: string }
  | { type: 'call:hangup'; callId: string; reason?: CallEndReason }
  | {
      type: 'call:renegotiate';
      callId: string;
      sdp: RTCSessionDescriptionInit;
      withVideo: boolean;
    };

export type CallQuality = 'excellent' | 'good' | 'poor' | 'critical';
