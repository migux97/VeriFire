import { useEffect, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/components/ui/StatusMessage';
import { useQrScanner } from './useQrScanner';
import { getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';

interface QrScanPanelProps {
  onDetected: (text: string) => void;
  onMessage: (message: Message) => void;
  onScanStart: () => void;
  locale?: ConsumerLocale;
  disabled?: boolean;
}

// Camera, image upload and Ctrl+V anywhere in the panel with a screenshot or photo of the QR.
export function QrScanPanel(props: QrScanPanelProps) {
  const { videoRef, cameraOpen, starting, start, stop, readImage } = useQrScanner(props);
  const labels = getConsumerMessages(props.locale).scan;

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
      const image = imageItem?.getAsFile();
      if (!image || props.disabled) return;
      event.preventDefault();
      void readImage(image);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [readImage, props.disabled]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (file && !props.disabled) void readImage(file);
  };

  return (
    <>
      <div className="scan-actions">
        <button className="button button-primary" type="button" hidden={cameraOpen} disabled={starting || props.disabled} onClick={() => void start()}>
          <Icon name="fa-solid fa-camera" /> {labels.camera}
        </button>
        <label className="button button-secondary scan-upload">
          <Icon name="fa-regular fa-image" /> {labels.upload}
          <input className="visually-hidden" type="file" accept="image/*" disabled={props.disabled} onChange={handleFile} />
        </label>
      </div>
      <div className="scan-viewer" hidden={!cameraOpen}>
        <video ref={videoRef} playsInline muted aria-label={labels.preview} />
        <span className="scan-frame" aria-hidden="true" />
        <button className="button button-secondary scan-stop" type="button" onClick={stop}>{labels.close}</button>
      </div>
    </>
  );
}
