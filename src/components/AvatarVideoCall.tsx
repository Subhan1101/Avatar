import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Phone, Monitor, MonitorOff, MessageSquare, Volume2, Loader2, Paperclip, X, FileText, Image as ImageIcon, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DIDClient } from '@/utils/DIDClient';
import { RealtimeChat, AudioSettings } from '@/utils/RealtimeAudio';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkQuality, getOptimalAudioSettings, NetworkQuality } from '@/hooks/useNetworkQuality';

// Your D-ID Agent ID
const DID_AGENT_ID = 'v2_agt_gp3qqZmx';

interface Message {
  id: number;
  sender: 'user' | 'agent';
  text: string;
}

const getNetworkStatusColor = (quality: NetworkQuality) => {
  switch (quality) {
    case 'excellent': return 'text-green-500';
    case 'good': return 'text-green-400';
    case 'fair': return 'text-yellow-500';
    case 'poor': return 'text-orange-500';
    case 'offline': return 'text-destructive';
  }
};

const getNetworkStatusText = (quality: NetworkQuality) => {
  switch (quality) {
    case 'excellent': return 'Excellent connection';
    case 'good': return 'Good connection';
    case 'fair': return 'Fair connection';
    case 'poor': return 'Weak connection';
    case 'offline': return 'Offline';
  }
};

