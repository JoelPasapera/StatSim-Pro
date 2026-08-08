// ========================================
// VIDEO-TUTORIALES por sección — patrón "façade" de rendimiento máximo:
// en reposo solo se muestra la MINIATURA oficial de YouTube (una imagen
// con carga perezosa, ~40 KB) + un botón de play; el reproductor real
// (iframe youtube-nocookie) se monta ÚNICAMENTE al hacer clic.
// Coste de YouTube antes del clic: CERO bytes de JS, cero rastreadores.
// ========================================
const VideoTutoriales = {
    // ⬇️ PEGA AQUÍ tus links de YouTube (formato completo, el que sea:
    // https://www.youtube.com/watch?v=XXXX · https://youtu.be/XXXX ·
    // shorts o embed). Deja '' en las secciones que aún no tengan video.
    VIDEOS: {
        explorador: 'https://www.youtube.com/watch?v=NB43HVZTWzc',
        simulador: 'https://www.youtube.com/watch?v=NB43HVZTWzc',
        analizador: 'https://www.youtube.com/watch?v=NB43HVZTWzc',
        buscador: 'https://www.youtube.com/watch?v=NB43HVZTWzc',
        ayuda: 'https://www.youtube.com/watch?v=NB43HVZTWzc'
        // (contacto no lleva tutorial)
    },
    // Extrae el ID de cualquier formato de URL de YouTube.
    _id(url) {
        if (!url) return null;
        const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null);
    },
    montar() {
        for (const [seccion, url] of Object.entries(this.VIDEOS)) {
            const id = this._id(url);
            if (!id) continue;
            const cabecera = document.querySelector(`#${seccion} .section-header`);
            if (!cabecera || cabecera.querySelector('.yt-lite')) continue;
            const f = document.createElement('div');
            f.className = 'yt-lite';
            f.dataset.id = id;
            f.setAttribute('role', 'button');
            f.setAttribute('tabindex', '0');
            f.setAttribute('aria-label', 'Reproducir video tutorial de esta sección');
            f.title = 'Ver el tutorial (se reproduce aquí mismo)';
            f.innerHTML = `
                <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
                <span class="yt-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
                <span class="yt-cinta">▶ Tutorial de la sección</span>`;
            cabecera.appendChild(f);
        }
        // UNA sola delegación para todos los videos (clic y teclado).
        if (this._delegado) return;
        this._delegado = true;
        // Al primer hover sobre cualquier façade: PRECONNECT a YouTube
        // (DNS+TLS por adelantado → el reproductor arranca ~300-500 ms
        // más rápido tras el clic). Se hace UNA sola vez.
        const precalentar = () => {
            if (this._precon) return;
            this._precon = true;
            ['https://www.youtube-nocookie.com', 'https://www.google.com'].forEach(h => {
                const l = document.createElement('link');
                l.rel = 'preconnect'; l.href = h; l.crossOrigin = '';
                document.head.appendChild(l);
            });
        };
        document.addEventListener('pointerover', (e) => {
            if (e.target.closest('.yt-lite:not(.yt-activo)')) precalentar();
        }, { passive: true });
        const activar = (el) => {
            const id = el.dataset.id;
            const marco = document.createElement('div');
            marco.className = 'yt-lite yt-activo';
            marco.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
                title="Video tutorial" frameborder="0" loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>`;
            el.replaceWith(marco);
        };
        document.addEventListener('click', (e) => {
            const el = e.target.closest('.yt-lite:not(.yt-activo)');
            if (el) activar(el);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const el = e.target.closest('.yt-lite:not(.yt-activo)');
            if (el) { e.preventDefault(); activar(el); }
        });
    }
};
if (typeof window !== 'undefined') {
    window.VideoTutoriales = VideoTutoriales;
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => VideoTutoriales.montar());
    else VideoTutoriales.montar();
}
