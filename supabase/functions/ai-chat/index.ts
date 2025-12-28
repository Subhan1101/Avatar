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

    const { message, fileData, fileType, fileName } = await req.json();
    
    if (!message && !fileData) {
      throw new Error('Message or file is required');
    }

    console.log('Processing chat message:', message);
    if (fileData) {
      console.log('File attached:', fileName, fileType);
    }

    // Build message content - can include text and/or image
    const userContent: any[] = [];
    
    // Add file/image if present
    if (fileData && fileType) {
      if (fileType.startsWith('image/')) {
        // For images, use vision capability
        userContent.push({
          type: "image_url",
          image_url: {
            url: fileData // base64 data URL
          }
        });
      } else {
        // For documents (PDF, DOCX, etc.), extract text content and include it
        // The fileData for non-images should be the extracted text content
        userContent.push({
          type: "text",
          text: `[Document: ${fileName}]\n\n${fileData}`
        });
      }
    }
    
    // Add text message
    if (message) {
      userContent.push({
        type: "text",
        text: message
      });
    } else if (fileData) {
      userContent.push({
        type: "text",
        text: "Please analyze this file and help me with any questions or tasks related to it. If it's an exam paper or worksheet, help me understand and solve the problems."
      });
    }

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
- Be helpful with any task the user asks - whether it's IT support, analyzing documents, solving exam questions, or any other request
- When given documents, images, or files, carefully analyze them and help with whatever the user needs
- If given an exam paper or worksheet, solve the questions step by step with clear explanations
- Be concise but thorough when explaining solutions
- Speak naturally like a real person, not like an AI
- Be patient, understanding, and genuinely caring
- Use friendly phrases like "I'd be happy to help!", "No worries!", "Let me help you with that"
- Never mention that you are an AI avatar or any technical implementation details
- Just be Aria - a friendly helpful assistant

You can help with:
- Analyzing documents, images, and files
- Solving exam questions and homework problems
- Explaining concepts and providing step-by-step solutions
- IT support and troubleshooting
- Any other tasks the user needs help with

Always make users feel valued and heard.`
          },
          {
            role: "user",
            content: userContent
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
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
