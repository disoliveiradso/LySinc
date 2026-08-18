const fs = require('fs');
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
    fs.writeFileSync('scratch/pf_output.json', JSON.stringify(data.data.artistUnion.discography.topTracks.items[0], null, 2));
    console.log('Done');
}
run();
