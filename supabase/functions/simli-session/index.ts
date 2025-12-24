import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SIMLI_API_KEY = Deno.env.get('SIMLI_API_KEY');
    if (!SIMLI_API_KEY) {
      console.error('SIMLI_API_KEY is not set');
      throw new Error('SIMLI_API_KEY is not configured');
    }

    const { faceId } = await req.json();
    
    console.log('Creating Simli session for faceId:', faceId);

    // Start an audio-to-video session with Simli
    const response = await fetch("https://api.simli.ai/startAudioToVideoSession", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        faceId: faceId || "cace3ef7-a4c4-425d-a8cf-a5358eb0c427",
        apiKey: SIMLI_API_KEY,
        handleSilence: true,
        maxSessionLength: 3600,
        maxIdleTime: 600,
        syncAudio: true,
        model: "fasttalk",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Simli API error:', response.status, errorText);
      throw new Error(`Simli API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Simli session created:", data);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error creating Simli session:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
