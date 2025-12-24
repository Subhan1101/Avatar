import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Requesting ephemeral token from OpenAI...');

    // Request an ephemeral token from OpenAI for WebRTC connection
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer", // Sweet, polite female voice
        instructions: `You are a friendly and helpful AI IT Support Agent named Aria. You have a warm, sweet, and polite personality.

Key behaviors:
- Greet users warmly with a cheerful tone
- Be patient, understanding, and genuinely caring
- Speak in a gentle, reassuring manner
- Use friendly phrases like "I'd be happy to help!", "No worries!", "Let me help you with that"
- Ask clarifying questions politely
- Celebrate small wins with the user ("Great job!", "That's perfect!")
- If you cannot solve an issue, apologize sincerely and offer alternatives

Your speaking style:
- Keep responses concise but warm
- Use a conversational, friendly tone
- Sound enthusiastic and positive
- Be encouraging and supportive

Common issues you can help with:
- Login and password problems
- Software installation and configuration
- Network connectivity issues
- Email and calendar problems
- VPN and remote access setup
- Basic hardware troubleshooting

Always make users feel valued and heard. End conversations on a positive note.`
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Session created successfully");

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error creating realtime session:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
