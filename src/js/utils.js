export function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatRupiah(num) {
  const safeNum = Number.isFinite(Number(num)) ? Number(num) : 0;
  const prefix = safeNum < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(Math.round(safeNum)).toLocaleString('id-ID');
}

export function calculateROP(product) {
  const daily = Math.max(0, Number(product.dailySalesAvg) || 0);
  const lead = Math.max(0, Number(product.leadTimeDays) || 0);
  const safety = Math.max(0, Number(product.safetyStock) || 0);
  return daily * lead + safety;
}

export function calculateMargin(costPrice, sellPrice) {
  const cost = Number(costPrice) || 0;
  const sell = Number(sellPrice) || 0;
  if (sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

export function getLevelInfo(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  if (safeXp >= 900) return { level: 4, title: 'Maestro Ritel', min: 900, next: 1500 };
  if (safeXp >= 500) return { level: 3, title: 'Saudagar Cerdas', min: 500, next: 900 };
  if (safeXp >= 200) return { level: 2, title: 'Juragan Terampil', min: 200, next: 500 };
  return { level: 1, title: 'Perintis Warung', min: 0, next: 200 };
}

export function compressImageFile(file, maxWidth = 320, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatRealtimeClock(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatRealtimeDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function getLocalTimezoneCode(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const offsetMin = -d.getTimezoneOffset();
  if (offsetMin === 420) return 'WIB';
  if (offsetMin === 480) return 'WITA';
  if (offsetMin === 540) return 'WIT';
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

export function formatDurationHMS(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}j ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}d`;
}

