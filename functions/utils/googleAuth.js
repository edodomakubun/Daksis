// functions/utils/googleAuth.js

/**
 * Encodes an ArrayBuffer or Uint8Array to a Base64URL string.
 * @param {Uint8Array} buffer
 * @returns {string}
 */
function base64urlEncode(buffer) {
    let str = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Converts a string to an ArrayBuffer.
 * @param {string} str
 * @returns {Uint8Array}
 */
function stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

/**
 * Generates a Google API OAuth2 Access Token using a Service Account Key.
 * @param {Object} serviceAccount - Parsed JSON object of the Google Service Account key.
 * @param {string[]} scopes - Array of Google API scopes needed.
 * @returns {Promise<string>} - The access token.
 */
export async function getGoogleAuthToken(serviceAccount, scopes) {
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: serviceAccount.client_email,
        scope: scopes.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600, // Token valid for 1 hour
        iat: now
    };

    const encodedHeader = base64urlEncode(stringToArrayBuffer(JSON.stringify(header)));
    const encodedClaimSet = base64urlEncode(stringToArrayBuffer(JSON.stringify(claimSet)));
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    // Import the private key for signing
    // Cloudflare Workers supports the Web Crypto API
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = serviceAccount.private_key
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, ''); // Remove newlines and spaces

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryDer.buffer,
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256'
        },
        false,
        ['sign']
    );

    // Sign the JWT
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        stringToArrayBuffer(signatureInput)
    );

    const encodedSignature = base64urlEncode(signature);
    const jwt = `${signatureInput}.${encodedSignature}`;

    // Request the access token from Google OAuth2 server
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Failed to obtain access token: ${data.error_description || data.error}`);
    }

    return data.access_token;
}
