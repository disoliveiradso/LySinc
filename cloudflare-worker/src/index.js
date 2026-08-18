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
      else if (url.pathname.startsWith('/spotify/pathfinder/')) {
        let token = request.headers.get("Authorization");
        
        // Fetch anonymous token if missing
        if (!token) {
          const embedRes = await fetch("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          const html = await embedRes.text();
          const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
          if (match) {
            const nextData = JSON.parse(match[1]);
            token = "Bearer " + nextData.props.pageProps.state.settings.session.accessToken;
          }
        }

        const targetUrl = `https://api-partner.spotify.com/pathfinder/v1/query${url.search}`;
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "Authorization": token || "",
            "App-Platform": "WebPlayer",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Endpoint não suportado" }), {
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
