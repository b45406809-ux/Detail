import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { callFunction } from './functions';

export const CLEANER_LOCATION_TASK='detail-cleaner-location';

TaskManager.defineTask(CLEANER_LOCATION_TASK, async ({data,error})=>{
  if(error||!data)return;
  const locations=(data as {locations?:Location.LocationObject[]}).locations;
  const newest=locations?.at(-1);
  if(!newest)return;
  try{await callFunction('updateCleanerLocation',{lat:newest.coords.latitude,lng:newest.coords.longitude});}
  catch(e){console.warn('[location] cleaner update failed',String(e));}
});

export async function startCleanerLocationUpdates(){
  const foreground=await Location.requestForegroundPermissionsAsync();
  if(!foreground.granted)throw new Error('Allow location while using Detail to go online.');
  const background=await Location.requestBackgroundPermissionsAsync();
  if(!background.granted)throw new Error('Allow background location while online so nearby customers can receive accurate availability and active-job updates.');
  if(await TaskManager.isTaskRegisteredAsync(CLEANER_LOCATION_TASK))return;
  await Location.startLocationUpdatesAsync(CLEANER_LOCATION_TASK,{
    accuracy:Location.Accuracy.Balanced,timeInterval:15000,distanceInterval:50,
    pausesUpdatesAutomatically:true,showsBackgroundLocationIndicator:true,
    foregroundService:{notificationTitle:'Detail cleaner availability is on',notificationBody:'Your location is shared while you are online and during an active booking.',notificationColor:'#3906d2'},
  });
}

export async function stopCleanerLocationUpdates(){
  if(await TaskManager.isTaskRegisteredAsync(CLEANER_LOCATION_TASK))await Location.stopLocationUpdatesAsync(CLEANER_LOCATION_TASK);
}
