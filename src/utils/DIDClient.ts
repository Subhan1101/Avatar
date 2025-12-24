import { supabase } from '@/integrations/supabase/client';

interface DIDClientCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onSpeakingStart: () => void;
  onSpeakingEnd: () => void;
  onError: (error: Error) => void;
  onStreamReady: (stream: MediaStream) => void;
  onMessage?: (text: string) => void;
}

export class DIDClient {
  private callbacks: DIDClientCallbacks;
  private peerConnection: RTCPeerConnection | null = null;
  private agentId: string;
  private streamId: string | null = null;
  private sessionId: string | null = null;
  private chatId: string | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isSpeaking = false;

  constructor(agentId: string, callbacks: DIDClientCallbacks) {
    this.agentId = agentId;
    this.callbacks = callbacks;
  }

  async init(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;
    
    try {
      console.log('Creating D-ID stream...');
      
      // Create stream
      const { data: streamData, error: streamError } = await supabase.functions.invoke('did-stream', {
        body: { 
          action: 'create-stream',
          agentId: this.agentId,
        }
      });

      if (streamError || !streamData) {
        throw new Error(streamError?.message || 'Failed to create stream');
      }

      console.log('Stream created:', streamData);
      this.streamId = streamData.id;
      this.sessionId = streamData.session_id;

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: streamData.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Handle incoming tracks
      this.peerConnection.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          this.callbacks.onStreamReady(event.streams[0]);
          if (this.videoElement) {
            this.videoElement.srcObject = event.streams[0];
          }
        }
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate');
          await supabase.functions.invoke('did-stream', {
            body: {
              action: 'submit-ice',
              agentId: this.agentId,
              streamId: this.streamId,
              sessionId: this.sessionId,
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            }
          });
        } else {
          // End of ICE gathering
          console.log('ICE gathering complete');
          await supabase.functions.invoke('did-stream', {
            body: {
              action: 'submit-ice',
              agentId: this.agentId,
              streamId: this.streamId,
              sessionId: this.sessionId,
            }
          });
        }
      };

      // Handle connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', this.peerConnection?.connectionState);
        if (this.peerConnection?.connectionState === 'connected') {
          this.callbacks.onConnected();
        } else if (this.peerConnection?.connectionState === 'disconnected' || 
                   this.peerConnection?.connectionState === 'failed') {
          this.callbacks.onDisconnected();
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
        if (this.peerConnection?.iceConnectionState === 'connected' || 
            this.peerConnection?.iceConnectionState === 'completed') {
          this.callbacks.onConnected();
        }
      };

      // Set remote description from offer
      // D-ID returns offer as an object with type and sdp, or as a string
      const offerSdp = typeof streamData.offer === 'string' 
        ? streamData.offer 
        : streamData.offer.sdp;
      
      await this.peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp,
      });

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Send answer to D-ID
      console.log('Submitting SDP answer...');
      const { error: sdpError } = await supabase.functions.invoke('did-stream', {
        body: {
          action: 'submit-sdp',
          agentId: this.agentId,
          streamId: this.streamId,
          sessionId: this.sessionId,
          answer: answer.sdp,
        }
      });

      if (sdpError) {
        console.error('SDP submission error:', sdpError);
      }

      // Create chat session
      console.log('Creating chat session...');
      const { data: chatData, error: chatError } = await supabase.functions.invoke('did-stream', {
        body: {
          action: 'create-chat',
          agentId: this.agentId,
        }
      });

      if (chatError) {
        console.error('Chat creation error:', chatError);
      } else {
        this.chatId = chatData?.id;
        console.log('Chat created:', this.chatId);
      }

    } catch (error) {
      console.error('D-ID init error:', error);
      this.callbacks.onError(error instanceof Error ? error : new Error('Failed to initialize'));
      throw error;
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.streamId || !this.sessionId) {
      console.error('Not connected');
      return;
    }

    try {
      this.isSpeaking = true;
      this.callbacks.onSpeakingStart();

      console.log('Speaking:', text.substring(0, 50) + '...');
      
      const { error } = await supabase.functions.invoke('did-stream', {
        body: {
          action: 'speak',
          agentId: this.agentId,
          streamId: this.streamId,
          sessionId: this.sessionId,
          text,
        }
      });

      if (error) {
        throw error;
      }

      // Estimate speaking duration based on text length (roughly 150 words per minute)
      const words = text.split(' ').length;
      const durationMs = Math.max(2000, (words / 150) * 60 * 1000);
      
      setTimeout(() => {
        this.isSpeaking = false;
        this.callbacks.onSpeakingEnd();
      }, durationMs);

    } catch (error) {
      console.error('Speak error:', error);
      this.isSpeaking = false;
      this.callbacks.onSpeakingEnd();
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.streamId || !this.sessionId || !this.chatId) {
      console.error('Not connected or no chat session');
      return;
    }

    try {
      this.isSpeaking = true;
      this.callbacks.onSpeakingStart();

      console.log('Sending message:', message.substring(0, 50) + '...');
      
      const { error } = await supabase.functions.invoke('did-stream', {
        body: {
          action: 'send-message',
          agentId: this.agentId,
          streamId: this.streamId,
          sessionId: this.sessionId,
          chatId: this.chatId,
          message,
        }
      });

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('Send message error:', error);
      this.isSpeaking = false;
      this.callbacks.onSpeakingEnd();
    }
  }

  disconnect(): void {
    console.log('Disconnecting D-ID...');
    
    if (this.streamId && this.sessionId) {
      supabase.functions.invoke('did-stream', {
        body: {
          action: 'close-stream',
          agentId: this.agentId,
          streamId: this.streamId,
          sessionId: this.sessionId,
        }
      }).catch(console.error);
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.streamId = null;
    this.sessionId = null;
    this.chatId = null;
    this.callbacks.onDisconnected();
  }
}
