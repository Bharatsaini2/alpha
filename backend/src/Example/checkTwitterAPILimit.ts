const { OAuth } = require('oauth');

const consumerKey = 'jWtOFis7OKnTAlvBJR2n3aDkT';
const consumerSecret = 'i6JkcyIh2R6wFC1jR0yTjmd6K24sAQQeHKWS7AHABmpzQIOrjP';
const accessToken = '1880103658324652032-WJxcMjlRHuspoNNAVCVoLuwAZjrTzO';  // alpha whale        
const accessTokenSecret = 'y7TYUrBI5IgdGKrevJjaLYUN4MJOuIJccgn5qasUPcqiZ';   // alpha whale
// const accessToken = '1897130118629429248-mCeI2JHx5koeVjatjYb8vxLQzhwWIx';    // alpha insight     
// const accessTokenSecret = '1MtvNlJp1aDMKUN2F8qtHsNV8LWKWgF6H19KrUbamRTqN';   // alpha insight

const oauth = new OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  consumerKey,
  consumerSecret,
  '1.0A',
  null,
  'HMAC-SHA1'
);

// Check rate limits
oauth.get(
  'https://api.twitter.com/1.1/application/rate_limit_status.json',
  accessToken,
  accessTokenSecret,
  (err:any, data:any) => {
    if (err) {
      console.error('❌ Error checking rate limit:', err);
    } else {
      const limits = JSON.parse(data);
      console.log('✅ Rate Limit Status:');
      console.log(JSON.stringify(limits.resources, null, 2)); // Pretty print
    }
  }
);
