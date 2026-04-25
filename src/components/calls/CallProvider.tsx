'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useSocket } from '@/hooks/useSocket';
import { useCallStore } from '@/lib/calls/store';
import { PeerSession } from '@/lib/calls/peer';
import { signaling } from '@/lib/calls/signaling';
import type {
  ActiveCall,
  CallEndReason,
  CallPeer,
  CallType,
} from '@/types/calls';
import { useToast } from '@/components/ui/Toast';
import { CallView } from './CallView';
import { IncomingCallModal } from './IncomingCallModal';
import { MiniCallWindow } from './MiniCallWindow';

interface InviteFromServer {
  callId: string;
  conversationId: string;
  callType: CallType;
  caller: CallPeer;
  sdp: RTCSessionDescriptionInit;
  from: string;
}

interface CallContextValue {
  startCall: (peer: CallPeer, conversationId: string, type: CallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  enableCameraMidCall: () => Promise<void>;
}

let providerCtx: CallContextValue | null = null;
export function getCallController() {
  if (!providerCtx) throw new Error('CallProvider not mounted');
  return providerCtx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const me = session?.user;
  const socket = useSocket();
  const toast = useToast();

  const peerRef = useRef<PeerSession | null>(null);
  const pendingOfferRef = useRef<InviteFromServer | null>(null);

  const {
    call,
    setCall,
    patchCall,
    setLocalStream,
    setRemoteStream,
    setMicMuted,
    setCameraOff,
    setMinimized,
    setQuality,
    setRingtone,
    reset,
  } = useCallStore();

  const finalize = useCallback(
    async (
      reason: CallEndReason,
      opts?: { notifyPeer?: boolean; recordHistory?: boolean },
    ) => {
      const cur = useCallStore.getState().call;
      const peer = peerRef.current;

      if (cur && opts?.notifyPeer && cur.peer.id) {
        signaling.hangup(socket, cur.peer.id, cur.callId, reason);
      }

      peer?.close();
      peerRef.current = null;
      pendingOfferRef.current = null;

      if (cur && opts?.recordHistory) {
        // Persist history (fire-and-forget; UI doesn't block on this)
        const endedAt = Date.now();
        fetch('/api/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: cur.callId,
            conversationId: cur.conversationId,
            calleeId: cur.isCaller ? cur.peer.id : me?.id,
            callerId: cur.isCaller ? me?.id : cur.peer.id,
            type: cur.type,
            startedAt: cur.startedAt,
            answeredAt: cur.answeredAt,
            endedAt,
            durationMs: cur.answeredAt ? endedAt - cur.answeredAt : null,
            endReason: reason,
            status:
              reason === 'missed' || reason === 'declined' || reason === 'cancelled'
                ? reason === 'missed'
                  ? 'MISSED'
                  : reason === 'declined'
                    ? 'DECLINED'
                    : 'ENDED'
                : 'ENDED',
          }),
        }).catch(() => {});
      }

