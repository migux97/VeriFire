import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/components/ui/StatusMessage';
import { getConsumerMessages, type ConsumerLocale, type ConsumerMessages } from '@/i18n/consumer';
import { createQrDecoder } from '@/lib/client/qr';
import { errorMessage } from '@/lib/errors';

const FRAME_INTERVAL_MS = 250;
// Why the camera could not open, in the words of the DOMException the browser throws.
const CAMERA_ERRORS: Record<string, keyof ScanMessages> = {
  NotAllowedError: 'cameraBlocked',
  NotFoundError: 'cameraMissing',
  NotReadableError: 'cameraBusy'
};

type ScanMessages = ConsumerMessages['scan'];

interface QrScannerOptions {
  // The language of the panel using the scanner.
  locale?: ConsumerLocale;
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
  // Same idea for images: incremented on every read, so a slow one cannot answer after a newer one.
  const imageRequest = useRef(0);
  const decoder = useRef<ReturnType<typeof createQrDecoder> | null>(null);
  // The frame loop outlives renders: it always calls the latest callbacks.
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  });

  const decode = () => (decoder.current ??= createQrDecoder());
  const message = (text: string, tone: Message['tone']) => callbacks.current.onMessage({ text, tone });
  const labels = (): ScanMessages => getConsumerMessages(callbacks.current.locale).scan;

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
      message(labels().cameraInsecure, 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      message(labels().cameraUnsupported, 'error');
      return;
    }
    const request = ++cameraRequest.current;
    setStartingState(true);
    callbacks.current.onScanStart();
    message(labels().asking, 'info');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (error) {
      if (request !== cameraRequest.current) return;
      setStartingState(false);
      const reason = error instanceof DOMException ? CAMERA_ERRORS[error.name] : undefined;
      message(reason ? labels()[reason] : labels().cameraFailed, 'error');
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
      message(labels().cameraFailed, 'error');
      return;
    }
    setStartingState(false);
    setCameraOpen(true);
    message(labels().aim, 'info');
    void scanFrame();
  }, [scanFrame, stop]);

  const readImage = useCallback(async (image: Blob) => {
    stop();
    callbacks.current.onScanStart();
    message(labels().reading, 'info');
    // Pasting a second image (or picking a file while one is being read) replaces the first: only the last one answers.
    imageRequest.current += 1;
    const request = imageRequest.current;
    try {
      const bitmap = await window.createImageBitmap(image);
      const text = await decode()(bitmap, bitmap.width, bitmap.height);
      if (request !== imageRequest.current) return;
      if (text) callbacks.current.onDetected(text);
      else message(labels().noQrInImage, 'error');
    } catch {
      if (request === imageRequest.current) message(labels().unreadableImage, 'error');
    }
  }, [stop]);

  // The camera is released when the page is left or the panel unmounts.
  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      // An image still being read must not answer into a panel that is gone.
      imageRequest.current += 1;
      stop();
    };
  }, [stop]);

  return { videoRef, cameraOpen, starting, start, stop, readImage };
}
