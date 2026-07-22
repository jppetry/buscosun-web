/**
 * Upload-Fenster für Streckendateien — Drag & Drop oder Dateiauswahl.
 * Command-Deck (hell): Dropzone-Karte + Format-Sidebar (Vorlage T1/T11, mobil T8).
 *
 * Reiner Picker: reicht die ausgewählte Datei roh nach oben. Format-Erkennung
 * (über Magic Bytes), Validierung und Parsing übernimmt die RoutePage.
 */

import { useId, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ACCEPT_ATTR, ROUTE_FORMATS } from './routeFormats';

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
    <div className="rd-upload">
      <div className="rd-dropzone-card">
        <label
          className={`rd-dropzone${dragging ? ' is-dragging' : ''}${error ? ' has-error' : ''}`}
          htmlFor={inputId}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input ref={inputRef} id={inputId} type="file" className="rd-dropzone-input" accept={ACCEPT_ATTR} onChange={onInputChange} />
          {/* Wolke + Aufwärtspfeil + Track-Punkte (Vorlage) */}
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
            <path d="M22 44 A11 11 0 0 1 24 22 A14 14 0 0 1 50 27 A9 9 0 0 1 48 45 Z" stroke="var(--rd-dash-ico)" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="24" cy="50" r="2.2" fill="var(--sage-600)" />
            <circle cx="48" cy="50" r="2.2" fill="var(--sage-600)" />
            <path d="M24 50 Q36 56 48 50" stroke="var(--sage-600)" strokeWidth="1.6" fill="none" />
            <path d="M36 52 V34 M30 40 L36 34 L42 40" stroke="var(--terracotta-500)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="rd-dropzone-title">Strecke hierher ziehen</p>
          <span className="rd-dropzone-or">oder</span>
          <span className="rd-dropzone-btn">Datei auswählen</span>
          <p className="rd-dropzone-sub">GPX · TCX · FIT · KML · KMZ · max. 25 MB</p>
          {error && <p className="rd-dropzone-error" role="alert">{error}</p>}
        </label>
      </div>

      <div className="rd-formats">
        <span className="rd-label">Unterstützte Formate</span>
        <ul className="rd-formats-list" aria-label="Unterstützte Formate">
          {ROUTE_FORMATS.map((f) => (
            <li key={f.id} className="rd-format-row">
              <span className="rd-format-tag">{f.label}</span>
              <span>{f.hint}</span>
            </li>
          ))}
        </ul>
        <div className="rd-formats-note">
          Max. 25 MB · max. 100.000 Trackpunkte<br />
          Region: Deutschland · Österreich · Schweiz
        </div>
      </div>
    </div>
  );
}
