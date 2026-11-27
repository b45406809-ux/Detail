import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { callFunction } from './functions';
import { appAlert } from '../components/AppDialog';

export class CleanerLocationPermissionError extends Error {
  constructor(message: string, public canAskAgain: boolean) { super(message); }
}

export const CLEANER_LOCATION_TASK='detail-cleaner-location';
let cleanerPresenceStarting = false;

if (Platform.OS !== 'web') {
  TaskManager.defineTask(CLEANER_LOCATION_TASK, async ({data,error})=>{
    if(error||!data)return;
    const locations=(data as {locations?:Location.LocationObject[]}).locations;
    const newest=locations?.at(-1);
    if(!newest)return;
    try{await callFunction('updateCleanerLocation',{lat:newest.coords.latitude,lng:newest.coords.longitude});}
    catch(e){console.warn('[location] cleaner update failed',String(e));}
  });
}

async function registerCleanerLocationUpdates(){
  if (Platform.OS === 'web') throw new Error('Background cleaner location is available in the Detail mobile app.');
  // Starting again on a registered task applies the current options, so devices
  // already online pick up the heartbeat settings after an app update.
  await Location.startLocationUpdatesAsync(CLEANER_LOCATION_TASK,{
    // High accuracy and no automatic pausing: iOS stops paused updates until the
    // app is reopened, so a cleaner waiting in one place silently went stale.
    // distanceInterval 0 + a 60s deferral sends a heartbeat about once a minute
    // even when the cleaner is not moving, so they stay matchable while online.
    accuracy:Location.Accuracy.High,timeInterval:60000,distanceInterval:0,deferredUpdatesInterval:60000,
    pausesUpdatesAutomatically:false,activityType:Location.ActivityType.OtherNavigation,showsBackgroundLocationIndicator:true,
    foregroundService:{notificationTitle:'Detail cleaner availability is on',notificationBody:'Your location is shared while you are online and during an active booking.',notificationColor:'#3906d2'},
  });
}

/**
 * Google Play prominent disclosure: on Android, explain background location in the
 * app before the system permission prompt. Shown until background access is granted.
 */
async function confirmBackgroundLocationDisclosure(){
  if (Platform.OS !== 'android') return;
  if ((await Location.getBackgroundPermissionsAsync()).granted) return;
  const accepted = await new Promise<boolean>((resolve) => {
    appAlert(
      'Location while you are online',
      'Detail collects your location to match you with nearby cleaning requests and to show customers your arrival, ' +
      'even when the app is closed or not in use. This happens only while you are online or on an active booking, ' +
      'and stops when you go offline. Your location is not used for ads.\n\n' +
      'On the next screen, choose "Allow all the time" to stay matchable when Detail is in the background.',
      [
        { text: 'No thanks', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
  if (!accepted) throw new CleanerLocationPermissionError('Location sharing is needed to go online. You can turn it on any time from Go Online.', true);
}

export async function startCleanerLocationUpdates(){
  cleanerPresenceStarting = true;
  try {
    await confirmBackgroundLocationDisclosure();
    const foreground=await Location.requestForegroundPermissionsAsync();
    if(!foreground.granted)throw new CleanerLocationPermissionError('Allow location while using Detail to go online.', foreground.canAskAgain);
    const background=await Location.requestBackgroundPermissionsAsync();
    if(!background.granted)throw new CleanerLocationPermissionError('Allow background location while online so nearby customers can receive accurate availability and active-job updates.', background.canAskAgain);
    await registerCleanerLocationUpdates();
  } catch (error) {
    cleanerPresenceStarting = false;
    throw error;
  }
}

/** Resume a saved online choice after restart without prompting again. */
export async function resumeCleanerLocationUpdates(){
  const foreground=await Location.getForegroundPermissionsAsync();
  if(!foreground.granted)throw new Error('Location permission was removed. Go offline, then online again to restore sharing.');
  const background=await Location.getBackgroundPermissionsAsync();
  if(!background.granted)throw new Error('Background location permission was removed. Go offline, then online again to restore sharing.');
  await registerCleanerLocationUpdates();
}

export function completeCleanerPresenceStart(){cleanerPresenceStarting=false;}
export function isCleanerPresenceStarting(){return cleanerPresenceStarting;}

export async function stopCleanerLocationUpdates(){
  cleanerPresenceStarting = false;
  if (Platform.OS === 'web') return;
  if(await TaskManager.isTaskRegisteredAsync(CLEANER_LOCATION_TASK))await Location.stopLocationUpdatesAsync(CLEANER_LOCATION_TASK);
}
