import { supabase } from '@/integrations/supabase/client';

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioContext = new AudioContext({
        sampleRate: 24000,
      });

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
};

export type RealtimeEvent = {
  type: string;
  event_id?: string;
  delta?: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  transcript?: string;
  [key: string]: unknown;
};

export type RealtimeChatCallbacks = {
  onMessage?: (event: RealtimeEvent) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
};

export class RealtimeChat {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement;
  private recorder: AudioRecorder | null = null;
  private callbacks: RealtimeChatCallbacks;

  constructor(callbacks: RealtimeChatCallbacks) {
    this.callbacks = callbacks;
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
  }

  async init() {
    try {
      this.callbacks.onStatusChange?.('connecting');
      console.log('Initializing realtime chat...');

      // Get ephemeral token from edge function
      const { data, error } = await supabase.functions.invoke('realtime-session');

      if (error) {
        console.error('Error getting session token:', error);
        throw new Error(`Failed to get session token: ${error.message}`);
      }

      if (!data?.client_secret?.value) {
        console.error('Invalid session response:', data);
        throw new Error("Failed to get ephemeral token from session");
      }

      const EPHEMERAL_KEY = data.client_secret.value;
      console.log('Got ephemeral token, creating WebRTC connection...');

      // Create peer connection
      this.pc = new RTCPeerConnection();

      // Set up remote audio
      this.pc.ontrack = (e) => {
        console.log('Received remote audio track');
        this.audioEl.srcObject = e.streams[0];
      };

      // Add local audio track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.pc.addTrack(ms.getTracks()[0]);
      console.log('Added local audio track');

      // Set up data channel for events
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        console.log("Received event:", event.type);
        this.handleEvent(event);
      });

      this.dc.addEventListener("open", () => {
        console.log('Data channel opened');
        this.callbacks.onStatusChange?.('connected');
      });

      this.dc.addEventListener("close", () => {
        console.log('Data channel closed');
        this.callbacks.onStatusChange?.('disconnected');
      });

      // Create and set local description
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Connect to OpenAI's Realtime API via WebRTC
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      
      console.log('Connecting to OpenAI Realtime API...');
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`Failed to connect to OpenAI: ${sdpResponse.status} - ${errorText}`);
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };

      await this.pc.setRemoteDescription(answer);
      console.log("WebRTC connection established successfully");

    } catch (error) {
      console.error("Error initializing chat:", error);
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.callbacks.onStatusChange?.('disconnected');
      throw error;
    }
  }

  private handleEvent(event: RealtimeEvent) {
    this.callbacks.onMessage?.(event);

    switch (event.type) {
      case 'response.audio.delta':
        this.callbacks.onSpeakingChange?.(true);
        break;
      case 'response.audio.done':
        this.callbacks.onSpeakingChange?.(false);
        break;
      case 'response.audio_transcript.delta':
        if (event.delta) {
          this.callbacks.onTranscript?.(event.delta, 'assistant');
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.callbacks.onTranscript?.(event.transcript, 'user');
        }
        break;
      case 'error':
        console.error('Realtime API error:', event);
        this.callbacks.onError?.(new Error(JSON.stringify(event)));
        break;
    }
  }

  sendTextMessage(text: string) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text
          }
        ]
      }
    };

    this.dc.send(JSON.stringify(event));
    this.dc.send(JSON.stringify({ type: 'response.create' }));
  }

  disconnect() {
    console.log('Disconnecting realtime chat...');
    this.recorder?.stop();
    this.dc?.close();
    this.pc?.close();
    this.audioEl.srcObject = null;
    this.callbacks.onStatusChange?.('disconnected');
  }
}
