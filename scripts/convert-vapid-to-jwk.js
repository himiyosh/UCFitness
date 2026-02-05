const webpush = require('web-push'); // We can use this in the script (Node env)
const fs = require('fs');

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BMqwMC-gQS05c3CQFXdNHXK1GgJ6uqKGgmxhW18wfdL6BY20YRawfb1BZb3ocCOf5W4bPa-dd8TXy-anQxEJXH0';
const privateKey = process.env.VAPID_PRIVATE_KEY || '4DPxWCpiV35X3xDoRzRUmksjyZhmFXV5dOrzljgI2hU';

// Function to convert VAPID keys to JWK
// Since web-push doesn't export this easily, we use native crypto
const crypto = require('crypto');

function toUrlBase64(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function convert() {
    // 1. Create a KeyObject from the private key (which is base64url encoded P-256 scalar)
    // We need to construct the standard curve info to make it a valid PEM/JWK
    
    // Actually, simple trick: web-push generates keys.
    // Let's use crypto to import the raw scalar.
    
    // Decode base64url to buffer
    const d = Buffer.from(privateKey, 'base64url'); // Node 14+ supports 'base64url'
    
    // We basically need to construct a JWK manually since we know the curve P-256
    // But we need the public points X and Y for a full JWK usually? 
    // Actually, for signing (private), we need d.
    // Let's try to see if we can get x and y from the public key.
    
    // Public Key is uncompressed point: 0x04 + x + y
    const pubBuf = Buffer.from(publicKey, 'base64url');
    // P-256 keys are 65 bytes (1 header + 32 x + 32 y)
    const x = pubBuf.slice(1, 33);
    const y = pubBuf.slice(33, 65);
    
    const jwk = {
        kty: 'EC',
        crv: 'P-256',
        d: d.toString('base64url'),
        x: x.toString('base64url'),
        y: y.toString('base64url')
    };
    
    console.log('\n=== COPY THIS JWK TO .env.local ===');
    console.log(`VAPID_PRIVATE_JWK='${JSON.stringify(jwk)}'`);
    console.log('====================================\n');
}

convert();
