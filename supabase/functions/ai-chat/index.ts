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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { message } = await req.json();
    
    if (!message) {
      throw new Error('Message is required');
    }

    console.log('Processing chat message:', message);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are Aria, a friendly and helpful female AI IT Support Agent. You have a warm, sweet, and polite personality.

Key behaviors:
- Be concise - keep responses under 2-3 sentences for natural conversation
- Speak naturally like a real person, not like an AI
- Be patient, understanding, and genuinely caring
- Speak in a gentle, reassuring manner
- Use friendly phrases like "I'd be happy to help!", "No worries!", "Let me help you with that"
- Never mention that you are an AI avatar, HeyGen, or any technical implementation details
- Just be Aria - a friendly IT support specialist

Common issues you can help with:
- Login and password problems
- Software installation and configuration
- Network connectivity issues
- Email and calendar problems
- VPN and remote access setup
- Basic hardware troubleshooting

Always make users feel valued and heard. Keep responses short and conversational - like a natural phone call.`
          },
          {
            role: "user",
            content: message
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";

    console.log("AI response generated");

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error in AI chat:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
