/**
 * Upload-Fenster für Streckendateien — Drag & Drop oder Dateiauswahl.
 *
 * Reiner Picker: reicht die ausgewählte Datei roh nach oben. Format-Erkennung
 * (über Magic Bytes), Validierung und Parsing übernimmt die RoutePage.
 */

import { useId, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ACCEPT_ATTR, ROUTE_FORMATS } from './routeFormats';
import './RouteUpload.css';

interface Props {
  onFile: (file: File) => void;
}

export default function RouteUpload({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setError('Bitte nur eine Datei auf einmal.');
      return;
    }
    onFile(files[0]);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = ''; // erlaubt erneutes Auswählen derselben Datei
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }
  function onDragLeave(e: DragEvent<HTMLLabelElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }

  return (
    <div className="rt-upload">
        <label
          className={`rt-dropzone${dragging ? ' is-dragging' : ''}${error ? ' has-error' : ''}`}
          htmlFor={inputId}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input ref={inputRef} id={inputId} type="file" className="rt-dropzone-input" accept={ACCEPT_ATTR} onChange={onInputChange} />
          {/* Cloud + Pfeil + Track-Akzent */}
          <svg className="rt-dropzone-ico" width="92" height="64" viewBox="0 0 120 80" fill="none" aria-hidden="true">
            <path d="M 22 48 Q 7 48 7 33 Q 7 18 22 18 Q 24 -2 47 -2 Q 67 -6 77 10 Q 90 4 102 16 Q 122 18 122 34 Q 122 48 107 48 Z"
              transform="translate(-4 6)" fill="#EDE6D3" stroke="#C4B896" strokeWidth="1.6" strokeLinejoin="round" />
            <line x1="52" y1="46" x2="52" y2="78" stroke="#C97B47" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M 42 54 L 52 44 L 62 54" fill="none" stroke="#C97B47" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14" cy="60" r="2.5" fill="#7A9466" /><circle cx="34" cy="76" r="2.5" fill="#7A9466" /><circle cx="92" cy="70" r="2.5" fill="#7A9466" />
            <path d="M 14 60 Q 26 78 34 76 Q 60 70 92 70" fill="none" stroke="#7A9466" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
          </svg>
          <p className="rt-dropzone-title">Strecke hierher ziehen</p>
          <span className="rt-dropzone-or">oder</span>
          <span className="rt-dropzone-btn">Datei auswählen</span>
          <p className="rt-dropzone-sub">GPX · TCX · FIT · KML · KMZ · max. 25 MB</p>
          {error && <p className="rt-dropzone-error" role="alert">{error}</p>}
        </label>

        <div className="rt-card rt-formats">
          <span className="rt-eyebrow">Unterstützte Formate</span>
          <ul className="rt-formats-list" aria-label="Unterstützte Formate">
            {ROUTE_FORMATS.map((f) => (
              <li key={f.id} className="rt-format-row">
                <span className={`rt-format-tag t${f.tier}`}>{f.label}</span>
                <span>{f.hint}</span>
              </li>
            ))}
          </ul>
          <div className="rt-limits">
            Max. 25 MB · max. 100.000 Trackpunkte<br />
            Region: Deutschland · Österreich · Schweiz
          </div>
        </div>
    </div>
  );
}
