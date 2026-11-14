import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '{}');
if (!credentials.client_email || !credentials.private_key) throw new Error('Play service account JSON is missing or invalid.');
const packageName = 'zw.co.detailapp.mobile';
const listing = JSON.parse(await readFile('play-store/listing.json', 'utf8'));
const base64url = value => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${base64url(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${base64url(JSON.stringify({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}))}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
if (!tokenResponse.ok) throw new Error(`Google service account authentication failed (HTTP ${tokenResponse.status}).`);
const {access_token} = await tokenResponse.json();
const root = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
async function request(url, method, body, contentType='application/json') {
  const response = await fetch(url,{method,headers:{authorization:`Bearer ${access_token}`,...(body ? {'content-type':contentType} : {})},body});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`Play API ${method} failed (HTTP ${response.status}): ${data.error?.message || 'Unknown error'}`);
  return data;
}
const edit = await request(`${root}/edits`,'POST','{}');
const editRoot = `${root}/edits/${encodeURIComponent(edit.id)}`;
await request(`${editRoot}/listings/${listing.language}`,'PUT',JSON.stringify(listing));
const icon = await readFile('play-store/icon.png');
await request(`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${encodeURIComponent(edit.id)}/listings/${listing.language}/icon?uploadType=media`,'POST',icon,'image/png');
await request(`${editRoot}:commit`,'POST','{}');
console.log('Play listing and icon changes submitted. Google may show temporary details until review.');
