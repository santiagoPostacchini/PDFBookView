import { useEffect, useState } from 'react';
import type { BookShape, SceneSpec } from '../../promo/model';
import type { FiguritasLibrary, StickerAsset } from '../../promo/figuritas/assets';
import { readStickerSheet } from '../../promo/figuritas/sheet';
import { basicPack, readPackArt } from '../../promo/figuritas/packArt';
import { resolveTargets } from '../../promo/figuritas/targets';
import { Disclosure, FileButton, Section, Toggle } from '../controls';

function BlobThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const url = URL.createObjectURL(blob); setUrl(url); return () => URL.revokeObjectURL(url); }, [blob]);
  return <img src={url || undefined} alt="" className="sticker-thumb" />;
}

export function FiguritasStep({ scene, shape, library, onLibrary, onChange }: {
  scene: SceneSpec; shape: BookShape; library: FiguritasLibrary | null;
  onLibrary: (library: FiguritasLibrary) => void; onChange: (patch: Partial<SceneSpec>) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const selected: NonNullable<SceneSpec['stickers']> = scene.stickers ?? resolveTargets(scene, shape, library ?? undefined).map((t) => ({ id: t.sticker.id }));
  const load = async (files: FileList | null, pack = false) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      if (pack) onLibrary({ stickers: library?.stickers ?? [], pack: await readPackArt(files[0]) });
      else {
        const stickers = (await Promise.all([...files].map(readStickerSheet))).flat();
        onLibrary({ stickers: [...(library?.stickers ?? []), ...stickers], pack: library?.pack ?? await basicPack() });
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const setSticker = (asset: StickerAsset, change: Partial<StickerAsset>) => {
    if (library) onLibrary({ ...library, stickers: library.stickers.map((s) => s.id === asset.id ? { ...s, ...change } : s) });
  };
  return <>
    <Section title="Tus figuritas">
      {!library?.stickers.length ? <div className="sticker-empty">
        <strong>Todavía no cargaste figuritas</strong>
        <p>Cargá una hoja PDF sobre blanco o imágenes sueltas. La escena se omite hasta entonces.</p>
        <FileButton className="sticker-upload" buttonLabel="Cargar figuritas" aria-label="Cargar figuritas" accept=".pdf,image/*" multiple disabled={busy} onChange={(e) => { void load(e.target.files); e.target.value = ''; }} />
      </div> : <div className="sticker-summary">
        <strong>{selected.length} de 6 elegidas</strong>
        <button className="link-btn" onClick={() => onChange({ stickers: undefined })}>Elegir automáticamente hasta 3</button>
        <FileButton className="sticker-upload" buttonLabel="Cargar más" aria-label="Cargar figuritas" accept=".pdf,image/*" multiple disabled={busy} onChange={(e) => { void load(e.target.files); e.target.value = ''; }} />
      </div>}
      {busy && <p role="status">Preparando imágenes…</p>}
      {error && <p role="alert" className="diag diag-warn">{error}</p>}
      <div className="sticker-grid">
      {library?.stickers.map((s) => {
        const ref = selected.find((r) => r.id === s.id);
        const target = resolveTargets({ kind: 'figuritas', stickers: [ref ?? { id: s.id }] }, shape, library)[0];
        const valid = !!target;
        return <div className={`sticker-row${ref ? '' : ' is-muted'}`} key={s.id}>
          <div className="sticker-card-top"><span className="sticker-number">{s.number || 'Sin número'}</span><Toggle aria-label={`Elegir figurita ${s.number}`} checked={!!ref} disabled={!ref && selected.length >= 6}
            onChange={(e) => onChange({ stickers: e.target.checked ? [...selected, { id: s.id }] : selected.filter((r) => r.id !== s.id) })} />
          </div>
          <div className="sticker-image"><BlobThumb blob={s.image} /></div>
          <p className="sticker-destination">{target ? ref?.page ? `Página ${ref.page} · centrada` : `Casillero ${ref?.slot ?? s.number} · Pág. ${target.page + 1}` : 'Sin destino'}</p>
          {!valid && <p className="sticker-notice"><span aria-hidden="true">⚠</span> Sin casillero · elegí otro destino</p>}
          {target && shape.pagePt && target.w < s.widthPt / shape.pagePt.width - 0.001 && <p className="sticker-notice"><span aria-hidden="true">↘</span> Se reduce para entrar</p>}
          <Disclosure title="Ajustar">
          <label className="field"><span>Número</span><input className="text-input" type="number" min={1} max={999} value={s.number || ''} aria-label={`Número de figurita ${s.number}`}
            onChange={(e) => setSticker(s, { number: Number(e.target.value) })} /></label>
          <label className="field"><span>Va en</span><select className="text-input" aria-label={`Destino de figurita ${s.number}`} disabled={!ref}
            value={ref?.page ? `page:${ref.page}` : ref?.slot ? `slot:${ref.slot}` : 'auto'}
            onChange={(e) => {
              const [kind, value] = e.target.value.split(':');
              onChange({ stickers: selected.map((r) => r.id !== s.id ? r : { id: s.id, ...(kind === 'slot' ? { slot: Number(value) } : kind === 'page' ? { page: Number(value) } : {}) }) });
            }}>
            <option value="auto">Casillero Nº {s.number || '?'}</option>
            {[...(shape.slots?.keys() ?? [])].sort((a, b) => a - b).map((n) => <option key={n} value={`slot:${n}`}>Casillero Nº {n}</option>)}
            {Array.from({ length: Math.max(0, 2 * (shape.leafCount - 1)) }, (_, i) => i + 2).map((n) => <option key={n} value={`page:${n}`}>Página {n} · centrada</option>)}
          </select></label>
          <button className="link-btn" onClick={() => { onLibrary({ ...library, stickers: library.stickers.filter((other) => other.id !== s.id) }); onChange({ stickers: selected.filter((r) => r.id !== s.id) }); }}>Quitar figurita</button>
          </Disclosure>
        </div>;
      })}
      </div>
    </Section>
    <div className="sticker-pack">
    <Disclosure title="Diseño del paquete">
      <p className="editor-formula">Un PDF de troquel usa frente y dorso; una imagen se usa como frente.</p>
      <label className="field"><span>Usar mi diseño (PDF o imagen)</span><FileButton aria-label="Diseño del paquete" accept=".pdf,image/*" disabled={busy}
        onChange={(e) => { void load(e.target.files, true); e.target.value = ''; }} /></label>
      <button className="btn" disabled={busy} onClick={() => { setBusy(true); void basicPack().then((pack) => onLibrary({ stickers: library?.stickers ?? [], pack })).finally(() => setBusy(false)); }}>Usar paquete básico</button>
      {library && <div className="pack-thumbs"><BlobThumb blob={library.pack.front} /><BlobThumb blob={library.pack.back} /></div>}
    </Disclosure>
    <p className="sticker-pack-summary">{library?.pack.custom ? 'Tu diseño' : 'Paquete básico'}</p>
    </div>
  </>;
}
