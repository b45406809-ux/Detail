/**
 * One-time admin bootstrap. Uses Application Default Credentials or
 * GOOGLE_APPLICATION_CREDENTIALS. Passwords are accepted only through the
 * process environment and are never written to this repository/Firestore.
 *
 * ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='temporary-secret' npm run bootstrap-admin
 */
import admin from 'firebase-admin';

admin.initializeApp();
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD||'';
if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (minimum 8 characters).');
let user;
try{user=await admin.auth().getUserByEmail(email);await admin.auth().updateUser(user.uid,{password,emailVerified:true,disabled:false});}
catch(error){if(error?.code!=='auth/user-not-found')throw error;user=await admin.auth().createUser({email,password,emailVerified:true});}
await admin.auth().setCustomUserClaims(user.uid,{admin:true,elevated:true,permissions:['admins.manage','marketing.read','marketing.send','finance.read','audit.read']});
process.stdout.write(`Bootstrapped elevated admin ${email} (${user.uid}). Sign in and change the temporary password immediately.\n`);
