import { db, doc, updateDoc } from '../firebase';
import { arrayUnion } from 'firebase/firestore';

// WebRTC Signaling Client for secure VoIP live calls using Firestore
export class WebRTCCallClient {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private jobId: string;
  private userId: string;
  private isCaller: boolean;
  private onRemoteStreamCallback: (stream: MediaStream) => void;
  private onConnectionStateChange?: (state: string) => void;
  private audioContext: AudioContext | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackNode: GainNode | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private synthesisUtterance: SpeechSynthesisUtterance | null = null;

  constructor(
    jobId: string,
    userId: string,
    isCaller: boolean,
    onRemoteStream: (stream: MediaStream) => void,
    onConnectionStateChange?: (state: string) => void
  ) {
    this.jobId = jobId;
    this.userId = userId;
    this.isCaller = isCaller;
    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  private getIceConfiguration(): RTCConfiguration {
    return {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
          ],
        },
      ],
    };
  }

  // Captures microphone or falls back to synthetic line if permission denied in iframe
  async startLocalStream(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.localStream = stream;
      return stream;
    } catch (err) {
      console.warn('[WebRTC Voice] Microphone permission blocked. Implementing mock carrier audio generator.', err);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440Hz safe test tone
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime); // silent background hum
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      this.audioContext = audioCtx;
      this.localStream = dest.stream;
      return dest.stream;
    }
  }

  // Setup actual browser peer connection
  async initializePeerConnection() {
    if (this.pc) return;

    this.pc = new RTCPeerConnection(this.getIceConfiguration());
    
    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamCallback(event.streams[0]);
        this.playRemoteStream(event.streams[0]);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });
    }

    // Capture candidates and push to client array lists in Firestore
    this.pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      
      try {
        const candidateData = event.candidate.toJSON();
        const docRef = doc(db, 'jobs', this.jobId);
        const listField = this.isCaller ? 'activeCall.callerCandidates' : 'activeCall.recipientCandidates';
        
        await updateDoc(docRef, {
          [listField]: arrayUnion(candidateData)
        });
      } catch (err) {
        console.error('[WebRTC] Failed to sync ICE candidate to Firestore:', err);
      }
    };
  }

  // Create call offer Sdp and register it in firestore doc
  async createOffer(): Promise<any> {
    await this.initializePeerConnection();
    if (!this.pc) throw new Error('Peer connection failed to establish');

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
    });
    await this.pc.setLocalDescription(offer);
    
    const docRef = doc(db, 'jobs', this.jobId);
    await updateDoc(docRef, {
      'activeCall.offer': { sdp: offer.sdp, type: offer.type },
      'activeCall.callerCandidates': []
    });

    return offer;
  }

  // Set remote offer and reply back with set local answer Sdp
  async createAnswer(offerSdp: any): Promise<any> {
    await this.initializePeerConnection();
    if (!this.pc) throw new Error('Peer connection failed to establish');

    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const docRef = doc(db, 'jobs', this.jobId);
    await updateDoc(docRef, {
      'activeCall.answer': { sdp: answer.sdp, type: answer.type },
      'activeCall.recipientCandidates': []
    });

    return answer;
  }

  async setRemoteAnswer(answerSdp: any) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    } catch (e) {
      console.error('[WebRTC] Error setting remote description:', e);
    }
  }

  async addIceCandidate(candidateData: any) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateData));
    } catch (err) {
      console.warn('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  // Safe autoplay fallback to play stream in background audio elements
  private playRemoteStream(stream: MediaStream) {
    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.srcObject = null;
        this.remoteAudioElement.remove();
      } catch (e) {}
    }

    const audio = new Audio();
    audio.srcObject = stream;
    audio.setAttribute('autoplay', 'true');
    audio.setAttribute('playsinline', 'true');
    audio.volume = 1.0;
    
    // Mount to body invisibly so browsers don't garbage collect ongoing stream play
    audio.style.display = 'none';
    document.body.appendChild(audio);
    this.remoteAudioElement = audio;

    audio.play().catch((err) => {
      console.log('[WebRTC Playback] Auto-play pending user interaction check.', err);
    });
  }

  // Loopback test for solo testing / sandbox environments. Plays back their mic with a echo delay.
  // Announces call established via Speech Synthesis client!
  startSoloEchoTest() {
    console.log('[WebRTC Client] Initiating Soho Safe Echo Test Network Fallback.');
    try {
      // 1. Play clean vocal confirmation using Web Speech Synthesis API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Clear pending phrases
        const textToSpeak = "Secure line established. Soho encrypted voice gateway activated. Please speak to test your microphone.";
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        // Find an English premium voice if possible
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
        if (enVoice) utterance.voice = enVoice;
        
        window.speechSynthesis.speak(utterance);
        this.synthesisUtterance = utterance;
      }

      // 2. Route local microphone to local speaker with a high-fidelity 0.8s studio echo-delay
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (this.localStream && this.audioContext) {
        const sourceNode = this.audioContext.createMediaStreamSource(this.localStream);
        
        // Setup echo-delay module
        const delay = this.audioContext.createDelay(2.0);
        delay.delayTime.setValueAtTime(0.8, this.audioContext.currentTime); // 800ms echo delay

        const feedback = this.audioContext.createGain();
        feedback.gain.setValueAtTime(0.35, this.audioContext.currentTime); // soft feedback echo decay

        // Hook up loops
        sourceNode.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay); // connect decay back to delay input

        // Deliver output straight to standard speakers safely
        delay.connect(this.audioContext.destination);

        this.delayNode = delay;
        this.feedbackNode = feedback;
        console.log('[WebRTC Solo Echo] Echo test loops connected successfully.');
      }
    } catch (e) {
      console.warn('[WebRTC Solo Echo] Setup failed:', e);
    }
  }

  setSpeaker(enabled: boolean) {
    if (this.remoteAudioElement) {
      // Browser apps toggle speaker mainly by volume or routed endpoints, we simulate max gain/normal gain
      this.remoteAudioElement.volume = enabled ? 1.0 : 0.4;
    }
  }

  setMuted(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  cleanup() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.srcObject = null;
        this.remoteAudioElement.remove();
      } catch (e) {}
      this.remoteAudioElement = null;
    }

    if (this.delayNode) {
      try {
        this.delayNode.disconnect();
      } catch (e) {}
      this.delayNode = null;
    }

    if (this.feedbackNode) {
      try {
        this.feedbackNode.disconnect();
      } catch (e) {}
      this.feedbackNode = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    console.log('[WebRTC Client] calling resources successfully disposed.');
  }
}
