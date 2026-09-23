import { useEffect, useId, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/components/ui/StatusMessage';
import { useQrScanner } from './useQrScanner';
import { getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import { parseManualCode, parseScannedQr, type ScannedClaim } from '@/lib/qr-codes';

interface QrScanPanelProps {
  onDetected: (text: string) => void;
  onMessage: (message: Message) => void;
  onScanStart: () => void;
  onManualClaim?: (claim: ScannedClaim) => void;
  locale?: ConsumerLocale;
  disabled?: boolean;
}

// Camera, image upload and Ctrl+V anywhere in the panel with a screenshot or photo of the QR.
export function QrScanPanel(props: QrScanPanelProps) {
  const { videoRef, cameraOpen, starting, start, stop, readImage } = useQrScanner(props);
  const labels = getConsumerMessages(props.locale).scan;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (manualOpen) inputRef.current?.focus();
  }, [manualOpen]);

  const validateCode = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.disabled || !props.onManualClaim) return;
    props.onScanStart();
    const claim = parseManualCode(code);
    if (!claim) {
      setError(parseScannedQr(code).publicToken ? labels.public : labels.invalid);
      inputRef.current?.focus();
      return;
    }
    setError('');
    setCode('');
    props.onManualClaim(claim);
    props.onMessage({ text: labels.ready, tone: 'info' });
  };

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
        <button className="button button-primary" type="button" hidden={cameraOpen} disabled={starting || props.disabled} onClick={() => { setManualOpen(false); setCode(''); void start(); }}>
          <Icon name="fa-solid fa-camera" /> {labels.camera}
        </button>
        <label className="button button-secondary scan-upload">
          <Icon name="fa-regular fa-image" /> {labels.upload}
          <input className="visually-hidden" type="file" accept="image/*" disabled={props.disabled} onChange={handleFile} />
        </label>
        {props.onManualClaim && <button type="button" className="button button-secondary" aria-expanded={manualOpen} aria-controls={`${id}-manual`}
          disabled={props.disabled} onClick={() => { stop(); props.onScanStart(); setError(''); setCode(''); setManualOpen(!manualOpen); }}>
          <Icon name="fa-solid fa-keyboard" /> {labels.manual}
        </button>}
      </div>
      <form id={`${id}-manual`} className="manual-code" hidden={!manualOpen} onSubmit={validateCode} noValidate>
        <label htmlFor={`${id}-input`}>{labels.label}</label>
        <p id={`${id}-hint`} className="field-hint">{labels.hint}</p>
        <div className="manual-code-row">
          <input ref={inputRef} id={`${id}-input`} type="text" value={code} autoComplete="off" autoCapitalize="none" spellCheck={false}
            maxLength={2048} disabled={props.disabled} placeholder={labels.placeholder} aria-invalid={Boolean(error)}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            onChange={(event) => { setCode(event.target.value); setError(''); props.onScanStart(); }} />
          <button className="button button-primary" type="submit" disabled={props.disabled}>{labels.validate}</button>
        </div>
        {error && <p id={`${id}-error`} className="manual-code-error" role="alert">{error}</p>}
      </form>
      <div className="scan-viewer" hidden={!cameraOpen}>
        <video ref={videoRef} playsInline muted aria-label={labels.preview} />
        <span className="scan-frame" aria-hidden="true" />
        <button className="button button-secondary scan-stop" type="button" onClick={stop}>{labels.close}</button>
      </div>
    </>
  );
}
