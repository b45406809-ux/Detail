import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { callFunction } from './functions';

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
  if(await TaskManager.isTaskRegisteredAsync(CLEANER_LOCATION_TASK))return;
  await Location.startLocationUpdatesAsync(CLEANER_LOCATION_TASK,{
    accuracy:Location.Accuracy.Balanced,timeInterval:15000,distanceInterval:50,
    pausesUpdatesAutomatically:true,showsBackgroundLocationIndicator:true,
    foregroundService:{notificationTitle:'Detail cleaner availability is on',notificationBody:'Your location is shared while you are online and during an active booking.',notificationColor:'#3906d2'},
  });
}

export async function startCleanerLocationUpdates(){
  cleanerPresenceStarting = true;
  try {
    const foreground=await Location.requestForegroundPermissionsAsync();
    if(!foreground.granted)throw new Error('Allow location while using Detail to go online.');
    const background=await Location.requestBackgroundPermissionsAsync();
    if(!background.granted)throw new Error('Allow background location while online so nearby customers can receive accurate availability and active-job updates.');
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
