'use client';
import type { Socket } from 'socket.io-client';
import type { CallType, CallEndReason, CallPeer } from '@/types/calls';

export interface IncomingInvite {
  callId: string;
  conversationId: string;
  callType: CallType;
  caller: CallPeer;
  sdp: RTCSessionDescriptionInit;
  from: string;
}

export const signaling = {
  invite(
    socket: Socket,
    payload: {
      peerId: string;
      callId: string;
      conversationId: string;
      callType: CallType;
      caller: CallPeer;
      sdp: RTCSessionDescriptionInit;
    },
  ) {
    socket.emit('call:invite', payload);
  },
  answer(socket: Socket, peerId: string, callId: string, sdp: RTCSessionDescriptionInit) {
    socket.emit('call:answer', { peerId, callId, sdp });
  },
  ice(socket: Socket, peerId: string, callId: string, candidate: RTCIceCandidateInit) {
    socket.emit('call:ice', { peerId, callId, candidate });
  },
  cancel(socket: Socket, peerId: string, callId: string) {
    socket.emit('call:cancel', { peerId, callId });
  },
  decline(socket: Socket, peerId: string, callId: string) {
    socket.emit('call:decline', { peerId, callId });
  },
  hangup(socket: Socket, peerId: string, callId: string, reason?: CallEndReason) {
    socket.emit('call:hangup', { peerId, callId, reason });
  },
  renegotiate(
    socket: Socket,
    peerId: string,
    callId: string,
    sdp: RTCSessionDescriptionInit,
    withVideo: boolean,
  ) {
    socket.emit('call:renegotiate', { peerId, callId, sdp, withVideo });
  },
};
