import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_META, type UnitStatus, type System } from '../domain/types';

export function CodePlate({ code, large = false }: { code: string; large?: boolean }) {
  return <span className={large ? 'code-plate code-plate--lg' : 'code-plate'}>{code}</span>;
}

/** Etiqueta + medidor de 6 pasos: el estado nunca depende solo del color. */
export function StatusPill({ status }: { status: UnitStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
      <span className="flex gap-px" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`h-2.5 w-1 rounded-sm ${i < meta.level ? meta.bar : 'bg-current opacity-20'}`} />
        ))}
      </span>
      {meta.label}
    </span>
  );
}

export function SystemPill({ system }: { system: System | undefined | null }) {
  if (!system) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-soft">
      <span className="h-2 w-2 rounded-full" style={{ background: system.color ?? '#999' }} aria-hidden />
      {system.name}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-mute">{icon}</div>}
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-ink-soft">{children}</p>}
      {action && (action.to ? (
        <Link to={action.to} className="tap mt-5 inline-flex items-center rounded-ctl bg-honey-400 px-5 font-semibold text-ink">{action.label}</Link>
      ) : (
        <button onClick={action.onClick} className="tap mt-5 rounded-ctl bg-honey-400 px-5 font-semibold text-ink">{action.label}</button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions }: {
  title: string; subtitle?: string; back?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {back}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-ink lg:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

/** Hoja inferior en móvil, ventana centrada en escritorio. Usa <dialog> nativo: foco atrapado y Esc gratis. */
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="sheet m-0 mb-0 mt-auto w-full max-w-none bg-surface p-0 text-ink backdrop:bg-ink/40 lg:mx-auto lg:my-auto lg:max-w-lg"
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 pb-safe">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="tap -mr-2 rounded-ctl px-3 text-ink-soft hover:bg-paper">✕</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 9999 }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
  const btn = 'tap grid w-12 place-items-center rounded-ctl border border-line-strong bg-surface text-xl font-semibold active:bg-honey-100 disabled:opacity-40';
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} aria-label="Menos" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <input
        inputMode="numeric" aria-label="Cantidad"
        className="tap tnum w-20 rounded-ctl border border-line-strong bg-surface text-center text-lg font-semibold"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/\D/g, '') || String(min), 10)))}
      />
      <button type="button" className={btn} aria-label="Más" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  );
}

export const inputCls =
  'tap w-full rounded-ctl border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-mute focus:border-honey-500';
export const primaryBtn =
  'tap inline-flex items-center justify-center rounded-ctl bg-honey-400 px-5 font-semibold text-ink transition active:scale-[0.99] hover:bg-honey-500 disabled:opacity-50';
export const secondaryBtn =
  'tap inline-flex items-center justify-center rounded-ctl border border-line-strong bg-surface px-5 font-semibold text-ink transition hover:bg-paper disabled:opacity-50';
export const dangerBtn =
  'tap inline-flex items-center justify-center rounded-ctl bg-st-bad-fg px-5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50';
export const fieldLabel = 'mb-1.5 block text-sm font-medium text-ink-soft';
