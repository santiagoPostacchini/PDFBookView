import { useEffect, useState } from 'react';
import type { BookShape, SceneSpec } from '../../promo/model';
import type { FiguritasLibrary, StickerAsset } from '../../promo/figuritas/assets';
import { readStickerSheet } from '../../promo/figuritas/sheet';
import { basicPack, readPackArt } from '../../promo/figuritas/packArt';
import { resolveTargets } from '../../promo/figuritas/targets';
import { FileButton, Section, Toggle } from '../controls';

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
    <Section title="Tus figuritas" hint="Cargá una hoja PDF sobre blanco o imágenes individuales. Elegí hasta 6; las horizontales conservan su orientación.">
      <label className="field"><span>Cargar figuritas (PDF o imágenes)</span>
        <FileButton aria-label="Cargar figuritas" accept=".pdf,image/*" multiple disabled={busy} onChange={(e) => { void load(e.target.files); e.target.value = ''; }} />
      </label>
      {busy && <p role="status">Preparando imágenes…</p>}
      {error && <p role="alert" className="diag diag-warn">{error}</p>}
      <button className="link-btn" onClick={() => onChange({ stickers: undefined })}>Elegir automáticamente hasta 3</button>
      {library?.stickers.map((s) => {
        const ref = selected.find((r) => r.id === s.id);
        const target = resolveTargets({ kind: 'figuritas', stickers: [ref ?? { id: s.id }] }, shape, library)[0];
        const valid = !!target;
        return <div className="sticker-row" key={s.id}>
          <label className="check"><Toggle aria-label={`Elegir figurita ${s.number}`} checked={!!ref} disabled={!ref && selected.length >= 6}
            onChange={(e) => onChange({ stickers: e.target.checked ? [...selected, { id: s.id }] : selected.filter((r) => r.id !== s.id) })} />
            <BlobThumb blob={s.image} /><span>Figurita {s.number || 'sin número'}</span></label>
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
          {!valid && <p className="diag diag-warn">No encontramos ese casillero o la figurita no entra. Elegí otra página o destino.</p>}
          {target && shape.pagePt && target.w < s.widthPt / shape.pagePt.width - 0.001 && <p className="editor-formula">Se reduce proporcionalmente para entrar completa en la página, sin girarla.</p>}
          <button className="link-btn" onClick={() => { onLibrary({ ...library, stickers: library.stickers.filter((other) => other.id !== s.id) }); onChange({ stickers: selected.filter((r) => r.id !== s.id) }); }}>Quitar figurita</button>
        </div>;
      })}
      {!library?.stickers.length && <p>Cargá tus figuritas para que esta escena aparezca en el video.</p>}
    </Section>
    <Section title="Diseño del paquete" hint="Un PDF de troquel usa frente y dorso; una imagen se usa como frente.">
      <label className="field"><span>Usar mi diseño (PDF o imagen)</span><FileButton aria-label="Diseño del paquete" accept=".pdf,image/*" disabled={busy}
        onChange={(e) => { void load(e.target.files, true); e.target.value = ''; }} /></label>
      <button className="btn" disabled={busy} onClick={() => { setBusy(true); void basicPack().then((pack) => onLibrary({ stickers: library?.stickers ?? [], pack })).finally(() => setBusy(false)); }}>Usar paquete básico</button>
      {library && <div className="pack-thumbs"><BlobThumb blob={library.pack.front} /><BlobThumb blob={library.pack.back} /></div>}
    </Section>
  </>;
}
