const https = require('https');

function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({
                status: res.statusCode,
                ok: res.statusCode >= 200 && res.statusCode < 300,
                json: () => JSON.parse(body)
            }));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function test() {
    // Alok's Spotify ID
    const artistId = '01aBc2D3eFg4HiJ5kLm6No'; // Wait, let's use a real one. Let's just search for Alok
    const token = 'BQA...'; // I need a token.
    console.log('Without a token or client secret I cannot fetch. I will write a mock test.');
}

test();
