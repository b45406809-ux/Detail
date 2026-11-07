import React, { useEffect, useState } from 'react';
import { AlertButton, AlertOptions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { CameraOff, CircleAlert, Info } from 'lucide-react-native';

type Dialog = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let queue: Dialog[] = [];
let hosts: symbol[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export function appAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  queue = [...queue, { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options }];
  notify();
}
export function AppDialogHost() {
  const [id] = useState(() => Symbol('dialog host'));
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    listeners.add(update);
    hosts = [...hosts, id];
    notify();
    return () => { listeners.delete(update); hosts = hosts.filter(host => host !== id); notify(); };
  }, [id]);
  const dialog = hosts[hosts.length - 1] === id ? queue[0] : undefined;
  const dismiss = (action?: () => void) => {
    queue = queue.slice(1);
    notify();
    if (action) setTimeout(action, 350);
  };
  const Icon = /photo|camera/i.test(dialog?.title ?? '') ? CameraOff : /error|failed|unavailable|could not|permission/i.test(dialog?.title ?? '') ? CircleAlert : Info;
  return <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => { if (dialog?.options?.cancelable) dismiss(dialog.options.onDismiss); }}>
    <View className="flex-1 items-center justify-center bg-[#150256]/55 px-6">
      <View accessibilityViewIsModal style={{ maxHeight: '85%' }} className="w-full max-w-[400px] rounded-[28px] bg-white px-6 py-6 items-center">
        <View className="h-12 w-12 rounded-full bg-accent/10 items-center justify-center mb-4"><Icon size={24} color="#3906D2" /></View>
        <Text accessibilityRole="header" className="text-xl font-display font-black text-ink text-center">{dialog?.title}</Text>
        {!!dialog?.message && <ScrollView style={{ flexGrow: 0, flexShrink: 1, maxHeight: 160, width: '100%', marginTop: 10 }}><Text className="font-sans text-sm leading-5 text-ink/60 text-center">{dialog.message}</Text></ScrollView>}
        <View className="w-full mt-5 gap-2">
          {dialog?.buttons.filter(button => button.style !== 'cancel').map((button, index) => <Pressable key={`${button.text}-${index}`} accessibilityRole="button" onPress={() => dismiss(button.onPress)} className={`w-full rounded-full py-3.5 items-center ${button.style === 'destructive' ? 'bg-red-600' : 'bg-accent'}`}><Text className="font-sans-bold text-sm text-white">{button.text || 'OK'}</Text></Pressable>)}
          {dialog?.buttons.filter(button => button.style === 'cancel').map((button, index) => <Pressable key={`${button.text}-${index}`} accessibilityRole="button" onPress={() => dismiss(button.onPress)} className="w-full py-3 items-center"><Text className="font-sans-bold text-sm text-accent">{button.text || 'Cancel'}</Text></Pressable>)}
        </View>
      </View>
    </View>
  </Modal>;
}
