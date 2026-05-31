const ACCESS_TOKEN = 'ROW_iTMkXQAAAAARaTd67iVwZbvJj7plvfhjKQo6WHHjSKQnuGwpd15HjuT5nw0eVizcbzv-O3RknrAYlSsf7UwIRyPjkC8H6gwz7PoVZhZcY6LgqVir8B6XXvD_GvHVxIa9NfdolQWzCT4BRHn4BkVCM-KSEq9gV6KeYxFlEWtcI4LcRaknVg6CU8PUTKLlQ9ugvQz5J1N6Stw';
const URL = 'https://open-api.tiktok-shops.com/authorization/202309/shops';

console.log('GET', URL);
console.log('x-tts-access-token:', ACCESS_TOKEN.slice(0, 30) + '...');
console.log();

const resp = await fetch(URL, {
  headers: {
    'x-tts-access-token': ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

const body = await resp.text();
console.log('HTTP status:', resp.status);
console.log('Response headers:', Object.fromEntries(resp.headers));
console.log('Response body:', body);

try {
  const json = JSON.parse(body);
  console.log('\nParsed JSON:', JSON.stringify(json, null, 2));
} catch {
  console.log('\n(Body is not valid JSON)');
}
