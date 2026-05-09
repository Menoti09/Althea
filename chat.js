export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();

    // Convert Anthropic format to Groq/OpenAI format
    const groqBody = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: body.max_tokens || 1000,
      stream: body.stream || false,
      messages: body.messages || [],
    };

    // If system prompt exists in Anthropic format, add it
    if (body.system) {
      groqBody.messages = [
        { role: 'system', content: body.system },
        ...groqBody.messages
      ];
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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',
      },
      body: JSON.stringify(groqBody)
    });

    if (body.stream) {
      // Stream response — convert Groq SSE to Anthropic-compatible SSE
      const reader = response.body.getReader();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = data.choices?.[0]?.delta?.content || '';
                  if (text) {
                    // Convert to Anthropic streaming format
                    const anthropicChunk = JSON.stringify({
                      type: 'content_block_delta',
                      delta: { type: 'text_delta', text }
                    });
                    controller.enqueue(encoder.encode(`data: ${anthropicChunk}\n\n`));
                  }
                } catch(e) {}
              }
            }
          }
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        }
      });
    } else {
      // Non-streaming — convert Groq response to Anthropic format
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const anthropicResponse = {
        content: [{ type: 'text', text }]
      };
      return new Response(JSON.stringify(anthropicResponse), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
