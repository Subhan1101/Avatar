import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DID_API_KEY = Deno.env.get('DID_API_KEY');
const DID_API_URL = 'https://api.d-id.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!DID_API_KEY) {
      throw new Error('DID_API_KEY is not configured');
    }

    // Parse body ONCE at the top
    const body = await req.json();
    const { action, agentId, streamId, sessionId, text, answer, candidate, sdpMid, sdpMLineIndex } = body;
    console.log('D-ID action:', action);

    const authHeader = `Basic ${DID_API_KEY}`;

    // Create a new stream
    if (action === 'create-stream') {
      console.log('Creating D-ID stream for agent:', agentId);
      
      const response = await fetch(`${DID_API_URL}/agents/${agentId}/streams`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          compatibility_mode: 'on',
          fluent: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('D-ID create stream error:', response.status, errorText);
        throw new Error(`Failed to create stream: ${response.status}`);
      }

      const data = await response.json();
      console.log('Stream created:', data.id);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit SDP answer
    if (action === 'submit-sdp') {
      console.log('Submitting SDP answer for stream:', streamId);
      
      const response = await fetch(`${DID_API_URL}/agents/${agentId}/streams/${streamId}/sdp`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answer: answer,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('D-ID submit SDP error:', response.status, errorText);
        throw new Error(`Failed to submit SDP: ${response.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit ICE candidate
    if (action === 'submit-ice') {
      const iceBody: Record<string, unknown> = { session_id: sessionId };
      if (candidate) {
        iceBody.candidate = candidate;
        iceBody.sdpMid = sdpMid;
        iceBody.sdpMLineIndex = sdpMLineIndex;
      }

      const response = await fetch(`${DID_API_URL}/agents/${agentId}/streams/${streamId}/ice`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(iceBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('D-ID submit ICE error:', response.status, errorText);
        // Don't throw for ICE errors, just log
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Speak - make avatar say specific text (uses our own AI for responses)
    if (action === 'speak') {
      console.log('Making avatar speak:', text?.substring(0, 50));
      
      const response = await fetch(`${DID_API_URL}/agents/${agentId}/streams/${streamId}`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: {
            type: 'text',
            input: text,
          },
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('D-ID speak error:', response.status, errorText);
        throw new Error(`Failed to speak: ${response.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Close stream
    if (action === 'close-stream') {
      console.log('Closing stream:', streamId);
      
      await fetch(`${DID_API_URL}/agents/${agentId}/streams/${streamId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
        }),
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Unknown action: ' + action);

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('D-ID stream error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
