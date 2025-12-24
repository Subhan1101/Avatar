import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY');
    if (!HEYGEN_API_KEY) {
      console.error('HEYGEN_API_KEY is not set');
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    console.log('Requesting HeyGen access token...');

    // Get access token for streaming avatar
    const response = await fetch("https://api.heygen.com/v1/streaming.create_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": HEYGEN_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HeyGen API error:", response.status, errorText);
      throw new Error(`HeyGen API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("HeyGen token created successfully");

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error creating HeyGen token:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
