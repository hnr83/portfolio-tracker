import { useState } from "react";
import { getAssetDisplayName, getAssetLogo } from "../../utils/assetLogos";

function FallbackAvatar({ label, size = 32 }) {
    const text = (label || "?").slice(0, 1).toUpperCase();

    return (
        <div
            className="flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200"
            style={{ width: size, height: size, minWidth: size }}
            title={label}
        >
            {text}
        </div>
    );
}

export default function AssetAvatar({
    ticker,
    normalizedTicker,
    size = 32,
    showText = true,
    subtitle,
}) {
    const [imgError, setImgError] = useState(false);

    const label = getAssetDisplayName(ticker, normalizedTicker);
    const logo = getAssetLogo(ticker, normalizedTicker);

    return (
        <div className="flex items-center gap-3 min-w-0">
            {logo && !imgError ? (
                <img
                    src={logo}
                    alt={label}
                    title={label}
                    onError={() => setImgError(true)}
                    className="rounded-full border border-slate-700 bg-white/5 object-cover"
                    style={{ width: size, height: size, minWidth: size }}
                />
            ) : (
                <FallbackAvatar label={label} size={size} />
            )}

            {showText && (
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                        {label}
                    </div>
                    {subtitle ? (
                        <div className="truncate text-xs text-slate-400">{subtitle}</div>
                    ) : ticker && normalizedTicker && ticker !== normalizedTicker ? (
                        <div className="truncate text-xs text-slate-400">{ticker}</div>
                    ) : null}
                </div>
            )}
        </div>
    );
}