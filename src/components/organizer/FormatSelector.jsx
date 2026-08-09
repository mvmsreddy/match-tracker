import { FORMATS, FORMAT_TEMPLATES, FORMAT_CATEGORIES, defaultConfigForFormat } from '../../utils/formats/formatRegistry';

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9 w-full';

export default function FormatSelector({ format, formatConfig, templateId, onFormatChange, onConfigChange, onTemplateChange, compact = false }) {
  const def = FORMATS[format] || FORMATS.single_elimination;

  function applyTemplate(tid) {
    const t = FORMAT_TEMPLATES[tid];
    if (!t) return;
    onTemplateChange?.(tid);
    onFormatChange(t.format, { ...defaultConfigForFormat(t.format), ...t.config });
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Quick templates</div>
          <div className="flex flex-wrap gap-2">
            {Object.values(FORMAT_TEMPLATES).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  templateId === t.id ? 'border-primary bg-primary/10 text-accent-ink' : 'border-border hover:border-primary/50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Tournament format
        <select className={selectCls} value={format} onChange={(e) => onFormatChange(e.target.value, defaultConfigForFormat(e.target.value))}>
          {FORMAT_CATEGORIES.map((cat) => (
            <optgroup key={cat.id} label={cat.label}>
              {Object.values(FORMATS).filter((f) => f.category === cat.id).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {def.description && (
        <p className="text-xs text-muted-foreground">{def.description}</p>
      )}

      {(def.configFields || []).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {def.configFields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {field.label}
              {field.type === 'select' ? (
                <select
                  className={selectCls}
                  value={formatConfig[field.key] ?? field.default}
                  onChange={(e) => onConfigChange({ ...formatConfig, [field.key]: e.target.value })}
                >
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : field.type === 'boolean' ? (
                <input
                  type="checkbox"
                  className="accent-primary w-5 h-5"
                  checked={!!formatConfig[field.key]}
                  onChange={(e) => onConfigChange({ ...formatConfig, [field.key]: e.target.checked })}
                />
              ) : (
                <input
                  type="number"
                  className={selectCls}
                  min={field.min}
                  max={field.max}
                  value={formatConfig[field.key] ?? field.default ?? ''}
                  onChange={(e) => onConfigChange({ ...formatConfig, [field.key]: Number(e.target.value) })}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export { FORMAT_TEMPLATES, defaultConfigForFormat };
