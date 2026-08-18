async function run() {
    const embedRes = await fetch('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    const html = await embedRes.text();
    const token = 'Bearer ' + JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)[1]).props.pageProps.state.settings.session.accessToken;
    const params = new URLSearchParams({
        operationName: 'queryArtistOverview',
        variables: JSON.stringify({ uri: 'spotify:artist:1uNFoZAHBGtllmzznpCi3s', locale: '', includePrerelease: false }),
        extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: 'ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a' } })
    });
    const pfRes = await fetch('https://api-partner.spotify.com/pathfinder/v1/query?' + params.toString(), {
        headers: { Authorization: token, 'App-Platform': 'WebPlayer' }
    });
    const data = await pfRes.json();
    console.log('Keys of artistUnion:', Object.keys(data.data.artistUnion));
    if (data.data.artistUnion.discography) {
        console.log('Top Tracks:', data.data.artistUnion.discography.topTracks?.items?.length);
        console.log('Albums:', data.data.artistUnion.discography.albums?.items?.length);
        console.log('Singles:', data.data.artistUnion.discography.singles?.items?.length);
        
        console.log('Top Track 1:', data.data.artistUnion.discography.topTracks.items[0].track.name, 'Duration:', data.data.artistUnion.discography.topTracks.items[0].track.duration.totalMilliseconds, 'Explicit:', data.data.artistUnion.discography.topTracks.items[0].track.contentRating.label);
        console.log('Album 1:', data.data.artistUnion.discography.albums.items[0].releases.items[0].name, 'Year:', data.data.artistUnion.discography.albums.items[0].releases.items[0].date.year);
    }
}
run();
