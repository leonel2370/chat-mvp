'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AdSlot } from './components/AdSlot';

// Serveur backend (par défaut localhost, modifiable via env)
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
const TERMS_KEY = 'chat-terms-accepted';

// Serveurs STUN de base ; les serveurs TURN éphémères sont récupérés au montage
// auprès du backend (/turn-credentials) pour ne pas exposer d'identifiants statiques.
const stunServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Identifiants de zones publicitaires ExoClick (vides = publicités désactivées)
const adZones = {
  terms: process.env.NEXT_PUBLIC_EXOCLICK_ZONE_TERMS,
  lobby: process.env.NEXT_PUBLIC_EXOCLICK_ZONE_LOBBY,
  interstitial: process.env.NEXT_PUBLIC_EXOCLICK_ZONE_INTERSTITIAL,
  footer: process.env.NEXT_PUBLIC_EXOCLICK_ZONE_FOOTER
};

// Résolution de capture raisonnable (le navigateur ajuste selon la caméra)
const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
  facingMode: 'user'
};

// Lecture de l'acceptation mémorisée, compatible rendu serveur (useSyncExternalStore)
function subscribeTerms(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getTermsSnapshot() {
  try {
    return localStorage.getItem(TERMS_KEY) === '1';
  } catch {
    return false;
  }
}

function getTermsServerSnapshot() {
  return false;
}

type SignalData = {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type MediaState = 'pending' | 'ready' | 'error';
type Quality = 'good' | 'ok' | 'bad' | null;

type Status = {
  text: string;
  tone: 'idle' | 'search' | 'ok' | 'error';
};

type ChatMsg = { id: number; mine: boolean; text: string };

const toneDot: Record<Status['tone'], string> = {
  idle: 'bg-ink-muted',
  search: 'bg-warning',
  ok: 'bg-success',
  error: 'bg-danger'
};

// Icônes Material (Apache 2.0)
function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={path} />
    </svg>
  );
}

const icons = {
  videocam: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  videocamOff: 'M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z',
  mic: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z',
  micOff: 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM4.27 3L3 4.27l6 6V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z',
  skipNext: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  error: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  visibility: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  chat: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  stop: 'M6 6h12v12H6z'
};

const qualityLabel: Record<Exclude<Quality, null>, string> = {
  good: 'Good connection',
  ok: 'Average connection',
  bad: 'Weak connection'
};

const qualityColor: Record<Exclude<Quality, null>, string> = {
  good: 'text-success',
  ok: 'text-warning',
  bad: 'text-danger'
};

