const { OAuth } = require('oauth');
const readline = require('readline');

// Step 1: Use Alpha Whale developer app credentials
const consumerKey = 'jWtOFis7OKnTAlvBJR2n3aDkT';
const consumerSecret = 'i6JkcyIh2R6wFC1jR0yTjmd6K24sAQQeHKWS7AHABmpzQIOrjP';

const oauth = new OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    consumerKey,
    consumerSecret,
    '1.0A',
    null,   
    'HMAC-SHA1'
  );
  
  oauth.getOAuthRequestToken((err:any, oauthToken:any, oauthTokenSecret:any) => {
    if (err) {
      console.error('Error getting request token:', err);
      return;
    }
  
    console.log(`Authorize the app: https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`);
  
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
    rl.question('Enter the PIN (oauth_verifier): ', (oauthVerifier:any) => {
      rl.close();
  
      oauth.getOAuthAccessToken(oauthToken, oauthTokenSecret, oauthVerifier, (err:any, accessToken:any, accessTokenSecret:any) => {
        if (err) {
          console.error('Error getting access token:', err);
          return;
        }
  
        console.log('Access Token:', accessToken);
        console.log('Access Token Secret:', accessTokenSecret);
      });
    });
  });