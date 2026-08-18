async function run() {
    const embedRes = await fetch('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    const html = await embedRes.text();
    const token = 'Bearer ' + JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)[1]).props.pageProps.state.settings.session.accessToken;
    
    const artistRes = await fetch('https://api.spotify.com/v1/artists/1uNFoZAHBGtllmzznpCi3s', {
        headers: { 'Authorization': token }
    });
    console.log(artistRes.status);
    console.log(await artistRes.text());
}
run();