export default function Home() {
  const storedAccepted = useSyncExternalStore(subscribeTerms, getTermsSnapshot, getTermsServerSnapshot);
  const [acceptedLocal, setAcceptedLocal] = useState(false);
  const accepted = storedAccepted || acceptedLocal;
  const [checked, setChecked] = useState(false);

  const [status, setStatus] = useState<Status>({ text: 'Ready', tone: 'idle' });
  const [isConnected, setIsConnected] = useState(false);
  const [mediaState, setMediaState] = useState<MediaState>('pending');
  const [mediaError, setMediaError] = useState('');
  const [watcherCount, setWatcherCount] = useState(0);
  const [reported, setReported] = useState(false);

  // Commandes d'appel
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [quality, setQuality] = useState<Quality>(null);

  // Choix des périphériques
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>('');
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Chat texte
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Vignette locale déplaçable et redimensionnable
  const [thumbPos, setThumbPos] = useState<{ x: number; y: number } | null>(null);
  const [thumbSize, setThumbSize] = useState<{ w: number; h: number } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  // Serveurs ICE (STUN + TURN éphémère récupéré du backend)
  const iceServersRef = useRef<RTCIceServer[]>(stunServers);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const modPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const msgIdRef = useRef(0);

  const clearChat = useCallback(() => {
    setMessages([]);
    setDraft('');
    setPartnerTyping(false);
  }, []);

  // Son léger + vibration à la mise en relation
  const playNotify = useCallback(() => {
    try {
      navigator.vibrate?.(200);
    } catch {
      // vibration non supportée
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => ctx.close();
    } catch {
      // audio indisponible
    }
  }, []);

  const stopQualityMonitor = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    setQuality(null);
  }, []);

  const startQualityMonitor = useCallback((pc: RTCPeerConnection) => {
    stopQualityMonitor();
    statsIntervalRef.current = setInterval(() => {
      pc.getStats().then((stats) => {
        let rtt: number | null = null;
        stats.forEach((report) => {
          if (
            report.type === 'candidate-pair' &&
            report.state === 'succeeded' &&
            typeof report.currentRoundTripTime === 'number'
          ) {
            rtt = report.currentRoundTripTime;
          }
        });
        if (rtt === null) {
          setQuality('ok');
        } else if (rtt > 0.3) {
          setQuality('bad');
        } else if (rtt > 0.15) {
          setQuality('ok');
        } else {
          setQuality('good');
        }
      });
    }, 2000);
  }, [stopQualityMonitor]);

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    dc.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'msg') {
          msgIdRef.current += 1;
          setMessages((prev) => [...prev, { id: msgIdRef.current, mine: false, text: payload.text }]);
          setPartnerTyping(false);
        } else if (payload.type === 'typing') {
          setPartnerTyping(true);
          if (partnerTypingTimeoutRef.current) clearTimeout(partnerTypingTimeoutRef.current);
          partnerTypingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2500);
        }
      } catch {
        // message ignoré
      }
    };
  }, []);

  const closePeerConnection = useCallback(() => {
    pendingCandidatesRef.current = [];
    stopQualityMonitor();
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [stopQualityMonitor]);

  const createPeerConnection = useCallback((sock: Socket, initiator: boolean) => {
    closePeerConnection();

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peerConnectionRef.current = pc;

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    // Canal de données pour le chat texte (pair à pair)
    if (initiator) {
      setupDataChannel(pc.createDataChannel('chat'));
    } else {
      pc.ondatachannel = (event) => setupDataChannel(event.channel);
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sock.emit('signal', { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (peerConnectionRef.current !== pc) return;
      if (pc.connectionState === 'connected') {
        setStatus({ text: 'Connected', tone: 'ok' });
        startQualityMonitor(pc);
      } else if (pc.connectionState === 'failed') {
        setStatus({ text: 'Connection failed, try next', tone: 'error' });
        stopQualityMonitor();
      }
    };

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => sock.emit('signal', { sdp: pc.localDescription }))
        .catch((e) => console.error("Erreur lors de la création de l'offre :", e));
    }
  }, [closePeerConnection, setupDataChannel, startQualityMonitor, stopQualityMonitor]);

  // Flux à sens unique vers un modérateur qui observe la session
  const startModStream = useCallback((sock: Socket, adminId: string) => {
    const localStream = localStreamRef.current;
    if (!localStream) return;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    modPeersRef.current.set(adminId, pc);
    setWatcherCount(modPeersRef.current.size);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sock.emit('mod-signal', { targetId: adminId, data: { candidate: event.candidate } });
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => sock.emit('mod-signal', { targetId: adminId, data: { sdp: pc.localDescription } }))
      .catch((e) => console.error('Erreur de supervision :', e));
  }, []);

  const stopModStream = useCallback((adminId: string) => {
    const pc = modPeersRef.current.get(adminId);
    if (pc) {
      pc.close();
      modPeersRef.current.delete(adminId);
      setWatcherCount(modPeersRef.current.size);
    }
  }, []);

  // Liste des caméras et micros disponibles
  const refreshDevices = useCallback(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    }).catch(() => {
      // énumération indisponible
    });
  }, []);

  useEffect(() => {
    if (!accepted) return;

    let cancelled = false;
    const modPeers = modPeersRef.current;

    // Récupérer les serveurs TURN éphémères auprès du backend
    fetch(`${SOCKET_SERVER_URL}/turn-credentials`)
      .then((r) => r.json())
      .then((data: { iceServers?: RTCIceServer[] }) => {
        if (!cancelled && data.iceServers && data.iceServers.length > 0) {
          iceServersRef.current = [...stunServers, ...data.iceServers];
        }
      })
      .catch(() => {
        // backend injoignable : on reste en STUN seul
      });

    navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        setSelectedCam(videoTrack?.getSettings().deviceId ?? '');
        setSelectedMic(audioTrack?.getSettings().deviceId ?? '');
        setMediaState('ready');
        refreshDevices();
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        console.error("Erreur d'accès aux médias :", err);
        setMediaError(
          err.name === 'NotAllowedError'
            ? 'Camera and microphone access was denied. Allow it in your browser settings, then reload the page.'
            : err.name === 'NotFoundError'
              ? 'No camera or microphone was found.'
              : 'Could not access the camera or microphone.'
        );
        setMediaState('error');
      });

    const newSocket = io(SOCKET_SERVER_URL);
    socketRef.current = newSocket;

    // Confirmer au serveur l'acceptation des conditions (vérifiée côté serveur)
    newSocket.on('connect', () => newSocket.emit('accept-terms'));

    newSocket.on('waiting', () => setStatus({ text: 'Searching', tone: 'search' }));

    newSocket.on('matched', ({ initiator }: { initiator: boolean }) => {
      setStatus({ text: 'Connecting', tone: 'search' });
      setIsConnected(true);
      setReported(false);
      clearChat();
      playNotify();
      createPeerConnection(newSocket, initiator);
    });

    newSocket.on('partner-disconnected', () => {
      closePeerConnection();
      setIsConnected(false);
      clearChat();
      setStatus({ text: 'Partner left, searching again', tone: 'search' });
      newSocket.emit('find-partner');
    });

    newSocket.on('signal', async (data: SignalData) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            newSocket.emit('signal', { sdp: pc.localDescription });
          }
          const queued = pendingCandidatesRef.current;
          pendingCandidatesRef.current = [];
          for (const candidate of queued) {
            await pc.addIceCandidate(candidate);
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(data.candidate);
          } else {
            pendingCandidatesRef.current.push(data.candidate);
          }
        }
      } catch (e) {
        console.error('Erreur de signalisation :', e);
      }
    });

    newSocket.on('mod-watch-request', ({ adminId }: { adminId: string }) => startModStream(newSocket, adminId));
    newSocket.on('mod-watch-stop', ({ adminId }: { adminId: string }) => stopModStream(adminId));

    newSocket.on('mod-signal', async ({ from, data }: { from: string; data: SignalData }) => {
      const pc = modPeersRef.current.get(from);
      if (!pc) return;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      } catch (e) {
        console.error('Erreur de supervision :', e);
      }
    });

    return () => {
      cancelled = true;
      newSocket.disconnect();
      socketRef.current = null;
      closePeerConnection();
      modPeers.forEach((pc) => pc.close());
      modPeers.clear();
      setWatcherCount(0);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [accepted, clearChat, closePeerConnection, createPeerConnection, playNotify, refreshDevices, startModStream, stopModStream]);

  // Faire défiler le chat vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, partnerTyping]);

  const acceptTerms = () => {
    try {
      localStorage.setItem(TERMS_KEY, '1');
    } catch {
      // Sans localStorage, l'accès reste possible pour cette session
    }
    setAcceptedLocal(true);
  };

  const startSearch = () => {
    if (socketRef.current && mediaState === 'ready') {
      closePeerConnection();
      socketRef.current.emit('find-partner');
    }
  };

  const nextPartner = useCallback(() => {
    if (socketRef.current) {
      closePeerConnection();
      setIsConnected(false);
      clearChat();
      socketRef.current.emit('next-partner');
    }
  }, [closePeerConnection, clearChat]);

  const leaveCall = useCallback(() => {
    if (socketRef.current) {
      closePeerConnection();
      setIsConnected(false);
      clearChat();
      setStatus({ text: 'Ready', tone: 'idle' });
      socketRef.current.emit('leave');
    }
  }, [closePeerConnection, clearChat]);

  const reportPartner = () => {
    if (socketRef.current && isConnected && !reported) {
      socketRef.current.emit('report', '');
      setReported(true);
    }
  };

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCamOn(next);
  }, [camOn]);

  // Remplacer la caméra ou le micro en cours sur toutes les connexions
  const changeDevice = async (kind: 'video' | 'audio', deviceId: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: kind === 'video'
          ? { ...videoConstraints, deviceId: { exact: deviceId } }
          : (selectedCam ? { ...videoConstraints, deviceId: { exact: selectedCam } } : videoConstraints),
        audio: kind === 'audio'
          ? { deviceId: { exact: deviceId } }
          : (selectedMic ? { deviceId: { exact: selectedMic } } : true)
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      newStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      newStream.getVideoTracks().forEach((t) => { t.enabled = camOn; });

      const applyTo = (pc: RTCPeerConnection) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === 'video') sender.replaceTrack(newStream.getVideoTracks()[0] ?? null);
          if (sender.track?.kind === 'audio') sender.replaceTrack(newStream.getAudioTracks()[0] ?? null);
        });
      };
      if (peerConnectionRef.current) applyTo(peerConnectionRef.current);
      modPeersRef.current.forEach(applyTo);

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;

      if (kind === 'video') setSelectedCam(deviceId);
      else setSelectedMic(deviceId);
    } catch (e) {
      console.error('Changement de périphérique impossible :', e);
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    const dc = dataChannelRef.current;
    if (!text || !dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ type: 'msg', text }));
    msgIdRef.current += 1;
    setMessages((prev) => [...prev, { id: msgIdRef.current, mine: true, text }]);
    setDraft('');
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      dc.send(JSON.stringify({ type: 'typing' }));
      typingTimeoutRef.current = setTimeout(() => {}, 1500);
    }
  };

  // Raccourcis clavier : Échap = suivant, M = micro, V = caméra
  useEffect(() => {
    if (!isConnected) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') nextPartner();
      else if (e.key === 'm' || e.key === 'M') toggleMic();
      else if (e.key === 'v' || e.key === 'V') toggleCam();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isConnected, nextPartner, toggleMic, toggleCam]);

  // Déplacement de la vignette locale
  const onThumbPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !stageRef.current) return;
    const stage = stageRef.current.getBoundingClientRect();
    const el = e.currentTarget.getBoundingClientRect();
    let x = e.clientX - stage.left - dragRef.current.dx;
    let y = e.clientY - stage.top - dragRef.current.dy;
    x = Math.max(8, Math.min(x, stage.width - el.width - 8));
    y = Math.max(8, Math.min(y, stage.height - el.height - 8));
    setThumbPos({ x, y });
  };

  const onThumbPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Agrandir ou réduire la vignette locale (proportions 4:3 conservées)
  const resizeThumb = (factor: number) => {
    setThumbSize((prev) => {
      const baseW = prev?.w ?? 320;
      const w = Math.round(Math.max(160, Math.min(baseW * factor, 720)));
      return { w, h: Math.round((w * 9) / 16) };
    });
  };

  const thumbStyle: React.CSSProperties = {
    ...(thumbPos ? { left: thumbPos.x, top: thumbPos.y, right: 'auto', bottom: 'auto' } : {}),
    ...(thumbSize ? { width: thumbSize.w, height: thumbSize.h } : {})
  };

  const isSearching = status.tone === 'search' && !isConnected;

  // --- Écran d'acceptation des conditions ---
  if (!accepted) {
    return (
      <div className="min-h-screen bg-white text-ink flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-line p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon path={icons.videocam} className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-medium">CHAT</h1>
          <p className="mt-2 text-sm text-ink-muted">Talk with random people over live video.</p>

          <div className="mt-6 rounded-lg bg-surface px-4 py-3 text-left text-sm text-ink-muted">
            <p className="font-medium text-ink">Before you start</p>
            <ul className="mt-2 space-y-1.5 list-disc pl-5">
              <li>You must be 18 or older to use this service.</li>
              <li>Be respectful. Nudity, harassment and illegal content are not allowed.</li>
              <li>
                Sessions may be monitored by a moderator for safety. A{' '}
                <span className="font-medium text-ink">&ldquo;Supervised&rdquo;</span> banner appears on
                your screen whenever a moderator is watching.
              </li>
            </ul>
          </div>

          <label className="mt-5 flex items-start gap-3 text-left text-sm text-ink">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              I am 18 or older and I accept the Terms. I understand sessions may be monitored by a
              moderator.
            </span>
          </label>

          <button
            onClick={acceptTerms}
            disabled={!checked}
            className="mt-6 h-10 w-full rounded-full bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:bg-surface disabled:text-ink-muted disabled:cursor-not-allowed"
          >
            Agree and continue
          </button>

          <AdSlot zoneId={adZones.terms} className="mt-6 flex justify-center" />
        </div>
      </div>
    );
  }

  const controlBtn =
    'flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const controlBtnOff = 'flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white transition-colors hover:brightness-110';

  return (
    <div className="flex h-screen flex-col bg-white text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon path={icons.videocam} />
          </span>
          <span className="text-[22px] text-ink-muted">CHAT</span>
        </div>
        <div className="flex items-center gap-2">
          {quality && isConnected && (
            <span className={`hidden items-center gap-1 text-xs sm:flex ${qualityColor[quality]}`} title={qualityLabel[quality]}>
              <span className="h-2 w-1 rounded-sm bg-current" />
              <span className={`h-3 w-1 rounded-sm ${quality === 'bad' ? 'bg-current/30' : 'bg-current'}`} />
              <span className={`h-4 w-1 rounded-sm ${quality === 'good' ? 'bg-current' : 'bg-current/30'}`} />
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full border border-line px-3 h-8 text-sm text-ink-muted">
            <span className={`h-2 w-2 rounded-full ${toneDot[status.tone]}`} />
            <span>{status.text}</span>
          </div>
        </div>
      </header>

      {watcherCount > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-warning/15 py-2 text-sm font-medium text-ink">
          <Icon path={icons.visibility} className="h-4 w-4" />
          Supervised — a moderator is watching this session
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Scène vidéo */}
        <main className="flex min-h-0 flex-1 flex-col">
          {mediaState === 'error' && (
            <div role="alert" className="m-4 flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              <Icon path={icons.error} className="h-5 w-5 shrink-0" />
              <span>{mediaError}</span>
            </div>
          )}

          <div ref={stageRef} className="relative flex-1 overflow-hidden bg-black">
            {/* Vidéo distante en plein écran */}
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />
            {!isConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-ink-muted">
                {isSearching ? (
                  <span className="h-12 w-12 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-ink-muted">
                    <Icon path={icons.person} className="h-8 w-8" />
                  </span>
                )}
                <span className="text-sm">{isSearching ? 'Looking for someone' : 'Waiting for someone'}</span>
                {/* Publicité lobby (attente) ou interstitiel (recherche) */}
                <AdSlot
                  zoneId={isSearching ? adZones.interstitial : adZones.lobby}
                  className="mt-4 flex justify-center"
                />
              </div>
            )}

            {/* Vignette locale déplaçable */}
            <div
              onPointerDown={onThumbPointerDown}
              onPointerMove={onThumbPointerMove}
              onPointerUp={onThumbPointerUp}
              style={thumbStyle}
              className="absolute bottom-4 right-4 z-10 h-32 w-56 cursor-grab touch-none overflow-hidden rounded-lg border-2 border-white/80 bg-black shadow-lg active:cursor-grabbing sm:h-44 sm:w-80"
            >
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-contain -scale-x-100" />
              {/* Commandes de redimensionnement */}
              <div className="absolute right-1 top-1 z-10 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  onClick={() => resizeThumb(1 / 1.25)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/60 text-base leading-none text-white hover:bg-ink/80"
                  aria-label="Shrink video"
                >
                  −
                </button>
                <button
                  onClick={() => resizeThumb(1.25)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/60 text-base leading-none text-white hover:bg-ink/80"
                  aria-label="Enlarge video"
                >
                  +
                </button>
              </div>
              {mediaState === 'pending' && (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-muted">Starting camera</span>
              )}
              {!camOn && mediaState === 'ready' && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/80 text-white">
                  <Icon path={icons.videocamOff} />
                </span>
              )}
              <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">You</span>
            </div>
          </div>
        </main>

        {/* Panneau de chat (bureau) / tiroir (mobile) */}
        {isConnected && (
          <aside
            className={`${chatOpen ? 'flex' : 'hidden'} absolute inset-0 z-20 flex-col border-l border-line bg-white md:static md:z-auto md:flex md:w-80`}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-medium">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-ink-muted md:hidden" aria-label="Close chat">
                <Icon path={icons.close} />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="text-center text-xs text-ink-muted">Say hello 👋</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <span
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.mine ? 'bg-primary text-white' : 'bg-surface text-ink'
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
              {partnerTyping && (
                <div className="flex justify-start">
                  <span className="rounded-2xl bg-surface px-3 py-2 text-sm text-ink-muted">typing…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex shrink-0 items-center gap-2 border-t border-line p-3"
            >
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                placeholder="Message"
                className="h-10 flex-1 rounded-full border border-line px-4 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white disabled:bg-surface disabled:text-ink-muted"
                aria-label="Send"
              >
                <Icon path={icons.send} />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Barre de commandes */}
      {/* Publicité en pied de page (hors appel) */}
      {!isConnected && adZones.footer && (
        <div className="flex shrink-0 justify-center border-t border-line px-4 py-3">
          <AdSlot zoneId={adZones.footer} />
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-line px-4 py-4">
        {!isConnected ? (
          <>
            <button
              onClick={startSearch}
              disabled={mediaState !== 'ready' || isSearching}
              className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-white transition-colors hover:bg-primary-hover hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:bg-surface disabled:text-ink-muted disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Icon path={icons.search} />
              {mediaState === 'pending' ? 'Starting camera' : isSearching ? 'Searching' : 'Find someone'}
            </button>
            {isSearching && (
              <button onClick={leaveCall} className={controlBtn} aria-label="Stop" title="Stop">
                <Icon path={icons.stop} />
              </button>
            )}
            <button onClick={() => setSettingsOpen((v) => !v)} className={controlBtn} aria-label="Settings" title="Devices">
              <Icon path={icons.settings} />
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMic} className={micOn ? controlBtn : controlBtnOff} aria-label="Toggle microphone" title="Microphone (M)">
              <Icon path={micOn ? icons.mic : icons.micOff} />
            </button>
            <button onClick={toggleCam} className={camOn ? controlBtn : controlBtnOff} aria-label="Toggle camera" title="Camera (V)">
              <Icon path={camOn ? icons.videocam : icons.videocamOff} />
            </button>
            <button
              onClick={nextPartner}
              className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              title="Next (Esc)"
            >
              <Icon path={icons.skipNext} />
              Next
            </button>
            <button onClick={leaveCall} className={controlBtnOff} aria-label="Stop" title="Stop">
              <Icon path={icons.stop} />
            </button>
            <button onClick={() => setChatOpen(true)} className={`${controlBtn} md:hidden`} aria-label="Open chat" title="Chat">
              <Icon path={icons.chat} />
            </button>
            <button
              onClick={reportPartner}
              disabled={reported}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-danger transition-colors hover:bg-danger-soft disabled:text-ink-muted disabled:cursor-not-allowed"
              aria-label="Report"
              title={reported ? 'Reported' : 'Report'}
            >
              <Icon path={icons.flag} />
            </button>
          </>
        )}
      </footer>

      {/* Choix des périphériques */}
      {settingsOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setSettingsOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Devices</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-ink-muted" aria-label="Close">
                <Icon path={icons.close} />
              </button>
            </div>
            <label className="mt-4 block text-sm text-ink-muted">Camera</label>
            <select
              value={selectedCam}
              onChange={(e) => changeDevice('video', e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-primary"
            >
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
            <label className="mt-4 block text-sm text-ink-muted">Microphone</label>
            <select
              value={selectedMic}
              onChange={(e) => changeDevice('audio', e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-primary"
            >
              {mics.map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