export const AvatarVideoCall = () => {
  const { toast } = useToast();
  const networkInfo = useNetworkQuality();
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [audioLevels, setAudioLevels] = useState([0.3, 0.5, 0.8, 0.4, 0.6]);
  const [isListening, setIsListening] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [networkIssueMessage, setNetworkIssueMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const didRef = useRef<DIDClient | null>(null);
  const realtimeChatRef = useRef<RealtimeChat | null>(null);
  const messageIdRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const speechUnavailableRef = useRef(false);
  const currentTranscriptRef = useRef<string>('');
  const pendingUserTranscriptRef = useRef<string>('');

  // Audio wave animation when speaking
  useEffect(() => {
    if (!isSpeaking) return;
    const interval = setInterval(() => {
      setAudioLevels((prev) => prev.map(() => Math.random() * 0.7 + 0.3));
    }, 150);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const showSpeechUnavailable = useCallback(() => {
    if (speechUnavailableRef.current) return;
    speechUnavailableRef.current = true;
    toast({
      variant: 'destructive',
      title: 'Avatar voice unavailable',
      description: 'The avatar cannot speak right now (insufficient credits). Chat will continue without voice.',
    });
  }, [toast]);

  // Clear network issue messages after a delay
  useEffect(() => {
    if (networkIssueMessage) {
      const timer = setTimeout(() => setNetworkIssueMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [networkIssueMessage]);

  // Show warning toast when network quality drops
  useEffect(() => {
    if (status === 'connected' && networkInfo.quality === 'poor') {
      toast({
        title: 'Slow Connection Detected',
        description: 'Your connection is slow. Audio quality may be affected.',
        duration: 4000,
      });
    }
    if (networkInfo.quality === 'offline' && status === 'connected') {
      toast({
        variant: 'destructive',
        title: 'Connection Lost',
        description: 'You are offline. Trying to reconnect when network is available...',
      });
    }
  }, [networkInfo.quality, status, toast]);

  // Update audio settings when network quality changes
  useEffect(() => {
    if (realtimeChatRef.current && status === 'connected') {
      const newSettings = getOptimalAudioSettings(networkInfo.quality);
      realtimeChatRef.current.updateAudioSettings(newSettings);
    }
  }, [networkInfo.quality, status]);

  const startConversation = useCallback(async () => {
    try {
      setStatus('connecting');

      if (!videoRef.current) {
        throw new Error('Video element not found');
      }

      // Check network quality before starting
      if (networkInfo.quality === 'offline') {
        throw new Error('You are offline. Please check your internet connection.');
      }

      if (networkInfo.quality === 'poor') {
        toast({
          title: 'Slow Connection',
          description: 'Your connection is slow. The call may take longer to connect.',
          duration: 4000,
        });
      }

      console.log('Initializing D-ID avatar...');

      // First initialize D-ID for avatar video
      didRef.current = new DIDClient(DID_AGENT_ID, {
        onConnected: async () => {
          console.log('D-ID avatar connected, now starting OpenAI Realtime...');

          // Now start OpenAI Realtime for voice with network-optimized settings
          try {
            const audioSettings = getOptimalAudioSettings(networkInfo.quality);
            
            realtimeChatRef.current = new RealtimeChat({
              onStatusChange: (s) => {
                console.log('Realtime status:', s);
                if (s === 'connected') {
                  setStatus('connected');
                  setIsListening(true);
                  setNetworkIssueMessage(null);

                  // Send initial greeting via D-ID
                  setTimeout(async () => {
                    const greeting = "Hello! I'm Aria, your friendly IT support assistant. How can I help you today?";
                    setMessages([{ id: ++messageIdRef.current, sender: 'agent', text: greeting }]);
                    const ok = await didRef.current?.speak(greeting);
                    if (ok === false) showSpeechUnavailable();
                  }, 500);
                } else if (s === 'disconnected') {
                  setIsListening(false);
                  setStatus('disconnected');
                } else if (s === 'reconnecting') {
                  setStatus('reconnecting');
                }
              },
              onSpeakingChange: (speaking) => {
                setIsSpeaking(speaking);
              },
              onTranscript: (text, role) => {
                console.log(`Transcript [${role}]:`, text);

                if (role === 'user') {
                  // User transcript from Whisper
                  pendingUserTranscriptRef.current += text;
                } else if (role === 'assistant') {
                  // Assistant transcript - accumulate for D-ID
                  currentTranscriptRef.current += text;
                }
              },
              onMessage: async (event) => {
                // When assistant response is complete, add to messages and make D-ID speak
                if (event.type === 'response.audio_transcript.done') {
                  const fullText = currentTranscriptRef.current.trim();
                  if (fullText) {
                    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'agent', text: fullText }]);
                    
                    // Make D-ID avatar speak with lip sync
                    const ok = await didRef.current?.speak(fullText);
                    if (ok === false) showSpeechUnavailable();
                  }
                  currentTranscriptRef.current = '';
                }

                // Fallback: Extract response from response.done if transcript wasn't captured
                if (event.type === 'response.done') {
                  const response = event.response as { output?: Array<{ content?: Array<{ transcript?: string; text?: string }> }> } | undefined;
                  if (response?.output) {
                    for (const item of response.output) {
                      if (item.content) {
                        for (const content of item.content) {
                          const text = content.transcript || content.text;
                          if (text && !currentTranscriptRef.current) {
                            // Only use this if we didn't get transcript from deltas
                            console.log('Using response.done fallback for text:', text.substring(0, 50));
                            setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'agent', text }]);
                            const ok = await didRef.current?.speak(text);
                            if (ok === false) showSpeechUnavailable();
                          }
                        }
                      }
                    }
                  }
                }

                // When user finishes speaking, add their message
                if (event.type === 'conversation.item.input_audio_transcription.completed') {
                  const userText = (event.transcript as string)?.trim();
                  if (userText) {
                    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: userText }]);
                  }
                  pendingUserTranscriptRef.current = '';
                }

                // Handle transcription failure - still show user spoke
                if (event.type === 'conversation.item.input_audio_transcription.failed') {
                  console.log('Transcription failed but model may still respond');
                  // Add a placeholder to show user spoke
                  if (!pendingUserTranscriptRef.current) {
                    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: '(Voice input - transcription unavailable)' }]);
                  }
                }

                // Handle interruption - user started speaking while assistant was talking
                if (event.type === 'input_audio_buffer.speech_started') {
                  console.log('User interrupted - speech started');
                  // The server VAD will handle stopping the current response
                }
              },
              onError: (error) => {
                console.error('Realtime error:', error);
                toast({
                  variant: 'destructive',
                  title: 'Voice Error',
                  description: 'Voice connection error. Attempting to reconnect...',
                });
              },
              onNetworkIssue: (message) => {
                setNetworkIssueMessage(message);
                toast({
                  title: 'Connection Issue',
                  description: message,
                  duration: 3000,
                });
              },
            }, audioSettings);

            await realtimeChatRef.current.init();
          } catch (error) {
            console.error('Failed to initialize OpenAI Realtime:', error);
            toast({
              variant: 'destructive',
              title: 'Voice Error',
              description: 'Failed to start voice. Avatar video will work without voice input.',
            });
            setStatus('connected');
          }
        },
        onDisconnected: () => {
          console.log('D-ID avatar disconnected');
          setStatus('disconnected');
          realtimeChatRef.current?.disconnect();
        },
        onSpeakingStart: () => {
          // D-ID speaking state is controlled by our calls, not needed here
        },
        onSpeakingEnd: () => {
          // D-ID speaking state is controlled by our calls
        },
        onError: (error) => {
          console.error('D-ID error:', error);
          toast({
            variant: 'destructive',
            title: 'Avatar Error',
            description: error.message || 'Failed to initialize avatar',
          });
          setStatus('disconnected');
        },
        onStreamReady: (stream) => {
          console.log('D-ID stream ready');
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        },
      });

      await didRef.current.init(videoRef.current);

      toast({
        title: 'Connecting',
        description: 'Setting up voice and video...',
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      setStatus('disconnected');
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to start conversation',
      });
    }
  }, [toast, showSpeechUnavailable]);

  const endConversation = useCallback(() => {
    realtimeChatRef.current?.disconnect();
    realtimeChatRef.current = null;
    didRef.current?.disconnect();
    didRef.current = null;
    setStatus('disconnected');
    setIsSpeaking(false);
    setIsListening(false);
    setMessages([]);
    toast({
      title: 'Disconnected',
      description: 'Session ended',
    });
  }, [toast]);

  const toggleMute = useCallback(() => {
    if (status !== 'connected') return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    realtimeChatRef.current?.setMuted(newMuted);
    setIsListening(!newMuted);

    toast({
      title: newMuted ? 'Microphone Off' : 'Microphone On',
      description: newMuted ? 'You are now muted' : 'You can speak now - just talk naturally!',
    });
  }, [status, isMuted, toast]);

  const sendTextMessage = useCallback(async () => {
    if (!inputText.trim() || status !== 'connected') return;

    const userMessage = inputText.trim();
    setInputText('');

    // Add user message
    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: userMessage }]);

    // Send via OpenAI Realtime
    try {
      realtimeChatRef.current?.sendTextMessage(userMessage);
    } catch (error) {
      console.error('Error sending text message:', error);
    }
  }, [inputText, status]);

  // Capture screen and send to AI
  const captureAndAnalyzeScreen = useCallback(async () => {
    if (!screenStreamRef.current || !isScreenSharing) return;

    try {
      const videoTrack = screenStreamRef.current.getVideoTracks()[0];
      if (!videoTrack) return;

      // Create canvas to capture frame
      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement('canvas');
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Create video element to draw from stream
      const video = document.createElement('video');
      video.srcObject = screenStreamRef.current;
      video.muted = true;
      await video.play();

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      video.pause();
      video.srcObject = null;

      // Send to AI with the screenshot
      const analysisPrompt = "I'm sharing my screen. Please look at this screenshot and help me with any issues you see. If there's an error, explain what's wrong and how to fix it.";
      
      setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: '📸 [Screen shared for analysis]' }]);
      
      // Send to OpenAI Realtime with image context
      if (realtimeChatRef.current) {
        realtimeChatRef.current.sendTextMessage(`${analysisPrompt}\n\n[Screen capture attached - analyzing the visible content on screen]`);
      }

      toast({
        title: 'Screen Captured',
        description: 'Aria is analyzing your screen...',
      });

    } catch (error) {
      console.error('Error capturing screen:', error);
      toast({
        variant: 'destructive',
        title: 'Capture Failed',
        description: 'Failed to capture screen for analysis',
      });
    }
  }, [isScreenSharing, toast]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      toast({
        title: 'Screen Share Ended',
        description: 'Screen sharing has been stopped',
      });
    } else {
      try {
        // Start screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        // Listen for when user stops sharing via browser UI
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          setIsScreenSharing(false);
          toast({
            title: 'Screen Share Ended',
            description: 'Screen sharing was stopped',
          });
        };

        toast({
          title: 'Screen Sharing Active',
          description: 'Click the screen share button again to capture and analyze your screen',
        });

        // Automatically capture after a short delay
        setTimeout(() => {
          captureAndAnalyzeScreen();
        }, 1000);

      } catch (error) {
        console.error('Error starting screen share:', error);
        if ((error as Error).name !== 'NotAllowedError') {
          toast({
            variant: 'destructive',
            title: 'Screen Share Failed',
            description: 'Could not start screen sharing. Please try again.',
          });
        }
      }
    }
  }, [isScreenSharing, toast, captureAndAnalyzeScreen]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
      });
      return;
    }

    // Supported file types
    const supportedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!supportedTypes.includes(file.type) && !file.name.endsWith('.txt')) {
      toast({
        variant: 'destructive',
        title: 'Unsupported file type',
        description: 'Please upload an image (JPG, PNG), PDF, Word document, or text file',
      });
      return;
    }

    setIsProcessingFile(true);

    try {
      const reader = new FileReader();
      
      reader.onload = async () => {
        const result = reader.result as string;
        
        if (file.type.startsWith('image/')) {
          // For images, store the base64 data URL directly
          setUploadedFile({
            name: file.name,
            type: file.type,
            data: result
          });
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          // For text files, extract the text content
          setUploadedFile({
            name: file.name,
            type: 'text/plain',
            data: result.replace(/^data:.*?;base64,/, '') // Remove data URL prefix and decode
          });
        } else {
          // For PDF and other documents, store as base64 for AI processing
          // The AI will try to analyze the content
          setUploadedFile({
            name: file.name,
            type: file.type,
            data: result
          });
        }

        toast({
          title: 'File uploaded',
          description: `${file.name} is ready. Send a message to ask about it!`,
        });
      };

      reader.onerror = () => {
        throw new Error('Failed to read file');
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Could not process the file. Please try again.',
      });
    } finally {
      setIsProcessingFile(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [toast]);

  // Send message with optional file
  const sendMessageWithFile = useCallback(async () => {
    if (status !== 'connected') return;
    if (!inputText.trim() && !uploadedFile) return;

    const userMessage = inputText.trim();
    const fileToSend = uploadedFile;
    
    setInputText('');
    setUploadedFile(null);

    // Add user message to chat
    const displayText = fileToSend 
      ? `${userMessage ? userMessage + '\n' : ''}📎 ${fileToSend.name}`
      : userMessage;
    
    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: displayText }]);

    try {
      // Call AI chat function with file data
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: userMessage || 'Please analyze this file and help me with it.',
          fileData: fileToSend?.data,
          fileType: fileToSend?.type,
          fileName: fileToSend?.name
        }
      });

      if (error) throw error;

      const aiResponse = data?.response || "I'm sorry, I couldn't process that.";
      
      // Add AI response to messages
      setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'agent', text: aiResponse }]);
      
      // Make D-ID avatar speak the response (truncate for speech)
      const speechText = aiResponse.length > 500 
        ? aiResponse.substring(0, 500) + "... I've provided more details in the chat."
        : aiResponse;
      
      const ok = await didRef.current?.speak(speechText);
      if (ok === false) showSpeechUnavailable();

    } catch (error) {
      console.error('Error processing message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to process your request. Please try again.',
      });
    }
  }, [status, inputText, uploadedFile, toast, showSpeechUnavailable]);

  // Remove uploaded file
  const removeUploadedFile = useCallback(() => {
    setUploadedFile(null);
  }, []);

  useEffect(() => {
    return () => {
      realtimeChatRef.current?.disconnect();
      didRef.current?.disconnect();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="glass-strong rounded-2xl overflow-hidden shadow-card">
        {/* Video call header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                status === 'connected'
                  ? 'bg-primary animate-pulse'
                  : status === 'connecting' || status === 'reconnecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="text-sm font-medium text-foreground">AI IT Support Agent - Aria</span>
            <span className="text-xs text-muted-foreground">
              • {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : status === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Network Quality Indicator */}
            <div className="flex items-center gap-1.5" title={getNetworkStatusText(networkInfo.quality)}>
              {networkInfo.quality === 'offline' ? (
                <WifiOff className={`w-4 h-4 ${getNetworkStatusColor(networkInfo.quality)}`} />
              ) : (
                <Wifi className={`w-4 h-4 ${getNetworkStatusColor(networkInfo.quality)}`} />
              )}
              <span className={`text-xs ${getNetworkStatusColor(networkInfo.quality)}`}>
                {networkInfo.quality === 'excellent' || networkInfo.quality === 'good' ? '' : getNetworkStatusText(networkInfo.quality)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-end gap-0.5 h-4">
                {audioLevels.map((level, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${isSpeaking ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    style={{ height: isSpeaking ? `${level * 100}%` : '30%' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Avatar video section */}
          <div className="flex-1 relative bg-gradient-to-b from-secondary/50 to-background min-h-[500px] lg:min-h-[600px]">
            <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" />

            <div className="relative z-10 flex items-center justify-center h-full">
              {/* D-ID Avatar Video */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-contain max-h-[550px] transition-all ${
                  status === 'connected' ? 'opacity-100' : 'opacity-0 absolute'
                }`}
              />

              {/* Placeholder when not connected */}
              {status !== 'connected' && (
                <div className={`flex items-center justify-center transition-all ${status === 'connecting' || status === 'reconnecting' ? 'animate-pulse' : ''}`}>
                  {status === 'connecting' || status === 'reconnecting' ? (
                    <div className="text-center">
                      <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {status === 'reconnecting' ? 'Reconnecting...' : 'Initializing avatar...'}
                      </p>
                      <p className="text-muted-foreground/60 text-sm mt-2">
                        {networkIssueMessage || (status === 'reconnecting' ? 'Please wait while we restore your connection' : 'This may take a moment')}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-32 h-32 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                        <Phone className="w-16 h-16 text-primary/60" />
                      </div>
                      <p className="text-muted-foreground text-lg mb-2">Ready to assist</p>
                      <p className="text-muted-foreground/60 text-sm">Click "Start Call" to begin</p>
                    </div>
                  )}
                </div>
              )}

              {/* Speaking/Listening indicator overlay */}
              {status === 'connected' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50 shadow-lg">
                  {isSpeaking ? (
                    <>
                      <div className="flex gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 bg-primary rounded-full animate-wave"
                            style={{
                              height: '16px',
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-foreground font-medium ml-2">Speaking...</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">Microphone off</span>
                    </>
                  ) : isListening ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-green-600 font-medium">Listening... Just speak!</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Ready</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Call controls */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
              {status === 'disconnected' ? (
                <Button variant="hero" size="lg" onClick={startConversation} className="rounded-full px-8">
                  <Phone className="w-5 h-5 mr-2" />
                  Start Call
                </Button>
              ) : status === 'connecting' ? (
                <Button variant="secondary" size="lg" disabled className="rounded-full px-8">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </Button>
              ) : (
                <>
                  <Button
                    variant={isMuted ? 'destructive' : 'glass'}
                    size="iconLg"
                    onClick={toggleMute}
                    className="rounded-full"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                  <Button 
                    variant={isScreenSharing ? 'default' : 'glass'} 
                    size="iconLg" 
                    className={`rounded-full ${isScreenSharing ? 'bg-primary animate-pulse' : ''}`}
                    onClick={toggleScreenShare}
                    title={isScreenSharing ? 'Click to capture screen' : 'Share screen'}
                  >
                    {isScreenSharing ? <Monitor className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </Button>
                  <Button variant="destructive" size="iconLg" className="rounded-full" onClick={endConversation}>
                    <Phone className="w-5 h-5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Chat section */}
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border/50 flex flex-col max-h-[600px]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Live Transcript</span>
              {isListening && !isMuted && (
                <span className="ml-auto text-xs text-green-600 animate-pulse">● Live</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && status === 'disconnected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Click "Start Call" to begin talking with Aria
                </div>
              )}
              {messages.length === 0 && status === 'connected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Just speak naturally - Aria is listening!
                </div>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-secondary text-secondary-foreground rounded-bl-md'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-border/50">
              {status === 'connected' && !isMuted && (
                <p className="text-xs text-green-600 mb-2 text-center">
                  🎤 Voice active - speak anytime to interrupt!
                </p>
              )}
              
              {/* Uploaded file preview */}
              {uploadedFile && (
                <div className="mb-2 flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                  {uploadedFile.type.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-primary" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                  <span className="text-sm text-foreground flex-1 truncate">{uploadedFile.name}</span>
                  <button
                    onClick={removeUploadedFile}
                    className="p-1 hover:bg-destructive/20 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              )}
              
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                {/* File upload button */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status !== 'connected' || isProcessingFile}
                  className="shrink-0"
                  title="Upload file (PDF, Image, Word, Text)"
                >
                  {isProcessingFile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </Button>
                
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessageWithFile()}
                  placeholder={uploadedFile ? 'Ask about the file...' : (status === 'connected' ? 'Or type a message...' : 'Connect to send messages')}
                  disabled={status !== 'connected'}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <Button 
                  size="sm" 
                  variant="hero" 
                  onClick={sendMessageWithFile} 
                  disabled={status !== 'connected' || (!inputText.trim() && !uploadedFile)}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
