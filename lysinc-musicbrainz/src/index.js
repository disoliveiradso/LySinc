export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, App-Platform",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname.startsWith('/musicbrainz/')) {
        const targetPath = url.pathname.replace('/musicbrainz/', '');
        const targetUrl = `https://musicbrainz.org/ws/2/${targetPath}${url.search}`;
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "LySinc/5.0.0 ( https://github.com/disoliveiradso/LySinc )",
            "Accept": "application/json"
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Endpoint não suportado no proxy do MusicBrainz" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
