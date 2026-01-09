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
  private speakQueue: string[] = [];
  private isProcessingQueue = false;
  private speechDisabledReason: string | null = null;

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

      // Create peer connection with D-ID's ICE servers
      this.peerConnection = new RTCPeerConnection({
        iceServers: streamData.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }],
        iceCandidatePoolSize: 10,
      });

      // IMPORTANT: Register track handler BEFORE setRemoteDescription.
      // Some browsers can dispatch the "track" event during/very shortly after
      // applying the remote offer; setting the handler afterwards may miss it.
      this.peerConnection.ontrack = (event) => {
        console.log('🎥 Received track:', event.track.kind, 'readyState:', event.track.readyState);

        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log('🎬 Stream received with', stream.getTracks().length, 'tracks');

          // Log track details
          stream.getTracks().forEach((track) => {
            console.log(
              `  - ${track.kind} track: ${track.id}, enabled: ${track.enabled}, readyState: ${track.readyState}`,
            );
          });

          this.callbacks.onStreamReady(stream);

          if (this.videoElement) {
            console.log('📺 Attaching stream to video element');
            this.videoElement.srcObject = stream;

            // Force video to play
            const playPromise = this.videoElement.play();
            if (playPromise !== undefined) {
              playPromise
                .catch((err) => {
                  console.warn('Video autoplay blocked:', err.message);
                  // Try muted playback as fallback
                  if (this.videoElement) {
                    this.videoElement.muted = true;
                    this.videoElement
                      .play()
                      .then(() => {
                        console.log('✅ Video playing (muted)');
                      })
                      .catch((e) => console.error('❌ Video play failed:', e));
                  }
                })
                .then(() => {
                  console.log('✅ Video playing');
                });
            }
          } else {
            console.error('❌ No video element available!');
          }
        }
      };

      // Set remote description (D-ID's offer)
      const offerSdp = typeof streamData.offer === 'string' ? streamData.offer : streamData.offer.sdp;

      console.log('Setting remote description from D-ID offer...');
      await this.peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp,
      });


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

      // Create answer (remote description was already set above)
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

      // Note: We don't use D-ID's chat API (requires paid credits)
      // Instead we use our own Lovable AI and the speak endpoint
      console.log('D-ID stream ready - using speak endpoint with our AI');

    } catch (error) {
      console.error('D-ID init error:', error);
      this.callbacks.onError(error instanceof Error ? error : new Error('Failed to initialize'));
      throw error;
    }
  }

  async speak(text: string): Promise<boolean> {
    if (!this.streamId || !this.sessionId) {
      console.error('Not connected');
      return false;
    }

    if (this.speechDisabledReason) {
      console.warn('Speech disabled:', this.speechDisabledReason);
      return false;
    }

    // If already speaking, queue this request
    if (this.isSpeaking || this.isProcessingQueue) {
      console.log('Already speaking, queueing:', text.substring(0, 30) + '...');
      this.speakQueue.push(text);
      return true;
    }

    return await this.processSpeak(text);
  }

  private async processSpeak(text: string): Promise<boolean> {
    if (!this.streamId || !this.sessionId) return false;

    let success = true;

    try {
      this.isProcessingQueue = true;
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
        },
      });

      if (error) {
        success = false;
        const msg = String((error as any)?.message ?? error);
        console.error('Speak API error:', msg);

        // D-ID returns 402 when the account has no credits.
        if (msg.includes('402') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('credits')) {
          this.speechDisabledReason = 'Avatar voice is unavailable (insufficient credits).';
        }
      } else {
        // Estimate speaking duration based on text length.
        // Keep this short to avoid muting the user's mic for too long after greetings.
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        const estimatedMs = (words / 170) * 60 * 1000 + 800; // ~170 WPM + small padding
        const durationMs = Math.min(20000, Math.max(1500, estimatedMs));
        await new Promise((resolve) => setTimeout(resolve, durationMs));
      }

      this.isSpeaking = false;
      this.callbacks.onSpeakingEnd();
      this.isProcessingQueue = false;

      // Process next in queue if any
      if (this.speakQueue.length > 0 && !this.speechDisabledReason) {
        const nextText = this.speakQueue.shift()!;
        // Small delay between speeches to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.processSpeak(nextText);
      }

      return success;
    } catch (error) {
      console.error('Speak error:', error);
      this.isSpeaking = false;
      this.isProcessingQueue = false;
      this.callbacks.onSpeakingEnd();
      return false;
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
