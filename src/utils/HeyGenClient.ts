import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import { supabase } from "@/integrations/supabase/client";

export type HeyGenCallbacks = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onError?: (error: Error) => void;
  onStreamReady?: (stream: MediaStream) => void;
};

export class HeyGenAvatarClient {
  private avatar: StreamingAvatar | null = null;
  private callbacks: HeyGenCallbacks;
  private sessionData: any = null;

  constructor(callbacks: HeyGenCallbacks) {
    this.callbacks = callbacks;
  }

  async init(videoElement: HTMLVideoElement) {
    try {
      console.log("Initializing HeyGen avatar...");

      // Get access token from edge function
      const { data, error } = await supabase.functions.invoke("heygen-token");

      if (error) {
        console.error("Error getting HeyGen token:", error);
        throw new Error(`Failed to get HeyGen token: ${error.message}`);
      }

      if (!data?.data?.token) {
        console.error("Invalid HeyGen token response:", data);
        throw new Error("Failed to get HeyGen access token");
      }

      const accessToken = data.data.token;
      console.log("Got HeyGen access token, creating avatar...");

      // Create StreamingAvatar instance
      this.avatar = new StreamingAvatar({ token: accessToken });

      // Set up event listeners
      this.avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("HeyGen stream ready");
        if (event.detail && videoElement) {
          videoElement.srcObject = event.detail;
          videoElement.play().catch(console.error);
        }
        this.callbacks.onStreamReady?.(event.detail);
      });

      this.avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log("Avatar started talking");
        this.callbacks.onSpeakingStart?.();
      });

      this.avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log("Avatar stopped talking");
        this.callbacks.onSpeakingEnd?.();
      });

      this.avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("HeyGen stream disconnected");
        this.callbacks.onDisconnected?.();
      });

      // Start avatar session with a female avatar
      this.sessionData = await this.avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "Anna_public_3_20240108", // Professional female avatar
        voice: {
          voiceId: "1bd001e7e50f421d891986aad5158bc8", // Sweet female voice
          rate: 1.0,
          emotion: VoiceEmotion.FRIENDLY,
        },
        language: "en",
      });

      console.log("HeyGen avatar session started:", this.sessionData.session_id);
      this.callbacks.onConnected?.();

    } catch (error) {
      console.error("Error initializing HeyGen:", error);
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // Make the avatar speak text with lip-sync
  async speak(text: string) {
    if (!this.avatar) {
      throw new Error("Avatar not initialized");
    }

    try {
      console.log("Avatar speaking:", text);
      await this.avatar.speak({
        text,
        taskType: TaskType.TALK,
      });
    } catch (error) {
      console.error("Error making avatar speak:", error);
      throw error;
    }
  }

  // Repeat text exactly (for direct responses)
  async repeat(text: string) {
    if (!this.avatar) {
      throw new Error("Avatar not initialized");
    }

    try {
      await this.avatar.speak({
        text,
        taskType: TaskType.REPEAT,
      });
    } catch (error) {
      console.error("Error making avatar repeat:", error);
      throw error;
    }
  }

  // Interrupt current speech
  async interrupt() {
    if (!this.avatar) return;
    
    try {
      await this.avatar.interrupt();
    } catch (error) {
      console.error("Error interrupting avatar:", error);
    }
  }

  // Start voice chat mode (listen to user's voice)
  async startVoiceChat() {
    if (!this.avatar) {
      throw new Error("Avatar not initialized");
    }

    try {
      await this.avatar.startVoiceChat();
      console.log("Voice chat started");
    } catch (error) {
      console.error("Error starting voice chat:", error);
      throw error;
    }
  }

  // Stop voice chat mode
  stopVoiceChat() {
    if (!this.avatar) return;
    this.avatar.closeVoiceChat();
  }

  disconnect() {
    console.log("Disconnecting HeyGen avatar...");
    if (this.avatar) {
      this.avatar.stopAvatar();
      this.avatar = null;
    }
    this.sessionData = null;
    this.callbacks.onDisconnected?.();
  }
}
