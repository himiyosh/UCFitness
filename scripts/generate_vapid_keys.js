const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Paste the following into your .env.local file:');
console.log('');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your@email.com`);
