const https = require('https');
https.get('https://open.spotify.com/artist/04gDigrS5kc9YWfZHwBETP', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const match = data.match(/"followers":\{"total":(\d+)/) || data.match(/followerCount":(\d+)/i) || data.match(/"followerCount":\s*(\d+)/);
        console.log("Followers:", match ? match[1] : "not found");
    });
});
