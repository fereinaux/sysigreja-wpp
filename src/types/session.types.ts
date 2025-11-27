export type SessionStatus = 'not_found' | 'connecting' | 'qr_pending' | 'connected' | 'disconnected' | 'timeout';

export interface SessionInfo {
  status: SessionStatus;
  qr?: string | null;
  connected: boolean;
  userId: string;
}

export interface CreateSessionResponse {
  qr: string | null;
  status: SessionStatus;
}

export interface SendMessageResponse {
  success: boolean;
  messageId: string;
  error?: string;
}

export interface SendTextRequest {
  sessionUserId: string;
  to: string;
  message: string;
}

export interface SendImageRequest {
  sessionUserId: string;
  to: string;
  imageKey: string;
  caption?: string;
}

export interface SendAudioRequest {
  sessionUserId: string;
  to: string;
  audioKey: string;
}