      reset();
    },
    [socket, me?.id, reset],
  );

  const buildPeer = useCallback(
    (callIdLocal: string, peerId: string) => {
      const ps = new PeerSession({
        onLocalIce: (candidate) =>
          signaling.ice(socket, peerId, callIdLocal, candidate),
        onRemoteStream: (stream) => setRemoteStream(stream),
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            const cur = useCallStore.getState().call;
            if (cur && cur.phase !== 'active') {
              patchCall({ phase: 'active', answeredAt: cur.answeredAt ?? Date.now() });
              setRingtone(null);
            }
          }
          if (state === 'failed') {
            toast.push({ message: 'звонок прервался', kind: 'error' });
            void finalize('failed', { notifyPeer: true, recordHistory: true });
          }
        },
        onQualityChange: setQuality,
        onNegotiationNeeded: async () => {
          const cur = useCallStore.getState().call;
          if (!cur || !ps.pc.localDescription) return;
          if (cur.phase !== 'active') return;
          try {
            const offer = await ps.pc.createOffer();
            await ps.pc.setLocalDescription(offer);
            signaling.renegotiate(socket, cur.peer.id, cur.callId, offer, true);
          } catch {
            // ignore
          }
        },
      });
      peerRef.current = ps;
      return ps;
    },
    [socket, setRemoteStream, patchCall, setRingtone, setQuality, toast, finalize],
  );

  const startCall = useCallback<CallContextValue['startCall']>(
    async (peer, conversationId, type) => {
      if (useCallStore.getState().call) {
        toast.push({ message: 'уже идёт звонок', kind: 'error' });
        return;
      }
      if (!me?.id) return;
      const callId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newCall: ActiveCall = {
        callId,
        conversationId,
        type,
        phase: 'outgoing-ringing',
        isCaller: true,
        peer,
        startedAt: Date.now(),
      };
      setCall(newCall);
      setRingtone('outgoing');

      try {
        const ps = buildPeer(callId, peer.id);
        const stream = await ps.getLocalMedia(true, type === 'VIDEO');
        setLocalStream(stream);
        const offer = await ps.createOffer();

        signaling.invite(socket, {
          peerId: peer.id,
          callId,
          conversationId,
          callType: type,
          caller: {
            id: me.id,
            username: me.username ?? 'tubik',
            displayName: me.username ?? null,
            avatarUrl: me.image ?? null,
          },
          sdp: offer,
        });
      } catch (err) {
        toast.push({
          message: err instanceof Error ? err.message : 'не удалось начать звонок',
          kind: 'error',
        });
        void finalize('failed', { notifyPeer: false, recordHistory: false });
      }
    },
    [me?.id, me?.username, me?.image, socket, buildPeer, setCall, setLocalStream, setRingtone, toast, finalize],
  );

  const acceptIncoming = useCallback<CallContextValue['acceptIncoming']>(async () => {
    const cur = useCallStore.getState().call;
    const offer = pendingOfferRef.current;
    if (!cur || !offer) return;

    patchCall({ phase: 'connecting', answeredAt: Date.now() });
    setRingtone(null);

    try {
      const ps = buildPeer(cur.callId, cur.peer.id);
      const stream = await ps.getLocalMedia(true, cur.type === 'VIDEO');
      setLocalStream(stream);
      const answer = await ps.createAnswer(offer.sdp);
      signaling.answer(socket, cur.peer.id, cur.callId, answer);
      pendingOfferRef.current = null;
    } catch (err) {
      toast.push({
        message: err instanceof Error ? err.message : 'не удалось ответить',
        kind: 'error',
      });
      void finalize('failed', { notifyPeer: true, recordHistory: false });
    }
  }, [socket, buildPeer, patchCall, setLocalStream, setRingtone, toast, finalize]);

  const declineIncoming = useCallback(() => {
    const cur = useCallStore.getState().call;
    if (!cur) return;
    signaling.decline(socket, cur.peer.id, cur.callId);
    void finalize('declined', { notifyPeer: false, recordHistory: true });
  }, [socket, finalize]);

  const hangup = useCallback(() => {
    const cur = useCallStore.getState().call;
    if (!cur) return;
    if (cur.phase === 'outgoing-ringing') {
      signaling.cancel(socket, cur.peer.id, cur.callId);
      void finalize('cancelled', { notifyPeer: false, recordHistory: true });
    } else {
      void finalize(cur.isCaller ? 'caller_hangup' : 'callee_hangup', {
        notifyPeer: true,
        recordHistory: true,
      });
    }
  }, [socket, finalize]);

  const toggleMic = useCallback(() => {
    const ps = peerRef.current;
    const next = !useCallStore.getState().micMuted;
    setMicMuted(next);
    ps?.setMicEnabled(!next);
  }, [setMicMuted]);

  const toggleCamera = useCallback(() => {
    const ps = peerRef.current;
    const next = !useCallStore.getState().cameraOff;
    setCameraOff(next);
    ps?.setCameraEnabled(!next);
  }, [setCameraOff]);

  const enableCameraMidCall = useCallback(async () => {
    const ps = peerRef.current;
    if (!ps) return;
    await ps.enableCamera();
    const localStream = useCallStore.getState().localStream;
    if (localStream) setLocalStream(new MediaStream(localStream.getTracks()));
    patchCall({ type: 'VIDEO' });
  }, [patchCall, setLocalStream]);

  // ===== Wire Socket.io listeners =====
  useEffect(() => {
    if (!socket || !me?.id) return;

    const onInvite = (payload: InviteFromServer) => {
      if (useCallStore.getState().call) {
        // already in a call → auto-decline
        signaling.decline(socket, payload.from, payload.callId);
        return;
      }
      pendingOfferRef.current = payload;
      setCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        type: payload.callType,
        phase: 'incoming-ringing',
        isCaller: false,
        peer: payload.caller,
        startedAt: Date.now(),
      });
      setRingtone('incoming');

      // Auto-mark missed after 35 seconds if not answered
      const callIdAtInvite = payload.callId;
      setTimeout(() => {
        const cur = useCallStore.getState().call;
        if (cur?.callId === callIdAtInvite && cur.phase === 'incoming-ringing') {
          void finalize('missed', { notifyPeer: false, recordHistory: true });
        }
      }, 35_000);
    };

    const onAnswer = async (payload: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      const ps = peerRef.current;
      const cur = useCallStore.getState().call;
      if (!ps || !cur || cur.callId !== payload.callId) return;
      patchCall({ phase: 'connecting' });
      setRingtone(null);
      await ps.applyAnswer(payload.sdp);
    };

    const onIce = async (payload: { callId: string; candidate: RTCIceCandidateInit }) => {
      const ps = peerRef.current;
      const cur = useCallStore.getState().call;
      if (!ps || !cur || cur.callId !== payload.callId) return;
      await ps.addRemoteIce(payload.candidate);
    };

    const onDecline = () => {
      toast.push({ message: 'отклонили звонок' });
      void finalize('declined', { notifyPeer: false, recordHistory: true });
    };

    const onCancel = () => {
      void finalize('cancelled', { notifyPeer: false, recordHistory: true });
    };

    const onHangup = (payload: { reason?: CallEndReason }) => {
      void finalize(payload?.reason ?? 'callee_hangup', {
        notifyPeer: false,
        recordHistory: true,
      });
    };

    const onRenegotiate = async (payload: {
      callId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const ps = peerRef.current;
      const cur = useCallStore.getState().call;
      if (!ps || !cur || cur.callId !== payload.callId) return;
      try {
        const answer = await ps.createAnswer(payload.sdp);
        signaling.answer(socket, cur.peer.id, cur.callId, answer);
      } catch {
        // ignore
      }
    };

    socket.on('call:invite', onInvite);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:decline', onDecline);
    socket.on('call:cancel', onCancel);
    socket.on('call:hangup', onHangup);
    socket.on('call:renegotiate', onRenegotiate);

    return () => {
      socket.off('call:invite', onInvite);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:decline', onDecline);
      socket.off('call:cancel', onCancel);
      socket.off('call:hangup', onHangup);
      socket.off('call:renegotiate', onRenegotiate);
    };
  }, [socket, me?.id, setCall, patchCall, setRingtone, toast, finalize]);

  // ===== Browser notification for incoming calls =====
  useEffect(() => {
    if (call?.phase === 'incoming-ringing' && document.visibilityState !== 'visible') {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Входящий звонок', {
          body: `${call.peer.displayName ?? call.peer.username} звонит`,
          icon: '/icons/icon-192.png',
        });
      }
    }
  }, [call?.phase, call?.peer.username, call?.peer.displayName]);

  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Expose imperative API
  const ctx = useMemo<CallContextValue>(
    () => ({
      startCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      toggleMic,
      toggleCamera,
      enableCameraMidCall,
    }),
    [
      startCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      toggleMic,
      toggleCamera,
      enableCameraMidCall,
    ],
  );
  providerCtx = ctx;

  return (
    <>
      {children}
      {call?.phase === 'incoming-ringing' && <IncomingCallModal />}
      {call &&
        ['outgoing-ringing', 'connecting', 'active'].includes(call.phase) &&
        (useCallStore.getState().minimized ? <MiniCallWindow /> : <CallView />)}
    </>
  );
}
