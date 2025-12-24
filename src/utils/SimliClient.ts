import { SimliClient, SimliClientConfig } from "simli-client";
import { supabase } from "@/integrations/supabase/client";

export type SimliCallbacks = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: (error: Error) => void;
  onSpeaking?: () => void;
  onSilent?: () => void;
};

export class SimliAvatarClient {
  private simliClient: SimliClient | null = null;
  private callbacks: SimliCallbacks;
  private videoRef: HTMLVideoElement | null = null;
  private audioRef: HTMLAudioElement | null = null;

  constructor(callbacks: SimliCallbacks) {
    this.callbacks = callbacks;
  }

  async init(
    videoRef: HTMLVideoElement,
    audioRef: HTMLAudioElement,
    faceId: string = "cace3ef7-a4c4-425d-a8cf-a5358eb0c427"
  ) {
    this.videoRef = videoRef;
    this.audioRef = audioRef;

    try {
      console.log("Initializing Simli client...");

      // Get session token from edge function
      const { data, error } = await supabase.functions.invoke("simli-session", {
        body: { faceId },
      });

      if (error) {
        console.error("Error getting Simli session:", error);
        throw new Error(`Failed to get Simli session: ${error.message}`);
      }

      if (!data?.session_token) {
        console.error("Invalid Simli session response:", data);
        throw new Error("Failed to get Simli session token");
      }

      console.log("Got Simli session token, creating client...");

      this.simliClient = new SimliClient();

      const simliConfig: SimliClientConfig = {
        apiKey: "",
        faceID: faceId,
        handleSilence: true,
        maxSessionLength: 3600,
        maxIdleTime: 600,
        videoRef: this.videoRef,
        audioRef: this.audioRef,
        enableConsoleLogs: true,
        session_token: data.session_token,
        SimliURL: "wss://api.simli.ai",
        maxRetryAttempts: 10,
        retryDelay_ms: 2000,
        videoReceivedTimeout: 15000,
        enableSFU: true,
        model: "fasttalk",
      };

      // Set up event listeners
      this.simliClient.on("connected", () => {
        console.log("Simli connected!");
        this.callbacks.onConnected?.();
      });

      this.simliClient.on("disconnected", () => {
        console.log("Simli disconnected!");
        this.callbacks.onDisconnected?.();
      });

      this.simliClient.on("failed", (reason: string) => {
        console.log("Simli connection failed:", reason);
        this.callbacks.onFailed?.(new Error(reason || "Simli connection failed"));
      });

      this.simliClient.on("speaking", () => {
        console.log("Avatar is speaking");
        this.callbacks.onSpeaking?.();
      });

      this.simliClient.on("silent", () => {
        console.log("Avatar is silent");
        this.callbacks.onSilent?.();
      });

      // Initialize and start the client
      this.simliClient.Initialize(simliConfig);
      await this.simliClient.start();
      
      console.log("Simli client started successfully");
    } catch (error) {
      console.error("Error initializing Simli:", error);
      this.callbacks.onFailed?.(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  sendAudioData(audioData: Uint8Array) {
    if (this.simliClient) {
      this.simliClient.sendAudioData(audioData);
    }
  }

  listenToMediastreamTrack(track: MediaStreamTrack) {
    if (this.simliClient) {
      this.simliClient.listenToMediastreamTrack(track);
    }
  }

  clearBuffer() {
    if (this.simliClient) {
      this.simliClient.ClearBuffer();
    }
  }

  disconnect() {
    console.log("Disconnecting Simli client...");
    if (this.simliClient) {
      this.simliClient.close();
      this.simliClient = null;
    }
  }
}
