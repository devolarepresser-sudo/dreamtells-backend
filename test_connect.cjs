const http = require('http');

console.log("Testing connection to http://localhost:10000/api/interpretarSonho...");

const data = JSON.stringify({
    text: "Teste de conexão",
    language: "pt"
});

const options = {
    hostname: 'localhost',
    port: 10000,
    path: '/api/interpretarSonho',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(data);
req.end();
