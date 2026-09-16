import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/components/ui/StatusMessage';
import { createQrDecoder } from '@/lib/client/qr';
import { errorMessage } from '@/lib/errors';

const FRAME_INTERVAL_MS = 250;
const CAMERA_FALLBACK = 'No pudimos abrir la cámara. Subí o pegá (Ctrl+V) una imagen del QR.';
const CAMERA_ERRORS: Record<string, string> = {
  NotAllowedError: 'La cámara está bloqueada. Tocá el candado junto a la dirección, permití la cámara y volvé a intentar (en Windows revisá también Configuración > Privacidad > Cámara).',
  NotFoundError: 'No encontramos ninguna cámara en este dispositivo. Subí o pegá (Ctrl+V) una imagen del QR.',
  NotReadableError: 'La cámara está en uso por otra aplicación (Zoom, Teams, Meet...). Cerrala y volvé a intentar.'
};

interface QrScannerOptions {
  // Text of the first QR found.
  onDetected: (text: string) => void;
  onMessage: (message: Message) => void;
  // A new scan started: whatever was scanned before no longer applies.
  onScanStart: () => void;
}

// Reads a QR from the camera or from an image.
export function useQrScanner(options: QrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const startingNow = useRef(false);
  const frameTimer = useRef<number | undefined>(undefined);
  // Incremented on every stop, so a camera that finishes starting after the user moved on is closed right away.
  const cameraRequest = useRef(0);
  const decoder = useRef<ReturnType<typeof createQrDecoder> | null>(null);
  // The frame loop outlives renders: it always calls the latest callbacks.
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  });

  const decode = () => (decoder.current ??= createQrDecoder());
  const message = (text: string, tone: Message['tone']) => callbacks.current.onMessage({ text, tone });

  const setStartingState = (value: boolean) => {
    startingNow.current = value;
    setStarting(value);
  };

  const stop = useCallback(() => {
    cameraRequest.current += 1;
    window.clearTimeout(frameTimer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setStartingState(false);
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!stream.current || !video) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const text = await decode()(video, video.videoWidth, video.videoHeight);
        if (text && stream.current) {
          stop();
          callbacks.current.onDetected(text);
          return;
        }
      } catch (error) {
        stop();
        message(errorMessage(error), 'error');
        return;
      }
    }
    frameTimer.current = window.setTimeout(() => void scanFrame(), FRAME_INTERVAL_MS);
  }, [stop]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (stream.current || startingNow.current || !video) return;
    if (!window.isSecureContext) {
      message('La cámara solo funciona si Verifire se abre con https:// o desde localhost. Mientras tanto, subí o pegá (Ctrl+V) una imagen del QR.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      message('Este navegador no permite usar la cámara. Subí o pegá (Ctrl+V) una imagen del QR.', 'error');
      return;
    }
    const request = ++cameraRequest.current;
    setStartingState(true);
    callbacks.current.onScanStart();
    message('Pidiendo permiso para usar la cámara...', 'info');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (error) {
      if (request !== cameraRequest.current) return;
      setStartingState(false);
      message((error instanceof DOMException && CAMERA_ERRORS[error.name]) || CAMERA_FALLBACK, 'error');
      return;
    }
    if (request !== cameraRequest.current) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream.current = media;
    video.srcObject = media;
    try {
      await video.play();
    } catch {
      stop();
      message(CAMERA_FALLBACK, 'error');
      return;
    }
    setStartingState(false);
    setCameraOpen(true);
    message('Apuntá la cámara al QR de la etiqueta.', 'info');
    void scanFrame();
  }, [scanFrame, stop]);

  const readImage = useCallback(async (image: Blob) => {
    stop();
    callbacks.current.onScanStart();
    message('Leyendo la imagen...', 'info');
    try {
      const bitmap = await window.createImageBitmap(image);
      const text = await decode()(bitmap, bitmap.width, bitmap.height);
      if (text) callbacks.current.onDetected(text);
      else message('No encontramos un QR en la imagen. Probá con una imagen más nítida y cercana.', 'error');
    } catch {
      message('No pudimos leer esa imagen. Probá con otra imagen del QR.', 'error');
    }
  }, [stop]);

  // The camera is released when the page is left or the panel unmounts.
  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  return { videoRef, cameraOpen, starting, start, stop, readImage };
}
