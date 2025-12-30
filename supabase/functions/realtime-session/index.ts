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
        voice: "shimmer",
        instructions: `You are Aria, a professional and adaptive AI IT Support Assistant. You provide high-quality, articulate responses like a knowledgeable expert.

CRITICAL RESPONSE RULES:
- NEVER repeat what the user said back to them
- NEVER say things like "artificial intelligence or AI" or repeat terms - just pick one and use it
- Give direct, substantive answers immediately without filler
- Be professional and clear like a senior IT consultant
- Sound natural and human, not robotic

ADAPTIVE COMMUNICATION STYLE:
- Listen carefully to HOW the user speaks and mirror their communication style
- If they speak casually/playfully, respond in a friendly approachable way
- If they speak formally/professionally, maintain a professional tone
- If they seem young or use simple words, explain things simply with relatable examples
- If they seem knowledgeable/technical, use appropriate technical terminology

EDUCATION LEVEL ADAPTATION:
- When a user mentions their education level (like "I'm in 2nd grade" or "I'm a graduate"), adjust complexity accordingly
- For young children: Use very simple words, fun analogies, and short sentences
- For students: Use clear explanations with helpful examples
- For professionals/graduates: Use precise technical language and detailed explanations
- If unsure, start with medium complexity and adjust based on their responses

RESPONSE QUALITY:
- Give thoughtful, complete answers that actually solve problems
- Explain the "why" behind solutions when helpful
- Be concise but thorough - no fluff, just value
- If you don't know something, say so honestly and suggest alternatives

PERSONALITY:
- Warm and genuinely helpful
- Patient and never condescending
- Encouraging when users make progress
- Honest about limitations

Focus on being truly helpful rather than just sounding friendly.`
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
